import os
import sys
from pathlib import Path

# Add backend directory to sys.path to ensure absolute app imports work robustly
_backend_dir = str(Path(__file__).resolve().parent.parent)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

import logging
import logging.config
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text

from app import models  # noqa: F401
from app.database import engine
from app.limiter import limiter
from app.routers import dashboard, documents, enforcement, facilities, inspectors, violations
from app.services.scheduler import start_scheduler, stop_scheduler

# ── Structured JSON logging ──────────────────────────────────────────────────
LOGGING: dict = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
            "fmt": "%(asctime)s %(levelname)s %(name)s %(message)s",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        }
    },
    "root": {"handlers": ["console"], "level": "INFO"},
}
logging.config.dictConfig(LOGGING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    if engine.dialect.name != "postgresql":
        raise RuntimeError(
            f"Database dialect must be postgresql, got {engine.dialect.name}. "
            "SQLite is not supported."
        )
    if _scheduler_enabled():
        start_scheduler()
    else:
        logging.getLogger(__name__).info("Scheduler startup disabled by ENABLE_SCHEDULER=false")

    yield  # application runs

    # ── Shutdown ─────────────────────────────────────────────────────────────
    if _scheduler_enabled():
        stop_scheduler()


app = FastAPI(title="AWA Platform", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

cors_origins_str = os.environ.get("CORS_ALLOWED_ORIGINS", "")
allowed_origins = [o.strip() for o in cors_origins_str.split(",") if o.strip()]

if not allowed_origins:
    allowed_origins = [
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:4174",
        "http://127.0.0.1:4174",
        "http://localhost:4175",
        "http://127.0.0.1:4175",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]


def _expand_loopback_origins(origins: list[str]) -> list[str]:
    expanded: list[str] = []
    seen: set[str] = set()

    def add(origin: str) -> None:
        if origin and origin not in seen:
            seen.add(origin)
            expanded.append(origin)

    for origin in origins:
        add(origin)
        if "localhost" in origin:
            add(origin.replace("localhost", "127.0.0.1"))
        elif "127.0.0.1" in origin:
            add(origin.replace("127.0.0.1", "localhost"))

    if any("localhost" in origin or "127.0.0.1" in origin for origin in origins):
        for port in (4173, 4174, 4175, 5173, 5174, 5175):
            add(f"http://localhost:{port}")
            add(f"http://127.0.0.1:{port}")

    return expanded


def _scheduler_enabled() -> bool:
    return os.environ.get("ENABLE_SCHEDULER", "false").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


allowed_origins = _expand_loopback_origins(allowed_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(facilities.router)
app.include_router(inspectors.router)
app.include_router(dashboard.router)
app.include_router(violations.router)
app.include_router(documents.router)
app.include_router(enforcement.router)


@app.get("/health")
def health() -> dict[str, str]:
    """Health endpoint for liveness and DB connectivity."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        return {"status": "fail", "detail": str(exc)}
    return {"status": "ok"}


@app.get("/")
def root():
    return {"status": "AWA Platform running"}
