import logging
from datetime import date, datetime, timezone

from dateutil.relativedelta import relativedelta
from sqlalchemy import case, desc, func
from sqlalchemy.orm import Session

from app.services.category_mapper import map_section_to_category
from app.models import EnforcementAction, Facility, Inspection, Inventory, Violation

logger = logging.getLogger(__name__)


def cutoff_18_months_ago() -> date:
    """
    Returns the calendar-correct date 18 months prior to today.
    Under USDA APHIS policy, receiving four or more inspection reports with
    direct/critical noncompliant items within an 18-month rolling window
    triggers heightened scrutiny and potential enforcement action.
    """
    return datetime.now(timezone.utc).date() - relativedelta(months=18)


def calculate_facilities_risk_flags_bulk(db: Session, facilities: list) -> dict:
    """
    Bulk calculation of risk flags and compliance metadata for a list of facilities.
    Avoids N+1 query overhead by executing 4 batched queries instead of 200+ sequential queries.
    """
    facility_ids = [f.id for f in facilities]
    results = {}
    if not facility_ids:
        return results

    # 1. Fetch all inspections for these facilities, ordered by date desc, then id desc
    inspections = (
        db.query(Inspection)
        .filter(Inspection.facility_id.in_(facility_ids))
        .order_by(desc(Inspection.inspection_date), desc(Inspection.id))
        .all()
    )

    inspections_by_facility = {}
    for insp in inspections:
        inspections_by_facility.setdefault(insp.facility_id, []).append(insp)

    inspection_ids = [insp.id for insp in inspections]

    # 2. Fetch all inventories for these inspections
    inventories_by_inspection = {}
    if inspection_ids:
        inventories = (
            db.query(Inventory)
            .filter(Inventory.inspection_id.in_(inspection_ids))
            .all()
        )
        for inv in inventories:
            inventories_by_inspection.setdefault(inv.inspection_id, []).append(inv)

    # 3. Fetch all violations for these inspections
    violations_by_inspection = {}
    if inspection_ids:
        violations = (
            db.query(Violation)
            .filter(Violation.inspection_id.in_(inspection_ids))
            .all()
        )
        for viol in violations:
            violations_by_inspection.setdefault(viol.inspection_id, []).append(viol)

    # 4. Fetch all facilities that have enforcement actions
    enforcement_facility_ids = {
        row.facility_id
        for row in db.query(EnforcementAction.facility_id)
        .filter(EnforcementAction.facility_id.in_(facility_ids))
        .distinct()
        .all()
    }

    cutoff_date = cutoff_18_months_ago()
    severity_priority = {"critical": 4, "direct": 3, "indirect": 2, "teachable": 1}

    for facility in facilities:
        facility_id = facility.id
        inspections_for_fac = inspections_by_facility.get(facility_id, [])

        # Default values when no inspections/violations exist
        flags = {
            "exceeds_animal_limit": False,
            "high_direct_violations": False,
            "inventory_spike": False,
            "animal_limit_exceeded": False,
            "has_high_direct_violations": False,
            "recent_inventory_spike": False,
            "risk_level": "LOW",
            "risk_drivers": [],
            "score": 0,
            "compliance_score": 100,
            "has_enforcement_actions": facility_id in enforcement_facility_ids,
            "highest_severity": None,
            "last_inspection_status": "No Inspections",
        }

        if not inspections_for_fac:
            results[facility_id] = flags
            continue

        # 1. exceeds_animal_limit
        if facility.licensed_animal_limit is not None:
            latest_inv_inspection = None
            for insp in inspections_for_fac:
                if insp.id in inventories_by_inspection:
                    latest_inv_inspection = insp
                    break
            if latest_inv_inspection:
                total_animals = sum(inv.count for inv in inventories_by_inspection.get(latest_inv_inspection.id, []))
                if total_animals > facility.licensed_animal_limit:
                    flags["exceeds_animal_limit"] = True

        # 2. high_direct_violations
        direct_viol_count = 0
        for insp in inspections_for_fac:
            if insp.inspection_date >= cutoff_date:
                for viol in violations_by_inspection.get(insp.id, []):
                    if viol.severity and viol.severity.lower() in ["direct", "critical"]:
                        direct_viol_count += 1
        if direct_viol_count > 3:
            flags["high_direct_violations"] = True

        # 3. inventory_spike
        inspections_with_inv = [
            insp for insp in reversed(inspections_for_fac)
            if insp.id in inventories_by_inspection
        ]
        if len(inspections_with_inv) >= 2:
            prev_insp = inspections_with_inv[-2]
            curr_insp = inspections_with_inv[-1]
            prev_total = sum(inv.count for inv in inventories_by_inspection.get(prev_insp.id, []))
            curr_total = sum(inv.count for inv in inventories_by_inspection.get(curr_insp.id, []))
            if prev_total > 0 and curr_total > prev_total * 3:
                flags["inventory_spike"] = True

        # Align keys
        flags["animal_limit_exceeded"] = flags["exceeds_animal_limit"]
        flags["has_high_direct_violations"] = flags["high_direct_violations"]
        flags["recent_inventory_spike"] = flags["inventory_spike"]

        # Compute risk level
        active_flags_count = sum([
            flags["animal_limit_exceeded"],
            flags["has_high_direct_violations"],
            flags["recent_inventory_spike"]
        ])
        
        if flags["has_high_direct_violations"] or active_flags_count >= 2:
            flags["risk_level"] = "HIGH"
        elif active_flags_count == 1:
            flags["risk_level"] = "MEDIUM"
        else:
            flags["risk_level"] = "LOW"

        # Compute risk drivers
        drivers = []
        if flags["animal_limit_exceeded"]:
            drivers.append("Licensed animal limit exceeded in latest inventory")
        if flags["has_high_direct_violations"]:
            drivers.append("More than 3 direct/critical violations in the last 18 months")
        if flags["recent_inventory_spike"]:
            drivers.append("Sudden animal inventory spike (>3x increase) between recent inspections")

        # Check for any direct/critical violation in the rolling 18 months
        has_any_recent_direct = False
        for insp in inspections_for_fac:
            if insp.inspection_date >= cutoff_date:
                for viol in violations_by_inspection.get(insp.id, []):
                    if viol.severity and viol.severity.lower() in ["direct", "critical"]:
                        has_any_recent_direct = True
                        break
            if has_any_recent_direct:
                break
        if has_any_recent_direct and not flags["has_high_direct_violations"]:
            drivers.append("Recent critical or direct violations noted in the past 18 months")

        flags["risk_drivers"] = drivers
        flags["score"] = active_flags_count * 5

        # Compute max violation severity
        max_priority = 0
        highest_severity_str = None
        for insp in inspections_for_fac:
            for viol in violations_by_inspection.get(insp.id, []):
                sev = viol.severity.lower() if viol.severity else None
                if sev and severity_priority.get(sev, 0) > max_priority:
                    max_priority = severity_priority[sev]
                    highest_severity_str = viol.severity

        flags["highest_severity"] = highest_severity_str

        # Compute last inspection status
        latest_insp = inspections_for_fac[0]
        if latest_insp.violations_found:
            flags["last_inspection_status"] = f"Violations Found ({latest_insp.violation_count})"
        else:
            flags["last_inspection_status"] = "No Violations"

        # Count total violations
        total_viol_count = sum(len(violations_by_inspection.get(insp.id, [])) for insp in inspections_for_fac)

        # Compute compliance score: max 100, deductions based on risk factors and violations
        deductions = total_viol_count * 4
        if flags["has_high_direct_violations"]:
            deductions += 25
        elif has_any_recent_direct:
            deductions += 15
        if flags["animal_limit_exceeded"]:
            deductions += 15
        if flags["recent_inventory_spike"]:
            deductions += 10
        flags["compliance_score"] = max(0, 100 - deductions)

        results[facility_id] = flags

    return results


