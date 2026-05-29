from app.database import SessionLocal
from app.models import EnforcementAction, ProcessingStatus
from fastapi.testclient import TestClient
from app.main import app
import os

def run_test():
    # Set API key environment variable for auth
    os.environ["AWA_API_KEYS"] = "testkey"
    client = TestClient(app)
    headers = {"X-API-Key": "testkey"}
    
    db = SessionLocal()
    try:
        # Check action 1 before
        act = db.query(EnforcementAction).filter(EnforcementAction.id == 1).first()
        if not act:
            print("Action ID 1 not found in DB.")
            return
            
        print("=== BEFORE ON-DEMAND OCR ===")
        print(f"ID: {act.id} | Facility: {act.facility.name}")
        print(f"pdf_downloaded: {act.pdf_downloaded}")
        print(f"pdf_processed: {act.pdf_processed}")
        print(f"ocr_status: {act.ocr_status}")
        print(f"extracted_text length: {len(act.extracted_text) if act.extracted_text else 0}")
        print(f"summary: {act.summary[:100]}")
        print("-" * 50)
        
        # Reset them to simulate pending state
        act.pdf_downloaded = False
        act.pdf_processed = False
        act.ocr_status = ProcessingStatus.PENDING
        act.extracted_text = None
        db.commit()
        
        # Request dynamic proxy PDF endpoint
        print("Calling dynamic proxy PDF view endpoint /documents/enforcement-pdf/1...")
        response = client.get("/documents/enforcement-pdf/1")
        print(f"Response status code: {response.status_code}")
        
        # Refresh from database
        db.refresh(act)
        print("\n=== AFTER ON-DEMAND OCR ===")
        print(f"pdf_downloaded: {act.pdf_downloaded}")
        print(f"pdf_processed: {act.pdf_processed}")
        print(f"ocr_status: {act.ocr_status}")
        print(f"extracted_text length: {len(act.extracted_text) if act.extracted_text else 0}")
        print(f"summary: {act.summary[:100]}...")
        print("=== TEST COMPLETED ===")
        
    finally:
        db.close()

if __name__ == "__main__":
    run_test()
