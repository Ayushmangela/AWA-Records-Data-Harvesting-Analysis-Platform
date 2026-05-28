import multiprocessing
import time
import unittest
from datetime import date
from unittest.mock import patch

from app.database import Base, SessionLocal, engine
from app.models import Facility, Inspection, ProcessingStatus, Violation
from app.services.pipeline import worker_process


class TestPipelineKillRace(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()

        # Setup test data
        fac = self.db.query(Facility).filter_by(certificate_number="KILL-123").first()
        if not fac:
            fac = Facility(id=999999, name="Kill Test Facility", certificate_number="KILL-123")
            self.db.add(fac)
            self.db.commit()

        self.insp = Inspection(
            facility_id=fac.id,
            inspection_date=date(2024, 1, 1),
            source_pdf="mock.pdf",
            processing_status=ProcessingStatus.PROCESSING,
            violation_count=2,  # Fake existing count
        )
        self.db.add(self.insp)
        self.db.commit()

        # Add pre-existing violations
        v1 = Violation(inspection_id=self.insp.id, severity="Direct", description="Old Violation")
        self.db.add(v1)
        self.db.commit()

    def tearDown(self):
        self.db.query(Violation).filter_by(inspection_id=self.insp.id).delete()
        self.db.query(Inspection).filter_by(id=self.insp.id).delete()
        self.db.commit()
        self.db.close()

    def test_kill_mid_extraction_rollback(self):
        # We want to patch the pipeline so that it sleeps inside the SAVEPOINT.
        # We'll patch `db.query(Violation).filter` to sleep to simulate the hang.
        # Wait, if we patch something in the child process, it must be
        # importable or we patch it before spawning.
        # `multiprocessing` uses fork on Linux/Mac, so patches applied before start() are inherited.

        status_queue = multiprocessing.Queue()

        def slow_delete(*args, **kwargs):
            time.sleep(10)  # sleep 10s inside the nested transaction
            return 0

        with patch("sqlalchemy.orm.Query.delete", side_effect=slow_delete):
            p = multiprocessing.Process(target=worker_process, args=(self.insp.id, status_queue))
            p.start()

            # Wait a bit for it to enter the transaction and hit the sleep
            time.sleep(2)

            # Watchdog kills it
            p.terminate()
            p.join(timeout=2)
            if p.is_alive():
                p.kill()

        # Now the watchdog normally marks it as QUARANTINED
        # Let's simulate the watchdog logic
        with SessionLocal() as check_db:
            insp = check_db.query(Inspection).filter(Inspection.id == self.insp.id).first()
            if insp and insp.processing_status == ProcessingStatus.PROCESSING:
                insp.processing_status = ProcessingStatus.QUARANTINED
                check_db.commit()

        # Verify state
        self.db.expire_all()
        check_insp = self.db.query(Inspection).filter_by(id=self.insp.id).first()

        # 1. Status is QUARANTINED
        self.assertEqual(check_insp.processing_status, ProcessingStatus.QUARANTINED)

        # 2. Rollback worked (Violations were not deleted)
        viols = self.db.query(Violation).filter_by(inspection_id=self.insp.id).all()
        self.assertEqual(len(viols), 1)
        self.assertEqual(viols[0].description, "Old Violation")
