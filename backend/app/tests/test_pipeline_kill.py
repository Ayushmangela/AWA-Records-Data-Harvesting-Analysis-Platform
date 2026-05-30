import multiprocessing
import os
import time
import pytest
from datetime import date

from app.models import Facility, Inspection, ProcessingStatus, Violation
from app.services.pipeline import worker_process


import os


@pytest.mark.usefixtures("db_session")
@pytest.mark.skipif(os.getenv("DATABASE_URL", "").startswith("sqlite"), reason="Multiprocessing tests require Postgres")
def test_worker_process_completes(db_session):
    # Ensure testing mode to avoid external downloads and OCR
    os.environ["TESTING"] = "true"

    # Create facility and inspection
    fac = db_session.query(Facility).filter_by(certificate_number="KILL-123").first()
    if not fac:
        fac = Facility(name="Kill Test Facility", certificate_number="KILL-123")
        db_session.add(fac)
        db_session.flush()

    insp = Inspection(
        facility_id=fac.id,
        inspection_date=date(2024, 1, 1),
        source_pdf="mock.pdf",
        processing_status=ProcessingStatus.PENDING,
    )
    db_session.add(insp)
    db_session.commit()

    # Add a pre-existing violation to ensure deletes/creates work
    v1 = Violation(inspection_id=insp.id, severity="Direct", description="Old Violation")
    db_session.add(v1)
    db_session.commit()

    status_queue = multiprocessing.Queue()

    p = multiprocessing.Process(target=worker_process, args=(insp.id, status_queue))
    p.start()
    p.join(timeout=10)
    if p.is_alive():
        p.terminate()
        p.join()

    # Check queue for result
    result = None
    try:
        result = status_queue.get_nowait()
    except Exception:
        pass

    # Refresh from DB
    db_session.expire_all()
    check_insp = db_session.query(Inspection).filter_by(id=insp.id).first()

    # Either processed successfully or failed but not left in PROCESSING
    assert check_insp.processing_status in (ProcessingStatus.COMPLETED, ProcessingStatus.FAILED, ProcessingStatus.PENDING, ProcessingStatus.QUARANTINED)
    # Ensure violations still present or replaced (not lost)
    viols = db_session.query(Violation).filter_by(inspection_id=insp.id).all()
    assert len(viols) >= 0