def calculate_facility_risk_flags(db: Session, facility_id: int) -> dict:
    """
    Calculate risk flags for a facility:
    - exceeds_animal_limit: latest inventory count > facility.licensed_animal_limit
    - high_direct_violations: count of DIRECT/CRITICAL violations in the last 18 months > 3
    - inventory_spike: latest inventory count > previous inventory count * 3 (if previous > 0)
    """
    flags = {
        "exceeds_animal_limit": False,
        "high_direct_violations": False,
        "inventory_spike": False,
    }

    facility = db.query(Facility).filter(Facility.id == facility_id).first()
    if not facility:
        return flags

    # 1. Get the latest two inspections that have inventory, ordered by date desc
    recent_insps_with_inv = (
        db.query(Inspection.id, Inspection.inspection_date)
        .join(Inventory, Inventory.inspection_id == Inspection.id)
        .filter(Inspection.facility_id == facility_id)
        .group_by(Inspection.id, Inspection.inspection_date)
        .order_by(desc(Inspection.inspection_date), desc(Inspection.id))
        .limit(2)
        .all()
    )

    if recent_insps_with_inv:
        insp_ids = [r.id for r in recent_insps_with_inv]
        totals = (
            db.query(Inventory.inspection_id, func.sum(Inventory.count))
            .filter(Inventory.inspection_id.in_(insp_ids))
            .group_by(Inventory.inspection_id)
            .all()
        )
        totals_map = {t[0]: t[1] or 0 for t in totals}
        
        latest_total = totals_map.get(recent_insps_with_inv[0].id, 0)
        
        # exceeds_animal_limit
        if facility.licensed_animal_limit is not None and latest_total > facility.licensed_animal_limit:
            flags["exceeds_animal_limit"] = True
            
        # inventory_spike
        if len(recent_insps_with_inv) >= 2:
            prev_total = totals_map.get(recent_insps_with_inv[1].id, 0)
            if prev_total > 0 and latest_total > prev_total * 3:
                flags["inventory_spike"] = True

    # 2. high_direct_violations
    # 18 months rolling window from today (regulatory timeframe for persistent noncompliance)
    cutoff_date = cutoff_18_months_ago()
    # Query count of violations with Direct or Critical severity in last 18 months for this facility
    direct_viol_count = (
        db.query(func.count(Violation.id))
        .join(Inspection, Violation.inspection_id == Inspection.id)
        .filter(
            Inspection.facility_id == facility_id,
            Inspection.inspection_date >= cutoff_date,
            func.lower(Violation.severity).in_(["direct", "critical"]),
        )
        .scalar()
        or 0
    )
    if direct_viol_count > 3:
        flags["high_direct_violations"] = True

    # Align new keys
    flags["animal_limit_exceeded"] = flags["exceeds_animal_limit"]
    flags["has_high_direct_violations"] = flags["high_direct_violations"]
    flags["recent_inventory_spike"] = flags["inventory_spike"]

    # Compute risk level
    active_flags_count = sum([
        flags["animal_limit_exceeded"],
        flags["has_high_direct_violations"],
        flags["recent_inventory_spike"]
    ])
    
    if flags["has_high_direct_violations"] or active_flags_count >= 2:
        flags["risk_level"] = "HIGH"
    elif active_flags_count == 1:
        flags["risk_level"] = "MEDIUM"
    else:
        flags["risk_level"] = "LOW"

    # Compute risk drivers
    drivers = []
    if flags["animal_limit_exceeded"]:
        drivers.append("Licensed animal limit exceeded in latest inventory")
    if flags["has_high_direct_violations"]:
        drivers.append("More than 3 direct/critical violations in the last 18 months")
    if flags["recent_inventory_spike"]:
        drivers.append("Sudden animal inventory spike (>3x increase) between recent inspections")

    # Check for any direct/critical violation in the rolling 18 months
    if not flags["has_high_direct_violations"]:
        has_any_recent_direct = db.query(Violation.id).join(Inspection, Violation.inspection_id == Inspection.id).filter(
            Inspection.facility_id == facility_id,
            Inspection.inspection_date >= cutoff_date,
            func.lower(Violation.severity).in_(["direct", "critical"])
        ).limit(1).first() is not None
        if has_any_recent_direct:
            drivers.append("Recent critical or direct violations noted in the past 18 months")

    flags["risk_drivers"] = drivers
    flags["score"] = active_flags_count * 5

    return flags


