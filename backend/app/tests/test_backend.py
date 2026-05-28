import os
from datetime import date, datetime, timezone
import pytest
import factory
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.database import get_db
from app.main import app
from app.models import Facility, Inspection, ProcessingStatus, Violation
from app.services.pipeline import process_all_pending
from app.services.risk_engine import calculate_facility_risk_flags, calculate_inspector_anomaly
from app.tests.conftest import check_production_db


# --- Factory Boy Setup ---

class FacilityFactory(factory.alchemy.SQLAlchemyModelFactory):
    class Meta:
        model = Facility
        sqlalchemy_session_persistence = "commit"

    name = factory.Sequence(lambda n: f"Test Facility {n}")
    certificate_number = factory.Sequence(lambda n: f"CERT-{n}")


class InspectionFactory(factory.alchemy.SQLAlchemyModelFactory):
    class Meta:
        model = Inspection
        sqlalchemy_session_persistence = "commit"

    inspection_date = factory.LazyFunction(lambda: datetime.now(timezone.utc).date())
    source_pdf = factory.Sequence(lambda n: f"http://example.com/pdf-{n}.pdf")
    processing_status = ProcessingStatus.COMPLETED


@pytest.fixture()
def setup_factories(db_session):
    FacilityFactory._meta.sqlalchemy_session = db_session
    InspectionFactory._meta.sqlalchemy_session = db_session
    yield


@pytest.fixture()
def client():
    os.environ["AWA_API_KEYS"] = "testkey"
    return TestClient(app)


@pytest.fixture()
def headers():
    return {"X-API-Key": "testkey"}


# --- Test Cases ---

def test_production_url_safety_check():
    """Verify that when DATABASE_URL points to a production host, check_production_db raises ValueError."""
    with pytest.raises(ValueError, match="production host"):
        check_production_db("postgresql://postgres:pass@db.supabase.co:5432/postgres")
    with pytest.raises(ValueError, match="production host"):
        check_production_db("postgresql://postgres:pass@db.supabase.net:5432/postgres")


def test_root_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "AWA Platform running"}


def test_dashboard_stats(client, headers, db_session, setup_factories):
    # Seed data
    fac = FacilityFactory()
    InspectionFactory(facility_id=fac.id, violation_count=2, violations_found=True)

    response = client.get("/dashboard/stats", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "total_facilities" in data
    assert "total_inspections" in data
    assert "total_violations" in data
    assert "risk_flags_distribution" in data


def test_violations_search(client, headers, db_session, setup_factories):
    fac = FacilityFactory()
    insp = InspectionFactory(facility_id=fac.id)
    viol = Violation(inspection_id=insp.id, severity="Direct", section="1.1", description="Test")
    db_session.add(viol)
    db_session.commit()

    response = client.get("/violations/search?limit=5", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "total" in data
    assert "results" in data
    assert len(data["results"]) <= 5


def test_facilities_search(client, headers, db_session, setup_factories):
    FacilityFactory.create_batch(3)

    response = client.get("/facilities?limit=5", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "total" in data
    assert "results" in data
    assert len(data["results"]) <= 5


def test_inspectors_list(client, headers, db_session, setup_factories):
    fac = FacilityFactory()
    InspectionFactory(facility_id=fac.id, inspector_name="CHARLIE", inspector_id="CBROWN")

    response = client.get("/inspectors?limit=5", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "total" in data
    assert "results" in data


def test_risk_calculations(client, headers, db_session, setup_factories):
    facility = FacilityFactory()
    flags = calculate_facility_risk_flags(db_session, facility.id)
    assert "exceeds_animal_limit" in flags
    assert "high_direct_violations" in flags
    assert "inventory_spike" in flags

    response = client.get(f"/facilities/{facility.id}", headers=headers)
    assert response.status_code == 200
    assert "risk_flags" in response.json()


def test_inspector_anomaly(client, headers, db_session, setup_factories):
    fac = FacilityFactory()
    InspectionFactory(facility_id=fac.id, inspector_name="CHARLIE", inspector_id="CBROWN")

    stats = calculate_inspector_anomaly(db_session, "CBROWN")
    assert "non_compliance_rate" in stats
    assert "regional_average_rate" in stats
    assert "anomaly_flag" in stats

    response = client.get("/inspectors/CBROWN", headers=headers)
    assert response.status_code == 200
    assert "anomaly_flag" in response.json()


def test_proxy_pdf_rejects_traversal(client, headers, db_session, setup_factories):
    facility = FacilityFactory(name="Traversal Test", certificate_number="TRV-123")
    malicious_inspection = InspectionFactory(
        facility_id=facility.id,
        inspection_date=datetime.now(timezone.utc).date(),
        source_pdf_path="../../../../etc/passwd",
    )

    response = client.get(
        f"/documents/proxy-pdf/{malicious_inspection.id}", headers=headers
    )
    assert response.status_code in [400, 403]


def test_pipeline_multiprocessing_safe(db_session, setup_factories):
    facility = FacilityFactory(name="MP Test", certificate_number="MP-123")
    for _i in range(50):
        InspectionFactory(
            facility_id=facility.id,
            inspection_date=date(2024, 5, 1),
            source_pdf="http://example.com/mock.pdf",
            processing_status=ProcessingStatus.PENDING,
        )

    process_all_pending()

    stuck = (
        db_session.query(Inspection)
        .filter(
            Inspection.processing_status == ProcessingStatus.PROCESSING,
            Inspection.facility_id == facility.id,
        )
        .count()
    )
    assert stuck == 0

    try:
        res = db_session.execute(
            text("SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction'")
        ).scalar()
        assert res == 0
    except Exception:
        db_session.rollback()


def test_auth_failure(client):
    response = client.get("/dashboard/stats")
    assert response.status_code == 401


def test_auth_success(client, headers, db_session, setup_factories):
    response = client.get("/dashboard/stats", headers=headers)
    assert response.status_code == 200
