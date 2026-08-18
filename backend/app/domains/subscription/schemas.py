"""subscription — Pydantic request/response contracts.

Validates external input at the boundary (architecture invariant 5) and defines
the API contract the frontend TypeScript types mirror.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, computed_field, field_validator


class SubscriptionTier(str, Enum):
    FREE = "free"
    WEEKLY_1 = "weekly_1"
    WEEKLY_3 = "weekly_3"
    WEEKLY_5 = "weekly_5"


class SubscriptionStatus(str, Enum):
    ACTIVE = "active"
    CANCELLED = "cancelled"
    PAST_DUE = "past_due"


# --- Requests ---------------------------------------------------------------


class CheckoutIn(BaseModel):
    """Request body for creating a Stripe Checkout session."""

    tier: SubscriptionTier

    @field_validator("tier")
    @classmethod
    def _not_free(cls, value: SubscriptionTier) -> SubscriptionTier:
        if value == SubscriptionTier.FREE:
            raise ValueError("The free plan does not require a checkout session")
        return value


class VerifyCheckoutIn(BaseModel):
    """Request body for verifying a completed Stripe Checkout session."""

    session_id: str


# --- Responses --------------------------------------------------------------


class SubscriptionOut(BaseModel):
    """Current subscription state returned to the client."""

    model_config = ConfigDict(from_attributes=True)

    tier: str
    status: str
    sessions_used_this_week: int
    sessions_allowed_per_week: int

    @computed_field  # type: ignore[misc]
    @property
    def sessions_remaining(self) -> int:
        """Sessions still available this week (never negative)."""
        return max(0, self.sessions_allowed_per_week - self.sessions_used_this_week)


class CheckoutOut(BaseModel):
    """Stripe-hosted Checkout URL to redirect the client to."""

    checkout_url: str
