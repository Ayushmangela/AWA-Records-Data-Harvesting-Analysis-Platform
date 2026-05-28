import base64
import json
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import asc, desc, func, or_, select, tuple_
from sqlalchemy.orm import Session, aliased, joinedload

from app.auth import require_api_key
from app.database import get_db
from app.limiter import limiter
from app.models import Facility, Inspection, Inventory, Violation
from app.schemas import AISummaryOut, FacilityDetailOut, FacilityListOut, LegalMemoOut
from app.services.ai_assistant import generate_facility_summary, generate_legal_memo
from app.services.risk_engine import calculate_facility_risk_flags, cutoff_18_months_ago

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/facilities", tags=["facilities"], dependencies=[Depends(require_api_key)]
)


@router.get("", response_model=FacilityListOut)
@limiter.limit("30/minute")
def list_facilities(
    request: Request,
    name: str | None = None,
    state: str | None = None,
    license_type: str | None = None,
    has_violations: bool | None = None,
    species: str | None = None,
    exceeds_animal_limit: bool | None = None,
    high_direct_violations: bool | None = None,
    inventory_spike: bool | None = None,
    severity: str | None = None,
    sort_by: str = "violations_desc",
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    cursor: str | None = None,
    include_total: bool = False,
    db: Session = Depends(get_db),
):
    # Prevent expensive leading wildcard sequential scans
    if any(term and len(term) < 3 for term in [name, license_type, species]):
        return {
            "total": None,
            "limit": limit,
            "offset": offset,
            "results": [],
            "message": "Search terms must be at least 3 characters",
        }

    query = db.query(Facility)

    if name:
        query = query.filter(Facility.name.ilike(f"%{name}%"))
    if state:
        query = query.filter(Facility.state.ilike(state))
    if license_type:
        query = query.filter(Facility.license_type.ilike(f"%{license_type}%"))
    if has_violations is True:
        query = query.filter(
            Facility.id.in_(
                db.query(Inspection.facility_id)
                .filter(Inspection.violations_found.is_(True))
                .distinct()
            )
        )
    elif has_violations is False:
        query = query.filter(
            ~Facility.id.in_(
                db.query(Inspection.facility_id)
                .filter(Inspection.violations_found.is_(True))
                .distinct()
            )
        )
    if species:
        query = query.filter(
            Facility.id.in_(
                db.query(Inspection.facility_id)
                .join(Inventory, Inventory.inspection_id == Inspection.id)
                .filter(
                    or_(
                        Inventory.scientific_name.ilike(f"%{species}%"),
                        Inventory.common_name.ilike(f"%{species}%"),
                    )
                )
                .distinct()
            )
        )

    # 1. exceeds_animal_limit filter
    if exceeds_animal_limit is not None:
        latest_date_sub = (
            db.query(Inspection.facility_id, func.max(Inspection.inspection_date).label("max_date"))
            .group_by(Inspection.facility_id)
            .subquery()
        )

        exceeds_query = (
            db.query(Facility.id)
            .join(latest_date_sub, Facility.id == latest_date_sub.c.facility_id)
            .join(
                Inspection,
                (Inspection.facility_id == Facility.id)
                & (Inspection.inspection_date == latest_date_sub.c.max_date),
            )
            .join(Inventory, Inventory.inspection_id == Inspection.id)
            .group_by(Facility.id, Facility.licensed_animal_limit)
            .having(func.sum(Inventory.count) > Facility.licensed_animal_limit)
        )

        if exceeds_animal_limit is True:
            query = query.filter(Facility.id.in_(exceeds_query))
        else:
            query = query.filter(~Facility.id.in_(exceeds_query))

    # 2. high_direct_violations filter
    if high_direct_violations is not None:
        cutoff_date = cutoff_18_months_ago()
        high_direct_query = (
            db.query(Inspection.facility_id)
            .join(Violation, Violation.inspection_id == Inspection.id)
            .filter(
                Inspection.inspection_date >= cutoff_date,
                func.lower(Violation.severity).in_(["direct", "critical"]),
            )
            .group_by(Inspection.facility_id)
            .having(func.count(Violation.id) > 3)
        )

        if high_direct_violations is True:
            query = query.filter(Facility.id.in_(high_direct_query))
        else:
            query = query.filter(~Facility.id.in_(high_direct_query))

    # 3. inventory_spike filter
    if inventory_spike is not None:
        insp_inv_total = (
            db.query(
                Inspection.facility_id,
                Inspection.id.label("inspection_id"),
                Inspection.inspection_date,
                func.sum(Inventory.count).label("inv_total"),
            )
            .join(Inventory, Inventory.inspection_id == Inspection.id)
            .group_by(Inspection.facility_id, Inspection.id, Inspection.inspection_date)
            .subquery()
        )

        prev_inv_total = db.query(
            insp_inv_total.c.facility_id,
            insp_inv_total.c.inv_total.label("curr_total"),
            func.lag(insp_inv_total.c.inv_total)
            .over(
                partition_by=insp_inv_total.c.facility_id, order_by=insp_inv_total.c.inspection_date
            )
            .label("prev_total"),
        ).subquery()

        spike_query = (
            db.query(prev_inv_total.c.facility_id)
            .filter(
                prev_inv_total.c.prev_total > 0,
                prev_inv_total.c.curr_total > prev_inv_total.c.prev_total * 3,
            )
            .distinct()
        )

        if inventory_spike is True:
            query = query.filter(Facility.id.in_(spike_query))
        else:
            query = query.filter(~Facility.id.in_(spike_query))

    # 4. Severity filter
    if severity:
        query = query.filter(
            Facility.id.in_(
                db.query(Inspection.facility_id)
                .join(Violation, Violation.inspection_id == Inspection.id)
                .filter(func.lower(Violation.severity) == severity.lower())
                .distinct()
            )
        )

    # Subqueries for sorting
    violation_subquery = (
        db.query(Inspection.facility_id, func.count(Violation.id).label("v_count"))
        .join(Violation, Violation.inspection_id == Inspection.id)
        .group_by(Inspection.facility_id)
        .subquery()
    )

    latest_insp_subquery = (
        db.query(Inspection.facility_id, func.max(Inspection.inspection_date).label("last_date"))
        .group_by(Inspection.facility_id)
        .subquery()
    )

    query = query.outerjoin(violation_subquery, Facility.id == violation_subquery.c.facility_id)
    query = query.outerjoin(latest_insp_subquery, Facility.id == latest_insp_subquery.c.facility_id)

    # Apply sorting
    if sort_by == "violations_asc":
        query = query.order_by(asc(func.coalesce(violation_subquery.c.v_count, 0)), Facility.id)
    elif sort_by == "name_asc":
        query = query.order_by(asc(Facility.name), Facility.id)
    elif sort_by == "name_desc":
        query = query.order_by(desc(Facility.name), Facility.id)
    elif sort_by == "date_desc":
        query = query.order_by(
            desc(func.coalesce(latest_insp_subquery.c.last_date, date(1970, 1, 1))), Facility.id
        )
    elif sort_by == "date_asc":
        query = query.order_by(
            asc(func.coalesce(latest_insp_subquery.c.last_date, date(1970, 1, 1))), Facility.id
        )
    else:  # violations_desc
        query = query.order_by(desc(func.coalesce(violation_subquery.c.v_count, 0)), Facility.id)

    # Opt-in total count via CTE
    total = None
    if include_total:
        cte = query.cte("filtered_facilities")
        total = db.execute(select(func.count()).select_from(cte)).scalar()
        aliased(Facility, cte)
        # Re-apply ordering on the aliased entity because select_entity_from
        # might lose it depending on SQLAlchemy version
        # Actually it's safer to just let the main query execute with the
        # same order_by and offset/limit
        pass

    # Cursor Pagination Logic
    is_heavy_query = (
        exceeds_animal_limit is not None
        or high_direct_violations is not None
        or inventory_spike is not None
        or severity is not None
    )
    next_cursor = None

    if is_heavy_query or cursor:
        if cursor:
            try:
                decoded = json.loads(base64.b64decode(cursor).decode("utf-8"))
                cursor_val = decoded.get("val")
                cursor_id = decoded.get("id")

                # Apply cursor filter
                if sort_by == "violations_asc":
                    query = query.filter(
                        tuple_(func.coalesce(violation_subquery.c.v_count, 0), Facility.id)
                        > tuple_(cursor_val, cursor_id)
                    )
                elif sort_by == "name_asc":
                    query = query.filter(
                        tuple_(Facility.name, Facility.id) > tuple_(cursor_val, cursor_id)
                    )
                elif sort_by == "name_desc":
                    query = query.filter(
                        tuple_(Facility.name, Facility.id) < tuple_(cursor_val, cursor_id)
                    )
                elif sort_by == "date_desc":
                    cursor_val = date.fromisoformat(cursor_val) if cursor_val else date(1970, 1, 1)
                    query = query.filter(
                        tuple_(
                            func.coalesce(latest_insp_subquery.c.last_date, date(1970, 1, 1)),
                            Facility.id,
                        )
                        < tuple_(cursor_val, cursor_id)
                    )
                elif sort_by == "date_asc":
                    cursor_val = date.fromisoformat(cursor_val) if cursor_val else date(1970, 1, 1)
                    query = query.filter(
                        tuple_(
                            func.coalesce(latest_insp_subquery.c.last_date, date(1970, 1, 1)),
                            Facility.id,
                        )
                        > tuple_(cursor_val, cursor_id)
                    )
                else:  # violations_desc
                    query = query.filter(
                        tuple_(func.coalesce(violation_subquery.c.v_count, 0), Facility.id)
                        < tuple_(cursor_val, cursor_id)
                    )
            except Exception as e:
                logger.warning("Failed to parse cursor: %s", e)

        # Use limit for cursor pagination (ignore offset)
        facilities = query.limit(limit).all()
    else:
        facilities = query.offset(offset).limit(limit).all()

    if not facilities:
        return {"total": 0, "limit": limit, "offset": offset, "results": []}

    facility_ids = [facility.id for facility in facilities]

    inspection_stats = {
        row.facility_id: row
        for row in db.query(
            Inspection.facility_id,
            func.count(Inspection.id).label("total_inspections"),
            func.max(Inspection.inspection_date).label("last_inspection_date"),
        )
        .filter(Inspection.facility_id.in_(facility_ids))
        .group_by(Inspection.facility_id)
        .all()
    }

    violation_stats = {
        row.facility_id: row.total_violations
        for row in db.query(
            Inspection.facility_id,
            func.count(Violation.id).label("total_violations"),
        )
        .join(Violation, Violation.inspection_id == Inspection.id)
        .filter(Inspection.facility_id.in_(facility_ids))
        .group_by(Inspection.facility_id)
        .all()
    }

    results = []
    for facility in facilities:
        stats = inspection_stats.get(facility.id)
        # Because FacilityListItemOut uses from_attributes=True, we can pass a dict
        # mixing the SQLAlchemy model and extra fields, and Pydantic will extract them.
        item_dict = {
            **facility.__dict__,
            "total_inspections": stats.total_inspections if stats else 0,
            "total_violations": violation_stats.get(facility.id, 0),
            "last_inspection_date": stats.last_inspection_date if stats else None,
        }
        results.append(item_dict)

    if (is_heavy_query or cursor) and len(facilities) == limit:
        last_fac = facilities[-1]
        last_res = results[-1]
        val = None
        if sort_by in ["violations_asc", "violations_desc"]:
            val = last_res["total_violations"]
        elif sort_by in ["name_asc", "name_desc"]:
            val = last_res["name"]
        elif sort_by in ["date_asc", "date_desc"]:
            last_date = last_res["last_inspection_date"]
            val = last_date.isoformat() if last_date else None

        next_cursor = base64.b64encode(
            json.dumps({"val": val, "id": last_fac.id}).encode("utf-8")
        ).decode("utf-8")

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "cursor": next_cursor,
        "results": results,
    }


@router.get("/{facility_id}", response_model=FacilityDetailOut)
def get_facility(facility_id: int, db: Session = Depends(get_db)):
    facility = db.query(Facility).filter(Facility.id == facility_id).first()
    if facility is None:
        raise HTTPException(status_code=404, detail="Facility not found")

    inspections = (
        db.query(Inspection)
        .filter(Inspection.facility_id == facility_id)
        .options(
            joinedload(Inspection.violations),
            joinedload(Inspection.inventory),
        )
        .order_by(desc(Inspection.inspection_date), desc(Inspection.id))
        .all()
    )

    risk_flags = calculate_facility_risk_flags(db, facility_id)

    return {
        **facility.__dict__,
        "risk_flags": risk_flags,
        "inspections": inspections,
    }


@router.post("/{facility_id}/ai-summary", response_model=AISummaryOut)
@limiter.limit("5/hour")
def get_ai_summary(facility_id: int, request: Request, db: Session = Depends(get_db)):
    result = generate_facility_summary(facility_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{facility_id}/legal-memo", response_model=LegalMemoOut)
@limiter.limit("5/hour")
def get_legal_memo(facility_id: int, request: Request, db: Session = Depends(get_db)):
    result = generate_legal_memo(facility_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result
