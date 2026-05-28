# AWA-Records-Data-Harvesting-Analysis-Platform

## Deployment Runbook

Before starting the server, ensure that all database migrations are applied:

```bash
cd backend
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Testing

The AWA Platform relies on Postgres-specific extensions (`pg_trgm`) and functions (`func.to_char`). Therefore, tests must run against a PostgreSQL instance. SQLite (`sqlite:///:memory:`) is not supported and will fail the startup assertions.

To run tests locally, start the dedicated test container:

```bash
cd backend
docker-compose -f docker-compose.test.yml up -d
DATABASE_URL=postgresql://postgres:test_password@localhost:5432/awa_test pytest
docker-compose -f docker-compose.test.yml down
```

## Data Assets

For repository performance, large data assets like `inspections.csv` and `inspections-citations.csv` are entirely excluded from version control. 

To regenerate these files or seed your local database:
1. Run the USDA scraper: `python backend/app/services/scraper.py`
2. Run the CSV importer: `python backend/app/services/csv_importer.py`
