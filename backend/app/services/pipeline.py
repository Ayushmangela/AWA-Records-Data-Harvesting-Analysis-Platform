import logging
import multiprocessing
import os
import queue
import time
from datetime import date, timezone
from datetime import datetime as dt_class
from pathlib import Path
from typing import Any, Dict

import requests
from sqlalchemy import desc, text
from sqlalchemy.orm import Session

from app.database import SessionLocal, engine
from app.models import Inspection, Inventory, ProcessingStatus, Violation
from app.services.extractor import extract_data
from app.services.ocr import extract_text_from_pdf

logger = logging.getLogger(__name__)

# ── Helper functions ──────────────────────────────────────────────────────


def _download(inspection, db):
    """Download PDF for *inspection* and return local path or False.
    Handles missing URL, caching, retries and logs appropriately.
    """
    inspection_id = inspection.id
    url = inspection.source_pdf
    if not url or url.strip() == "" or url.strip() == "placeholder":
        logger.warning("[PDF] Inspection %s has no source_pdf URL, skipping", inspection_id)
        return False
    hash_id = inspection.source_pdf_path
    filename = f"{hash_id}.pdf" if hash_id else f"{inspection_id}.pdf"
    pdf_dir = Path(__file__).resolve().parent.parent.parent / "data" / "raw_pdfs"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    filepath = pdf_dir / filename
    if filepath.exists():
        logger.debug("[PDF] Cached: %s already exists locally", filename)
        return str(filepath)
    logger.info("[PDF] Downloading: %s", url)
    retries = 3
    for attempt in range(1, retries + 1):
        try:
            ca_bundle = os.environ.get("AWA_CA_BUNDLE")
            response = requests.get(
                url,
                headers={
                    "User-Agent": "The Data Liberation Project (data-liberation-project.org)",
                    "Accept": "*/*",
                },
                timeout=30,
                verify=ca_bundle if ca_bundle else True,
            )
            response.raise_for_status()
            if len(response.content) < 1000:
                raise ValueError("Downloaded file too small")
            filepath.write_bytes(response.content)
            logger.info("[PDF] Downloaded on attempt %s — saved to %s", attempt, filepath)
            time.sleep(0.5)
            return str(filepath)
        except Exception as e:
            logger.warning(
                "[PDF] Download attempt %s/%s failed for inspection %s: %s",
                attempt,
                retries,
                inspection_id,
                e,
            )
            if attempt < retries:
                time.sleep(attempt * 2)
            else:
                logger.error(
                    "[PDF] All %s download attempts failed for inspection %s",
                    retries,
                    inspection_id,
                )
    return False


def _ocr(pdf_path):
    """Run OCR on *pdf_path* and return result dict or None on failure."""
    ocr_result = extract_text_from_pdf(pdf_path)
    if not ocr_result.get("success") or not ocr_result.get("text"):
        logger.warning("[OCR] Text extraction failed for %s", pdf_path)
        return None
    method = ocr_result.get("method", "pdfplumber")
    logger.info("[OCR] Extracted text via %s for %s", method, pdf_path)
    return ocr_result


def _extract(ocr_result, filename):
    """Extract structured data from OCR result using existing extractor."""
    return extract_data(ocr_result["text"], filename)


