from app.database import SessionLocal
from sqlalchemy import text

def fix():
    db = SessionLocal()
    try:
        # Update lowercase 'pending' to uppercase 'PENDING'
        res = db.execute(text("UPDATE enforcement_actions SET ocr_status = 'PENDING' WHERE ocr_status = 'pending'"))
        db.commit()
        print(f"Updated {res.rowcount} rows in enforcement_actions to 'PENDING'.")
    finally:
        db.close()

if __name__ == "__main__":
    fix()
