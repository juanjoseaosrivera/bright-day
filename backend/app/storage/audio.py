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

# Storage extension per content type. The stored object's extension and
# content-type have to match the actual bytes, or the `<audio>` element on the
# session detail page refuses to play them (Safari is strict; Chrome often sniffs
# past a wrong type).
_EXTENSION_BY_CONTENT_TYPE = {
    "audio/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
}


def extension_for_content_type(content_type: str, default: str = "mp3") -> str:
    """Map a response content type to a storage file extension."""
    normalized = content_type.split(";")[0].strip().lower()
    extension = _EXTENSION_BY_CONTENT_TYPE.get(normalized)
    if extension is None:
        logger.warning(
            "Unrecognized audio content type %r — storing as .%s", content_type, default
        )
        return default
    return extension


def upload_audio(
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    audio_bytes: bytes,
    supabase_client,
    *,
    extension: str = "webm",
    content_type: str = "audio/webm",
) -> str:
    """Upload audio to Supabase Storage; return the storage path string.

    `extension` / `content_type` default to the browser-recorded WebM the local
    voice loop produces. ElevenLabs conversation recordings come back in a
    different format, so that caller passes the type it actually received.
    """
    settings = get_settings()
    bucket = settings.supabase_storage_bucket
    path = f"{user_id}/{session_id}.{extension}"

    try:
        supabase_client.storage.from_(bucket).upload(
            path=path,
            file=audio_bytes,
            file_options={"content-type": content_type, "upsert": "true"},
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
