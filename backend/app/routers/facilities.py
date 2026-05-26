from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, or_, asc
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Facility, Inspection, Inventory, Violation
from app.services.risk_engine import calculate_facility_risk_flags

router = APIRouter(prefix="/facilities", tags=["facilities"])


def _serialize_violation(violation: Violation) -> dict:
    return {
        "id": violation.id,
        "severity": violation.severity,
        "section": violation.section,
        "description": violation.description,
        "source_pdf": violation.source_pdf,
        "source_page": violation.source_page,
    }


def _serialize_inventory(item: Inventory) -> dict:
    return {
        "id": item.id,
        "scientific_name": item.scientific_name,
        "common_name": item.common_name,
        "count": item.count,
        "source_pdf": item.source_pdf,
    }


def _serialize_inspection(inspection: Inspection) -> dict:
    return {
        "id": inspection.id,
        "inspection_date": inspection.inspection_date,
        "inspection_type": inspection.inspection_type,
        "inspector_name": inspection.inspector_name,
        "inspector_id": inspection.inspector_id,
        "violations_found": inspection.violations_found,
        "violation_count": inspection.violation_count,
        "source_pdf": inspection.source_pdf,
        "source_pdf_path": inspection.source_pdf_path,
        "violations": [_serialize_violation(v) for v in inspection.violations],
        "inventory": [_serialize_inventory(i) for i in inspection.inventory],
    }


def _serialize_facility(facility: Facility) -> dict:
    return {
        "id": facility.id,
        "name": facility.name,
        "customer_id": facility.customer_id,
        "certificate_number": facility.certificate_number,
        "license_type": facility.license_type,
        "license_status": facility.license_status,
        "address": facility.address,
        "city": facility.city,
        "state": facility.state,
        "zip_code": facility.zip_code,
        "county": facility.county,
        "licensed_animal_limit": facility.licensed_animal_limit,
    }


@router.get("")
def list_facilities(
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
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
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
                        Inventory.common_name.ilike(f"%{species}%")
                    )
                )
                .distinct()
            )
        )

    # 1. exceeds_animal_limit filter
    if exceeds_animal_limit is not None:
        latest_date_sub = db.query(
            Inspection.facility_id,
            func.max(Inspection.inspection_date).label("max_date")
        ).group_by(Inspection.facility_id).subquery()

        exceeds_query = db.query(Facility.id)\
            .join(latest_date_sub, Facility.id == latest_date_sub.c.facility_id)\
            .join(Inspection, (Inspection.facility_id == Facility.id) & (Inspection.inspection_date == latest_date_sub.c.max_date))\
            .join(Inventory, Inventory.inspection_id == Inspection.id)\
            .group_by(Facility.id, Facility.licensed_animal_limit)\
            .having(func.sum(Inventory.count) > Facility.licensed_animal_limit)
        
        if exceeds_animal_limit is True:
            query = query.filter(Facility.id.in_(exceeds_query))
        else:
            query = query.filter(~Facility.id.in_(exceeds_query))

    # 2. high_direct_violations filter
    if high_direct_violations is not None:
        cutoff_date = date.today() - timedelta(days=18 * 30)
        high_direct_query = db.query(Inspection.facility_id)\
            .join(Violation, Violation.inspection_id == Inspection.id)\
            .filter(
                Inspection.inspection_date >= cutoff_date,
                func.lower(Violation.severity).in_(["direct", "critical"])
            )\
            .group_by(Inspection.facility_id)\
            .having(func.count(Violation.id) > 3)

        if high_direct_violations is True:
            query = query.filter(Facility.id.in_(high_direct_query))
        else:
            query = query.filter(~Facility.id.in_(high_direct_query))

    # 3. inventory_spike filter
    if inventory_spike is not None:
        insp_inv_total = db.query(
            Inspection.facility_id,
            Inspection.id.label("inspection_id"),
            Inspection.inspection_date,
            func.sum(Inventory.count).label("inv_total")
        ).join(Inventory, Inventory.inspection_id == Inspection.id)\
         .group_by(Inspection.facility_id, Inspection.id, Inspection.inspection_date)\
         .subquery()

        prev_inv_total = db.query(
            insp_inv_total.c.facility_id,
            insp_inv_total.c.inv_total.label("curr_total"),
            func.lag(insp_inv_total.c.inv_total).over(
                partition_by=insp_inv_total.c.facility_id,
                order_by=insp_inv_total.c.inspection_date
            ).label("prev_total")
        ).subquery()

        spike_query = db.query(prev_inv_total.c.facility_id)\
            .filter(
                prev_inv_total.c.prev_total > 0,
                prev_inv_total.c.curr_total > prev_inv_total.c.prev_total * 3
            ).distinct()

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
        db.query(
            Inspection.facility_id,
            func.count(Violation.id).label("v_count")
        )
        .join(Violation, Violation.inspection_id == Inspection.id)
        .group_by(Inspection.facility_id)
        .subquery()
    )

    latest_insp_subquery = (
        db.query(
            Inspection.facility_id,
            func.max(Inspection.inspection_date).label("last_date")
        )
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
        query = query.order_by(desc(func.coalesce(latest_insp_subquery.c.last_date, date(1970, 1, 1))), Facility.id)
    elif sort_by == "date_asc":
        query = query.order_by(asc(func.coalesce(latest_insp_subquery.c.last_date, date(1970, 1, 1))), Facility.id)
    else:  # violations_desc
        query = query.order_by(desc(func.coalesce(violation_subquery.c.v_count, 0)), Facility.id)

    total = query.count()
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
        results.append(
            {
                **_serialize_facility(facility),
                "total_inspections": stats.total_inspections if stats else 0,
                "total_violations": violation_stats.get(facility.id, 0),
                "last_inspection_date": stats.last_inspection_date if stats else None,
            }
        )

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "results": results
    }


@router.get("/{facility_id}")
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
        **_serialize_facility(facility),
        "risk_flags": risk_flags,
        "inspections": [_serialize_inspection(inspection) for inspection in inspections],
    }


@router.post("/{facility_id}/ai-summary")
def get_ai_summary(
    facility_id: int,
    db: Session = Depends(get_db)
):
    from app.services.ai_assistant import generate_facility_summary
    result = generate_facility_summary(facility_id)
    if 'error' in result:
        raise HTTPException(
            status_code=400,
            detail=result['error'])
    return result

@router.post("/{facility_id}/legal-memo")
def get_legal_memo(
    facility_id: int,
    db: Session = Depends(get_db)
):
    from app.services.ai_assistant import generate_legal_memo
    result = generate_legal_memo(facility_id)
    if 'error' in result:
        raise HTTPException(
            status_code=400,
            detail=result['error'])
    return result
