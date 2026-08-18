"""Behavioral pattern detection worker.

Runs as an asyncio background task after a diary entry is created or updated.
Opens its own DB session — never shares the HTTP request's DB session.

The LLM client reference is set at startup via set_llm_client called from lifespan.py.
"""

from __future__ import annotations

import asyncio
import json
import logging

from app.ai.prompts.therapy import PATTERN_DETECTION_PROMPT_V1
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

_llm_client = None


def set_llm_client(client) -> None:
    global _llm_client
    _llm_client = client


async def detect_patterns_task(user_id: str) -> None:
    """Detect top-3 behavioral patterns from user's diary entries and persist them."""
    db = SessionLocal()
    try:
        from app.domains.diary import service as diary_service
        from app.domains.insights import service as insights_service
        from app.core.config import get_settings

        entries = diary_service.list_entries(user_id, db)
        if len(entries) < 3:
            return

        formatted = "\n\n---\n\n".join(e.content for e in entries)
        settings = get_settings()
        prompt = PATTERN_DETECTION_PROMPT_V1.format(entries=formatted, count=3)

        response = await asyncio.to_thread(
            lambda: _llm_client.chat.completions.create(
                model=settings.ollama_model,
                messages=[{"role": "user", "content": prompt}],
            )
        )

        raw = response.choices[0].message.content or ""
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("detect_patterns_task: failed to parse LLM response as JSON: %s", raw)
            return

        if not isinstance(parsed, list):
            logger.warning("detect_patterns_task: LLM response is not a list: %s", parsed)
            return

        patterns = [str(p) for p in parsed if str(p).strip()][:3]
        if not patterns:
            return

        insights_service.replace_patterns(user_id, patterns, db)
        logger.info("detect_patterns_task: persisted %d patterns for user %s", len(patterns), user_id)

    except Exception:
        logger.exception("detect_patterns_task failed for user %s", user_id)
    finally:
        db.close()
