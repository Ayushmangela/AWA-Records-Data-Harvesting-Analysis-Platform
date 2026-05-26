import sys
import os
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent))

from app.database import engine
from sqlalchemy import text

def migrate():
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE inspections ADD COLUMN IF NOT EXISTS processing_status VARCHAR(50);"))
        conn.execute(text("ALTER TABLE inspections ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP;"))
        conn.execute(text("ALTER TABLE inspections ADD COLUMN IF NOT EXISTS error_reason TEXT;"))
        conn.execute(text("ALTER TABLE inspections ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'CSV_IMPORT';"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inspections_processing_status ON inspections (processing_status);"))
        conn.execute(text("UPDATE inspections SET processing_status = 'completed' WHERE inspector_name IS NOT NULL AND processing_status IS NULL;"))
        conn.execute(text("UPDATE inspections SET processing_status = 'pending' WHERE processing_status IS NULL;"))
        
if __name__ == "__main__":
    migrate()
    print("Database migration completed.")
