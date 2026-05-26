from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app import models  # noqa: F401
from app.routers import facilities, inspectors, dashboard, violations, documents
from app.services.scheduler import start_scheduler, stop_scheduler

app = FastAPI(title="AWA Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
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
    Base.metadata.create_all(bind=engine)
    start_scheduler()


@app.on_event("shutdown")
def on_shutdown():
    stop_scheduler()


@app.get("/")
def root():
    return {"status": "AWA Platform running"}
