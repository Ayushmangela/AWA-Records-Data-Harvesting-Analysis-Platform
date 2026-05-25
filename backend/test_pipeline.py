from app.services.pipeline import process_all_pending
import app.services.pipeline as pipeline

# Monkeypatch the query logic just to test 2 items
original_query = pipeline.SessionLocal.query
def mock_query(*args, **kwargs):
    # This is hard to monkeypatch SQLAlchemy query.
    pass

# We will just rewrite a small snippet of pipeline to have a limit
