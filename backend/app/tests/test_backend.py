import os
from datetime import date, datetime, timezone

import factory
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.main import app
from app.models import EnforcementAction, Facility, Inspection, Inventory, ProcessingStatus, Violation
from app.services.pipeline import process_all_pending
from app.services.risk_engine import (
    build_facility_dossier_summary,
    calculate_facility_risk_flags,
    calculate_inspector_anomaly,
)
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
def headers():
    os.environ["AWA_API_KEYS"] = "testkey"
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


def test_facility_dossier_summary_uses_shared_risk_engine(client, headers, db_session, setup_factories):
    facility = FacilityFactory(licensed_animal_limit=5)
    latest_insp = InspectionFactory(
        facility_id=facility.id,
        inspection_date=date(2026, 5, 28),
        inspector_name="INSPECTOR A",
        violation_count=2,
        violations_found=True,
        inspection_type="ROUTINE",
    )
    prior_insp = InspectionFactory(
        facility_id=facility.id,
        inspection_date=date(2026, 4, 28),
        inspector_name="INSPECTOR B",
        violation_count=2,
        violations_found=True,
        inspection_type="FOLLOW-UP",
    )

    for inspection in (latest_insp, prior_insp):
        db_session.add_all(
            [
                Violation(
                    inspection_id=inspection.id,
                    severity="Direct",
                    section="3.1",
                    description="Test violation",
                    source_page=1,
                ),
                Violation(
                    inspection_id=inspection.id,
                    severity="Critical",
                    section="3.1",
                    description="Test violation 2",
                    source_page=2,
                ),
                Inventory(
                    inspection_id=inspection.id,
                    scientific_name="Testus animalus",
                    common_name="Test animal",
                    count=4 if inspection.id == latest_insp.id else 1,
                ),
            ]
        )
    db_session.commit()

    expected = build_facility_dossier_summary(
        {
            "id": facility.id,
            "name": facility.name,
            "customer_id": facility.customer_id,
            "certificate_number": facility.certificate_number,
            "license_status": facility.license_status,
            "license_type": facility.license_type,
            "address": facility.address,
            "city": facility.city,
            "state": facility.state,
            "zip_code": facility.zip_code,
            "county": facility.county,
            "licensed_animal_limit": facility.licensed_animal_limit,
        },
        [
            {
                "id": latest_insp.id,
                "inspection_date": latest_insp.inspection_date,
                "inspection_type": latest_insp.inspection_type,
                "inspector_name": latest_insp.inspector_name,
                "violation_count": latest_insp.violation_count,
                "violations": [
                    {
                        "id": 1,
                        "severity": "Direct",
                        "section": "3.1",
                        "description": "Test violation",
                        "source_page": 1,
                    },
                    {
                        "id": 2,
                        "severity": "Critical",
                        "section": "3.1",
                        "description": "Test violation 2",
                        "source_page": 2,
                    },
                ],
                "inventory": [
                    {"count": 4},
                ],
            },
            {
                "id": prior_insp.id,
                "inspection_date": prior_insp.inspection_date,
                "inspection_type": prior_insp.inspection_type,
                "inspector_name": prior_insp.inspector_name,
                "violation_count": prior_insp.violation_count,
                "violations": [
                    {
                        "id": 3,
                        "severity": "Direct",
                        "section": "3.1",
                        "description": "Test violation",
                        "source_page": 1,
                    },
                    {
                        "id": 4,
                        "severity": "Critical",
                        "section": "3.1",
                        "description": "Test violation 2",
                        "source_page": 2,
                    },
                ],
                "inventory": [
                    {"count": 1},
                ],
            },
        ],
        [
            {
                "id": 1,
                "action_date": date(2026, 5, 20),
                "action_type": "Warning",
                "outcome": "Pending",
                "penalty_amount": None,
            }
        ],
    )

    response = client.get(f"/facilities/{facility.id}/dossier-summary", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["risk_flags"]["risk_level"] == expected["risk_flags"]["risk_level"]
    assert data["compliance_snapshot"]["licensed_animal_limit"] == 5
    assert data["latest_inspection"]["inspection_type"] == "ROUTINE"


def test_inspection_frequency_filter_and_checksum_exposure(client, headers, db_session, setup_factories):
    high_facility = FacilityFactory(name="High Frequency", certificate_number="HF-1")
    low_facility = FacilityFactory(name="Low Frequency", certificate_number="LF-1")

    for offset, facility_id in enumerate([high_facility.id] * 4):
        inspection = InspectionFactory(
            facility_id=facility_id,
            inspection_date=date(2026, 5, 28 - offset),
            inspection_type="ROUTINE",
            violation_count=1,
            violations_found=True,
            pdf_sha256="a" * 64 if offset == 0 else None,
        )
        db_session.add_all(
            [
                Violation(
                    inspection_id=inspection.id,
                    severity="Direct",
                    section="3.1",
                    description="Filter test violation",
                ),
                Inventory(
                    inspection_id=inspection.id,
                    scientific_name="Testus animalus",
                    common_name="Test animal",
                    count=1,
                ),
            ]
        )

    low_inspection = InspectionFactory(
        facility_id=low_facility.id,
        inspection_date=date(2026, 5, 28),
        inspection_type="ROUTINE",
        violation_count=0,
        violations_found=False,
    )
    db_session.add(
        Inventory(
            inspection_id=low_inspection.id,
            scientific_name="Testus animalus",
            common_name="Test animal",
            count=1,
        )
    )

    enforcement = EnforcementAction(
        facility_id=high_facility.id,
        certificate=high_facility.certificate_number,
        action_type="Warning",
        action_date=date(2026, 5, 20),
        outcome="Pending",
        pdf_sha256="b" * 64,
        pdf_downloaded=True,
        pdf_processed=True,
        ocr_status="COMPLETED",
    )
    db_session.add(enforcement)
    db_session.commit()

    response = client.get("/facilities?inspection_frequency=high&limit=10", headers=headers)
    assert response.status_code == 200
    data = response.json()
    result_ids = {item["id"] for item in data["results"]}
    assert high_facility.id in result_ids
    assert low_facility.id not in result_ids

    detail_response = client.get(f"/facilities/{high_facility.id}", headers=headers)
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["inspections"][0]["pdf_sha256"] == "a" * 64
    assert detail["enforcement_actions"][0]["pdf_sha256"] == "b" * 64


def test_facility_comparison_endpoint(client, headers, db_session, setup_factories):
    facility_a = FacilityFactory(name="Compare A", certificate_number="CA-1")
    facility_b = FacilityFactory(name="Compare B", certificate_number="CB-1")

    for facility, severity in [(facility_a, "Direct"), (facility_b, "Critical")]:
        inspection = InspectionFactory(
            facility_id=facility.id,
            inspection_date=date(2026, 5, 28),
            inspection_type="ROUTINE",
            violation_count=1,
            violations_found=True,
        )
        db_session.add_all(
            [
                Violation(
                    inspection_id=inspection.id,
                    severity=severity,
                    section="3.1",
                    description="Comparison test violation",
                ),
                Inventory(
                    inspection_id=inspection.id,
                    scientific_name="Testus animalus",
                    common_name="Test animal",
                    count=2,
                ),
            ]
        )

    db_session.commit()

    response = client.get(
        f"/facilities/comparison?facility_ids={facility_a.id},{facility_b.id}",
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    returned_ids = {item["id"] for item in data}
    assert returned_ids == {facility_a.id, facility_b.id}


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


def test_dashboard_stats_public_access(client, db_session, setup_factories):
    response = client.get("/dashboard/stats")
    assert response.status_code == 200


def test_get_facility_inspections_endpoint(client, headers, db_session, setup_factories):
    facility = FacilityFactory()
    inspection = InspectionFactory(
        facility_id=facility.id,
        inspection_date=date(2026, 5, 28),
        inspector_name="INSPECTOR TEST",
        violation_count=0,
        violations_found=False,
        inspection_type="ROUTINE",
    )
    db_session.commit()

    response = client.get(f"/facilities/{facility.id}/inspections", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["id"] == inspection.id
    assert data[0]["inspector_name"] == "INSPECTOR TEST"


from unittest.mock import Mock, patch
import app.auth
from app.auth import require_auth

def test_require_auth_query_param_success(monkeypatch):
    monkeypatch.setattr(app.auth, "SUPABASE_URL", "https://mock.supabase.co")
    monkeypatch.setattr(app.auth, "SUPABASE_KEY", "mock-key")
    
    mock_request = Mock()
    mock_request.query_params = {"token": "valid-token"}
    
    class MockResponse:
        status_code = 200
        def json(self):
            return {"id": "mock-user"}
            
    with patch("requests.get", return_value=MockResponse()) as mock_get:
        user = require_auth(request=mock_request, credentials=None)
        assert user == {"id": "mock-user"}
        mock_get.assert_called_once_with(
            "https://mock.supabase.co/auth/v1/user",
            headers={"Authorization": "Bearer valid-token", "apikey": "mock-key"},
            timeout=5
        )