def _persist(inspection, extracted, db):
    """Persist extracted data to DB atomically.
    Updates inspection fields, deletes and inserts violations and inventory,
    and marks processing as COMPLETED.
    """
    inspection_id = inspection.id
    filename = Path(inspection.source_pdf_path or inspection.id).name
    # Update inspection fields
    ext = extracted.get("inspection", {})
    if ext.get("inspector_name"):
        inspection.inspector_name = ext["inspector_name"]
    if ext.get("inspector_id"):
        inspection.inspector_id = ext["inspector_id"]
    if not inspection.inspection_type and ext.get("inspection_type"):
        inspection.inspection_type = ext["inspection_type"]
    if extracted.get("violations"):
        inspection.violations_found = True
        inspection.violation_count = len(extracted["violations"])
    # Atomic delete/insert
    with db.begin_nested():
        db.query(Violation).filter(Violation.inspection_id == inspection_id).delete(
            synchronize_session=False
        )
        for viol in extracted.get("violations", []):
            db.add(
                Violation(
                    inspection_id=inspection_id,
                    severity=viol["severity"],
                    section=viol["section"],
                    description=viol["description"],
                    source_pdf=filename,
                    source_page=viol.get("source_page", 1),
                )
            )
        db.query(Inventory).filter(Inventory.inspection_id == inspection_id).delete(
            synchronize_session=False
        )
        for inv in extracted.get("inventory", []):
            db.add(
                Inventory(
                    inspection_id=inspection_id,
                    scientific_name=inv["scientific_name"],
                    common_name=inv["common_name"],
                    count=inv["count"],
                    source_pdf=filename,
                )
            )
        inspection.processing_status = ProcessingStatus.COMPLETED
        inspection.error_reason = None
        inspection.processed_at = dt_class.now(timezone.utc)
    db.commit()
    logger.info("[DB] Successfully committed changes for inspection %s", inspection_id)


def _fail(inspection, db, reason):
    """Mark inspection as FAILED with reason and commit. Returns False."""
    inspection.processing_status = ProcessingStatus.FAILED
    inspection.error_reason = reason
    inspection.processed_at = dt_class.now(timezone.utc)
    db.commit()
    logger.error("Inspection %s failed during %s", inspection.id, reason)
    return False


def recover_orphaned_inspections():
    """Reset Quarantined inspections that were killed mid-extraction without saving violations."""
    db = SessionLocal()
    try:
        # Find inspections that are quarantined, have > 0 violation_count recorded on the PDF,
        # but have no actual violation rows in the DB (meaning transaction killed mid-commit).
        sql = text("""
            SELECT id FROM inspections
            WHERE processing_status = 'QUARANTINED'
            AND violation_count > 0
            AND NOT EXISTS (
                SELECT 1 FROM violations WHERE inspection_id = inspections.id
            )
        """)
        rows = db.execute(sql).fetchall()
        orphans = [r[0] for r in rows]

        if orphans:
            logger.info(
                "Found %d orphaned quarantined inspections, resetting to PENDING...", len(orphans)
            )
            db.execute(
                text(
                    "UPDATE inspections SET processing_status = 'PENDING' WHERE id = ANY(:ids)"
                ).bindparams(ids=orphans)
            )
            db.commit()
    except Exception as e:
        logger.error("Failed to recover orphaned inspections: %s", e)
    finally:
        db.close()


def log_failed_pdf(inspection_id: int):
    """Save failed inspection IDs to data/failed_pdfs.txt."""
    failed_file = Path(__file__).resolve().parent.parent.parent / "data" / "failed_pdfs.txt"
    failed_file.parent.mkdir(parents=True, exist_ok=True)
    with failed_file.open("a") as f:
        f.write(f"{inspection_id}\n")


def download_inspection_pdf(inspection_id: int, db: Session) -> str | bool:
    """
    Query database for inspection, download its source PDF, and save locally.
    Includes rate limiting, retries, and error handling.
    """
    inspection = db.query(Inspection).filter(Inspection.id == inspection_id).first()
    if not inspection:
        logger.error("[PDF] Inspection %s not found in database", inspection_id)
        return False

    url = inspection.source_pdf
    if not url or url.strip() == "" or url.strip() == "placeholder":
        logger.warning("[PDF] Inspection %s has no source_pdf URL, skipping", inspection_id)
        return False

    hash_id = inspection.source_pdf_path
    filename = f"{hash_id}.pdf" if hash_id else f"{inspection_id}.pdf"

    pdf_dir = Path(__file__).resolve().parent.parent.parent / "data" / "raw_pdfs"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    filepath = pdf_dir / filename

    if filepath.exists():
        logger.debug("[PDF] Cached: %s already exists locally", filename)
        return str(filepath)

    logger.info("[PDF] Downloading: %s", url)

    retries = 3
    for attempt in range(1, retries + 1):
        try:
            ca_bundle = os.environ.get("AWA_CA_BUNDLE")
            response = requests.get(
                url,
                headers={
                    "User-Agent": "The Data Liberation Project (data-liberation-project.org)",
                    "Accept": "*/*",
                },
                timeout=30,
                verify=ca_bundle if ca_bundle else True,
            )
            response.raise_for_status()

            if len(response.content) < 1000:
                raise ValueError("Downloaded file too small")

            filepath.write_bytes(response.content)
            logger.info("[PDF] Downloaded on attempt %s — saved to %s", attempt, filepath)

            # Rate limiting: 0.5 second sleep after successful PDF download
            time.sleep(0.5)

            return str(filepath)
        except Exception as e:
            logger.warning(
                "[PDF] Download attempt %s/%s failed for inspection %s: %s",
                attempt,
                retries,
                inspection_id,
                e,
            )
            if attempt < retries:
                time.sleep(attempt * 2)  # Wait 2, 4 seconds between retries
            else:
                logger.error(
                    "[PDF] All %s download attempts failed for inspection %s",
                    retries,
                    inspection_id,
                )

    return False


