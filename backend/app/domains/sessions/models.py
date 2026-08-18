"""sessions — SQLAlchemy ORM models.

One `Session` row per voice session. Tracks lifecycle status from `recording`
through `processing` to `ready` or `failed`, along with audio storage path,
transcript, and timing metadata.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Session(Base):
    """Voice session record — one row per session started by a user."""

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Lifecycle: recording → processing → ready | failed
    status: Mapped[str] = mapped_column(String(16), nullable=False)

    # Set after end-of-session audio upload; null while session is live.
    audio_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Set after background transcription completes; null until then.
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Reserved for future AI-generated session insights.
    overview: Mapped[str | None] = mapped_column(Text, nullable=True)

    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("ix_sessions_user_started", "user_id", "started_at"),
    )
