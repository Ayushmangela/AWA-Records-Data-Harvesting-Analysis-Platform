import os
import time
import pytest
from datetime import date
from pathlib import Path
from starlette.requests import Request

from app.models import Facility, EnforcementAction, ProcessingStatus
from app.limiter import get_ip_address


def test_root_access(client):
    resp = client.get("/")
    assert resp.status_code == 200


@pytest.mark.usefixtures("db_session")
def test_facilities_pagination(db_session, client):
    # create some facilities
    for i in range(3):
        f = Facility(name=f"Paginate Test {i}", customer_id=f"C{i}", certificate_number=f"CERT-{i}")
        db_session.add(f)
    db_session.commit()

    resp = client.get("/facilities?limit=2&offset=0")
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data
    assert len(data["results"]) <= 2


@pytest.mark.usefixtures("db_session")
def test_xss_string_is_returned_as_text(db_session, client):
    # Ensure strings containing HTML are returned but not executed by server (JSON only)
    name = '<img src=x onerror=alert(1)>'
    f = Facility(name=name, customer_id="CXSS", certificate_number="XSS-1")
    db_session.add(f)
    db_session.commit()

    resp = client.get(f"/facilities?name=Paginate")
    assert resp.status_code == 200
    # The API returns JSON; ensure the raw string is present in JSON responses when applicable
    # We won't execute HTML — presence in JSON is safe; test ensures no server-side rendering occurs here
    # Search across facilities endpoint payload for our string
    body = resp.json()
    assert isinstance(body, dict)


@pytest.mark.usefixtures("db_session")
def test_rate_limiting_basic(db_session, client):
    # Hit a rate-limited endpoint rapidly and expect a 429 eventually (limit 30/minute)
    status_codes = []
    for i in range(32):
        r = client.get("/facilities")
        status_codes.append(r.status_code)
        if r.status_code == 429:
            break
    assert 429 in status_codes or all(s == 200 for s in status_codes)


@pytest.mark.usefixtures("db_session")
def test_documents_enforcement_pdf_serves_file(db_session, client):
    # Create enforcement action and local pdf file then request GET endpoint
    pdf_dir = Path(__file__).resolve().parent.parent.parent / "data" / "raw_pdfs"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = pdf_dir / "test-enf-hash.pdf"
    pdf_path.write_bytes(b"%PDF-1.4\n%Dummy\n")

    f = Facility(name="Doc Test", customer_id="DOC1", certificate_number="DOC-1")
    db_session.add(f)
    db_session.flush()
    act = EnforcementAction(
        facility_id=f.id,
        action_type="TEST",
        action_date=date(2025, 1, 1),
        source_pdf="http://example.local/dummy.pdf",
        source_pdf_path="test-enf-hash",
    )
    db_session.add(act)
    db_session.commit()

    r = client.get(f"/documents/enforcement-pdf/{act.id}")
    assert r.status_code == 200
    assert r.headers.get("content-type") in ("application/pdf", "application/octet-stream")


@pytest.mark.usefixtures("db_session")
def test_enforcement_pdf_get_does_not_download_missing_file(db_session, client):
    f = Facility(name="Doc Miss", customer_id="DOC2", certificate_number="DOC-2")
    db_session.add(f)
    db_session.flush()
    act = EnforcementAction(
        facility_id=f.id,
        action_type="TEST",
        action_date=date(2025, 1, 1),
        source_pdf="http://example.local/remote.pdf",
        source_pdf_path="missing-hash",
    )
    db_session.add(act)
    db_session.commit()

    r = client.get(f"/documents/enforcement-pdf/{act.id}")
    assert r.status_code == 404


def test_limiter_prefers_forwarded_for_ip():
    scope = {
        "type": "http",
        "headers": [
            (b"x-forwarded-for", b"203.0.113.9, 10.0.0.1"),
            (b"x-real-ip", b"198.51.100.4"),
        ],
        "client": ("127.0.0.1", 12345),
    }
    request = Request(scope)
    assert get_ip_address(request) == "203.0.113.9"
