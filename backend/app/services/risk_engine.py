import logging
from datetime import date, datetime, timezone

from dateutil.relativedelta import relativedelta
from sqlalchemy import case, desc, func
from sqlalchemy.orm import Session

from app.models import Facility, Inspection, Inventory, Violation

logger = logging.getLogger(__name__)


def cutoff_18_months_ago() -> date:
    """
    Returns the calendar-correct date 18 months prior to today.
    Under USDA APHIS policy, receiving four or more inspection reports with
    direct/critical noncompliant items within an 18-month rolling window
    triggers heightened scrutiny and potential enforcement action.
    """
    return datetime.now(timezone.utc).date() - relativedelta(months=18)


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

    # Get all inspections for this facility, ordered by date desc
    inspections = (
        db.query(Inspection)
        .filter(Inspection.facility_id == facility_id)
        .order_by(desc(Inspection.inspection_date), desc(Inspection.id))
        .all()
    )
    if not inspections:
        return flags

    # 1. exceeds_animal_limit
    if facility.licensed_animal_limit is not None:
        # Find latest inspection that has inventory items
        latest_inv_inspection = None
        for insp in inspections:
            inv_count = db.query(Inventory).filter(Inventory.inspection_id == insp.id).count()
            if inv_count > 0:
                latest_inv_inspection = insp
                break

        if latest_inv_inspection:
            total_animals = (
                db.query(func.sum(Inventory.count))
                .filter(Inventory.inspection_id == latest_inv_inspection.id)
                .scalar()
                or 0
            )
            if total_animals > facility.licensed_animal_limit:
                flags["exceeds_animal_limit"] = True

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

    # 3. inventory_spike
    # Get all inspections for this facility that have inventory records, ordered by date asc
    # We want to check the latest two chronologically
    inspections_with_inv = (
        db.query(Inspection)
        .join(Inventory, Inventory.inspection_id == Inspection.id)
        .filter(Inspection.facility_id == facility_id)
        .distinct()
        .order_by(Inspection.inspection_date.asc(), Inspection.id.asc())
        .all()
    )
    if len(inspections_with_inv) >= 2:
        prev_insp = inspections_with_inv[-2]
        curr_insp = inspections_with_inv[-1]

        prev_total = (
            db.query(func.sum(Inventory.count))
            .filter(Inventory.inspection_id == prev_insp.id)
            .scalar()
            or 0
        )
        curr_total = (
            db.query(func.sum(Inventory.count))
            .filter(Inventory.inspection_id == curr_insp.id)
            .scalar()
            or 0
        )

        if prev_total > 0 and curr_total > prev_total * 3:
            flags["inventory_spike"] = True

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
