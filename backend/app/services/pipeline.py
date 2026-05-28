import logging
import time
import datetime
from datetime import date, datetime as dt_class
from pathlib import Path
from typing import Any, Dict
import queue
import threading
import multiprocessing
import os

import requests
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Inspection, Inventory, Violation, ProcessingStatus
from app.services.extractor import extract_data
from app.services.ocr import extract_text_from_pdf

logger = logging.getLogger(__name__)

# Global lock for thread-safe console printing
print_lock = threading.Lock()


def log_failed_pdf(inspection_id: int):
    """Save failed inspection IDs to data/failed_pdfs.txt."""
    failed_file = Path(__file__).resolve().parent.parent.parent / "data" / "failed_pdfs.txt"
    failed_file.parent.mkdir(parents=True, exist_ok=True)
    with failed_file.open("a") as f:
        f.write(f"{inspection_id}\n")


def download_inspection_pdf(inspection_id: int, db: Session, verbose: bool = True) -> str | bool:
    """
    Query database for inspection, download its source PDF, and save locally.
    Includes rate limiting, retries, and error handling.
    """
    inspection = db.query(Inspection).filter(Inspection.id == inspection_id).first()
    if not inspection:
        if verbose:
            print("    [PDF] Error: Inspection not found in database.")
        logger.error("Inspection %s not found in database", inspection_id)
        return False

    url = inspection.source_pdf
    if not url or url.strip() == "" or url.strip() == "placeholder":
        if verbose:
            print("    [PDF] Skip: No source PDF URL available.")
        logger.warning("Inspection %s has no source_pdf URL", inspection_id)
        return False

    hash_id = inspection.source_pdf_path
    filename = f"{hash_id}.pdf" if hash_id else f"{inspection_id}.pdf"

    pdf_dir = Path(__file__).resolve().parent.parent.parent / "data" / "raw_pdfs"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    filepath = pdf_dir / filename

    if filepath.exists():
        if verbose:
            print(f"    [PDF] Cached: {filename} already exists locally.")
        return str(filepath)

    if verbose:
        print(f"    [PDF] Downloading: {url}...")
    
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
            if verbose:
                print(f"    [PDF] Success: Downloaded PDF on attempt {attempt}.")
            logger.info("Saved PDF for inspection %s to %s", inspection_id, filepath)

            # Rate limiting: 0.5 second sleep after successful PDF download
            time.sleep(0.5)

            return str(filepath)
        except Exception as e:
            if verbose:
                print(f"    [PDF] Warning: Download attempt {attempt} failed: {e}")
            logger.warning("Download attempt %s failed for inspection %s: %s", attempt, inspection_id, e)
            if attempt < retries:
                time.sleep(attempt * 2)  # Wait 2, 4 seconds between retries
            else:
                if verbose:
                    print("    [PDF] Error: All 3 download attempts failed.")
                logger.error("All 3 download attempts failed for inspection %s", inspection_id)

    return False


def process_single_inspection(inspection_id: int, db: Session) -> bool:
    """
    Download PDF, run OCR, extract structured data, and update inspection,
    violations, and inventory records in the database.
    """
    inspection = db.query(Inspection).filter(Inspection.id == inspection_id).first()
    if not inspection:
        return False

    filepath = download_inspection_pdf(inspection_id, db, verbose=True)
    if not filepath:
        log_failed_pdf(inspection_id)
        inspection.processing_status = ProcessingStatus.FAILED
        inspection.error_reason = "Failed to download PDF"
        inspection.processed_at = dt_class.now()
        db.commit()
        return False

    ocr_result = extract_text_from_pdf(filepath)
    if not ocr_result.get("success") or not ocr_result.get("text"):
        print("    [OCR] Error: OCR text extraction failed.")
        logger.warning("OCR text extraction failed for inspection %s", inspection_id)
        inspection.processing_status = ProcessingStatus.FAILED
        inspection.error_reason = "OCR text extraction failed"
        inspection.processed_at = dt_class.now()
        db.commit()
        return False

    method = ocr_result.get("method", "pdfplumber")
    print(f"    [OCR] Success: Extracted text via {method}.")

    filename = Path(filepath).name
    extracted = extract_data(ocr_result["text"], filename)

    viols_count = len(extracted.get("violations", []))
    inv_count = len(extracted.get("inventory", []))
    print(f"    [Extraction] Found {viols_count} detailed violations and {inv_count} species inventory rows.")

    try:
        # 1. Update inspection fields
        ext_inspection = extracted.get("inspection", {})
        if ext_inspection.get("inspector_name"):
            inspection.inspector_name = ext_inspection["inspector_name"]
        if ext_inspection.get("inspector_id"):
            inspection.inspector_id = ext_inspection["inspector_id"]
        if not inspection.inspection_type and ext_inspection.get("inspection_type"):
            inspection.inspection_type = ext_inspection["inspection_type"]

        # Also align count summaries if we found detailed violations
        if extracted.get("violations"):
            inspection.violations_found = True
            inspection.violation_count = len(extracted["violations"])

        # 2. Duplicate prevention for violations
        db.query(Violation).filter(
            Violation.inspection_id == inspection_id,
            Violation.section.is_(None),
        ).delete(synchronize_session=False)

        db.query(Violation).filter(
            Violation.inspection_id == inspection_id,
            Violation.section.isnot(None),
        ).delete(synchronize_session=False)

        # Create fresh detailed violations from PDF extraction
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

        # 3. Duplicate prevention for inventory
        db.query(Inventory).filter(Inventory.inspection_id == inspection_id).delete(synchronize_session=False)

        # Create fresh inventory records from PDF extraction
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
        inspection.processed_at = dt_class.now()
        db.commit()
        print("    [DB] Success: Successfully committed changes to database.")
        logger.info("Successfully updated database records for inspection %s", inspection_id)
        return True
    except Exception as e:
        db.rollback()
        print(f"    [DB] Error: Transaction failed: {e}")
        logger.exception("Failed database updates for inspection %s: %s", inspection_id, e)
        # Try to save the failed state
        try:
            inspection.processing_status = ProcessingStatus.FAILED
            inspection.error_reason = f"Transaction failed: {e}"
            inspection.processed_at = dt_class.now()
            db.commit()
        except:
            db.rollback()
        return False


