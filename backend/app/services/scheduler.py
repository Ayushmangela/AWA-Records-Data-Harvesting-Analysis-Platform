import concurrent.futures
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.services.pipeline import process_all_pending, recover_orphaned_inspections
from app.services.scraper import check_and_download_new_pdfs

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def nightly_sync_job():
    """Check USDA for new records, download PDFs, and process them."""

    def _run_sync():
        start_time = datetime.now(timezone.utc)
        logger.info("Nightly USDA sync started at %s", start_time.isoformat())

        downloaded = 0

        try:
            downloaded = check_and_download_new_pdfs()
        except Exception:
            logger.exception("Error during PDF download step")
            downloaded = 0

        try:
            # We start the multiprocessing pipeline as a separate process or blockingly run it
            # Actually, process_all_pending uses multiprocessing pool.
            logger.info("Starting pipeline processing for pending PDFs...")
            process_all_pending()
            logger.info("Pipeline processing step completed")
        except Exception:
            logger.exception("Error during PDF processing step")

        end_time = datetime.now(timezone.utc)
        duration = (end_time - start_time).total_seconds()
        logger.info(
            "Nightly USDA sync finished at %s (%.1fs) — downloaded=%s",
            end_time.isoformat(),
            duration,
            downloaded,
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(_run_sync)
        try:
            # 1 hour overall job timeout to prevent blocked subsequent runs
            future.result(timeout=3600)
        except concurrent.futures.TimeoutError:
            logger.error("Nightly sync job timed out after 1 hour.")
        except Exception as e:
            logger.error("Nightly sync job failed with exception: %s", e)


def start_scheduler():
    """Start the background scheduler and register the nightly job."""
    if scheduler.running:
        logger.debug("Scheduler already running")
        return

    # Run recovery for orphan rows before starting the regular schedule
    recover_orphaned_inspections()

    scheduler.add_job(
        nightly_sync_job,
        CronTrigger(hour=2, minute=0),
        id="nightly_usda_sync",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    logger.info("Background scheduler started (nightly job at 02:00)")


def stop_scheduler():
    """Shut down the background scheduler."""
    if not scheduler.running:
        logger.debug("Scheduler not running")
        return

    scheduler.shutdown(wait=False)
    logger.info("Background scheduler stopped")
