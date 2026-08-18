"""mood — domain service.

Plain `def` functions (blocking I/O) run in FastAPI's threadpool.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.domains.mood.models import MoodLog


def log_mood(user_id: str | uuid.UUID, mood: int, db: DBSession) -> MoodLog:
    """Upsert today's mood log for user_id."""
    uid = uuid.UUID(str(user_id))
    today = date.today()
    existing = db.scalar(
        select(MoodLog).where(MoodLog.user_id == uid, MoodLog.logged_date == today)
    )
    if existing is not None:
        existing.mood = mood
        existing.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return existing

    log = MoodLog(user_id=uid, mood=mood, logged_date=today)
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def get_today_mood(user_id: str | uuid.UUID, db: DBSession) -> MoodLog | None:
    """Return today's mood log for user_id, or None."""
    uid = uuid.UUID(str(user_id))
    return db.scalar(
        select(MoodLog).where(MoodLog.user_id == uid, MoodLog.logged_date == date.today())
    )
