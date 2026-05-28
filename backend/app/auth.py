import os
import hmac
from fastapi import Header, HTTPException, status

def require_api_key(x_api_key: str | None = Header(default=None)):
    if not x_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing API Key")

    keys_str = os.environ.get("AWA_API_KEYS", "")
    valid_keys = [k.strip() for k in keys_str.split(",") if k.strip()]
    
    if not valid_keys:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API Key")

    for valid_key in valid_keys:
        if hmac.compare_digest(valid_key.encode('utf-8'), x_api_key.encode('utf-8')):
            return x_api_key
            
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API Key")
