import logging
from datetime import date, datetime, timezone

from dateutil.relativedelta import relativedelta
from sqlalchemy import case, desc, func
from sqlalchemy.orm import Session

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