def process_batch(limit: int = 100, offset: int = 0) -> Dict[str, int]:
    """
    Process a batch of inspections from 2024 onward that have a source_pdf URL but no inspector_name.
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

        print(
            f"Batch processing: found {total_in_batch} records in this batch "
            f"(offset={offset}, limit={limit}). Total pending: {total_pending}"
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
                print(f"Batch progress: {index}/{total_in_batch} processed. Success: {success}, Failed: {failed}")

        return {"success": success, "failed": failed}
    finally:
        db.close()



def worker_process(inspection_id: int, status_queue):
    # This runs in a separate process
    from app.database import engine
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
        updated = db.query(Inspection).filter(
            Inspection.processing_status == ProcessingStatus.PROCESSING
        ).update(
            {Inspection.processing_status: ProcessingStatus.PENDING},
            synchronize_session=False
        )
        if updated > 0:
            db.commit()
            print(f"Reset {updated} stalled inspections to pending.")

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

    print("=" * 60)
    print(f"STARTING CONCURRENT 2024+ PIPELINE RUN (MULTIPROCESSING)")
    print(f"Pending inspections to process: {total_count}")
    print("=" * 60)

    if total_count == 0:
        print("No pending inspections to process.")
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
                    print(f"\n[WATCHDOG] STALL DETECTED for inspection {insp_id}! Killing worker pid {pid}...")
                    logger.error("[WATCHDOG] Killing worker pid %s for inspection %s", pid, insp_id)
                        
                    # Update DB to quarantined BEFORE terminating the process
                    insp = db.query(Inspection).filter(Inspection.id == insp_id).first()
                    if insp:
                        insp.processing_status = ProcessingStatus.QUARANTINED
                        insp.error_reason = "Worker timed out (stalled during OCR/NLP)"
                        insp.processed_at = dt_class.now()
                        db.commit()
                        
                    p.terminate()
                    p.join(timeout=5)
                    if p.is_alive():
                        p.kill()
                        
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
                active_workers[p.pid] = {
                    "process": p,
                    "id": next_id,
                    "start_time": time.time()
                }
                
            # Periodic stats output
            if processed_count > 0 and len(completed_pids) > 0:
                elapsed = time.time() - start_time
                avg = elapsed / processed_count
                rem = (total_count - processed_count) * avg
                print(f"Progress: [{processed_count}/{total_count}] | Success: {success_count} | Failed: {failed_count} | Quarantined: {quarantined_count} | Elapsed: {int(elapsed)}s | ETA: {int(rem)}s")
                
            time.sleep(1) # Watchdog poll interval
            
    except KeyboardInterrupt:
        print("\nPipeline interrupted by user. Cleaning up workers...")
    except Exception as e:
        logger.exception("Pipeline crashed: %s", e)
    finally:
        db.close()
        for pid, info in active_workers.items():
            print(f"Terminating worker pid {pid}")
            info["process"].terminate()
            
    print("=" * 60)
    print("CONCURRENT PIPELINE EXECUTION COMPLETE")
    print(f"Total processed: {processed_count}")
    print(f"Success: {success_count}")
    print(f"Failed: {failed_count}")
    print(f"Quarantined: {quarantined_count}")
    print("=" * 60)

def run_priority_batch(limit: int = 2000) -> Dict[str, Any]:
    """
    Run a priority batch processing the most recent pending inspections with violations from 2024 onward.
    """
    start_time = dt_class.now()
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

        print(f"Starting priority batch processing for {total_to_process} inspections.")
        print("-" * 50)

        success = 0
        failed = 0

        for index, insp in enumerate(inspections, start=1):
            res = process_single_inspection(insp.id, db)
            if res:
                success += 1
            else:
                failed += 1

            # Print progress every 100 records
            if index % 100 == 0 or index == total_to_process:
                elapsed_sec = (dt_class.now() - start_time).total_seconds()
                minutes = int(elapsed_sec // 60)
                seconds = int(elapsed_sec % 60)
                time_str = f"{minutes}m {seconds}s"
                print(
                    f"Processed {index}/{total_to_process} | Success: {success} | Failed: {failed} | Time: {time_str}"
                )

        end_time = dt_class.now()
        duration_sec = (end_time - start_time).total_seconds()
        duration_min = int(duration_sec // 60)
        duration_remaining_sec = int(duration_sec % 60)

        print("=" * 40)
        print("PRIORITY BATCH SUMMARY")
        print("=" * 40)
        print(f"Total processed: {success + failed}")
        print(f"Success count: {success}")
        print(f"Failed count: {failed}")
        print(f"Time taken: {duration_min}m {duration_remaining_sec}s")
        print("=" * 40)

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
            print("No raw PDFs folder found.")
            return

        local_hashes = {f.stem for f in pdf_dir.glob("*.pdf")}
        inspections = db.query(Inspection).filter(Inspection.source_pdf_path.in_(local_hashes)).all()
        total = len(inspections)
        print(f"Found {total} inspections with local PDFs. Starting processing...")

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
                print(f"Processed {index}/{total} | Success: {success} | Failed: {failed} | Time: {elapsed}s")

        print(f"Finished processing local PDFs. Success: {success}, Failed: {failed}")
    finally:
        db.close()
