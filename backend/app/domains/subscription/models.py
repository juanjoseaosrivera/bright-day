"""subscription — SQLAlchemy ORM models.

One `Subscription` row per user, keyed by the same `user_id` used in `profiles`.
Stores the active plan tier, billing status, Stripe identifiers, and the rolling
weekly session counter. The weekly counter is reset lazily by the service layer
rather than on a cron schedule, so no background job is required.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Subscription(Base):
    """Subscription record — one row per user."""

    __tablename__ = "subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.user_id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )

    # Plan tier stored as a plain string (validated by the Pydantic layer).
    # Values: "free" | "weekly_1" | "weekly_3" | "weekly_5"
    tier: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="free"
    )

    # Billing status: "active" | "cancelled" | "past_due"
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="active"
    )

    # Stripe identifiers — null for free-tier users until checkout is completed.
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Weekly quota tracking. Denormalised from tier for O(1) quota reads.
    # The service layer owns the mapping of tier → sessions_allowed_per_week.
    sessions_used_this_week: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    sessions_allowed_per_week: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="1"
    )

    # Timestamp of the last weekly counter reset (set to now() on row creation).
    week_reset_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
