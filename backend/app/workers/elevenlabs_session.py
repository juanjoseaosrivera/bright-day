"""ElevenLabs session worker — reconcile a finished agent conversation.

In ElevenLabs mode the browser talks to the agent directly, so the backend never
sees the audio stream. This task is how a session row catches up: it polls the
conversation until ElevenLabs has finished processing it, then persists the
transcript, archives the recording to object storage, and charges quota.

Runs as an asyncio background task (via `asyncio.create_task`) and opens its own
DB sessions — never shares the request's (architecture invariant: background work
uses a separate context with no shared DB state). Each phase opens and releases a
short-lived session rather than holding one across the poll, which can run for the
length of a whole conversation.

Unlike the Whisper and LLM workers, this one needs no `set_*` client injection:
the ElevenLabs adapter is stateless and reads credentials from `get_settings()`.
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from sqlalchemy import select

from app.ai.agents import elevenlabs as elevenlabs_agent
from app.ai.agents.schemas import ConversationDetail, ConversationTranscriptTurn
from app.db.session import SessionLocal
from app.domains.sessions import service as session_service
from app.domains.subscription import service as subscription_service
from app.storage import audio as audio_storage
from app.workers import overviews

logger = logging.getLogger(__name__)

# Speaker labels match the frontend's live transcript so the stored transcript and
# the in-session one read identically.
_SPEAKER_LABELS = {"user": "You", "agent": "Bright Day"}

# Poll backoff, in seconds. ElevenLabs needs a moment after a call ends before the
# conversation reaches "done", and when this task is armed as the abandonment
# safety net the conversation may still be in progress for the whole session.
_POLL_INTERVAL_START = 2.0
_POLL_INTERVAL_MAX = 30.0
_DEFAULT_MAX_WAIT_SECONDS = 2 * 60 * 60.0  # covers a long session plus processing

# A conversation still sitting at "initiated" past the signed URL's 15-minute
# validity window will never start — the signature it needs has expired. Give up
# then instead of holding the row open for the full wait.
_INITIATION_GRACE_SECONDS = 15 * 60.0


# ---------------------------------------------------------------------------
# Blocking DB helpers — each opens and closes its own short-lived session.
# Called from the async task via asyncio.to_thread.
# ---------------------------------------------------------------------------


def _load_pending(session_id: uuid.UUID) -> tuple[str, uuid.UUID] | None:
    """Return (conversation_id, user_id) if this session still needs reconciling."""
    from app.domains.sessions.models import Session as SessionModel

    db = SessionLocal()
    try:
        session = db.scalar(select(SessionModel).where(SessionModel.id == session_id))
        if session is None:
            logger.warning("reconcile_session_task: session %s not found", session_id)
            return None
        if session.status in ("ready", "failed"):
            # Already reconciled by another trigger. Nothing to do — and crucially
            # no second quota charge.
            return None
        if not session.provider_conversation_id:
            logger.warning("reconcile_session_task: session %s has no conversation id", session_id)
            return None
        return session.provider_conversation_id, session.user_id
    finally:
        db.close()


def _mark_failed(session_id: uuid.UUID) -> None:
    db = SessionLocal()
    try:
        session_service.fail_transcription(session_id, db)
    finally:
        db.close()


def _complete(
    session_id: uuid.UUID,
    transcript: str,
    duration_seconds: int | None,
    audio_path: str | None,
) -> bool:
    db = SessionLocal()
    try:
        return session_service.complete_elevenlabs_session(
            session_id, transcript, duration_seconds, audio_path, db
        )
    finally:
        db.close()


def _charge_quota(user_id: uuid.UUID) -> None:
    db = SessionLocal()
    try:
        subscription_service.increment_sessions_used(db, user_id)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Task
# ---------------------------------------------------------------------------


def _format_transcript(turns: list[ConversationTranscriptTurn]) -> str:
    """Render the conversation as a two-sided plain-text transcript.

    The session detail page renders `transcript` with `whitespace-pre-wrap`, so
    blank-line-separated "Speaker: text" needs no frontend work.
    """
    lines: list[str] = []
    for turn in turns:
        text = (turn.message or "").strip()
        if not text:
            continue
        label = _SPEAKER_LABELS.get(turn.role, turn.role.capitalize())
        lines.append(f"{label}: {text}")
    return "\n\n".join(lines)


async def _poll_until_finished(
    conversation_id: str, max_wait_seconds: float
) -> ConversationDetail | None:
    """Poll the conversation until it is done or failed.

    Returns the finished conversation, or None if it failed or the wait ran out.
    An unrecognized status counts as "still running", so an unexpected value times
    out rather than being mistaken for success.
    """
    waited = 0.0
    interval = _POLL_INTERVAL_START

    while waited < max_wait_seconds:
        detail = await asyncio.to_thread(elevenlabs_agent.get_conversation, conversation_id)
        if detail.is_done:
            return detail
        if detail.is_failed:
            logger.warning(
                "ElevenLabs conversation %s reported status %r", conversation_id, detail.status
            )
            return None
        if detail.is_never_started and waited >= _INITIATION_GRACE_SECONDS:
            logger.warning(
                "ElevenLabs conversation %s never started (signed URL expired) — "
                "abandoning after %.0fs",
                conversation_id,
                waited,
            )
            return None

        await asyncio.sleep(interval)
        waited += interval
        interval = min(interval * 1.5, _POLL_INTERVAL_MAX)

    logger.warning(
        "Timed out after %.0fs waiting for ElevenLabs conversation %s to finish",
        max_wait_seconds,
        conversation_id,
    )
    return None


async def _archive_audio(
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    conversation_id: str,
    supabase_client,
) -> str | None:
    """Download the conversation recording and upload it to object storage.

    Returns the storage path, or None if the recording could not be archived. A
    missing recording is not fatal: the transcript is the valuable artifact, and
    audio saving may simply be disabled on the agent.
    """
    try:
        audio_bytes, content_type = await asyncio.to_thread(
            elevenlabs_agent.get_conversation_audio, conversation_id
        )
        if not audio_bytes:
            logger.warning("ElevenLabs returned empty audio for conversation %s", conversation_id)
            return None

        extension = audio_storage.extension_for_content_type(content_type)
        return await asyncio.to_thread(
            audio_storage.upload_audio,
            user_id,
            session_id,
            audio_bytes,
            supabase_client,
            extension=extension,
            content_type=content_type or f"audio/{extension}",
        )
    except Exception:
        logger.exception(
            "Could not archive audio for session %s (conversation %s) — "
            "continuing with transcript only",
            session_id,
            conversation_id,
        )
        return None


async def reconcile_session_task(
    session_id: uuid.UUID,
    supabase_client,
    initial_delay_seconds: float = 0.0,
    max_wait_seconds: float = _DEFAULT_MAX_WAIT_SECONDS,
) -> None:
    """Wait for an ElevenLabs conversation to finish, then complete the session row.

    On success: transcript persisted, audio archived, status → "ready", quota
    charged exactly once. On failure or timeout: status → "failed", no quota.
    Exceptions are logged, not propagated.
    """
    try:
        if initial_delay_seconds > 0:
            await asyncio.sleep(initial_delay_seconds)

        pending = await asyncio.to_thread(_load_pending, session_id)
        if pending is None:
            return
        conversation_id, user_id = pending

        detail = await _poll_until_finished(conversation_id, max_wait_seconds)
        if detail is None:
            await asyncio.to_thread(_mark_failed, session_id)
            return

        transcript = _format_transcript(detail.transcript)

        if detail.has_audio:
            audio_path = await _archive_audio(
                user_id, session_id, conversation_id, supabase_client
            )
        else:
            audio_path = None
            logger.warning(
                "ElevenLabs conversation %s has no saved audio — check the agent's "
                "Privacy settings (audio saving must be enabled).",
                conversation_id,
            )

        won = await asyncio.to_thread(
            _complete, session_id, transcript, detail.duration_seconds, audio_path
        )
        if not won:
            # Another trigger finished this row first; it charged the quota.
            logger.info("Session %s was already completed elsewhere", session_id)
            return

        logger.info(
            "Reconciled ElevenLabs session %s (conversation %s)", session_id, conversation_id
        )

        # Charge quota only after the transcript is persisted — the same
        # "nothing produced, nothing charged" rule as the local path, anchored on
        # the transcript because the audio download can fail independently.
        try:
            await asyncio.to_thread(_charge_quota, user_id)
        except Exception:
            logger.exception("Failed to increment session quota for %s", user_id)

        asyncio.create_task(overviews.generate_overview_task(session_id, str(user_id)))

    except Exception:
        logger.exception("ElevenLabs reconcile failed for session %s", session_id)
        try:
            await asyncio.to_thread(_mark_failed, session_id)
        except Exception:
            logger.exception("fail_transcription also failed for session %s", session_id)