def process_single_inspection(inspection_id: int, db: Session) -> bool:
    """Thin orchestrator that calls helper functions.
    Returns ``True`` on success, ``False`` on any failure.
    """
    inspection = db.query(Inspection).filter(Inspection.id == inspection_id).first()
    if not inspection:
        return False

    pdf_path = _download(inspection, db)
    if not pdf_path:
        return _fail(inspection, db, "download")

    ocr = _ocr(pdf_path)
    if not ocr:
        return _fail(inspection, db, "ocr")

    extracted = _extract(ocr, Path(pdf_path).name)
    _persist(inspection, extracted, db)
    return True


def process_batch(limit: int = 100, offset: int = 0) -> Dict[str, int]:
    """
    Process a batch of inspections from 2024 onward that have a
    source_pdf URL but no inspector_name.
    """
    db = SessionLocal()
    try:
        query = db.query(Inspection).filter(
            Inspection.source_pdf.isnot(None),
            Inspection.source_pdf != "",
            Inspection.source_pdf != "placeholder",
            Inspection.processing_status == ProcessingStatus.PENDING,
            Inspection.inspection_date >= date(2024, 1, 1),
        )

        total_pending = query.count()
        inspections = query.offset(offset).limit(limit).all()
        total_in_batch = len(inspections)

        logger.info(
            "Batch processing: %d records in this batch (offset=%d, limit=%d). Total pending: %d",
            total_in_batch,
            offset,
            limit,
            total_pending,
        )

        success = 0
        failed = 0

        for index, insp in enumerate(inspections, start=1):
            res = process_single_inspection(insp.id, db)
            if res:
                success += 1
            else:
                failed += 1

            if index % 10 == 0 or index == total_in_batch:
                logger.info(
                    "Batch progress: %d/%d processed. Success: %d, Failed: %d",
                    index,
                    total_in_batch,
                    success,
                    failed,
                )

        return {"success": success, "failed": failed}
    finally:
        db.close()


def worker_process(inspection_id: int, status_queue):
    # This runs in a separate process
    engine.dispose(close=False)
    db = SessionLocal()
    try:
        success = process_single_inspection(inspection_id, db)
        status_queue.put((inspection_id, "success" if success else "failed", None))
    except Exception as e:
        status_queue.put((inspection_id, "failed", str(e)))
    finally:
        db.close()


