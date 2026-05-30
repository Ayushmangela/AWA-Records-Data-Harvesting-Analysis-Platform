import logging
import signal
import sys
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
