import hashlib
import logging
import os
import ssl
import time
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

PDF_DOWNLOAD_HEADERS = {
    "User-Agent": "The Data Liberation Project (data-liberation-project.org)",
    "Accept": "*/*",
}


def build_ssl_context() -> ssl.SSLContext:
    """Return a TLS context that uses the system trust store and an optional custom CA bundle."""
    context = ssl.create_default_context()
    ca_bundle = os.environ.get("AWA_CA_BUNDLE")
    if ca_bundle:
        context.load_verify_locations(ca_bundle)
    return context


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def sha256_file(path: Path) -> str | None:
    try:
        return sha256_bytes(path.read_bytes())
    except Exception as exc:
        logger.debug("Failed to hash %s: %s", path, exc)
        return None


def download_pdf_bytes(url: str, retries: int = 3, timeout: int = 15, min_size: int = 1000) -> bytes | None:
    """Download a PDF with TLS verification and retries."""
    for attempt in range(1, retries + 1):
        try:
            request = urllib.request.Request(url, headers=PDF_DOWNLOAD_HEADERS)  # noqa: S310
            with urllib.request.urlopen(request, timeout=timeout, context=build_ssl_context()) as response:  # noqa: S310
                content = response.read()
                if len(content) < min_size:
                    raise ValueError("Response too small to be a real PDF")
                return content
        except Exception as exc:
            logger.warning("Attempt %s for %s failed: %s", attempt, url, exc)
            if attempt < retries:
                time.sleep(attempt * 2)
    return None


def verify_checksum(path: Path, expected_sha256: str | None) -> bool:
    if not expected_sha256:
        return True
    actual = sha256_file(path)
    return actual == expected_sha256