def process_all_pending():
    """
    Locate all pending inspections from 2024 onward, and process them
    using a multiprocessing pool with a watchdog to handle stalls.
    """
    db = SessionLocal()
    try:
        # Reset any stuck processing states back to pending
        updated = (
            db.query(Inspection)
            .filter(Inspection.processing_status == ProcessingStatus.PROCESSING)
            .update(
                {Inspection.processing_status: ProcessingStatus.PENDING}, synchronize_session=False
            )
        )
        if updated > 0:
            db.commit()
            logger.info("Reset %d stalled inspections to PENDING", updated)

        query = db.query(Inspection).filter(
            Inspection.source_pdf.isnot(None),
            Inspection.source_pdf != "",
            Inspection.source_pdf != "placeholder",
            Inspection.processing_status == ProcessingStatus.PENDING,
            Inspection.inspection_date >= date(2024, 1, 1),
        )

        inspections = query.order_by(desc(Inspection.inspection_date)).all()
        total_count = len(inspections)
    finally:
        db.close()

    logger.info("=" * 60)
    logger.info("STARTING CONCURRENT 2024+ PIPELINE RUN (MULTIPROCESSING)")
    logger.info("Pending inspections to process: %d", total_count)
    logger.info("=" * 60)

    if total_count == 0:
        logger.info("No pending inspections to process.")
        return

    ctx = multiprocessing.get_context("spawn")
    status_queue = ctx.Queue()
    max_workers = 4  # Limit CPU intensive OCR processes
    timeout_seconds = 180  # 3 minute timeout per PDF

    pending_ids = [insp.id for insp in inspections]
    active_workers = {}  # pid -> {"process": Process, "id": int, "start_time": float}

    processed_count = 0
    success_count = 0
    failed_count = 0
    quarantined_count = 0

    start_time = time.time()
    db = SessionLocal()

    try:
        while pending_ids or active_workers:
            completed_pids = []
            now = time.time()

            # Drain status_queue
            while not status_queue.empty():
                try:
                    insp_id, status, error = status_queue.get_nowait()
                    if status == "success":
                        success_count += 1
                    else:
                        failed_count += 1
                except queue.Empty:
                    break

            for pid, info in list(active_workers.items()):
                p = info["process"]
                insp_id = info["id"]

                if not p.is_alive():
                    # Process finished naturally
                    completed_pids.append(pid)
                    processed_count += 1
                elif now - info["start_time"] > timeout_seconds:
                    # Stall detected!
                    logger.error(
                        "[WATCHDOG] Stall detected for inspection %s! Killing worker pid %s",
                        insp_id,
                        pid,
                    )

                    p.terminate()
                    p.join(timeout=5)
                    if p.is_alive():
                        p.kill()

                    # After killing, check if it actually managed to commit right before dying
                    # Use a fresh session to avoid seeing a stale snapshot
                    with SessionLocal() as check_db:
                        insp = check_db.query(Inspection).filter(Inspection.id == insp_id).first()
                        if insp and insp.processing_status == ProcessingStatus.PROCESSING:
                            insp.processing_status = ProcessingStatus.QUARANTINED
                            insp.error_reason = "Worker timed out (stalled during OCR/NLP)"
                            insp.processed_at = dt_class.now(timezone.utc)
                            check_db.commit()
                        elif insp and insp.processing_status == ProcessingStatus.COMPLETED:
                            # It finished right at the buzzer
                            success_count += 1

                    completed_pids.append(pid)
                    processed_count += 1
                    quarantined_count += 1

            for pid in completed_pids:
                del active_workers[pid]

            # Spawn new workers
            while len(active_workers) < max_workers and pending_ids:
                next_id = pending_ids.pop(0)
                # Mark as processing
                insp = db.query(Inspection).filter(Inspection.id == next_id).first()
                if insp:
                    insp.processing_status = ProcessingStatus.PROCESSING
                    db.commit()

                p = ctx.Process(target=worker_process, args=(next_id, status_queue))
                p.start()
                active_workers[p.pid] = {"process": p, "id": next_id, "start_time": time.time()}

            if processed_count > 0 and len(completed_pids) > 0:
                elapsed = time.time() - start_time
                avg = elapsed / processed_count
                rem = (total_count - processed_count) * avg
                logger.info(
                    "Progress: [%d/%d] | Success: %d | Failed: %d | Quarantined: %d | "
                    "Elapsed: %ds | ETA: %ds",
                    processed_count,
                    total_count,
                    success_count,
                    failed_count,
                    quarantined_count,
                    int(elapsed),
                    int(rem),
                )

            time.sleep(1)  # Watchdog poll interval

    except KeyboardInterrupt:
        logger.warning("Pipeline interrupted by user. Cleaning up workers...")
    except Exception as e:
        logger.exception("Pipeline crashed: %s", e)
    finally:
        db.close()
        for pid, info in active_workers.items():
            logger.warning("Terminating worker pid %s", pid)
            info["process"].terminate()

    logger.info("=" * 60)
    logger.info(
        "CONCURRENT PIPELINE COMPLETE — processed: %d | success: %d | failed: %d | quarantined: %d",
        processed_count,
        success_count,
        failed_count,
        quarantined_count,
    )
    logger.info("=" * 60)


