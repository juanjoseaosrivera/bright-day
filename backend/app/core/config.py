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

    # Stripe — payment processing for subscription management.
    # Defaults to "" so the app boots without real keys (same pattern as Supabase keys).
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id_weekly_1: str = ""
    stripe_price_id_weekly_3: str = ""
    stripe_price_id_weekly_5: str = ""

    # Voice provider — selects the implementation of the LIVE VOICE TURN LOOP only.
    #   "local"      → Whisper STT + Ollama LLM + Kokoro TTS, orchestrated by ai/graph.py
    #                  over our own WebSocket (app/domains/sessions/router.py).
    #   "elevenlabs" → the browser talks directly to an ElevenLabs agent, which runs
    #                  STT + LLM + TTS; the backend mints the signed URL and reconciles
    #                  the finished conversation afterwards.
    # This flag does NOT affect diary pattern detection or session overviews — those
    # stay on Ollama unconditionally (ElevenLabs has no general chat-completions API).
    voice_provider: str = "local"  # local | elevenlabs

    # ElevenLabs Agents Platform — only read when voice_provider == "elevenlabs".
    # Defaults to "" so the app boots without real keys (same pattern as Supabase/Stripe).
    elevenlabs_api_key: str = ""
    elevenlabs_agent_id: str = ""

    # Sessions / AI — local inference stack and audio storage.
    # Ollama must be running locally with the configured model pulled.
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "llama3.1"
    whisper_model_size: str = "base"
    supabase_storage_bucket: str = "sessions-audio"

    # Kokoro TTS model files (resolved relative to the process CWD, i.e. backend/).
    # If either file is missing, the app runs in text-only mode (no voice output).
    kokoro_model_path: str = "models/kokoro-v1.0.onnx"
    kokoro_voices_path: str = "models/voices-v1.0.bin"

    # espeak-ng backend for Kokoro phonemization. Leave empty to auto-detect a
    # system install (Homebrew / apt). The espeakng-loader wheel that ships with
    # kokoro-onnx has a broken bundled data path, so a real espeak-ng is required
    # for voice output. Install: `brew install espeak-ng` (macOS) / `apt install espeak-ng`.
    espeak_library_path: str = ""
    espeak_data_path: str = ""

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def use_elevenlabs_voice(self) -> bool:
        """True when live voice sessions run on the ElevenLabs Agents Platform."""
        return self.voice_provider.strip().lower() == "elevenlabs"

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
