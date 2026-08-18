"""diary — domain service.

All functions are plain `def` (blocking I/O) so FastAPI runs them in its
threadpool. Ownership is enforced on every fetch — a mismatched user_id
returns AppError(404) to prevent information leakage via 403.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.exceptions import AppError
from app.domains.diary.models import DiaryEntry


def create_entry(
    user_id: uuid.UUID,
    title: str | None,
    content: str,
    db: DBSession,
) -> DiaryEntry:
    entry = DiaryEntry(user_id=user_id, title=title, content=content)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_entries(user_id: uuid.UUID, db: DBSession) -> list[DiaryEntry]:
    return list(
        db.scalars(
            select(DiaryEntry)
            .where(DiaryEntry.user_id == user_id)
            .order_by(DiaryEntry.created_at.desc())
        )
    )


def get_entry(entry_id: uuid.UUID, user_id: uuid.UUID, db: DBSession) -> DiaryEntry:
    entry = db.scalar(
        select(DiaryEntry).where(DiaryEntry.id == entry_id, DiaryEntry.user_id == user_id)
    )
    if entry is None:
        raise AppError("Diary entry not found", status_code=404)
    return entry


def update_entry(
    entry_id: uuid.UUID,
    user_id: uuid.UUID,
    title: str | None,
    content: str,
    db: DBSession,
) -> DiaryEntry:
    entry = get_entry(entry_id, user_id, db)
    entry.title = title
    entry.content = content
    db.commit()
    db.refresh(entry)
    return entry


def delete_entry(entry_id: uuid.UUID, user_id: uuid.UUID, db: DBSession) -> None:
    entry = get_entry(entry_id, user_id, db)
    db.delete(entry)
    db.commit()
