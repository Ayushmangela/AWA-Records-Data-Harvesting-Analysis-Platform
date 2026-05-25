from fastapi import APIRouter, Depends
from sqlalchemy import func, desc
from sqlalchemy.orm import Session
from datetime import date, timedelta
from app.database import get_db
from app.models import Facility, Inspection, Inventory, Violation

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    # 1. Total counts
    total_facilities = db.query(Facility).count()
    total_inspections = db.query(Inspection).count()
    total_violations = db.query(Violation).count()

    # 2. Violations by severity
    severity_rows = db.query(
        Violation.severity,
        func.count(Violation.id)
    ).group_by(Violation.severity).all()
    
    severity_distribution = {
        (row[0] or "Unknown").capitalize(): row[1]
        for row in severity_rows
    }

    # 3. Top Violating Facilities
    top_violating_facilities_rows = db.query(
        Facility.id,
        Facility.name,
        func.count(Violation.id).label("viol_count")
    ).join(Inspection, Facility.id == Inspection.facility_id)\
     .join(Violation, Violation.inspection_id == Inspection.id)\
     .group_by(Facility.id, Facility.name)\
     .order_by(desc("viol_count"))\
     .limit(5).all()

    top_violating_facilities = [
        {
            "id": row[0],
            "name": row[1],
            "violation_count": row[2]
        }
        for row in top_violating_facilities_rows
    ]

    # 4. Top active states (by facility count)
    top_states_rows = db.query(
        Facility.state,
        func.count(Facility.id)
    ).filter(Facility.state.isnot(None))\
     .group_by(Facility.state)\
     .order_by(desc(func.count(Facility.id)))\
     .limit(5).all()

    top_states = [
        {"state": row[0], "count": row[1]}
        for row in top_states_rows
    ]

    # 5. Top active inspectors
    top_inspectors_rows = db.query(
        Inspection.inspector_id,
        func.max(Inspection.inspector_name).label("name"),
        func.count(Inspection.id).label("cnt")
    ).filter(Inspection.inspector_id.isnot(None), Inspection.inspector_id != "")\
     .group_by(Inspection.inspector_id)\
     .order_by(desc("cnt"))\
     .limit(5).all()

    top_inspectors = [
        {"inspector_id": row[0], "name": row[1] or row[0], "inspection_count": row[2]}
        for row in top_inspectors_rows
    ]

    # 6. Flag D count (Exceeds Animal Limit)
    latest_date_sub = db.query(
        Inspection.facility_id,
        func.max(Inspection.inspection_date).label("max_date")
    ).group_by(Inspection.facility_id).subquery()

    flag_d_count = db.query(Facility.id)\
        .join(latest_date_sub, Facility.id == latest_date_sub.c.facility_id)\
        .join(Inspection, (Inspection.facility_id == Facility.id) & (Inspection.inspection_date == latest_date_sub.c.max_date))\
        .join(Inventory, Inventory.inspection_id == Inspection.id)\
        .group_by(Facility.id, Facility.licensed_animal_limit)\
        .having(func.sum(Inventory.count) > Facility.licensed_animal_limit)\
        .count()

    # 7. Flag C count (Frequent direct violations in last 18 months)
    cutoff_date = date.today() - timedelta(days=18 * 30)
    flag_c_count = db.query(Inspection.facility_id)\
        .join(Violation, Violation.inspection_id == Inspection.id)\
        .filter(
            Inspection.inspection_date >= cutoff_date,
            func.lower(Violation.severity).in_(["direct", "critical"])
        )\
        .group_by(Inspection.facility_id)\
        .having(func.count(Violation.id) > 3)\
        .count()

    # 8. Flag E count (Inventory Spike)
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

    flag_e_count = db.query(prev_inv_total.c.facility_id)\
        .filter(
            prev_inv_total.c.prev_total > 0,
            prev_inv_total.c.curr_total > prev_inv_total.c.prev_total * 3
        )\
        .distinct().count()

    # 9. Inspections Per Month (Last 12 Months)
    twelve_months_ago = date.today().replace(day=1) - timedelta(days=365)
    monthly_rows = db.query(
        func.to_char(Inspection.inspection_date, 'YYYY-MM').label("month"),
        func.count(Inspection.id)
    ).filter(Inspection.inspection_date >= twelve_months_ago)\
     .group_by("month")\
     .order_by("month")\
     .all()

    # Convert '2025-04' to 'Apr' or 'Apr 2025' on the frontend, here we'll just return 'YYYY-MM'
    inspections_per_month = [
        {"month": row[0], "count": row[1]}
        for row in monthly_rows if row[0]
    ]

    return {
        "total_facilities": total_facilities,
        "total_inspections": total_inspections,
        "total_violations": total_violations,
        "severity_distribution": severity_distribution,
        "top_violating_facilities": top_violating_facilities,
        "top_states": top_states,
        "top_inspectors": top_inspectors,
        "risk_flags_distribution": {
            "exceeds_animal_limit": flag_d_count,
            "high_direct_violations": flag_c_count,
            "inventory_spike": flag_e_count
        },
        "inspections_per_month": inspections_per_month
    }
