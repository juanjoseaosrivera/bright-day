"""Object-storage adapter for session audio files.

Raw audio never lives in the database. This module wraps the Supabase Storage
API for uploads and signed-URL issuance. Both functions accept the supabase
client as a parameter — no module-level singleton — to avoid initialization
order issues.
"""

from __future__ import annotations

import logging
import uuid

from app.core.config import get_settings
from app.core.exceptions import AppError

logger = logging.getLogger(__name__)


def upload_audio(
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    audio_bytes: bytes,
    supabase_client,
) -> str:
    """Upload audio to Supabase Storage; return the storage path string."""
    settings = get_settings()
    bucket = settings.supabase_storage_bucket
    path = f"{user_id}/{session_id}.webm"

    try:
        supabase_client.storage.from_(bucket).upload(
            path=path,
            file=audio_bytes,
            file_options={"content-type": "audio/webm", "upsert": "true"},
        )
    except Exception as exc:
        logger.exception("Audio upload failed for %s/%s", user_id, session_id)
        raise AppError("Failed to upload session audio", status_code=500) from exc

    return path


def get_signed_url(
    storage_path: str,
    supabase_client,
    expires_in: int = 3600,
) -> str:
    """Create and return a signed URL valid for `expires_in` seconds."""
    settings = get_settings()
    bucket = settings.supabase_storage_bucket

    try:
        response = supabase_client.storage.from_(bucket).create_signed_url(
            path=storage_path,
            expires_in=expires_in,
        )
        url: str = response["signedURL"]
        if not url:
            raise ValueError("Empty signed URL returned")
        return url
    except (AppError, ValueError):
        raise
    except Exception as exc:
        logger.exception("Failed to create signed URL for %s", storage_path)
        raise AppError("Failed to generate audio URL", status_code=500) from exc
