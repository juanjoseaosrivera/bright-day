"""mood — SQLAlchemy ORM model."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class MoodLog(Base):
    __tablename__ = "mood_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.user_id", ondelete="CASCADE"), nullable=False
    )
    mood: Mapped[int] = mapped_column(Integer, nullable=False)
    logged_date: Mapped[date] = mapped_column(
        Date, nullable=False, server_default="CURRENT_DATE"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()", onupdate=datetime.utcnow
    )

    __table_args__ = (
        UniqueConstraint("user_id", "logged_date"),
        Index("ix_mood_logs_user_id", "user_id"),
    )
