from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import case, desc, func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Facility, Inspection
from app.services.risk_engine import calculate_inspector_anomaly
from app.auth import require_api_key
from app.limiter import limiter

router = APIRouter(prefix="/inspectors", tags=["inspectors"], dependencies=[Depends(require_api_key)])


def _serialize_inspection(inspection: Inspection) -> dict:
    facility = inspection.facility
    return {
        "id": inspection.id,
        "facility_id": inspection.facility_id,
        "facility_name": facility.name if facility else None,
        "facility_state": facility.state if facility else None,
        "inspection_date": inspection.inspection_date,
        "inspection_type": inspection.inspection_type,
        "violations_found": inspection.violations_found,
        "violation_count": inspection.violation_count,
        "source_pdf": inspection.source_pdf,
    }


@router.get("")
@limiter.limit("60/minute")
def list_inspectors(
    request: Request,
    state: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    violation_count = func.sum(
        case((Inspection.violations_found.is_(True), 1), else_=0)
    ).label("violations_found_count")

    query = (
        db.query(
            Inspection.inspector_id,
            func.max(Inspection.inspector_name).label("inspector_name"),
            func.count(Inspection.id).label("total_inspections"),
            violation_count,
        )
        .filter(
            Inspection.inspector_id.isnot(None),
            Inspection.inspector_id != "",
        )
    )

    if state:
        query = query.join(Facility, Facility.id == Inspection.facility_id).filter(
            Facility.state.ilike(state)
        )

    # Calculate total distinct inspector_ids count
    total_query = db.query(Inspection.inspector_id).filter(
        Inspection.inspector_id.isnot(None),
        Inspection.inspector_id != ""
    )
    if state:
        total_query = total_query.join(Facility, Facility.id == Inspection.facility_id).filter(
            Facility.state.ilike(state)
        )
    total = total_query.distinct().count()

    rows = (
        query.group_by(Inspection.inspector_id)
        .order_by(func.count(Inspection.id).desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    results = []
    for row in rows:
        anomaly_stats = calculate_inspector_anomaly(db, row.inspector_id)
        results.append(
            {
                "inspector_id": row.inspector_id,
                "inspector_name": row.inspector_name or row.inspector_id,
                "total_inspections": row.total_inspections,
                "non_compliance_rate": anomaly_stats["non_compliance_rate"],
                "primary_state": anomaly_stats["primary_state"],
                "regional_average_rate": anomaly_stats["regional_average_rate"],
                "anomaly_flag": anomaly_stats["anomaly_flag"],
            }
        )

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "results": results
    }


@router.get("/{inspector_id}")
def get_inspector(inspector_id: str, db: Session = Depends(get_db)):
    inspections = (
        db.query(Inspection)
        .options(joinedload(Inspection.facility))
        .filter(Inspection.inspector_id == inspector_id)
        .order_by(desc(Inspection.inspection_date), desc(Inspection.id))
        .all()
    )

    if not inspections:
        raise HTTPException(status_code=404, detail="Inspector not found")

    anomaly_stats = calculate_inspector_anomaly(db, inspector_id)

    return {
        "inspector_id": inspector_id,
        "inspector_name": inspections[0].inspector_name or inspector_id,
        "primary_state": anomaly_stats["primary_state"],
        "total_inspections": anomaly_stats["total_inspections"],
        "non_compliance_rate": anomaly_stats["non_compliance_rate"],
        "regional_average_rate": anomaly_stats["regional_average_rate"],
        "anomaly_flag": anomaly_stats["anomaly_flag"],
        "inspections": [_serialize_inspection(inspection) for inspection in inspections],
    }