def build_facility_dossier_summary(facility: dict, inspections: list[dict], enforcements: list[dict]) -> dict:
    """Build the facility dossier payload from preloaded records."""
    total_inspections = len(inspections)
    total_violations = sum(insp.get("violation_count") or 0 for insp in inspections)
    unique_inspectors_count = len(
        {insp.get("inspector_name") for insp in inspections if insp.get("inspector_name")}
    )

    critical_direct_count = sum(
        1
        for insp in inspections
        for viol in insp.get("violations", [])
        if viol.get("severity") and viol.get("severity").lower() in ("critical", "direct")
    )

    latest_animal_count = 0
    latest_inv_inspection = next((insp for insp in inspections if insp.get("inventory")), None)
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

    risk_flags = {
        "exceeds_animal_limit": False,
        "high_direct_violations": False,
        "inventory_spike": False,
    }
    if licensed_limit is not None and latest_animal_count > licensed_limit:
        risk_flags["exceeds_animal_limit"] = True

    cutoff_date = cutoff_18_months_ago()
    direct_viol_count = sum(
        1
        for insp in inspections
        for viol in insp.get("violations", [])
        if insp.get("inspection_date")
        and insp.get("inspection_date") >= cutoff_date
        and viol.get("severity")
        and viol.get("severity").lower() in ("critical", "direct")
    )
    if direct_viol_count > 3:
        risk_flags["high_direct_violations"] = True

    insps_with_inv = [insp for insp in inspections if insp.get("inventory")]
    insps_with_inv.sort(key=lambda item: (item.get("inspection_date") or date.min, item.get("id")))
    if len(insps_with_inv) >= 2:
        prev_total = sum(item.get("count") or 0 for item in insps_with_inv[-2].get("inventory", []))
        curr_total = sum(item.get("count") or 0 for item in insps_with_inv[-1].get("inventory", []))
        if prev_total > 0 and curr_total > prev_total * 3:
            risk_flags["inventory_spike"] = True

    risk_flags["animal_limit_exceeded"] = risk_flags["exceeds_animal_limit"]
    risk_flags["has_high_direct_violations"] = risk_flags["high_direct_violations"]
    risk_flags["recent_inventory_spike"] = risk_flags["inventory_spike"]

    active_flags_count = sum(
        [
            risk_flags["animal_limit_exceeded"],
            risk_flags["has_high_direct_violations"],
            risk_flags["recent_inventory_spike"],
        ]
    )
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

    prioritized_facts = []
    if latest_inspection and latest_inspection["inspection_date"]:
        latest_date_str = latest_inspection["inspection_date"].strftime("%b %d, %Y").upper().replace(" ", "_")
        prioritized_facts.append(
            {
                "key": "latest-insp",
                "text": f"The most recent inspection on {latest_date_str} was a {latest_inspection['inspection_type'] or 'ROUTINE INSPECTION'} and recorded {latest_inspection['violation_count']} violation(s).",
                "citations": [
                    {
                        "inspection_id": inspections[0]["id"],
                        "inspection_date": latest_inspection["inspection_date"].isoformat(),
                    }
                ],
            }
        )

    if licensed_limit:
        for insp in inspections:
            total_inv = sum(item.get("count") or 0 for item in insp.get("inventory", []))
            if total_inv > licensed_limit:
                insp_date_str = (
                    insp["inspection_date"].strftime("%b %d, %Y").upper().replace(" ", "_")
                    if insp.get("inspection_date")
                    else None
                )
                prioritized_facts.append(
                    {
                        "key": f"limit-exceeded-{insp['id']}",
                        "text": f"Total animal inventory ({total_inv}) exceeded the licensed limit of {licensed_limit} during the inspection on {insp_date_str or '—'}.",
                        "citations": [
                            {
                                "inspection_id": insp["id"],
                                "inspection_date": insp["inspection_date"].isoformat() if insp.get("inspection_date") else None,
                            }
                        ],
                    }
                )

    all_critical_violations = []
    for insp in inspections:
        for viol in insp.get("violations", []) or []:
            if viol.get("severity") and viol.get("severity").lower() in ("critical", "direct"):
                all_critical_violations.append((insp, viol))

    all_critical_violations.sort(
        key=lambda item: (item[0].get("inspection_date") or date.min, item[0].get("id")),
        reverse=True,
    )
    for insp, viol in all_critical_violations[:3]:
        v_date_str = (
            insp["inspection_date"].strftime("%b %d, %Y").upper().replace(" ", "_")
            if insp.get("inspection_date")
            else None
        )
        severity_label = viol.get("severity").upper() if viol.get("severity") else "VIOLATION"
        desc = viol.get("description") or ""
        desc_excerpt = desc[:90] + "..." if len(desc) > 90 else desc
        prioritized_facts.append(
            {
                "key": f"viol-{viol['id']}",
                "text": f"Cited for a {severity_label} violation of Section {viol.get('section') or '?'} ({map_section_to_category(viol.get('section'), viol.get('description')) or 'General Care'}) on {v_date_str or '—'}: \"{desc_excerpt}\"",
                "citations": [
                    {
                        "inspection_id": insp["id"],
                        "inspection_date": insp["inspection_date"].isoformat() if insp.get("inspection_date") else None,
                        "source_page": viol.get("source_page"),
                    }
                ],
            }
        )

    section_counts = {}
    section_violations = {}
    for insp in inspections:
        for viol in insp.get("violations", []) or []:
            sec = viol.get("section")
            if sec:
                section_counts[sec] = section_counts.get(sec, 0) + 1
                section_violations.setdefault(sec, []).append((insp, viol))

    for sec, count in section_counts.items():
        if count >= 2:
            cits = section_violations[sec]
            prioritized_facts.append(
                {
                    "key": f"recurring-sec-{sec}",
                    "text": f"Section {sec} was cited recurrently ({count} times) across multiple inspections.",
                    "citations": [
                        {
                            "inspection_id": insp["id"],
                            "inspection_date": insp["inspection_date"].isoformat() if insp.get("inspection_date") else None,
                            "source_page": viol.get("source_page"),
                        }
                        for insp, viol in cits
                    ],
                }
            )

    recent_activities = []
    for insp in inspections[:5]:
        recent_activities.append(
            {
                "type": "inspection",
                "id": insp["id"],
                "date": insp["inspection_date"].isoformat() if insp.get("inspection_date") else None,
                "title": "Inspection Conducted",
                "violations": insp.get("violation_count") or 0,
                "description": f"A {insp.get('inspection_type') or 'Routine'} inspection was completed by inspector {insp.get('inspector_name') or 'UNKNOWN'}, recording {insp.get('violation_count') or 0} violation(s).",
            }
        )

    for act in enforcements:
        penalty_amount = act.get("penalty_amount")
        penalty_part = f"| Penalty: ${penalty_amount:,.2f}" if penalty_amount else ""
        recent_activities.append(
            {
                "type": "enforcement",
                "id": act["id"],
                "date": act["action_date"].isoformat() if act.get("action_date") else None,
                "title": f"Enforcement Action: {act.get('action_type')}",
                "violations": 0,
                "description": f"Outcome: {act.get('outcome') or 'PENDING'} {penalty_part}",
            }
        )

    recent_activities.sort(key=lambda item: item["date"] or "", reverse=True)

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
        "recent_activities": recent_activities[:5],
    }


