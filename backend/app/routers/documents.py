import os
import re
from pathlib import Path

import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth import require_api_key
from app.database import get_db
from app.models import Inspection

router = APIRouter(prefix="/documents", tags=["documents"], dependencies=[Depends(require_api_key)])

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
