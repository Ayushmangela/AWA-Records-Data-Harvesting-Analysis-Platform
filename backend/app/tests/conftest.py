import os
import pytest
from testcontainers.postgres import PostgresContainer
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base, get_db
from app.main import app


def check_production_db(url: str):
    if "supabase.co" in url or "supabase.net" in url:
        raise ValueError("DATABASE_URL points to a production host")


@pytest.fixture(scope="session")
def postgres_url():
    db_url = os.getenv("DATABASE_URL", "")
    try:
        check_production_db(db_url)
    except ValueError as e:
        pytest.exit(f"Safety check failed: {e}", returncode=1)

    with PostgresContainer("postgres:15") as pg:
        yield pg.get_connection_url()


@pytest.fixture()
def db_session(postgres_url, monkeypatch):
    db_url = os.getenv("DATABASE_URL", "")
    try:
        check_production_db(db_url)
    except ValueError as e:
        pytest.exit(f"Safety check failed: {e}", returncode=1)

    monkeypatch.setenv("DATABASE_URL", postgres_url)

    engine = create_engine(postgres_url)
    Base.metadata.create_all(engine)

    Session = sessionmaker(bind=engine)
    session = Session()

    def override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    yield session

    session.close()
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(engine)