def calculate_inspector_anomaly(db: Session, inspector_id: str) -> dict:
    """
    Calculate inspector anomaly flags:
    - non_compliance_rate: (inspections with violations / total inspections) * 100
    - regional_average_rate: state average non-compliance rate
    - anomaly_flag: abs(non_compliance_rate - regional_average_rate) > 20
    """
    # 1. Total inspections & non-compliance count for inspector
    stats = (
        db.query(
            func.count(Inspection.id).label("total"),
            func.sum(case((Inspection.violations_found.is_(True), 1), else_=0)).label(
                "with_violations"
            ),
        )
        .filter(Inspection.inspector_id == inspector_id)
        .one_or_none()
    )

    total_inspections = stats.total if stats else 0
    with_violations = stats.with_violations if stats and stats.with_violations else 0

    if total_inspections == 0:
        return {
            "total_inspections": 0,
            "non_compliance_rate": 0.0,
            "primary_state": None,
            "regional_average_rate": None,
            "anomaly_flag": False,
        }

    non_compliance_rate = round((with_violations / total_inspections) * 100, 2)

    # 2. Determine inspector's primary state (where they perform the most inspections)
    primary_state_row = (
        db.query(Facility.state, func.count(Inspection.id).label("cnt"))
        .join(Inspection, Facility.id == Inspection.facility_id)
        .filter(Inspection.inspector_id == inspector_id, Facility.state.isnot(None))
        .group_by(Facility.state)
        .order_by(desc("cnt"))
        .first()
    )

    primary_state = primary_state_row[0] if primary_state_row else None
    regional_average_rate = None
    anomaly_flag = False

    # 3. Calculate regional average non-compliance rate for primary state
    if primary_state:
        reg_stats = (
            db.query(
                func.count(Inspection.id).label("total"),
                func.sum(case((Inspection.violations_found.is_(True), 1), else_=0)).label(
                    "with_violations"
                ),
            )
            .join(Facility, Facility.id == Inspection.facility_id)
            .filter(Facility.state.ilike(primary_state))
            .one_or_none()
        )

        reg_total = reg_stats.total if reg_stats else 0
        reg_with_violations = (
            reg_stats.with_violations if reg_stats and reg_stats.with_violations else 0
        )

        if reg_total > 0:
            regional_average_rate = round((reg_with_violations / reg_total) * 100, 2)
            anomaly_flag = abs(non_compliance_rate - regional_average_rate) > 20

    return {
        "total_inspections": total_inspections,
        "non_compliance_rate": non_compliance_rate,
        "primary_state": primary_state,
        "regional_average_rate": regional_average_rate,
        "anomaly_flag": anomaly_flag,
    }


