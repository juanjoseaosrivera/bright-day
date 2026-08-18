"""Transcription worker — post-session Faster-Whisper transcription.

Runs as an asyncio background task (via `asyncio.create_task`) after the
WebSocket session ends. Opens its own DB session — never shares the HTTP
request's DB session (architecture invariant: background work uses a separate
context with no shared DB state).

The Whisper model reference is set at startup via `set_whisper_model` called
from `lifespan.py`. This avoids `request.app.state`, which is unavailable in
a detached background task.
"""

from __future__ import annotations

import asyncio
import logging
import uuid

import httpx

from app.ai.stt import whisper as stt
from app.db.session import SessionLocal
from app.domains.sessions import service as session_service
from app.storage import audio as audio_storage
from app.workers import overviews

logger = logging.getLogger(__name__)

# Module-level model reference — set once at startup via set_whisper_model().
_whisper_model = None


def set_whisper_model(model) -> None:
    global _whisper_model
    _whisper_model = model


async def transcribe_session_task(
    session_id: uuid.UUID,
    supabase_client,
) -> None:
    """Download audio from storage, transcribe, and update the session row.

    On success: status → "ready", transcript populated.
    On any failure: status → "failed". Exceptions are logged, not propagated.
    """
    db = SessionLocal()
    try:
        # Re-fetch session with its own DB session (no shared state).
        from app.domains.sessions.models import Session as SessionModel
        from sqlalchemy import select

        session = db.scalar(select(SessionModel).where(SessionModel.id == session_id))
        if session is None:
            logger.warning("transcribe_session_task: session %s not found", session_id)
            return

        if not session.audio_path:
            logger.warning("transcribe_session_task: no audio_path for session %s", session_id)
            return

        signed_url = audio_storage.get_signed_url(session.audio_path, supabase_client)

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(signed_url)
            response.raise_for_status()
            audio_bytes = response.content

        if _whisper_model is None:
            raise RuntimeError("Whisper model not initialized")

        transcript = stt.transcribe_full(audio_bytes, _whisper_model)
        session_service.complete_transcription(session_id, transcript, db)
        logger.info("Transcription complete for session %s", session_id)
        asyncio.create_task(overviews.generate_overview_task(session_id, str(session.user_id)))

    except Exception:
        logger.exception("Transcription failed for session %s", session_id)
        try:
            session_service.fail_transcription(session_id, db)
        except Exception:
            logger.exception("fail_transcription also failed for session %s", session_id)
    finally:
        db.close()
