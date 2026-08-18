"""insights — domain service.

Plain `def` functions (blocking I/O) run in FastAPI's threadpool.
"""

from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session as DBSession

from app.domains.insights.models import BehavioralPattern


def get_patterns(user_id: str | uuid.UUID, db: DBSession) -> list[BehavioralPattern]:
    """Return all patterns for user_id ordered by rank ascending."""
    return list(
        db.scalars(
            select(BehavioralPattern)
            .where(BehavioralPattern.user_id == uuid.UUID(str(user_id)))
            .order_by(BehavioralPattern.rank.asc())
        )
    )


def replace_patterns(user_id: str | uuid.UUID, patterns: list[str], db: DBSession) -> None:
    """Atomically replace all patterns for user_id with the new list.

    The delete + insert runs in a single transaction to prevent a race where
    the dashboard reads zero patterns between the two operations.
    """
    uid = uuid.UUID(str(user_id))
    db.execute(delete(BehavioralPattern).where(BehavioralPattern.user_id == uid))
    for idx, text in enumerate(patterns):
        db.add(BehavioralPattern(user_id=uid, pattern_text=text, rank=idx + 1))
    db.commit()
