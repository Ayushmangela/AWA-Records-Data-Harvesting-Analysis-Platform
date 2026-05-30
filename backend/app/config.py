import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")


def _resolve_path(env_name: str, default: Path) -> Path:
    raw_value = os.getenv(env_name, "")
    if raw_value.strip():
        return Path(raw_value).expanduser().resolve()
    return default


PDF_STORAGE_PATH = _resolve_path("PDF_STORAGE_PATH", ROOT_DIR / "data" / "raw_pdfs")
PROCESSED_PATH = _resolve_path("PROCESSED_PATH", ROOT_DIR / "data" / "processed")

PDF_STORAGE_PATH.mkdir(parents=True, exist_ok=True)
PROCESSED_PATH.mkdir(parents=True, exist_ok=True)
