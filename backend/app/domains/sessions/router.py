"""sessions — HTTP and WebSocket router.

HTTP routes: POST /, GET /, GET /{session_id}
WebSocket:   WS /ws/{session_id}

Architecture carve-out (recorded in architecture.md): the WebSocket endpoint
reads the JWT from `?token=` because browser WebSocket() constructors do not
support custom headers. This is the only route where a credential appears in
the URL query string.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request, WebSocket, WebSocketDisconnect

from app.core.exceptions import AppError
from app.core.security import InvalidTokenError, verify_supabase_jwt
from app.db.session import SessionLocal, get_db
from app.domains.auth.dependencies import CurrentUser
from app.domains.sessions import schemas
from app.domains.sessions import service as session_service
from app.domains.subscription.dependencies import RequireActiveSubscription
from app.domains.subscription import service as subscription_service
from app.storage import audio as audio_storage
from app.workers import transcription as transcription_worker
from sqlalchemy.orm import Session as DBSession

router = APIRouter()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# HTTP routes
# ---------------------------------------------------------------------------


@router.post("/", response_model=schemas.StartSessionOut, status_code=201)
def start_session(
    request: Request,
    current_user: CurrentUser,
    _sub: RequireActiveSubscription,
    db: DBSession = Depends(get_db),
) -> schemas.StartSessionOut:
    session = session_service.start_session(current_user.user_id, db)
    auth_header = request.headers.get("Authorization", "")
    ws_token = auth_header.removeprefix("Bearer ").strip()
    return schemas.StartSessionOut(id=session.id, ws_token=ws_token)


@router.get("/", response_model=list[schemas.SessionListItemOut])
def list_sessions(
    current_user: CurrentUser,
    db: DBSession = Depends(get_db),
) -> list[schemas.SessionListItemOut]:
    sessions = session_service.list_sessions(current_user.user_id, db)
    return [session_service.build_list_item(s) for s in sessions]


@router.get("/{session_id}", response_model=schemas.SessionOut)
def get_session(
    session_id: uuid.UUID,
    request: Request,
    current_user: CurrentUser,
    db: DBSession = Depends(get_db),
) -> schemas.SessionOut:
    session = session_service.get_session(session_id, current_user.user_id, db)

    audio_url: str | None = None
    if session.audio_path:
        audio_url = audio_storage.get_signed_url(
            session.audio_path, request.app.state.supabase_storage
        )

    return schemas.SessionOut(
        id=session.id,
        status=schemas.SessionStatus(session.status),
        transcript=session.transcript,
        overview=session.overview,
        audio_url=audio_url,
        duration_seconds=session.duration_seconds,
        started_at=session.started_at,
        ended_at=session.ended_at,
        created_at=session.created_at,
    )


# ---------------------------------------------------------------------------
# WebSocket — live voice session loop
# ---------------------------------------------------------------------------


@router.websocket("/ws/{session_id}")
async def session_ws(
    ws: WebSocket,
    session_id: uuid.UUID,
    token: str = Query(...),
) -> None:
    await ws.accept()
    app_state = ws.app.state  # type: ignore[attr-defined]

    # 1. Authenticate via JWT query param
    try:
        claims = await asyncio.to_thread(verify_supabase_jwt, token)
        user_id = uuid.UUID(claims["sub"])
    except (InvalidTokenError, AppError, Exception) as exc:
        logger.warning("WS auth failed for session %s: %s", session_id, exc)
        await ws.close(code=4001)
        return

    # 2. Verify session ownership and status
    db = SessionLocal()
    try:
        from sqlalchemy import select
        from app.domains.sessions.models import Session as SessionModel
        from app.domains.auth.models import Profile

        session_row = db.scalar(
            select(SessionModel).where(
                SessionModel.id == session_id,
                SessionModel.user_id == user_id,
            )
        )
        if session_row is None:
            logger.warning(
                "WS session %s not found for user %s", session_id, user_id
            )
            await ws.close(code=4003)
            return
        if session_row.status != "recording":
            logger.warning(
                "WS session %s wrong status %r (need 'recording')",
                session_id,
                session_row.status,
            )
            await ws.close(code=4004)
            return

        profile = db.get(Profile, user_id)
        display_name = (
            (profile.display_name or profile.email) if profile else "there"
        )
    finally:
        db.close()

    # 3. Signal ready to client
    await ws.send_text('{"type":"ready"}')

    # 4. Voice loop
    audio_chunks: list[bytes] = []      # full-session recording (all chunks)
    utterance_chunks: list[bytes] = []  # current utterance only — reset after each turn
    # The browser records one continuous WebM stream, so the EBML/WebM container
    # header only ever arrives in the very first chunk. We keep it here to prepend
    # to later utterances, which would otherwise be undecodable header-less fragments.
    header_bytes: bytes | None = None
    first_utterance = True
    history: list[dict] = []
    session_start = datetime.now(timezone.utc)

    from app.ai import graph as ai_graph

    try:
        while True:
            message = await ws.receive()

            if message.get("bytes"):
                chunk = message["bytes"]
                if header_bytes is None:
                    header_bytes = chunk  # first chunk carries the WebM container header
                audio_chunks.append(chunk)
                utterance_chunks.append(chunk)

            elif message.get("text"):
                data = json.loads(message["text"])
                msg_type = data.get("type")

                if msg_type == "end_utterance":
                    if not utterance_chunks:
                        await ws.send_text(json.dumps({"type": "turn_complete"}))
                        continue
                    if first_utterance:
                        # Already contains the container header (it's the first chunk).
                        utterance_audio = b"".join(utterance_chunks)
                        first_utterance = False
                    else:
                        # Later utterances are header-less fragments — prepend the header
                        # so each is an independently decodable WebM stream.
                        utterance_audio = (header_bytes or b"") + b"".join(utterance_chunks)
                    utterance_chunks = []
                    try:
                        result = await ai_graph.run_turn(
                            user_audio=utterance_audio,
                            history=history,
                            app_state=app_state,
                            display_name=display_name,
                        )
                    except Exception:
                        logger.exception("AI turn error for session %s", session_id)
                        await ws.send_text(
                            json.dumps({
                                "type": "ai_text",
                                "text": "I'm sorry, I couldn't process that. Please try again.",
                            })
                        )
                        await ws.send_text(json.dumps({"type": "turn_complete"}))
                        continue

                    await ws.send_text(
                        json.dumps({"type": "ai_text", "text": result.get("ai_text", "")})
                    )
                    if result.get("ai_audio") is not None:
                        await ws.send_bytes(result["ai_audio"])

                    history = result.get("history", history)
                    await ws.send_text(json.dumps({"type": "turn_complete"}))

                elif msg_type == "end_session":
                    break

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket error for session %s", session_id)

    # 5. Empty session — the user never spoke (e.g. an extension blocked recording).
    #    Don't upload 0 bytes, don't run a doomed transcription, don't charge quota.
    if not audio_chunks:
        db_empty = SessionLocal()
        try:
            session_service.fail_transcription(session_id, db_empty)
        except Exception:
            logger.exception("Failed to mark empty session %s failed", session_id)
        finally:
            db_empty.close()
    else:
        # 6. End session — upload audio to storage and mark it processing.
        full_audio = b"".join(audio_chunks)
        duration_seconds = int((datetime.now(timezone.utc) - session_start).total_seconds())
        supabase_client = app_state.supabase_storage

        end_ok = False
        db2 = SessionLocal()
        try:
            await asyncio.to_thread(
                session_service.end_session,
                session_id,
                user_id,
                full_audio,
                duration_seconds,
                supabase_client,
                db2,
            )
            end_ok = True
        except Exception:
            logger.exception("end_session failed for %s", session_id)
            # Don't leave the row stuck in 'recording' — mark it failed so the UI
            # shows a clear state instead of a perpetually-recording session.
            try:
                session_service.fail_transcription(session_id, db2)
            except Exception:
                logger.exception("Failed to mark session %s failed", session_id)
        finally:
            db2.close()

        # 7. Only charge quota and transcribe once the audio is actually stored.
        if end_ok:
            db_quota = SessionLocal()
            try:
                await asyncio.to_thread(
                    subscription_service.increment_sessions_used, db_quota, user_id
                )
            except Exception:
                logger.exception("Failed to increment session quota for %s", user_id)
            finally:
                db_quota.close()

            asyncio.create_task(
                transcription_worker.transcribe_session_task(
                    session_id=session_id,
                    supabase_client=supabase_client,
                )
            )

    # 7. Confirm and close
    try:
        await ws.send_text(
            json.dumps({"type": "session_ended", "session_id": str(session_id)})
        )
        await ws.close()
    except Exception:
        logger.debug("WS final send/close failed for session %s", session_id, exc_info=True)
