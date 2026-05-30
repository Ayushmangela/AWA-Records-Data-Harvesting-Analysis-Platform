import base64
import json
import logging
import time
from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import asc, desc, func, or_, select, tuple_, text
from sqlalchemy.orm import Session, aliased, joinedload, selectinload

from app.auth import require_auth
from app.database import get_db
from app.limiter import limiter
from app.models import (
    AISummary,
    EnforcementAction,
    Facility,
    Inspection,
    Inventory,
    LegalMemo,
    Violation,
)
from app.schemas import (
    AISummaryOut,
    EnforcementActionOut,
    FacilityDetailOut,
    FacilityListOut,
    LegalMemoOut,
    FacilityDossierSummaryOut,
    InspectionOut,
)
from app.services.ai_assistant import generate_facility_summary, generate_legal_memo
from app.services.category_mapper import map_section_to_category
from app.services.risk_engine import (
    build_facility_dossier_summary,
    calculate_facilities_risk_flags_bulk,
    calculate_facility_risk_flags,
    cutoff_18_months_ago,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/facilities", tags=["facilities"], dependencies=[Depends(require_auth)]
)


def _build_facility_dossier_summary_payload(db: Session, facility_id: int) -> dict:
    facility_row = db.query(Facility).filter(Facility.id == facility_id).first()
    if facility_row is None:
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

    inspection_dicts = []
    for insp in inspections:
        inspection_dicts.append(
            {
                "id": insp.id,
                "inspection_date": insp.inspection_date,
                "inspection_type": insp.inspection_type,
                "inspector_name": insp.inspector_name,
                "violation_count": insp.violation_count,
                "violations": [
                    {
                        "id": viol.id,
                        "severity": viol.severity,
                        "section": viol.section,
                        "description": viol.description,
                        "source_page": viol.source_page,
                    }
                    for viol in insp.violations
                ],
                "inventory": [
                    {"count": inv.count}
                    for inv in insp.inventory
                ],
            }
        )

    enforcement_dicts = [
        {
            "id": act.id,
            "action_date": act.action_date,
            "action_type": act.action_type,
            "outcome": act.outcome,
            "penalty_amount": act.penalty_amount,
        }
        for act in (
            db.query(EnforcementAction)
            .filter(EnforcementAction.facility_id == facility_id)
            .order_by(desc(EnforcementAction.action_date), desc(EnforcementAction.id))
            .limit(5)
            .all()
        )
    ]

    facility_dict = {
        "id": facility_row.id,
        "name": facility_row.name,
        "customer_id": facility_row.customer_id,
        "certificate_number": facility_row.certificate_number,
        "license_type": facility_row.license_type,
        "license_status": facility_row.license_status,
        "address": facility_row.address,
        "city": facility_row.city,
        "state": facility_row.state,
        "zip_code": facility_row.zip_code,
        "county": facility_row.county,
        "licensed_animal_limit": facility_row.licensed_animal_limit,
    }

    return build_facility_dossier_summary(facility_dict, inspection_dicts, enforcement_dicts)


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
    inspection_frequency: str | None = None,
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

    if inspection_frequency:
        freq = inspection_frequency.lower().strip()
        freq_cutoff = cutoff_18_months_ago()
        inspection_count_query = (
            db.query(
                Inspection.facility_id.label("facility_id"),
                func.count(Inspection.id).label("inspection_count"),
            )
            .filter(Inspection.inspection_date >= freq_cutoff)
            .group_by(Inspection.facility_id)
            .subquery()
        )

        if freq in {"low", "infrequent"}:
            query = query.filter(
                ~Facility.id.in_(
                    db.query(inspection_count_query.c.facility_id).filter(
                        inspection_count_query.c.inspection_count >= 4
                    )
                )
            )
        elif freq in {"moderate", "medium"}:
            query = query.filter(
                Facility.id.in_(
                    db.query(inspection_count_query.c.facility_id).filter(
                        inspection_count_query.c.inspection_count.between(2, 3)
                    )
                )
            )
        elif freq in {"high", "frequent"}:
            query = query.filter(
                Facility.id.in_(
                    db.query(inspection_count_query.c.facility_id).filter(
                        inspection_count_query.c.inspection_count >= 4
                    )
                )
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="inspection_frequency must be low, moderate, or high",
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

    bulk_risk_flags = calculate_facilities_risk_flags_bulk(db, facilities)
    results = []
    for facility in facilities:
        stats = inspection_stats.get(facility.id)
        risk_flags = bulk_risk_flags.get(facility.id, {})
        # Because FacilityListItemOut uses from_attributes=True, we can pass a dict
        # mixing the SQLAlchemy model and extra fields, and Pydantic will extract them.
        item_dict = {
            **facility.__dict__,
            "total_inspections": stats.total_inspections if stats else 0,
            "total_violations": violation_stats.get(facility.id, 0),
            "last_inspection_date": stats.last_inspection_date if stats else None,
            "risk_level": risk_flags.get("risk_level", "LOW"),
            "animal_limit_exceeded": risk_flags.get("animal_limit_exceeded", False),
            "has_high_direct_violations": risk_flags.get("has_high_direct_violations", False),
            "recent_inventory_spike": risk_flags.get("recent_inventory_spike", False),
            "compliance_score": risk_flags.get("compliance_score", 100),
            "has_enforcement_actions": risk_flags.get("has_enforcement_actions", False),
            "highest_severity": risk_flags.get("highest_severity"),
            "last_inspection_status": risk_flags.get("last_inspection_status", "No Inspections"),
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


@router.get("/comparison", response_model=List[FacilityDossierSummaryOut])
@limiter.limit("30/minute")
def compare_facilities(
    request: Request,
    facility_ids: str = Query(..., description="Comma-separated facility IDs"),
    db: Session = Depends(get_db),
):
    ids = []
    for raw_id in facility_ids.split(","):
        raw_id = raw_id.strip()
        if not raw_id:
            continue
        try:
            ids.append(int(raw_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="facility_ids must be integers")

    if len(ids) < 2:
        raise HTTPException(status_code=400, detail="At least two facility IDs are required")
    if len(ids) > 4:
        raise HTTPException(status_code=400, detail="No more than four facility IDs are allowed")

    return [_build_facility_dossier_summary_payload(db, facility_id) for facility_id in ids]


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

    # Populate violation categories and build category aggregates
    violation_categories = {}
    for insp in inspections:
        for viol in insp.violations:
            cat = map_section_to_category(viol.section, viol.description)
            viol.category = cat
            violation_categories[cat] = violation_categories.get(cat, 0) + 1

    risk_flags = calculate_facility_risk_flags(db, facility_id)

    return {
        **facility.__dict__,
        "risk_flags": risk_flags,
        "inspections": inspections,
        "violation_categories": violation_categories,
        "enforcement_actions": facility.enforcement_actions,
    }


@router.post("/{facility_id}/ai-summary", response_model=AISummaryOut)
@limiter.limit("5/hour")
def get_ai_summary(facility_id: int, request: Request):
    result = generate_facility_summary(facility_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{facility_id}/legal-memo", response_model=LegalMemoOut)
@limiter.limit("5/hour")
def get_legal_memo(facility_id: int, request: Request):
    result = generate_legal_memo(facility_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/{facility_id}/ai-summary", response_model=AISummaryOut)
@limiter.limit("30/minute")
def fetch_stored_ai_summary(facility_id: int, request: Request, db: Session = Depends(get_db)):
    existing = (
        db.query(AISummary).filter(AISummary.facility_id == facility_id).order_by(AISummary.generated_at.desc()).first()
    )
    if not existing:
        raise HTTPException(status_code=404, detail="AI summary not found")
    try:
        parsed = json.loads(existing.summary_json)
        # Upgrade old schema_version=1 (JSON summary) to v2 (Markdown report) shape
        if parsed.get("schema_version", 1) == 1:
            old_summary = parsed.get("summary", {})
            exec_sum = old_summary.get("executive_summary", "")
            risk_nar = old_summary.get("risk_narrative", "")
            patterns = old_summary.get("compliance_patterns", [])
            priorities = old_summary.get("investigation_priorities", [])
            # Build a minimal Markdown report from the old JSON structure
            lines = ["# Executive Brief\n", exec_sum, "\n\n# Overall Risk Assessment\n", risk_nar]
            if patterns:
                lines.append("\n\n# Key Compliance Findings\n")
                for p in patterns:
                    lines.append(f"\n**{p.get('pattern_name', '')}**: {p.get('observation', '')}")
            if priorities:
                lines.append("\n\n# Recommended Investigator Actions\n")
                for pri in priorities:
                    lines.append(f"\n- **{pri.get('priority', '')}**: {pri.get('rationale', '')}")
            report_text = "".join(lines)
            cov = parsed.get("evidence_coverage", {
                "inspections_reviewed": 0,
                "total_inspections_available": 0,
                "violations_reviewed": 0,
                "inventory_records_reviewed": 0,
                "inspectors_reviewed": 0,
            })
            return {
                "facility_name": parsed.get("facility_name", ""),
                "facility_id": facility_id,
                "generated_at": parsed.get("generated_at", existing.generated_at.isoformat()),
                "model": parsed.get("model", existing.model_used or ""),
                "schema_version": 2,
                "report": report_text,
                "evidence_coverage": cov,
            }
        return parsed
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to parse stored AI summary")


@router.get("/{facility_id}/legal-memo", response_model=LegalMemoOut)
@limiter.limit("30/minute")
def fetch_stored_legal_memo(facility_id: int, request: Request, db: Session = Depends(get_db)):
    existing = (
        db.query(LegalMemo).filter(LegalMemo.facility_id == facility_id).order_by(LegalMemo.generated_at.desc()).first()
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Legal memo not found")
    facility = db.query(Facility).filter(Facility.id == facility_id).first()
    return {
        "facility_name": facility.name if facility else "",
        "certificate": facility.certificate_number if facility else None,
        "generated_at": existing.generated_at.isoformat(),
        "memo_text": existing.memo_text,
        "disclaimer": (
            "AI-generated for research purposes only. Human legal "
            "review required before official use. Source PDFs are untrusted "
            "OCR output; any quote must be verified against the original document."
        ),
    }


@router.get("/{facility_id}/enforcement", response_model=List[EnforcementActionOut])
@limiter.limit("30/minute")
def get_facility_enforcement(facility_id: int, request: Request, db: Session = Depends(get_db)):
    facility = db.query(Facility).filter(Facility.id == facility_id).first()
    if facility is None:
        raise HTTPException(status_code=404, detail="Facility not found")

    enforcements = (
        db.query(EnforcementAction)
        .filter(EnforcementAction.facility_id == facility_id)
        .order_by(desc(EnforcementAction.action_date), desc(EnforcementAction.id))
        .all()
    )
    return enforcements


@router.get("/{facility_id}/dossier-summary", response_model=FacilityDossierSummaryOut)
@limiter.limit("30/minute")
def get_facility_dossier_summary(facility_id: int, request: Request, db: Session = Depends(get_db)):
    if db.bind.dialect.name == "sqlite":
        facility_row = db.query(Facility).filter(Facility.id == facility_id).first()
        if facility_row is None:
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

        inspection_dicts = []
        for insp in inspections:
            inspection_dicts.append(
                {
                    "id": insp.id,
                    "inspection_date": insp.inspection_date,
                    "inspection_type": insp.inspection_type,
                    "inspector_name": insp.inspector_name,
                    "violation_count": insp.violation_count,
                    "violations": [
                        {
                            "id": viol.id,
                            "severity": viol.severity,
                            "section": viol.section,
                            "description": viol.description,
                            "source_page": viol.source_page,
                        }
                        for viol in insp.violations
                    ],
                    "inventory": [
                        {
                            "count": inv.count,
                        }
                        for inv in insp.inventory
                    ],
                }
            )

        enforcement_dicts = [
            {
                "id": act.id,
                "action_date": act.action_date,
                "action_type": act.action_type,
                "outcome": act.outcome,
                "penalty_amount": act.penalty_amount,
            }
            for act in (
                db.query(EnforcementAction)
                .filter(EnforcementAction.facility_id == facility_id)
                .order_by(desc(EnforcementAction.action_date), desc(EnforcementAction.id))
                .limit(5)
                .all()
            )
        ]

        facility_dict = {
            "id": facility_row.id,
            "name": facility_row.name,
            "customer_id": facility_row.customer_id,
            "certificate_number": facility_row.certificate_number,
            "license_type": facility_row.license_type,
            "license_status": facility_row.license_status,
            "address": facility_row.address,
            "city": facility_row.city,
            "state": facility_row.state,
            "zip_code": facility_row.zip_code,
            "county": facility_row.county,
            "licensed_animal_limit": facility_row.licensed_animal_limit,
        }

        return build_facility_dossier_summary(facility_dict, inspection_dicts, enforcement_dicts)

    query = text("""
        SELECT json_build_object(
            'facility', (
                SELECT row_to_json(f) 
                FROM (
                    SELECT id, name, customer_id, certificate_number, license_type, license_status, 
                           address, city, state, zip_code, county, licensed_animal_limit 
                    FROM facilities 
                    WHERE id = :facility_id
                ) f
            ),
            'inspections', (
                SELECT coalesce(json_agg(i), '[]'::json)
                FROM (
                    SELECT id, facility_id, inspection_date, inspection_type, inspector_name, inspector_id, 
                           violations_found, violation_count, source_pdf, source_pdf_path, 
                           processing_status, processed_at, error_reason, source_type,
                           (
                               SELECT coalesce(json_agg(v), '[]'::json)
                               FROM (
                                   SELECT id, inspection_id, severity, section, description, source_pdf, source_page
                                   FROM violations
                                   WHERE inspection_id = inspections.id
                               ) v
                           ) AS violations,
                           (
                               SELECT coalesce(json_agg(inv), '[]'::json)
                               FROM (
                                   SELECT id, inspection_id, scientific_name, common_name, count, source_pdf
                                   FROM inventory
                                   WHERE inspection_id = inspections.id
                               ) inv
                           ) AS inventory
                    FROM inspections
                    WHERE facility_id = :facility_id
                    ORDER BY inspection_date DESC, id DESC
                ) i
            ),
            'enforcements', (
                SELECT coalesce(json_agg(e), '[]'::json)
                FROM (
                    SELECT id, facility_id, certificate, action_type, action_date, outcome, penalty_amount
                    FROM enforcement_actions
                    WHERE facility_id = :facility_id
                    ORDER BY action_date DESC, id DESC
                    LIMIT 5
                ) e
            )
        ) AS data;
    """)
    
    raw_data = db.execute(query, {"facility_id": facility_id}).scalar()
    if not raw_data or not raw_data.get("facility"):
        raise HTTPException(status_code=404, detail="Facility not found")
        
    facility = raw_data["facility"]
    
    # Process inspections date strings into date objects and categories
    inspections = []
    for insp in raw_data.get("inspections", []) or []:
        insp_obj = dict(insp)
        if insp_obj.get("inspection_date"):
            insp_obj["inspection_date"] = date.fromisoformat(insp_obj["inspection_date"])
        
        # Populate violations and category
        violations = []
        for v in insp_obj.get("violations", []) or []:
            v_obj = dict(v)
            v_obj["category"] = map_section_to_category(v_obj.get("section"), v_obj.get("description"))
            violations.append(v_obj)
        insp_obj["violations"] = violations
        
        # Process inventory
        inventory = [dict(inv) for inv in insp_obj.get("inventory", []) or []]
        insp_obj["inventory"] = inventory
        
        inspections.append(insp_obj)
        
    enforcements = []
    for e in raw_data.get("enforcements", []) or []:
        e_obj = dict(e)
        if e_obj.get("action_date"):
            e_obj["action_date"] = date.fromisoformat(e_obj["action_date"])
        enforcements.append(e_obj)

    return build_facility_dossier_summary(facility, inspections, enforcements)



@router.get("/{facility_id}/inspections", response_model=List[InspectionOut])
@limiter.limit("30/minute")
def get_facility_inspections(facility_id: int, request: Request, db: Session = Depends(get_db)):
    if db.bind.dialect.name == "sqlite":
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
        inspections_list = []
        for insp in inspections:
            insp_dict = {
                "id": insp.id,
                "facility_id": insp.facility_id,
                "facility_name": insp.facility.name if insp.facility else None,
                "facility_state": insp.facility.state if insp.facility else None,
                "inspection_date": insp.inspection_date,
                "inspection_type": insp.inspection_type,
                "inspector_name": insp.inspector_name,
                "inspector_id": insp.inspector_id,
                "violations_found": insp.violations_found,
                "violation_count": insp.violation_count,
                "source_pdf": insp.source_pdf,
                "source_pdf_path": insp.source_pdf_path,
                "processing_status": insp.processing_status,
                "processed_at": insp.processed_at,
                "error_reason": insp.error_reason,
                "source_type": insp.source_type,
                "violations": [
                    {
                        "id": v.id,
                        "inspection_id": v.inspection_id,
                        "severity": v.severity,
                        "section": v.section,
                        "description": v.description,
                        "source_pdf": v.source_pdf,
                        "source_page": v.source_page,
                        "category": map_section_to_category(v.section, v.description)
                    }
                    for v in insp.violations
                ],
                "inventory": [
                    {
                        "id": inv.id,
                        "inspection_id": inv.inspection_id,
                        "scientific_name": inv.scientific_name,
                        "common_name": inv.common_name,
                        "count": inv.count,
                        "source_pdf": inv.source_pdf
                    }
                    for inv in insp.inventory
                ]
            }
            inspections_list.append(insp_dict)
            
        facility_exists = db.query(Facility.id).filter(Facility.id == facility_id).first() is not None
        if not facility_exists:
            raise HTTPException(status_code=404, detail="Facility not found")
        return inspections_list

    query = text("""
        SELECT json_agg(i)
        FROM (
            SELECT id, facility_id, inspection_date, inspection_type, inspector_name, inspector_id, 
                   violations_found, violation_count, source_pdf, source_pdf_path, 
                   processing_status, processed_at, error_reason, source_type,
                   (
                       SELECT coalesce(json_agg(v), '[]'::json)
                       FROM (
                           SELECT id, inspection_id, severity, section, description, source_pdf, source_page
                           FROM violations
                           WHERE inspection_id = inspections.id
                       ) v
                   ) AS violations,
                   (
                       SELECT coalesce(json_agg(inv), '[]'::json)
                       FROM (
                           SELECT id, inspection_id, scientific_name, common_name, count, source_pdf
                           FROM inventory
                           WHERE inspection_id = inspections.id
                       ) inv
                   ) AS inventory
            FROM inspections
            WHERE facility_id = :facility_id
            ORDER BY inspection_date DESC, id DESC
        ) i;
    """)
    raw_inspections = db.execute(query, {"facility_id": facility_id}).scalar()
    if raw_inspections is None:
        facility_exists = db.query(Facility.id).filter(Facility.id == facility_id).first() is not None
        if not facility_exists:
            raise HTTPException(status_code=404, detail="Facility not found")
        raw_inspections = []
        
    for insp in raw_inspections:
        if insp.get("inspection_date"):
            insp["inspection_date"] = date.fromisoformat(insp["inspection_date"])
        for viol in insp.get("violations", []) or []:
            viol["category"] = map_section_to_category(viol.get("section"), viol.get("description"))
            
    return raw_inspections



