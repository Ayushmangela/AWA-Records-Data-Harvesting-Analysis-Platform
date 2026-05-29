from app.database import SessionLocal
from app.models import EnforcementAction, Facility
from pathlib import Path

def verify():
    db = SessionLocal()
    try:
        total_actions = db.query(EnforcementAction).count()
        linked_facilities = db.query(EnforcementAction.facility_id).distinct().count()
        
        print("=== ENFORCEMENT VERIFICATION RESULT ===")
        print(f"Total Enforcement Records in DB: {total_actions}")
        print(f"Total Linked Facilities: {linked_facilities}")
        
        if total_actions > 0:
            print("\n=== SAMPLE ENFORCEMENT ACTIONS ===")
            actions = db.query(EnforcementAction).join(Facility).order_by(EnforcementAction.action_date.desc()).limit(15).all()
            pdf_dir = Path(__file__).resolve().parent.parent.parent / "data" / "raw_pdfs"
            
            for i, act in enumerate(actions):
                pdf_file = pdf_dir / f"{act.source_pdf_path}.pdf"
                pdf_exists = pdf_file.exists()
                
                print(f"{i+1}. Facility: {act.facility.name} (ID: {act.facility_id})")
                print(f"   Date: {act.action_date} | Type: {act.action_type} | Outcome: {act.outcome}")
                print(f"   Penalty: ${act.penalty_amount if act.penalty_amount else 0.0:.2f}")
                print(f"   Local PDF Exists: {pdf_exists} ({act.source_pdf_path}.pdf)")
                print(f"   Summary: {act.summary[:150]}...")
                print("-" * 50)
        else:
            print("No records found in database yet.")
    finally:
        db.close()

if __name__ == "__main__":
    verify()
