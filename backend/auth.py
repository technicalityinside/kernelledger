import os
from fastapi import Header, HTTPException, status


def require_push_key(authorization: str = Header(default="")) -> None:
    """Dependency that validates the push API key on write endpoints."""
    expected = os.environ.get("PUSH_API_KEY", "")
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Push API key not configured on server. Set PUSH_API_KEY.",
        )
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
            headers={"WWW-Authenticate": "Bearer"},
        )
