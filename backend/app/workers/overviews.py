"""Session overview generation worker.

Runs as an asyncio background task after transcription completes.
Opens its own DB session — never shares the transcription worker's DB session.

The LLM client reference is set at startup via set_llm_client called from lifespan.py.
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from app.ai.prompts.therapy import SESSION_OVERVIEW_PROMPT_V1
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

_llm_client = None


def set_llm_client(client) -> None:
    global _llm_client
    _llm_client = client


async def generate_overview_task(session_id: uuid.UUID, user_id: str) -> None:
    """Generate and persist a brief AI overview of the session transcript."""
    db = SessionLocal()
    try:
        from app.domains.sessions import service as session_service
        from app.core.config import get_settings

        session = session_service.get_session(session_id, uuid.UUID(user_id), db)
        if session.transcript is None:
            return

        settings = get_settings()
        prompt = SESSION_OVERVIEW_PROMPT_V1.format(transcript=session.transcript)

        response = await asyncio.to_thread(
            lambda: _llm_client.chat.completions.create(
                model=settings.ollama_model,
                messages=[{"role": "user", "content": prompt}],
            )
        )

        overview = (response.choices[0].message.content or "").strip()
        session.overview = overview
        db.commit()
        logger.info("generate_overview_task: overview saved for session %s", session_id)

    except Exception:
        logger.exception("generate_overview_task failed for session %s", session_id)
    finally:
        db.close()
