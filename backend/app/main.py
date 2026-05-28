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
from app.routers import dashboard, documents, facilities, inspectors, violations
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


@app.get("/")
def root():
    return {"status": "AWA Platform running"}
