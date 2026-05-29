from app.database import SessionLocal
from app.models import Inspection, EnforcementAction
from sqlalchemy import text

def inspect():
    db = SessionLocal()
    try:
        # Check inspection status values in DB
        insp_row = db.execute(text("SELECT processing_status FROM inspections LIMIT 5")).fetchall()
        print("Inspections processing_status in DB:")
        for r in insp_row:
            print(f"  - {r[0]} (Type: {type(r[0])})")
            
        # Check enforcement status values in DB
        enf_row = db.execute(text("SELECT ocr_status FROM enforcement_actions LIMIT 5")).fetchall()
        print("EnforcementActions ocr_status in DB:")
        for r in enf_row:
            print(f"  - {r[0]} (Type: {type(r[0])})")
            
    finally:
        db.close()

if __name__ == "__main__":
    inspect()