def calculate_inspector_anomaly_bulk(db: Session, inspector_ids: list[str]) -> dict:
    """
    Calculate inspector anomaly metrics for multiple inspectors in batches.
    This avoids the N+1 pattern used by calculate_inspector_anomaly when rendering
    directory pages.
    """
    inspector_ids = [inspector_id for inspector_id in inspector_ids if inspector_id]
    if not inspector_ids:
        return {}

    base_rows = (
        db.query(
            Inspection.inspector_id.label("inspector_id"),
            func.count(Inspection.id).label("total"),
            func.sum(case((Inspection.violations_found.is_(True), 1), else_=0)).label("with_violations"),
        )
        .filter(Inspection.inspector_id.in_(inspector_ids))
        .group_by(Inspection.inspector_id)
        .all()
    )

    totals_by_inspector = {
        row.inspector_id: {
            "total_inspections": int(row.total or 0),
            "with_violations": int(row.with_violations or 0),
        }
        for row in base_rows
    }

    state_rows = (
        db.query(
            Inspection.inspector_id.label("inspector_id"),
            Facility.state.label("state"),
            func.count(Inspection.id).label("cnt"),
        )
        .join(Facility, Facility.id == Inspection.facility_id)
        .filter(
            Inspection.inspector_id.in_(inspector_ids),
            Facility.state.isnot(None),
            Facility.state != "",
        )
        .group_by(Inspection.inspector_id, Facility.state)
        .all()
    )

    primary_state_by_inspector: dict[str, str | None] = {inspector_id: None for inspector_id in inspector_ids}
    state_counts: dict[str, dict[str, int]] = {inspector_id: {} for inspector_id in inspector_ids}
    for row in state_rows:
        inspector_state_counts = state_counts.setdefault(row.inspector_id, {})
        count = int(row.cnt or 0)
        inspector_state_counts[row.state] = count
        current_primary = primary_state_by_inspector.get(row.inspector_id)
        if current_primary is None or count > inspector_state_counts.get(current_primary, 0):
            primary_state_by_inspector[row.inspector_id] = row.state

    primary_states = sorted({state for state in primary_state_by_inspector.values() if state})
    regional_by_state: dict[str, float] = {}
    if primary_states:
        regional_rows = (
            db.query(
                Facility.state.label("state"),
                func.count(Inspection.id).label("total"),
                func.sum(case((Inspection.violations_found.is_(True), 1), else_=0)).label("with_violations"),
            )
            .join(Facility, Facility.id == Inspection.facility_id)
            .filter(Facility.state.in_(primary_states))
            .group_by(Facility.state)
            .all()
        )

        for row in regional_rows:
            total = int(row.total or 0)
            with_violations = int(row.with_violations or 0)
            regional_by_state[row.state] = round((with_violations / total) * 100, 2) if total > 0 else 0.0

    results = {}
    for inspector_id in inspector_ids:
        totals = totals_by_inspector.get(inspector_id, {"total_inspections": 0, "with_violations": 0})
        total_inspections = totals["total_inspections"]
        with_violations = totals["with_violations"]

        if total_inspections == 0:
            results[inspector_id] = {
                "total_inspections": 0,
                "non_compliance_rate": 0.0,
                "primary_state": None,
                "regional_average_rate": None,
                "anomaly_flag": False,
            }
            continue

        non_compliance_rate = round((with_violations / total_inspections) * 100, 2)
        primary_state = primary_state_by_inspector.get(inspector_id)
        regional_average_rate = regional_by_state.get(primary_state) if primary_state else None
        anomaly_flag = regional_average_rate is not None and abs(non_compliance_rate - regional_average_rate) > 20

        results[inspector_id] = {
            "total_inspections": total_inspections,
            "non_compliance_rate": non_compliance_rate,
            "primary_state": primary_state,
            "regional_average_rate": regional_average_rate,
            "anomaly_flag": anomaly_flag,
        }

    return results
