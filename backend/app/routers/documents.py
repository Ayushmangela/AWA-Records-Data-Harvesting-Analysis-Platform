import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.limiter import limiter

from app.database import get_db
from app.models import EnforcementAction, Inspection, ProcessingStatus
from app.services.ocr import extract_text_from_pdf
from app.auth import require_auth
from app.services.pdf_utils import download_pdf_bytes, sha256_bytes, verify_checksum

router = APIRouter(prefix="/documents", tags=["documents"], dependencies=[Depends(require_auth)])

HASH_RE = re.compile(r"^[A-Za-z0-9_-]{8,128}$")


def _raw_pdf_dir() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "data" / "raw_pdfs"


def _local_pdf_path(pdf_identifier: str) -> Path:
    pdf_dir = _raw_pdf_dir()
    pdf_dir_resolved = pdf_dir.resolve()

    file_name = pdf_identifier
    if not file_name.lower().endswith(".pdf"):
        file_name = f"{file_name}.pdf"

    local_path = (pdf_dir / file_name).resolve()
    if not local_path.is_relative_to(pdf_dir_resolved):
        raise HTTPException(status_code=403, detail="Path traversal blocked")
    return local_path


def _require_local_pdf(pdf_identifier: str, expected_sha256: str | None = None) -> Path:
    local_path = _local_pdf_path(pdf_identifier)
    if not local_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found")
    if expected_sha256 and not verify_checksum(local_path, expected_sha256):
        raise HTTPException(status_code=409, detail="Stored PDF checksum mismatch")
    return local_path


def _download_pdf_to_path(url: str, local_path: Path) -> bytes:
    content = download_pdf_bytes(url, retries=3, timeout=30)
    if content is None:
        raise HTTPException(status_code=502, detail="Failed to download PDF from source")
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(content)
    return content


@router.get("/proxy-pdf/{inspection_id}")
@limiter.limit("30/minute")
async def proxy_pdf(inspection_id: int, request: Request, db: Session = Depends(get_db)):
    inspection = db.query(Inspection).filter(Inspection.id == inspection_id).first()

    if not inspection or not inspection.source_pdf_path:
        raise HTTPException(status_code=404, detail="PDF not found")

    if not HASH_RE.match(inspection.source_pdf_path or ""):
        raise HTTPException(status_code=400, detail="Invalid PDF identifier")

    local_path = _local_pdf_path(inspection.source_pdf_path)

    if not local_path.exists():
        url = inspection.source_pdf
        if not url or url.strip() == "" or url.strip() == "placeholder":
            raise HTTPException(
                status_code=404,
                detail="PDF not available locally and has no source URL"
            )
        try:
            _download_pdf_to_path(url, local_path)
            content = local_path.read_bytes()
            inspection.pdf_sha256 = sha256_bytes(content)
            db.commit()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to download PDF from source: {e}") from e

    if inspection.pdf_sha256 and not verify_checksum(local_path, inspection.pdf_sha256):
        raise HTTPException(status_code=409, detail="Stored PDF checksum mismatch")

    if local_path.exists():
        return FileResponse(
            local_path, media_type="application/pdf", headers={"Content-Disposition": "inline"}
        )

    raise HTTPException(status_code=404, detail="PDF not available locally")


@router.get("/enforcement-pdf/{enforcement_id}")
@limiter.limit("30/minute")
async def enforcement_pdf(enforcement_id: int, request: Request, db: Session = Depends(get_db)):
    action = db.query(EnforcementAction).filter(EnforcementAction.id == enforcement_id).first()

    if not action or not action.source_pdf_path:
        raise HTTPException(status_code=404, detail="PDF not found")

    if not HASH_RE.match(action.source_pdf_path or ""):
        raise HTTPException(status_code=400, detail="Invalid PDF identifier")

    local_path = _require_local_pdf(action.source_pdf_path, action.pdf_sha256)

    if local_path.exists():
        return FileResponse(
            local_path, media_type="application/pdf", headers={"Content-Disposition": "inline"}
        )

    raise HTTPException(status_code=404, detail="PDF not available locally")


@router.post("/enforcement-pdf/{enforcement_id}/process")
@limiter.limit("10/minute")
async def process_enforcement_pdf(enforcement_id: int, request: Request, db: Session = Depends(get_db)):
    action = db.query(EnforcementAction).filter(EnforcementAction.id == enforcement_id).first()

    if not action or not action.source_pdf_path:
        raise HTTPException(status_code=404, detail="PDF not found")

    if not HASH_RE.match(action.source_pdf_path or ""):
        raise HTTPException(status_code=400, detail="Invalid PDF identifier")

    local_path = _local_pdf_path(action.source_pdf_path)

    file_bytes = None
    if not local_path.exists():
        url = action.source_pdf
        if not url or url.strip() == "" or url.strip() == "placeholder":
            raise HTTPException(
                status_code=404,
                detail="PDF not available locally and has no source URL"
            )
        file_bytes = _download_pdf_to_path(url, local_path)
    else:
        try:
            file_bytes = local_path.read_bytes()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to read local PDF file: {e}")

    # Compute and store SHA-256 checksum
    if file_bytes:
        sha256_hash = sha256_bytes(file_bytes)
        action.pdf_sha256 = sha256_hash
        action.pdf_downloaded = True

    try:
        ext_res = extract_text_from_pdf(local_path)
        if ext_res.get("success"):
            pdf_text = ext_res.get("text", "")
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
            return {"status": "success", "processed": True, "message": "OCR enrichment completed"}
        else:
            action.ocr_status = ProcessingStatus.FAILED
            db.commit()
            return {"status": "failed", "processed": False, "message": "OCR failed to extract text"}
    except Exception as e:
        action.ocr_status = ProcessingStatus.FAILED
        db.commit()
        raise HTTPException(status_code=500, detail=f"OCR execution failed: {e}")
