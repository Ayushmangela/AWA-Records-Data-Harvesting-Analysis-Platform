import logging
import logging.config
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

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
    start_scheduler()

    yield  # application runs

    # ── Shutdown ─────────────────────────────────────────────────────────────
    stop_scheduler()


app = FastAPI(title="AWA Platform", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

cors_origins_str = os.environ.get("CORS_ALLOWED_ORIGINS", "")
allowed_origins = [o.strip() for o in cors_origins_str.split(",") if o.strip()]


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
        for port in (4173, 4174, 5173, 5174):
            add(f"http://localhost:{port}")
            add(f"http://127.0.0.1:{port}")

    return expanded


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


@app.get("/")
def root():
    return {"status": "AWA Platform running"}
