import os
import sys
from pathlib import Path

# Add backend directory to sys.path to ensure absolute app imports work robustly
_backend_dir = str(Path(__file__).resolve().parent)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

import logging
import signal
import time

from app.services.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("worker")


def shutdown(signum, frame):
    logger.info("Received shutdown signal %s, stopping scheduler...", signum)
    stop_scheduler()
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    logger.info("Starting background worker service")
    start_scheduler()

    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        shutdown(signal.SIGINT, None)
