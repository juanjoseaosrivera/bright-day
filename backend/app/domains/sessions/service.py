"""sessions — domain service.

All functions are plain `def` (blocking I/O) so FastAPI runs them in its
threadpool. The WebSocket handler calls `end_session` via `asyncio.to_thread`.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session as DBSession

from app.ai.agents import elevenlabs as elevenlabs_agent
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.domains.sessions.models import Session
from app.domains.sessions import schemas
from app.domains.subscription import service as subscription_service
from app.storage import audio as audio_storage


def start_session(user_id: uuid.UUID, db: DBSession) -> tuple[Session, str | None]:
    """Check quota and create a new recording session row.

    Returns `(session, signed_url)`. `signed_url` is None for local sessions; for
    ElevenLabs sessions it is a single-use WebSocket URL the browser connects to
    directly.

    Quota is checked here but NOT incremented — it is charged only once the session
    has actually produced something (the local WebSocket teardown, or the ElevenLabs
    reconcile worker), so failed or dropped connections don't consume the user's
    weekly allowance.
    """
    settings = get_settings()
    has_quota = subscription_service.check_and_reset_quota(db, user_id)
    if not has_quota:
        raise AppError("Session quota exhausted or subscription not active", status_code=403)

    provider = "elevenlabs" if settings.use_elevenlabs_voice else "local"
    signed_url: str | None = None
    conversation_id: str | None = None

    if provider == "elevenlabs":
        # Mint before inserting: a failed mint then leaves no orphan 'recording'
        # row, and an unused signature costs nothing because no conversation runs.
        # The conversation id comes from ElevenLabs here, so the browser never has
        # to tell us which conversation belongs to this session.
        signed_url, conversation_id = elevenlabs_agent.create_signed_url(
            settings.elevenlabs_agent_id
        )

    session = Session(
        user_id=user_id,
        status="recording",
        started_at=datetime.now(timezone.utc),
        provider=provider,
        provider_conversation_id=conversation_id,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session, signed_url


def end_session(
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    audio_bytes: bytes,
    duration_seconds: int,
    supabase_client,
    db: DBSession,
) -> Session:
    """Upload audio to storage, mark session as processing."""
    session = get_session(session_id, user_id, db)

    storage_path = audio_storage.upload_audio(user_id, session_id, audio_bytes, supabase_client)

    session.audio_path = storage_path
    session.ended_at = datetime.now(timezone.utc)
    session.duration_seconds = duration_seconds
    session.status = "processing"
    db.commit()
    db.refresh(session)
    return session


def complete_transcription(session_id: uuid.UUID, transcript: str, db: DBSession) -> None:
    """Mark session as ready with transcript text."""
    session = db.get(Session, session_id)
    if session is None:
        return
    session.transcript = transcript
    session.status = "ready"
    session.updated_at = datetime.now(timezone.utc)
    db.commit()


def complete_elevenlabs_session(
    session_id: uuid.UUID,
    transcript: str,
    duration_seconds: int | None,
    audio_path: str | None,
    db: DBSession,
) -> bool:
    """Atomically finish an ElevenLabs session; return True iff this call won.

    The compare-and-swap on `status` is what makes quota charging exactly-once:
    a late `/complete`, a re-armed poller, and a restart-triggered retry can all
    run against the same row, but only the caller that actually moves it out of
    `recording`/`processing` gets `rowcount == 1` and charges the user.

    `audio_path` is left untouched when None so a failed audio download never
    erases a path a previous attempt already stored.
    """
    values: dict = {
        "status": "ready",
        "transcript": transcript,
        "ended_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    if duration_seconds is not None:
        values["duration_seconds"] = duration_seconds
    if audio_path is not None:
        values["audio_path"] = audio_path

    result = db.execute(
        update(Session)
        .where(Session.id == session_id, Session.status.in_(("recording", "processing")))
        .values(**values)
    )
    db.commit()
    return result.rowcount == 1


def mark_processing(session_id: uuid.UUID, user_id: uuid.UUID, db: DBSession) -> None:
    """Move a live session to `processing` so the UI stops showing it as recording."""
    session = get_session(session_id, user_id, db)
    if session.status == "recording":
        session.status = "processing"
        session.updated_at = datetime.now(timezone.utc)
        db.commit()


def fail_transcription(session_id: uuid.UUID, db: DBSession) -> None:
    """Mark session as failed after a transcription error."""
    session = db.get(Session, session_id)
    if session is None:
        return
    session.status = "failed"
    session.updated_at = datetime.now(timezone.utc)
    db.commit()


def get_session(session_id: uuid.UUID, user_id: uuid.UUID, db: DBSession) -> Session:
    """Fetch session by id; 404 for missing or wrong owner (info leak prevention)."""
    session = db.scalar(
        select(Session).where(Session.id == session_id, Session.user_id == user_id)
    )
    if session is None:
        raise AppError("Session not found", status_code=404)
    return session


def list_sessions(user_id: uuid.UUID, db: DBSession) -> list[Session]:
    """All sessions for this user, newest first."""
    return list(
        db.scalars(
            select(Session)
            .where(Session.user_id == user_id)
            .order_by(Session.started_at.desc())
        )
    )


def build_list_item(session: Session) -> schemas.SessionListItemOut:
    return schemas.SessionListItemOut(
        id=session.id,
        status=schemas.SessionStatus(session.status),
        duration_seconds=session.duration_seconds,
        started_at=session.started_at,
        ended_at=session.ended_at,
        created_at=session.created_at,
        has_transcript=session.transcript is not None,
        overview=session.overview,
    )