def run_priority_batch(limit: int = 2000) -> Dict[str, Any]:
    """
    Run a priority batch processing the most recent pending inspections with
    violations from 2024 onward.
    """
    start_time = dt_class.now(timezone.utc)
    db = SessionLocal()

    try:
        # Query inspections matching query conditions
        query = (
            db.query(Inspection)
            .filter(
                Inspection.processing_status == ProcessingStatus.PENDING,
                Inspection.source_pdf.isnot(None),
                Inspection.source_pdf != "",
                Inspection.violation_count > 0,
                Inspection.inspection_date >= date(2024, 1, 1),
            )
            .order_by(desc(Inspection.inspection_date))
            .limit(limit)
        )

        inspections = query.all()
        total_to_process = len(inspections)

        logger.info("Starting priority batch processing for %d inspections", total_to_process)
        logger.info("-" * 50)

        success = 0
        failed = 0

        for index, insp in enumerate(inspections, start=1):
            res = process_single_inspection(insp.id, db)
            if res:
                success += 1
            else:
                failed += 1

            if index % 100 == 0 or index == total_to_process:
                elapsed_sec = (dt_class.now(timezone.utc) - start_time).total_seconds()
                minutes = int(elapsed_sec // 60)
                seconds = int(elapsed_sec % 60)
                time_str = f"{minutes}m {seconds}s"
                logger.info(
                    "Priority batch: %d/%d processed | Success: %d | Failed: %d | Time: %s",
                    index,
                    total_to_process,
                    success,
                    failed,
                    time_str,
                )

        end_time = dt_class.now(timezone.utc)
        duration_sec = (end_time - start_time).total_seconds()
        duration_min = int(duration_sec // 60)
        duration_remaining_sec = int(duration_sec % 60)

        logger.info("=" * 40)
        logger.info(
            "PRIORITY BATCH SUMMARY — total: %d | success: %d | failed: %d | duration: %dm %ds",
            success + failed,
            success,
            failed,
            duration_min,
            duration_remaining_sec,
        )
        logger.info("=" * 40)

        return {"success": success, "failed": failed, "duration": duration_sec}

    finally:
        db.close()


def process_local_pdfs():
    """
    Find all inspections that have their PDF downloaded locally,
    and process them to extract detailed violations and inventory.
    """
    db = SessionLocal()
    try:
        pdf_dir = Path(__file__).resolve().parent.parent.parent / "data" / "raw_pdfs"
        if not pdf_dir.exists():
            logger.warning("No raw PDFs folder found at %s", pdf_dir)
            return

        local_hashes = {f.stem for f in pdf_dir.glob("*.pdf")}
        inspections = (
            db.query(Inspection).filter(Inspection.source_pdf_path.in_(local_hashes)).all()
        )
        total = len(inspections)
        logger.info("Found %d inspections with local PDFs. Starting processing...", total)

        success = 0
        failed = 0
        start_time = time.time()

        for index, insp in enumerate(inspections, start=1):
            res = process_single_inspection(insp.id, db)
            if res:
                success += 1
            else:
                failed += 1

            if index % 50 == 0 or index == total:
                elapsed = int(time.time() - start_time)
                logger.info(
                    "Local PDFs: %d/%d processed | Success: %d | Failed: %d | Time: %ds",
                    index,
                    total,
                    success,
                    failed,
                    elapsed,
                )

        logger.info("Finished processing local PDFs. Success: %d, Failed: %d", success, failed)
    finally:
        db.close()
