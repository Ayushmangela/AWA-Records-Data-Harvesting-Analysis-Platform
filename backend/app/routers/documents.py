import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Inspection

router = APIRouter(prefix="/documents", tags=["documents"])

@router.get("/proxy-pdf/{inspection_id}")
async def proxy_pdf(inspection_id: int, db: Session = Depends(get_db)):
    inspection = db.query(Inspection).filter(Inspection.id == inspection_id).first()
    
    if not inspection or not inspection.source_pdf_path:
        raise HTTPException(status_code=404, detail="PDF not found")
        
    pdf_dir = Path(__file__).resolve().parent.parent.parent / "data" / "raw_pdfs"
    
    # Check if the path already ends with .pdf or not
    file_name = inspection.source_pdf_path
    if not file_name.lower().endswith('.pdf'):
        file_name = f"{file_name}.pdf"
        
    local_path = pdf_dir / file_name
    
    if local_path.exists():
        return FileResponse(
            local_path,
            media_type="application/pdf",
            headers={"Content-Disposition": "inline"}
        )
        
    raise HTTPException(status_code=404, detail="PDF not available locally")
