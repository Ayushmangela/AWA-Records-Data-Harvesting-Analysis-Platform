import pytest
from datetime import date

from app.models import Facility, EnforcementAction, ProcessingStatus
from app.auth import require_auth
from app.main import app


@pytest.mark.usefixtures("db_session")
def test_on_demand_ocr_process_endpoint(db_session, tmp_path, monkeypatch, client):
    # Ensure the route is explicitly open for this test via dependency override.
    app.dependency_overrides[require_auth] = lambda: {"id": "test-user-id", "email": "test@example.com"}

    # Create a facility and enforcement action with a local pdf
    fac = Facility(name="OD OCR Facility", certificate_number="ODOCR-1", state="TX")
    db_session.add(fac)
    db_session.flush()

    action = EnforcementAction(
        facility_id=fac.id,
        action_type="ENFORCEMENT",
        action_date=date(2025, 1, 1),
        source_pdf="http://example.local/dummy.pdf",
        source_pdf_path="odocr-test-hash",
        pdf_downloaded=False,
        pdf_processed=False,
        ocr_status=ProcessingStatus.PENDING,
    )
    db_session.add(action)
    db_session.commit()

    # Create a dummy local pdf file in the repository data/raw_pdfs so the endpoint will read it
    from pathlib import Path
    pdf_dir = Path(__file__).resolve().parent.parent.parent / "data" / "raw_pdfs"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    dummy_pdf = pdf_dir / "odocr-test-hash.pdf"
    dummy_pdf.write_bytes(b"%PDF-1.4\n%Dummy PDF for testing\n")

    # Call the processing endpoint using the provided test client
    resp = client.post(f"/documents/enforcement-pdf/{action.id}/process")

    assert resp.status_code == 200

    db_session.refresh(action)
    # The endpoint should at least mark pdf_downloaded True (file existed)
    assert action.pdf_downloaded is True
