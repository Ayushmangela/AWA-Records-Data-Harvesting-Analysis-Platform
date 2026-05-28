from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from app.limiter import limiter

from app.database import Base, engine
from app import models  # noqa: F401
from app.routers import facilities, inspectors, dashboard, violations, documents
from app.services.scheduler import start_scheduler, stop_scheduler

app = FastAPI(title="AWA Platform")

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


@app.on_event("startup")
def on_startup():
    if engine.dialect.name != "postgresql":
        raise RuntimeError(f"Database dialect must be postgresql, got {engine.dialect.name}. SQLite is not supported.")
    start_scheduler()


@app.on_event("shutdown")
def on_shutdown():
    stop_scheduler()


@app.get("/")
def root():
    return {"status": "AWA Platform running"}
