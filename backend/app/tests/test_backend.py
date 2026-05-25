import unittest
from datetime import date
from sqlalchemy import func
from app.database import SessionLocal
from app.models import Facility, Inspection, Violation, Inventory
from app.services.risk_engine import calculate_facility_risk_flags, calculate_inspector_anomaly
from fastapi.testclient import TestClient
from app.main import app

class TestBackendAPIs(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()

    def test_root_endpoint(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "AWA Platform running"})

    def test_dashboard_stats(self):
        response = self.client.get("/dashboard/stats")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("total_facilities", data)
        self.assertIn("total_inspections", data)
        self.assertIn("total_violations", data)
        self.assertIn("risk_flags_distribution", data)
        print("Dashboard stats test passed successfully!")

    def test_violations_search(self):
        response = self.client.get("/violations/search?limit=5")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("total", data)
        self.assertIn("results", data)
        self.assertLessEqual(len(data["results"]), 5)
        print("Violations search test passed successfully!")

    def test_facilities_search(self):
        response = self.client.get("/facilities?limit=5")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("total", data)
        self.assertIn("results", data)
        self.assertLessEqual(len(data["results"]), 5)
        print("Facilities search test passed successfully!")

    def test_inspectors_list(self):
        response = self.client.get("/inspectors?limit=5")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("total", data)
        self.assertIn("results", data)
        print("Inspectors list test passed successfully!")

    def test_risk_calculations_live(self):
        # Find a facility in the database to test
        facility = self.db.query(Facility).first()
        if facility:
            flags = calculate_facility_risk_flags(self.db, facility.id)
            self.assertIn("exceeds_animal_limit", flags)
            self.assertIn("high_direct_violations", flags)
            self.assertIn("inventory_spike", flags)
            
            # Test GET /facilities/{id}
            response = self.client.get(f"/facilities/{facility.id}")
            self.assertEqual(response.status_code, 200)
            self.assertIn("risk_flags", response.json())
            print(f"Risk calculations test for Facility {facility.id} passed successfully!")
        else:
            print("Skipped: no facilities in database.")

    def test_inspector_anomaly_live(self):
        # Find an inspector in the database to test
        inspection = self.db.query(Inspection).filter(Inspection.inspector_id.isnot(None), Inspection.inspector_id != "").first()
        if inspection:
            inspector_id = inspection.inspector_id
            stats = calculate_inspector_anomaly(self.db, inspector_id)
            self.assertIn("non_compliance_rate", stats)
            self.assertIn("regional_average_rate", stats)
            self.assertIn("anomaly_flag", stats)
            
            # Test GET /inspectors/{id}
            response = self.client.get(f"/inspectors/{inspector_id}")
            self.assertEqual(response.status_code, 200)
            self.assertIn("anomaly_flag", response.json())
            print(f"Inspector anomaly test for Inspector {inspector_id} passed successfully!")
        else:
            print("Skipped: no inspectors in database.")

if __name__ == "__main__":
    unittest.main()
