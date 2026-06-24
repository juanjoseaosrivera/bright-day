"""auth — SQLAlchemy ORM models.

Every row is owned by exactly one user (`user_id`, the Supabase auth user id).
The profile is the system-of-record user record; onboarding answers are a 1:1
satellite created when the user finishes onboarding. There is deliberately no
foreign key into Supabase's `auth.users` table (a different schema this app
does not own); `profiles.user_id` simply equals the auth user id.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Profile(Base):
    """User profile — one row per Supabase auth user."""

    __tablename__ = "profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    display_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    onboarding: Mapped[OnboardingResponse | None] = relationship(
        back_populates="profile",
        uselist=False,
        cascade="all, delete-orphan",
    )


class OnboardingResponse(Base):
    """Answers to the onboarding questionnaire — 1:1 with a profile."""

    __tablename__ = "onboarding_responses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.user_id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    primary_focus: Mapped[str] = mapped_column(String(32), nullable=False)
    focus_areas: Mapped[list[str]] = mapped_column(ARRAY(String(32)), nullable=False)
    current_stress: Mapped[int] = mapped_column(Integer, nullable=False)
    checkin_frequency: Mapped[str] = mapped_column(String(32), nullable=False)
    used_wellbeing_tools_before: Mapped[bool] = mapped_column(Boolean, nullable=False)
    goals_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    acknowledged_not_medical: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    profile: Mapped[Profile] = relationship(back_populates="onboarding")
