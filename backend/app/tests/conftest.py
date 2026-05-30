import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Force testing mode & local sqlite to make test runs hermetic in CI-less environments.
# This keeps imports deterministic and avoids hitting Redis/Postgres unless explicitly requested.
os.environ["TESTING"] = "true"
os.environ["DATABASE_URL"] = "sqlite:///test.db"
os.environ["REDIS_URL"] = "memory://"

from app.database import Base, get_db
from importlib import import_module


def check_production_db(url: str):
    if "supabase.co" in url or "supabase.net" in url:
        raise ValueError("DATABASE_URL points to a production host")


@pytest.fixture()
def db_session(monkeypatch):
    # Use DATABASE_URL set at module import time (defaults to sqlite:///test.db)
    db_url = os.getenv("DATABASE_URL", "sqlite:///test.db")
    try:
        check_production_db(db_url)
    except ValueError as e:
        pytest.exit(f"Safety check failed: {e}", returncode=1)

    monkeypatch.setenv("DATABASE_URL", db_url)
    # Force rate limiter to use in-memory storage during tests
    monkeypatch.setenv("REDIS_URL", "memory://")

    engine = create_engine(db_url)
    Base.metadata.create_all(engine)

    Session = sessionmaker(bind=engine)
    session = Session()

    def override_get_db():
        try:
            yield session
        finally:
            pass

    # Import app lazily to avoid heavy imports at module import time
    from importlib import import_module
    main = import_module("app.main")
    app = main.app
    app.dependency_overrides[get_db] = override_get_db

    yield session

    session.close()
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(engine)


from app.auth import require_auth


def mock_require_auth():
    return {"id": "test-user-id", "email": "test@example.com"}


@pytest.fixture
def client(db_session):
    # Provide a TestClient with auth dependency overridden for tests
    from importlib import import_module
    main = import_module("app.main")
    app = main.app
    app.dependency_overrides[require_auth] = mock_require_auth
    try:
        from limits.storage.memory import MemoryStorage

        from app.limiter import limiter as rate_limiter

        rate_limiter.limiter.storage = MemoryStorage()
        rate_limiter.limiter.reset()
    except Exception:
        pass
    from fastapi.testclient import TestClient

    client = TestClient(app)
    yield client
    # cleanup
    app.dependency_overrides.pop(require_auth, None)


from sqlalchemy import event
from sqlalchemy.engine import Engine
import sqlite3

def sqlite_to_char(val, fmt):
    if not val:
        return None
    val_str = str(val)
    if fmt == 'YYYY-MM' and len(val_str) >= 7:
        return val_str[:7]
    return val_str

@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if isinstance(dbapi_connection, sqlite3.Connection):
        dbapi_connection.create_function("to_char", 2, sqlite_to_char)
