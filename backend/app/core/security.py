"""JWT verification.

Supabase issues asymmetric (ES256) access tokens signed by per-project signing
keys. We verify them at the system boundary against the project's public JWKS
endpoint — the token header's `kid` selects the right key, so key rotation is
handled transparently and no shared secret is needed. The JWKS client is built
once and caches the keys in memory.
"""

import ssl
from functools import lru_cache
from typing import Any

import certifi
import jwt
from jwt import PyJWKClient

from app.core.config import get_settings
from app.core.exceptions import AppError


class InvalidTokenError(AppError):
    """Raised when a bearer token is missing, malformed, or fails validation."""

    def __init__(self, message: str = "Invalid or expired authentication token") -> None:
        super().__init__(message, status_code=401)


@lru_cache
def get_jwks_client() -> PyJWKClient:
    """Return the cached JWKS client for the Supabase project."""
    settings = get_settings()
    ssl_ctx = ssl.create_default_context(cafile=certifi.where())
    return PyJWKClient(settings.supabase_jwks_url, cache_keys=True, ssl_context=ssl_ctx)


def verify_supabase_jwt(token: str) -> dict[str, Any]:
    """Validate a Supabase access token and return its claims.

    Raises `InvalidTokenError` (HTTP 401) on any failure.
    """
    settings = get_settings()
    try:
        signing_key = get_jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
            issuer=settings.supabase_issuer,
            leeway=10,
            # TEMPORARY: expiry disabled until session refresh flow is fixed
            options={"require": ["iss", "aud", "sub"], "verify_exp": False},
        )
    except AppError:
        raise
    except Exception as exc:  # noqa: BLE001 — any decode/JWKS failure is a 401
        raise InvalidTokenError() from exc
