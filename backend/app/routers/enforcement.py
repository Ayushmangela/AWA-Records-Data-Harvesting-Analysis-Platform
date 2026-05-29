from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.auth import require_api_key
from app.database import get_db
from app.limiter import limiter
from app.models import EnforcementAction, Facility
from app.schemas import EnforcementActionOut

router = APIRouter(
    prefix="/enforcement", tags=["enforcement"], dependencies=[Depends(require_api_key)]
)


@router.get("")
@limiter.limit("30/minute")
def list_enforcement(
    request: Request,
    action_type: str | None = None,
    outcome: str | None = None,
    date_start: date | None = None,
    date_end: date | None = None,
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    include_total: bool = False,
    db: Session = Depends(get_db),
):
    query = db.query(EnforcementAction).join(Facility, EnforcementAction.facility_id == Facility.id)

    if action_type:
        query = query.filter(EnforcementAction.action_type.ilike(action_type))
    if outcome:
        query = query.filter(EnforcementAction.outcome.ilike(outcome))
    if date_start:
        query = query.filter(EnforcementAction.action_date >= date_start)
    if date_end:
        query = query.filter(EnforcementAction.action_date <= date_end)

    query = query.order_by(desc(EnforcementAction.action_date), desc(EnforcementAction.id))

    total = None
    if include_total:
        cte = query.cte("filtered_enforcement")
        total = db.execute(select(func.count()).select_from(cte)).scalar()

    results = query.offset(offset).limit(limit).all()

    enforcements = []
    for row in results:
        enforcements.append({
            "id": row.id,
            "facility_id": row.facility_id,
            "facility_name": row.facility.name if row.facility else None,
            "facility_state": row.facility.state if row.facility else None,
            "certificate": row.certificate,
            "action_type": row.action_type,
            "action_date": row.action_date,
            "outcome": row.outcome,
            "penalty_amount": row.penalty_amount,
            "source_pdf": row.source_pdf,
            "source_pdf_path": row.source_pdf_path,
            "summary": row.summary,
            "pdf_downloaded": row.pdf_downloaded,
            "pdf_processed": row.pdf_processed,
            "ocr_status": row.ocr_status.value if hasattr(row.ocr_status, "value") else row.ocr_status,
            "extracted_text": row.extracted_text,
        })

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "results": enforcements,
    }


@router.get("/{enforcement_id}", response_model=EnforcementActionOut)
@limiter.limit("30/minute")
def get_enforcement(enforcement_id: int, request: Request, db: Session = Depends(get_db)):
    action = db.query(EnforcementAction).filter(EnforcementAction.id == enforcement_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Enforcement action not found")
    return action
