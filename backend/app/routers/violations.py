from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import desc, asc, func, select
from sqlalchemy.orm import Session
from datetime import date
from app.database import get_db
from app.models import Facility, Inspection, Violation
from app.auth import require_api_key
from app.limiter import limiter

router = APIRouter(prefix="/violations", tags=["violations"], dependencies=[Depends(require_api_key)])

@router.get("/search")
@limiter.limit("30/minute")
def search_violations(
    request: Request,
    query: str | None = None,
    severity: str | None = None,
    section: str | None = None,
    facility_id: int | None = None,
    state: str | None = None,
    date_start: date | None = None,
    date_end: date | None = None,
    sort_by: str = "date_desc",
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    include_total: bool = False,
    db: Session = Depends(get_db)
):
    # Prevent expensive leading wildcard sequential scans
    if query and len(query) < 3:
        return {"total": None, "limit": limit, "offset": offset, "results": [], "message": "Search terms must be at least 3 characters"}

    db_query = db.query(
        Violation.id,
        Violation.severity,
        Violation.section,
        Violation.description,
        Violation.source_pdf,
        Violation.source_page,
        Inspection.inspection_date,
        Inspection.id.label("inspection_id"),
        Facility.id.label("facility_id"),
        Facility.name.label("facility_name"),
        Facility.state.label("facility_state")
    ).join(Inspection, Violation.inspection_id == Inspection.id)\
     .join(Facility, Inspection.facility_id == Facility.id)

    if query:
        db_query = db_query.filter(Violation.description.ilike(f"%{query}%"))
    if severity:
        db_query = db_query.filter(Violation.severity.ilike(severity))
    if section:
        db_query = db_query.filter(Violation.section == section)
    if facility_id:
        db_query = db_query.filter(Facility.id == facility_id)
    if state:
        db_query = db_query.filter(Facility.state.ilike(state))
    if date_start:
        db_query = db_query.filter(Inspection.inspection_date >= date_start)
    if date_end:
        db_query = db_query.filter(Inspection.inspection_date <= date_end)

    # Sorting
    if sort_by == "date_asc":
        db_query = db_query.order_by(asc(Inspection.inspection_date), asc(Violation.id))
    else:
        db_query = db_query.order_by(desc(Inspection.inspection_date), desc(Violation.id))

    # CTE Optimization for count
    total = None
    if include_total:
        cte = db_query.cte("filtered_violations")
        total = db.execute(select(func.count()).select_from(cte)).scalar()
        
    results = db_query.offset(offset).limit(limit).all()

    violations = [
        {
            "id": row.id,
            "severity": row.severity,
            "section": row.section,
            "description": row.description,
            "source_pdf": row.source_pdf,
            "source_page": row.source_page,
            "inspection_id": row.inspection_id,
            "inspection_date": row.inspection_date,
            "facility_id": row.facility_id,
            "facility_name": row.facility_name,
            "facility_state": row.facility_state
        }
        for row in results
    ]

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "results": violations
    }
