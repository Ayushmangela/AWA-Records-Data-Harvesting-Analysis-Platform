import logging
import os
import socket
import ipaddress

from slowapi import Limiter

logger = logging.getLogger(__name__)

def _normalize_ip(candidate: str) -> str | None:
    candidate = candidate.strip()
    if not candidate:
        return None
    if candidate.startswith("[") and "]" in candidate:
        candidate = candidate[1:candidate.index("]")]
    if candidate.count(":") == 1 and candidate.rsplit(":", 1)[1].isdigit():
        candidate = candidate.rsplit(":", 1)[0]
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None


def get_ip_address(request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        for part in forwarded.split(","):
            normalized = _normalize_ip(part)
            if normalized:
                return normalized
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        normalized = _normalize_ip(real_ip)
        if normalized:
            return normalized
    if not request.client:
        return "127.0.0.1"
    normalized = _normalize_ip(request.client.host)
    return normalized or request.client.host

redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
is_testing = os.environ.get("TESTING") == "true" or "pytest" in os.environ.get("PYTEST_CURRENT_TEST", "")

if is_testing:
    limiter = Limiter(key_func=get_ip_address, storage_uri="memory://")
else:
    if redis_url == "redis://localhost:6379":
        try:
            parsed = redis_url.replace("redis://", "").split(":")
            host = parsed[0]
            port = int(parsed[1]) if len(parsed) > 1 else 6379
            with socket.create_connection((host, port), timeout=1):
                pass
        except Exception as exc:
            logger.warning(
                "Redis unavailable at %s, falling back to memory limiter: %s",
                redis_url,
                exc,
            )
            limiter = Limiter(key_func=get_ip_address, storage_uri="memory://")
        else:
            limiter = Limiter(key_func=get_ip_address, storage_uri=redis_url)
    else:
        limiter = Limiter(key_func=get_ip_address, storage_uri=redis_url)
