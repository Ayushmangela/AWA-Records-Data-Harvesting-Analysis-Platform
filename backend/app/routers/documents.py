import os
import re
from pathlib import Path

import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import EnforcementAction, Inspection, ProcessingStatus
from app.services.ocr import extract_text_from_pdf

router = APIRouter(prefix="/documents", tags=["documents"])

HASH_RE = re.compile(r"^[A-Za-z0-9_-]{8,128}$")


@router.get("/proxy-pdf/{inspection_id}")
async def proxy_pdf(inspection_id: int, db: Session = Depends(get_db)):
    inspection = db.query(Inspection).filter(Inspection.id == inspection_id).first()

    if not inspection or not inspection.source_pdf_path:
        raise HTTPException(status_code=404, detail="PDF not found")

    if not HASH_RE.match(inspection.source_pdf_path or ""):
        raise HTTPException(status_code=400, detail="Invalid PDF identifier")

    pdf_dir = Path(__file__).resolve().parent.parent.parent / "data" / "raw_pdfs"
    pdf_dir_resolved = pdf_dir.resolve()

    # Check if the path already ends with .pdf or not
    file_name = inspection.source_pdf_path
    if not file_name.lower().endswith(".pdf"):
        file_name = f"{file_name}.pdf"

    local_path = (pdf_dir / file_name).resolve()

    if not local_path.is_relative_to(pdf_dir_resolved):
        raise HTTPException(status_code=403, detail="Path traversal blocked")

    if not local_path.exists():
        url = inspection.source_pdf
        if not url or url.strip() == "" or url.strip() == "placeholder":
            raise HTTPException(
                status_code=404,
                detail="PDF not available locally and has no source URL"
            )

        try:
            pdf_dir_resolved.mkdir(parents=True, exist_ok=True)
            ca_bundle = os.environ.get("AWA_CA_BUNDLE")
            response = requests.get(
                url,
                headers={
                    "User-Agent": "The Data Liberation Project (data-liberation-project.org)",
                    "Accept": "*/*",
                },
                timeout=30,
                verify=ca_bundle if ca_bundle else True,
            )
            response.raise_for_status()
            if len(response.content) < 1000:
                raise ValueError("Downloaded file too small")
            local_path.write_bytes(response.content)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to download PDF from source: {e}") from e

    if local_path.exists():
        return FileResponse(
            local_path, media_type="application/pdf", headers={"Content-Disposition": "inline"}
        )

    raise HTTPException(status_code=404, detail="PDF not available locally")


@router.get("/enforcement-pdf/{enforcement_id}")
async def enforcement_pdf(enforcement_id: int, db: Session = Depends(get_db)):
    action = db.query(EnforcementAction).filter(EnforcementAction.id == enforcement_id).first()

    if not action or not action.source_pdf_path:
        raise HTTPException(status_code=404, detail="PDF not found")

    if not HASH_RE.match(action.source_pdf_path or ""):
        raise HTTPException(status_code=400, detail="Invalid PDF identifier")

    pdf_dir = Path(__file__).resolve().parent.parent.parent / "data" / "raw_pdfs"
    pdf_dir_resolved = pdf_dir.resolve()

    file_name = action.source_pdf_path
    if not file_name.lower().endswith(".pdf"):
        file_name = f"{file_name}.pdf"

    local_path = (pdf_dir / file_name).resolve()

    if not local_path.is_relative_to(pdf_dir_resolved):
        raise HTTPException(status_code=403, detail="Path traversal blocked")

    if not local_path.exists():
        url = action.source_pdf
        if not url or url.strip() == "" or url.strip() == "placeholder":
            raise HTTPException(
                status_code=404,
                detail="PDF not available locally and has no source URL"
            )

        try:
            pdf_dir_resolved.mkdir(parents=True, exist_ok=True)
            ca_bundle = os.environ.get("AWA_CA_BUNDLE")
            response = requests.get(
                url,
                headers={
                    "User-Agent": "The Data Liberation Project (data-liberation-project.org)",
                    "Accept": "*/*",
                },
                timeout=30,
                verify=ca_bundle if ca_bundle else True,
            )
            response.raise_for_status()
            if len(response.content) < 1000:
                raise ValueError("Downloaded file too small")
            local_path.write_bytes(response.content)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to download PDF from source: {e}") from e

    if local_path.exists():
        # Lazy/on-demand OCR enrichment if not already processed
        if not action.pdf_processed or action.ocr_status != ProcessingStatus.COMPLETED:
            try:
                ext_res = extract_text_from_pdf(local_path)
                if ext_res.get("success"):
                    pdf_text = ext_res.get("text", "")
                    action.pdf_downloaded = True
                    action.pdf_processed = True
                    action.ocr_status = ProcessingStatus.COMPLETED
                    action.extracted_text = pdf_text
                    
                    # Update penalty amount if missing
                    if pdf_text and not action.penalty_amount:
                        penalty_matches = []
                        for match in re.finditer(r"\$\s*([0-9,]+(?:\.[0-9]{2})?)", pdf_text):
                            val_str = match.group(1).replace(",", "")
                            try:
                                penalty_matches.append(float(val_str))
                            except ValueError:
                                continue
                        if penalty_matches:
                            penalty_amount = None
                            context_match = re.search(r"(?:civil penalty|penalty|fine|assess)\s*(?:of|in the amount of|valued at)?\s*\$\s*([0-9,]+(?:\.[0-9]{2})?)", pdf_text, re.IGNORECASE)
                            if context_match:
                                try:
                                    penalty_amount = float(context_match.group(1).replace(",", ""))
                                except ValueError:
                                    pass
                            if penalty_amount is None:
                                reasonable_fines = [p for p in penalty_matches if p < 1000000]
                                if reasonable_fines:
                                    penalty_amount = max(reasonable_fines)
                            if penalty_amount:
                                action.penalty_amount = penalty_amount
                                
                    # Update summary if default
                    if pdf_text and (not action.summary or action.summary.startswith("USDA AWA Enforcement Action")):
                        cleaned_text = re.sub(r"\s+", " ", pdf_text).strip()
                        summary = cleaned_text[:600]
                        if len(cleaned_text) > 600:
                            summary += "..."
                        action.summary = summary
                        
                    db.commit()
                else:
                    action.pdf_downloaded = True
                    action.ocr_status = ProcessingStatus.FAILED
                    db.commit()
            except Exception as e:
                # Log error but don't fail the download/PDF viewing response
                print(f"Lazy OCR failed for enforcement {enforcement_id}: {e}")

        return FileResponse(
            local_path, media_type="application/pdf", headers={"Content-Disposition": "inline"}
        )

    raise HTTPException(status_code=404, detail="PDF not available locally")

