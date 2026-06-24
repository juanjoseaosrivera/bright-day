"""Centralized application configuration via Pydantic Settings.

All environment-driven configuration is validated here and read through the
cached `get_settings()` accessor so the settings object is built once.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validated application settings, sourced from environment / `.env`."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    app_name: str = "Bright Day API"
    environment: str = "development"  # development | staging | production
    api_v1_prefix: str = "/api/v1"

    # CORS — explicit allowed origins (frontend dev origin); never a wildcard.
    cors_origins: list[str] = ["http://localhost:4200"]

    # Frontend base URL — used to build the email-verification redirect target.
    frontend_url: str = "http://localhost:4200"

    # Database (SQLAlchemy URL, e.g. postgresql+psycopg://...).
    database_url: str = ""

    # Supabase — new API key format (sb_publishable_* / sb_secret_*). The
    # backend talks to Supabase Auth with the secret key; JWTs are verified
    # against the project's public JWKS (asymmetric ES256 signing keys), so the
    # signing-key id is read for reference only and not used in verification.
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""
    supabase_jwt_signin_id: str = ""

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def supabase_jwks_url(self) -> str:
        """Public JWKS endpoint for verifying Supabase-issued access tokens."""
        return f"{self.supabase_url}/auth/v1/.well-known/jwks.json"

    @property
    def supabase_issuer(self) -> str:
        """Expected `iss` claim on Supabase access tokens."""
        return f"{self.supabase_url}/auth/v1"


@lru_cache
def get_settings() -> Settings:
    """Return the cached, validated application settings."""
    return Settings()
