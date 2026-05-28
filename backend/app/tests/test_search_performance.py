import time
import pytest
from sqlalchemy.orm import Session
from app.models import Facility, Inspection, Violation
from app.database import Base, engine, SessionLocal
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

@pytest.fixture(scope="module")
def db_session():
    # Setup database
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    # We only seed if there aren't already 100k records
    count = db.query(Facility).count()
    if count < 100000:
        # Seed 100k records quickly using bulk insert
        print("Seeding 100k records for benchmark...")
        facilities = []
        for i in range(count, 100000):
            facilities.append(
                Facility(
                    name=f"Test Facility {i}",
                    customer_id=f"CUST-{i}",
                    certificate_number=f"CERT-{i}",
                    state="CA"
                )
            )
            # Commit in batches of 10k
            if len(facilities) >= 10000:
                db.bulk_save_objects(facilities)
                db.commit()
                facilities = []
        if facilities:
            db.bulk_save_objects(facilities)
            db.commit()

        # Adding a specific target facility that matches "Dog"
        target = Facility(name="Happy Dog Breeding", state="TX")
        db.add(target)
        db.commit()

    yield db
    
    db.close()

def test_search_performance(db_session: Session):
    start = time.perf_counter()
    
    # Make sure we send the API key if it's required!
    headers = {"X-API-Key": "test_key_1"}  # Must match something in AWA_API_KEYS
    import os
    os.environ["AWA_API_KEYS"] = "test_key_1"
    
    response = client.get("/facilities?name=Dog", headers=headers)
    
    end = time.perf_counter()
    duration = end - start
    
    assert response.status_code == 200
    assert duration < 0.200, f"Search took too long: {duration:.3f}s (Threshold: 0.200s)"

def test_search_minimum_length_enforcement():
    headers = {"X-API-Key": "test_key_1"}
    response = client.get("/facilities?name=Do", headers=headers)
    
    # Should return empty results with a message because length is < 3
    assert response.status_code == 200
    data = response.json()
    assert data["results"] == []
    assert data["message"] == "Search terms must be at least 3 characters"
