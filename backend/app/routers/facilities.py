import base64
import json
import logging
import time
from datetime import date, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import asc, desc, func, or_, select, tuple_, text
from sqlalchemy.orm import Session, aliased, joinedload, selectinload

from app.auth import require_api_key
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
    calculate_facilities_risk_flags_bulk,
    calculate_facility_risk_flags,
    cutoff_18_months_ago,
)

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

    # Compute snapshot and other fields
    total_inspections = len(inspections)
    total_violations = sum(insp.get("violation_count") or 0 for insp in inspections)
    inspectors = {insp.get("inspector_name") for insp in inspections if insp.get("inspector_name")}
    unique_inspectors_count = len(inspectors)

    critical_direct_count = sum(
        1 for insp in inspections 
        for v in insp.get("violations", []) 
        if v.get("severity") and v.get("severity").lower() in ("critical", "direct")
    )

    latest_animal_count = 0
    latest_inv_inspection = None
    for insp in inspections:
        if len(insp.get("inventory", [])) > 0:
            latest_inv_inspection = insp
            break
    if latest_inv_inspection:
        latest_animal_count = sum(item.get("count") or 0 for item in latest_inv_inspection.get("inventory", []))

    licensed_limit = facility.get("licensed_animal_limit")
    compliance_snapshot = {
        "total_inspections": total_inspections,
        "total_violations": total_violations,
        "critical_direct_count": critical_direct_count,
        "unique_inspectors_count": unique_inspectors_count,
        "latest_animal_count": latest_animal_count,
        "licensed_animal_limit": licensed_limit,
    }

    latest_inspection = None
    if inspections:
        latest = inspections[0]
        latest_inspection = {
            "inspection_date": latest.get("inspection_date"),
            "inspection_type": latest.get("inspection_type"),
            "inspector_name": latest.get("inspector_name"),
            "violation_count": latest.get("violation_count") or 0,
        }

    # Compute risk flags in-memory
    risk_flags = {
        "exceeds_animal_limit": False,
        "high_direct_violations": False,
        "inventory_spike": False,
    }
    if licensed_limit is not None and latest_animal_count > licensed_limit:
        risk_flags["exceeds_animal_limit"] = True

    cutoff_date = date.today() - timedelta(days=18 * 30)
    direct_viol_count = sum(
        1 for insp in inspections
        for v in insp.get("violations", [])
        if insp.get("inspection_date") and insp.get("inspection_date") >= cutoff_date
        and v.get("severity") and v.get("severity").lower() in ("critical", "direct")
    )
    if direct_viol_count > 3:
        risk_flags["high_direct_violations"] = True

    insps_with_inv = [insp for insp in inspections if len(insp.get("inventory", [])) > 0]
    insps_with_inv.sort(key=lambda x: (x.get("inspection_date") or date.min, x.get("id")))
    if len(insps_with_inv) >= 2:
        prev_total = sum(item.get("count") or 0 for item in insps_with_inv[-2].get("inventory", []))
        curr_total = sum(item.get("count") or 0 for item in insps_with_inv[-1].get("inventory", []))
        if prev_total > 0 and curr_total > prev_total * 3:
            risk_flags["inventory_spike"] = True

    risk_flags["animal_limit_exceeded"] = risk_flags["exceeds_animal_limit"]
    risk_flags["has_high_direct_violations"] = risk_flags["high_direct_violations"]
    risk_flags["recent_inventory_spike"] = risk_flags["inventory_spike"]

    active_flags_count = sum([
        risk_flags["animal_limit_exceeded"],
        risk_flags["has_high_direct_violations"],
        risk_flags["recent_inventory_spike"]
    ])
    
    if risk_flags["has_high_direct_violations"] or active_flags_count >= 2:
        risk_flags["risk_level"] = "HIGH"
    elif active_flags_count == 1:
        risk_flags["risk_level"] = "MEDIUM"
    else:
        risk_flags["risk_level"] = "LOW"

    drivers = []
    if risk_flags["animal_limit_exceeded"]:
        drivers.append("Latest animal count exceeds licensed inventory limit")
    if risk_flags["has_high_direct_violations"]:
        drivers.append("More than 3 direct or critical violations in the last 18 months")
    if risk_flags["recent_inventory_spike"]:
        drivers.append("Significant animal inventory spike detected between recent audits")
    risk_flags["risk_drivers"] = drivers

    # Compute prioritized facts in-memory
    prioritized_facts = []
    
    if latest_inspection and latest_inspection["inspection_date"]:
        latest_date_str = latest_inspection["inspection_date"].strftime("%b %d, %Y").upper().replace(" ", "_")
        prioritized_facts.append({
            "key": "latest-insp",
            "text": f"The most recent inspection on {latest_date_str} was a {latest_inspection['inspection_type'] or 'ROUTINE INSPECTION'} and recorded {latest_inspection['violation_count']} violation(s).",
            "citations": [{"inspection_id": inspections[0]["id"], "inspection_date": latest_inspection["inspection_date"].isoformat()}]
        })

    if licensed_limit:
        for insp in inspections:
            total_inv = sum(item.get("count") or 0 for item in insp.get("inventory", []))
            if total_inv > licensed_limit:
                insp_date_str = insp["inspection_date"].strftime("%b %d, %Y").upper().replace(" ", "_") if insp.get("inspection_date") else None
                prioritized_facts.append({
                    "key": f"limit-exceeded-{insp['id']}",
                    "text": f"Total animal inventory ({total_inv}) exceeded the licensed limit of {licensed_limit} during the inspection on {insp_date_str or '—'}.",
                    "citations": [{"inspection_id": insp["id"], "inspection_date": insp["inspection_date"].isoformat() if insp.get("inspection_date") else None}]
                })

    all_critical_violations = []
    for insp in inspections:
        for v in insp.get("violations", []):
            if v.get("severity") and v.get("severity").lower() in ("critical", "direct"):
                all_critical_violations.append((insp, v))
                
    all_critical_violations.sort(key=lambda x: (x[0].get("inspection_date") or date.min, x[0].get("id")), reverse=True)
    
    for insp, v in all_critical_violations[:3]:
        v_date_str = insp["inspection_date"].strftime("%b %d, %Y").upper().replace(" ", "_") if insp.get("inspection_date") else None
        severity_label = v.get("severity").upper() if v.get("severity") else "VIOLATION"
        desc_excerpt = v.get("description")[:90] + "..." if v.get("description") and len(v.get("description")) > 90 else (v.get("description") or "")
        v_category = map_section_to_category(v.get("section"), v.get("description"))
        prioritized_facts.append({
            "key": f"viol-{v['id']}",
            "text": f"Cited for a {severity_label} violation of Section {v.get('section') or '?'} ({v_category or 'General Care'}) on {v_date_str or '—'}: \"{desc_excerpt}\"",
            "citations": [{"inspection_id": insp["id"], "inspection_date": insp["inspection_date"].isoformat() if insp.get("inspection_date") else None, "source_page": v.get("source_page")}]
        })

    section_counts = {}
    section_violations = {}
    for insp in inspections:
        for v in insp.get("violations", []):
            sec = v.get("section")
            if sec:
                section_counts[sec] = section_counts.get(sec, 0) + 1
                section_violations.setdefault(sec, []).append((insp, v))
                
    for sec, count in section_counts.items():
        if count >= 2:
            cits = section_violations[sec]
            prioritized_facts.append({
                "key": f"recurring-sec-{sec}",
                "text": f"Section {sec} was cited recurrently ({count} times) across multiple inspections.",
                "citations": [{"inspection_id": insp["id"], "inspection_date": insp["inspection_date"].isoformat() if insp.get("inspection_date") else None, "source_page": v.get("source_page")} for insp, v in cits]
            })

    # Compile recent activities list
    recent_activities = []
    for insp in inspections[:5]:
        recent_activities.append({
            "type": "inspection",
            "id": insp["id"],
            "date": insp["inspection_date"].isoformat() if insp.get("inspection_date") else None,
            "title": "Inspection Conducted",
            "violations": insp.get("violation_count") or 0,
            "description": f"A {insp.get('inspection_type') or 'Routine'} inspection was completed by inspector {insp.get('inspector_name') or 'UNKNOWN'}, recording {insp.get('violation_count') or 0} violation(s)."
        })

    for act in enforcements:
        recent_activities.append({
            "type": "enforcement",
            "id": act["id"],
            "date": act["action_date"].isoformat() if act.get("action_date") else None,
            "title": f"Enforcement Action: {act.get('action_type')}",
            "violations": 0,
            "description": f"Outcome: {act.get('outcome') or 'PENDING'} {f'| Penalty: ${act.get('penalty_amount'):,.2f}' if act.get('penalty_amount') else ''}"
        })

    recent_activities.sort(key=lambda x: x["date"] or "", reverse=True)
    recent_activities = recent_activities[:5]

    return {
        "id": facility["id"],
        "name": facility["name"],
        "customer_id": facility.get("customer_id"),
        "certificate_number": facility.get("certificate_number"),
        "license_status": facility.get("license_status"),
        "license_type": facility.get("license_type"),
        "address": facility.get("address"),
        "city": facility.get("city"),
        "state": facility.get("state"),
        "zip_code": facility.get("zip_code"),
        "county": facility.get("county"),
        "licensed_animal_limit": licensed_limit,
        "risk_flags": risk_flags,
        "compliance_snapshot": compliance_snapshot,
        "latest_inspection": latest_inspection,
        "prioritized_facts": prioritized_facts[:5],
        "recent_activities": recent_activities
    }


@router.get("/{facility_id}/inspections", response_model=List[InspectionOut])
@limiter.limit("30/minute")
def get_facility_inspections(facility_id: int, request: Request, db: Session = Depends(get_db)):
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


