from app.database import SessionLocal
from app.models import EnforcementAction, ProcessingStatus
from sqlalchemy import func

def print_counts():
    db = SessionLocal()
    try:
        total = db.query(EnforcementAction).count()
        pdf_downloaded = db.query(EnforcementAction).filter(EnforcementAction.pdf_downloaded == True).count()
        pdf_processed = db.query(EnforcementAction).filter(EnforcementAction.pdf_processed == True).count()
        ocr_completed = db.query(EnforcementAction).filter(EnforcementAction.ocr_status == ProcessingStatus.COMPLETED).count()
        ocr_pending = db.query(EnforcementAction).filter(EnforcementAction.ocr_status == ProcessingStatus.PENDING).count()
        ocr_failed = db.query(EnforcementAction).filter(EnforcementAction.ocr_status == ProcessingStatus.FAILED).count()
        
        print("=== DATABASE COUNTS ===")
        print(f"Total enforcement actions: {total}")
        print(f"pdf_downloaded = true: {pdf_downloaded}")
        print(f"pdf_processed = true: {pdf_processed}")
        print(f"ocr_status = COMPLETED: {ocr_completed}")
        print(f"ocr_status = PENDING: {ocr_pending}")
        print(f"ocr_status = FAILED: {ocr_failed}")
    finally:
        db.close()

if __name__ == "__main__":
    print_counts()
