from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import case, desc, func, or_
from sqlalchemy.orm import Session

from app.auth import require_api_key
from app.database import get_db
from app.models import EnforcementAction, Facility, Inspection, Inventory, Violation
from app.schemas import DashboardStatsOut
from app.services.category_mapper import map_section_to_category
from app.services.risk_engine import cutoff_18_months_ago

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(require_api_key)])


def _pct_change(current: int, previous: int) -> float | None:
    if previous in (None, 0):
        return None if current == 0 else 100.0
    return round(((current - previous) / previous) * 100, 1)


def _activity_item(activity_type: str, item_id: int, when_value, title: str, detail: str, tone: str = "primary"):
    return {
        "type": activity_type,
        "id": item_id,
        "date": when_value.isoformat() if when_value else None,
        "title": title,
        "detail": detail,
        "tone": tone,
    }


@router.get("/stats", response_model=DashboardStatsOut)
def get_dashboard_stats(db: Session = Depends(get_db)):
    today = datetime.now(timezone.utc).date()
    current_window_start = today - timedelta(days=30)
    previous_window_start = today - timedelta(days=60)
    current_datetime_start = datetime.now(timezone.utc) - timedelta(days=30)
    previous_datetime_start = datetime.now(timezone.utc) - timedelta(days=60)

    # Totals.
    total_facilities = db.query(Facility).count()
    total_inspections = db.query(Inspection).count()
    total_violations = db.query(Violation).count()
    total_enforcement_actions = db.query(EnforcementAction).count()
    total_inspectors = (
        db.query(func.count(func.distinct(Inspection.inspector_id)))
        .filter(Inspection.inspector_id.isnot(None), Inspection.inspector_id != "")
        .scalar()
        or 0
    )
    ocr_processed_documents = (
        db.query(EnforcementAction)
        .filter(or_(EnforcementAction.pdf_processed.is_(True), EnforcementAction.ocr_status == "completed"))
        .count()
    )

    # KPI trends use 30-day rolling windows so the dashboard can show movement without inventing values.
    inspections_current = (
        db.query(func.count(Inspection.id))
        .filter(Inspection.inspection_date >= current_window_start)
        .scalar()
        or 0
    )
    inspections_previous = (
        db.query(func.count(Inspection.id))
        .filter(Inspection.inspection_date >= previous_window_start, Inspection.inspection_date < current_window_start)
        .scalar()
        or 0
    )
    violations_current = (
        db.query(func.count(Violation.id))
        .join(Inspection, Violation.inspection_id == Inspection.id)
        .filter(Inspection.inspection_date >= current_window_start)
        .scalar()
        or 0
    )
    violations_previous = (
        db.query(func.count(Violation.id))
        .join(Inspection, Violation.inspection_id == Inspection.id)
        .filter(Inspection.inspection_date >= previous_window_start, Inspection.inspection_date < current_window_start)
        .scalar()
        or 0
    )
    enforcement_current = (
        db.query(func.count(EnforcementAction.id))
        .filter(EnforcementAction.action_date >= current_window_start)
        .scalar()
        or 0
    )
    enforcement_previous = (
        db.query(func.count(EnforcementAction.id))
        .filter(EnforcementAction.action_date >= previous_window_start, EnforcementAction.action_date < current_window_start)
        .scalar()
        or 0
    )
    ocr_current = (
        db.query(func.count(EnforcementAction.id))
        .filter(EnforcementAction.created_at >= current_datetime_start)
        .scalar()
        or 0
    )
    ocr_previous = (
        db.query(func.count(EnforcementAction.id))
        .filter(EnforcementAction.created_at >= previous_datetime_start, EnforcementAction.created_at < current_datetime_start)
        .scalar()
        or 0
    )
    kpi_trends = {
        "inspections": {
            "current": inspections_current,
            "previous": inspections_previous,
            "delta": inspections_current - inspections_previous,
            "change": _pct_change(inspections_current, inspections_previous),
        },
        "violations": {
            "current": violations_current,
            "previous": violations_previous,
            "delta": violations_current - violations_previous,
            "change": _pct_change(violations_current, violations_previous),
        },
        "enforcement_actions": {
            "current": enforcement_current,
            "previous": enforcement_previous,
            "delta": enforcement_current - enforcement_previous,
            "change": _pct_change(enforcement_current, enforcement_previous),
        },
        "ocr_processed_documents": {
            "current": ocr_current,
            "previous": ocr_previous,
            "delta": ocr_current - ocr_previous,
            "change": _pct_change(ocr_current, ocr_previous),
        },
    }

    # Violation breakdowns.
    severity_rows = db.query(Violation.severity, func.count(Violation.id)).group_by(Violation.severity).all()
    severity_distribution = {(row[0] or "Unknown").capitalize(): row[1] for row in severity_rows}
    direct_critical_count = sum(row[1] for row in severity_rows if (row[0] or "").lower() in {"direct", "critical"})
    indirect_teachable_count = sum(row[1] for row in severity_rows if (row[0] or "").lower() in {"indirect", "teachable"})

    category_rows = (
        db.query(
            Violation.section,
            func.max(Violation.description).label("description"),
            func.count(Violation.id).label("count"),
        )
        .group_by(Violation.section)
        .all()
    )
    category_totals: dict[str, int] = {}
    for section, description, count in category_rows:
        category = map_section_to_category(section, description)
        category_totals[category] = category_totals.get(category, 0) + count
    top_violation_categories = [
        {"category": category, "count": count}
        for category, count in sorted(category_totals.items(), key=lambda item: item[1], reverse=True)[:6]
    ]

    # Recent activity combines inspections, violations, enforcement actions, and document intake events.
    recent_activity = []

    latest_inspections = (
        db.query(
            Inspection.id,
            Inspection.inspection_date,
            Inspection.inspection_type,
            Inspection.inspector_name,
            Inspection.violation_count,
            Facility.name.label("facility_name"),
            Facility.state.label("facility_state"),
        )
        .join(Facility, Facility.id == Inspection.facility_id)
        .order_by(desc(Inspection.inspection_date), desc(Inspection.id))
        .limit(5)
        .all()
    )
    for row in latest_inspections:
        recent_activity.append(
            _activity_item(
                "inspection",
                row.id,
                row.inspection_date,
                f"Inspection at {row.facility_name}",
                f"{row.inspector_name or 'Unknown inspector'} · {row.inspection_type or 'Inspection'} · {row.violation_count or 0} violation(s)",
                "critical" if (row.violation_count or 0) > 0 else "primary",
            )
        )

    latest_violations = (
        db.query(
            Violation.id,
            Violation.severity,
            Violation.section,
            Violation.description,
            Inspection.inspection_date,
            Facility.name.label("facility_name"),
            Facility.state.label("facility_state"),
        )
        .join(Inspection, Violation.inspection_id == Inspection.id)
        .join(Facility, Facility.id == Inspection.facility_id)
        .order_by(desc(Inspection.inspection_date), desc(Violation.id))
        .limit(5)
        .all()
    )
    for row in latest_violations:
        severity = (row.severity or "violation").upper()
        category = map_section_to_category(row.section, row.description)
        recent_activity.append(
            _activity_item(
                "violation",
                row.id,
                row.inspection_date,
                f"{severity} violation at {row.facility_name}",
                f"{category} · Section {row.section or '—'}",
                "critical" if (row.severity or "").lower() in {"direct", "critical"} else "secondary",
            )
        )

    latest_enforcement_actions = (
        db.query(
            EnforcementAction.id,
            EnforcementAction.action_date,
            EnforcementAction.action_type,
            EnforcementAction.outcome,
            EnforcementAction.penalty_amount,
            EnforcementAction.ocr_status,
            EnforcementAction.pdf_processed,
            Facility.name.label("facility_name"),
            Facility.state.label("facility_state"),
        )
        .join(Facility, Facility.id == EnforcementAction.facility_id)
        .order_by(desc(EnforcementAction.action_date), desc(EnforcementAction.id))
        .limit(5)
        .all()
    )
    for row in latest_enforcement_actions:
        detail = f"Outcome: {row.outcome or 'Pending'}"
        if row.penalty_amount:
            detail += f" · Penalty: ${row.penalty_amount:,.2f}"
        recent_activity.append(
            _activity_item(
                "enforcement",
                row.id,
                row.action_date,
                f"{row.action_type} at {row.facility_name}",
                detail,
                "critical" if (row.penalty_amount or 0) > 0 else "secondary",
            )
        )

    latest_documents = (
        db.query(
            Inspection.id,
            Inspection.processed_at,
            Inspection.processing_status,
            Inspection.source_type,
            Facility.name.label("facility_name"),
            Facility.state.label("facility_state"),
        )
        .join(Facility, Facility.id == Inspection.facility_id)
        .filter(Inspection.processed_at.isnot(None))
        .order_by(desc(Inspection.processed_at), desc(Inspection.id))
        .limit(5)
        .all()
    )
    for row in latest_documents:
        recent_activity.append(
            _activity_item(
                "document_upload",
                row.id,
                row.processed_at,
                f"Document processed for {row.facility_name}",
                f"{row.source_type or 'Unknown source'} · {row.processing_status or 'pending'}",
                "primary" if str(row.processing_status).lower() == "completed" else "warning",
            )
        )

    recent_activity.sort(key=lambda item: item["date"] or "", reverse=True)
    recent_activity = recent_activity[:12]

    # Geographic distributions.
    facilities_by_state_rows = (
        db.query(Facility.state, func.count(Facility.id))
        .filter(Facility.state.isnot(None))
        .group_by(Facility.state)
        .order_by(desc(func.count(Facility.id)))
        .all()
    )
    facilities_by_state = [{"state": row[0], "count": row[1]} for row in facilities_by_state_rows]
    top_states = facilities_by_state

    violations_by_state_rows = (
        db.query(Facility.state, func.count(Violation.id))
        .join(Inspection, Facility.id == Inspection.facility_id)
        .join(Violation, Violation.inspection_id == Inspection.id)
        .filter(Facility.state.isnot(None))
        .group_by(Facility.state)
        .order_by(desc(func.count(Violation.id)))
        .all()
    )
    violations_by_state = [{"state": row[0], "count": row[1]} for row in violations_by_state_rows]

    enforcement_by_state_rows = (
        db.query(Facility.state, func.count(EnforcementAction.id))
        .join(EnforcementAction, EnforcementAction.facility_id == Facility.id)
        .filter(Facility.state.isnot(None))
        .group_by(Facility.state)
        .order_by(desc(func.count(EnforcementAction.id)))
        .all()
    )
    enforcement_by_state = [{"state": row[0], "count": row[1]} for row in enforcement_by_state_rows]

    # Inspector activity.
    top_inspectors_rows = (
        db.query(
            Inspection.inspector_id,
            func.max(Inspection.inspector_name).label("name"),
            func.count(Inspection.id).label("cnt"),
            func.sum(case((Inspection.violations_found.is_(True), 1), else_=0)).label("violating_inspections"),
            func.sum(func.coalesce(Inspection.violation_count, 0)).label("violation_total"),
            func.max(Inspection.inspection_date).label("recent_date"),
        )
        .filter(Inspection.inspector_id.isnot(None), Inspection.inspector_id != "")
        .group_by(Inspection.inspector_id)
        .order_by(desc("cnt"))
        .limit(5)
        .all()
    )
    top_inspectors = [
        {
            "inspector_id": row[0],
            "name": row[1] or row[0],
            "inspection_count": row[2],
            "violating_inspections": int(row[3] or 0),
            "violations_found": int(row[4] or 0),
            "recent_inspection_date": row[5].isoformat() if row[5] else None,
        }
        for row in top_inspectors_rows
    ]

    inspector_activity_rows = (
        db.query(
            Inspection.inspector_id,
            func.max(Inspection.inspector_name).label("name"),
            func.count(Inspection.id).label("cnt"),
            func.sum(case((Inspection.violations_found.is_(True), 1), else_=0)).label("violating_inspections"),
            func.sum(func.coalesce(Inspection.violation_count, 0)).label("violation_total"),
            func.max(Inspection.inspection_date).label("recent_date"),
        )
        .filter(Inspection.inspector_id.isnot(None), Inspection.inspector_id != "")
        .group_by(Inspection.inspector_id)
        .order_by(desc("cnt"), desc("recent_date"))
        .limit(8)
        .all()
    )
    inspector_activity = [
        {
            "inspector_id": row[0],
            "inspector_name": row[1] or row[0],
            "inspection_count": row[2],
            "violating_inspections": int(row[3] or 0),
            "violations_found": int(row[4] or 0),
            "recent_inspection_date": row[5].isoformat() if row[5] else None,
        }
        for row in inspector_activity_rows
    ]

    # Enforcement overview.
    penalty_trend_rows = (
        db.query(
            func.to_char(EnforcementAction.action_date, "YYYY-MM").label("month"),
            func.count(EnforcementAction.id).label("count"),
            func.coalesce(func.sum(EnforcementAction.penalty_amount), 0).label("penalty_total"),
        )
        .group_by("month")
        .order_by("month")
        .all()
    )
    penalty_trend = [
        {"month": row[0], "count": row[1], "penalty_total": float(row[2] or 0)}
        for row in penalty_trend_rows
        if row[0]
    ]

    recent_enforcement_rows = (
        db.query(
            EnforcementAction.id,
            EnforcementAction.action_date,
            EnforcementAction.action_type,
            EnforcementAction.outcome,
            EnforcementAction.penalty_amount,
            EnforcementAction.ocr_status,
            EnforcementAction.pdf_processed,
            Facility.name.label("facility_name"),
            Facility.state.label("facility_state"),
        )
        .join(Facility, Facility.id == EnforcementAction.facility_id)
        .order_by(desc(EnforcementAction.action_date), desc(EnforcementAction.id))
        .limit(6)
        .all()
    )
    recent_enforcement_actions = [
        {
            "id": row[0],
            "date": row[1].isoformat() if row[1] else None,
            "action_type": row[2],
            "outcome": row[3],
            "penalty_amount": float(row[4] or 0),
            "ocr_status": row[5].value if hasattr(row[5], "value") else row[5],
            "pdf_processed": row[6],
            "facility_name": row[7],
            "facility_state": row[8],
        }
        for row in recent_enforcement_rows
    ]

    enforcement_history_rows = (
        db.query(
            Facility.id,
            Facility.name,
            Facility.state,
            func.count(EnforcementAction.id).label("action_count"),
            func.max(EnforcementAction.action_date).label("last_action_date"),
            func.sum(EnforcementAction.penalty_amount).label("total_penalty"),
        )
        .join(EnforcementAction, EnforcementAction.facility_id == Facility.id)
        .group_by(Facility.id, Facility.name, Facility.state)
        .order_by(desc("action_count"), Facility.name)
        .limit(8)
        .all()
    )
    facilities_with_enforcement_history = [
        {
            "id": row[0],
            "name": row[1],
            "state": row[2],
            "action_count": row[3],
            "last_action_date": row[4].isoformat() if row[4] else None,
            "total_penalty": float(row[5] or 0),
        }
        for row in enforcement_history_rows
    ]

    # Risk queue.
    top_violation_facilities_rows = (
        db.query(Facility.id, Facility.name, Facility.state, func.count(Violation.id).label("viol_count"))
        .join(Inspection, Facility.id == Inspection.facility_id)
        .join(Violation, Violation.inspection_id == Inspection.id)
        .group_by(Facility.id, Facility.name, Facility.state)
        .order_by(desc("viol_count"), Facility.name)
        .limit(8)
        .all()
    )
    high_violation_facilities = [
        {"id": row[0], "name": row[1], "state": row[2], "violation_count": row[3]}
        for row in top_violation_facilities_rows
    ]

    top_direct_critical_rows = (
        db.query(Facility.id, Facility.name, Facility.state, func.count(Violation.id).label("dc_count"))
        .join(Inspection, Facility.id == Inspection.facility_id)
        .join(Violation, Violation.inspection_id == Inspection.id)
        .filter(
            Inspection.inspection_date >= cutoff_18_months_ago(),
            func.lower(Violation.severity).in_(["direct", "critical"]),
        )
        .group_by(Facility.id, Facility.name, Facility.state)
        .order_by(desc("dc_count"), Facility.name)
        .limit(8)
        .all()
    )
    direct_critical_facilities = [
        {"id": row[0], "name": row[1], "state": row[2], "direct_critical_count": row[3]}
        for row in top_direct_critical_rows
    ]

    # Monthly history retained for the existing dashboard visual language.
    twelve_months_ago = datetime.now(timezone.utc).date().replace(day=1) - timedelta(days=365)
    monthly_rows = (
        db.query(
            func.to_char(Inspection.inspection_date, "YYYY-MM").label("month"),
            func.count(Inspection.id),
        )
        .filter(Inspection.inspection_date >= twelve_months_ago)
        .group_by("month")
        .order_by("month")
        .all()
    )
    inspections_per_month = [{"month": row[0], "count": row[1]} for row in monthly_rows if row[0]]

    # Preserve the original risk counts using the existing query patterns.
    latest_date_sub = (
        db.query(Inspection.facility_id, func.max(Inspection.inspection_date).label("max_date"))
        .group_by(Inspection.facility_id)
        .subquery()
    )

    flag_d_count = (
        db.query(Facility.id)
        .join(latest_date_sub, Facility.id == latest_date_sub.c.facility_id)
        .join(
            Inspection,
            (Inspection.facility_id == Facility.id) & (Inspection.inspection_date == latest_date_sub.c.max_date),
        )
        .join(Inventory, Inventory.inspection_id == Inspection.id)
        .group_by(Facility.id, Facility.licensed_animal_limit)
        .having(func.sum(Inventory.count) > Facility.licensed_animal_limit)
        .count()
    )

    cutoff_date = cutoff_18_months_ago()
    flag_c_count = (
        db.query(Inspection.facility_id)
        .join(Violation, Violation.inspection_id == Inspection.id)
        .filter(
            Inspection.inspection_date >= cutoff_date,
            func.lower(Violation.severity).in_(["direct", "critical"]),
        )
        .group_by(Inspection.facility_id)
        .having(func.count(Violation.id) > 3)
        .count()
    )

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
        .over(partition_by=insp_inv_total.c.facility_id, order_by=insp_inv_total.c.inspection_date)
        .label("prev_total"),
    ).subquery()

    flag_e_count = (
        db.query(prev_inv_total.c.facility_id)
        .filter(prev_inv_total.c.prev_total > 0, prev_inv_total.c.curr_total > prev_inv_total.c.prev_total * 3)
        .distinct()
        .count()
    )

    return {
        "total_facilities": total_facilities,
        "total_inspections": total_inspections,
        "total_violations": total_violations,
        "total_enforcement_actions": total_enforcement_actions,
        "total_inspectors": total_inspectors,
        "ocr_processed_documents": ocr_processed_documents,
        "kpi_trends": kpi_trends,
        "recent_activity": recent_activity,
        "violations_overview": {
            "severity_distribution": severity_distribution,
            "direct_vs_indirect": {
                "direct_or_critical": direct_critical_count,
                "indirect_or_teachable": indirect_teachable_count,
            },
            "top_categories": top_violation_categories,
        },
        "geographic_overview": {
            "facilities_by_state": facilities_by_state,
            "violations_by_state": violations_by_state,
            "enforcement_by_state": enforcement_by_state,
        },
        "inspector_activity": inspector_activity,
        "enforcement_overview": {
            "total_enforcement_actions": total_enforcement_actions,
            "recent_enforcement_actions": recent_enforcement_actions,
            "penalty_trend": penalty_trend,
            "facilities_with_enforcement_history": facilities_with_enforcement_history,
        },
        "facility_risk_queue": {
            "high_violation_facilities": high_violation_facilities,
            "direct_critical_facilities": direct_critical_facilities,
            "facilities_with_enforcement_actions": facilities_with_enforcement_history,
        },
        "severity_distribution": severity_distribution,
        "top_violating_facilities": high_violation_facilities,
        "top_states": top_states,
        "top_inspectors": top_inspectors,
        "risk_flags_distribution": {
            "exceeds_animal_limit": flag_d_count,
            "high_direct_violations": flag_c_count,
            "inventory_spike": flag_e_count,
        },
        "inspections_per_month": inspections_per_month,
    }
