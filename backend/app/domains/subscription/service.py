"""subscription — domain service.

The only cross-domain entry point for subscription management. Handles free-tier
provisioning, Stripe Checkout session creation, webhook event processing, and the
lazy weekly quota reset used by the sessions domain.

All functions are plain `def` (blocking I/O) so FastAPI runs them in its threadpool
per `code-standards.md`. The sessions domain calls `check_and_reset_quota` and
`increment_sessions_used` through the `require_active_subscription` dependency
defined in `dependencies.py`.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import stripe
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.domains.subscription import schemas
from app.domains.subscription.models import Subscription

# Maps tier values to the number of sessions allowed per week.
TIER_WEEKLY_ALLOWANCE: dict[str, int] = {
    "free": 1,
    "weekly_1": 1,
    "weekly_3": 3,
    "weekly_5": 5,
}

# Maps Stripe subscription status strings to our internal status values.
_STRIPE_STATUS_MAP: dict[str, str] = {
    "active": "active",
    "past_due": "past_due",
    "canceled": "cancelled",   # Stripe uses one-l American spelling
    "cancelled": "cancelled",
    "unpaid": "past_due",
    "incomplete": "past_due",
    "incomplete_expired": "cancelled",
    "trialing": "active",
}


def _price_id_for_tier(tier: schemas.SubscriptionTier) -> str:
    """Return the Stripe Price ID for the given paid tier, or raise 500."""
    settings = get_settings()
    mapping: dict[schemas.SubscriptionTier, str] = {
        schemas.SubscriptionTier.WEEKLY_1: settings.stripe_price_id_weekly_1,
        schemas.SubscriptionTier.WEEKLY_3: settings.stripe_price_id_weekly_3,
        schemas.SubscriptionTier.WEEKLY_5: settings.stripe_price_id_weekly_5,
    }
    price_id = mapping.get(tier, "")
    if not price_id:
        raise AppError(
            f"No Stripe price configured for tier '{tier.value}'", status_code=500
        )
    return price_id


def get_or_create_free_subscription(db: Session, user_id: uuid.UUID) -> Subscription:
    """Idempotently fetch or create a free/active subscription row for this user."""
    sub = db.get(Subscription, user_id)
    if sub is None:
        sub = Subscription(
            user_id=user_id,
            tier="free",
            status="active",
            sessions_used_this_week=0,
            sessions_allowed_per_week=TIER_WEEKLY_ALLOWANCE["free"],
            week_reset_at=datetime.now(timezone.utc),
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)
    return sub


def get_subscription(db: Session, user_id: uuid.UUID) -> Subscription:
    """Return the subscription row, or raise 404 if none exists yet."""
    sub = db.get(Subscription, user_id)
    if sub is None:
        raise AppError("Subscription not found", status_code=404)
    return sub


def create_checkout_session(
    db: Session,
    user_id: uuid.UUID,
    tier: schemas.SubscriptionTier,
    email: str,
) -> str:
    """Create a Stripe Checkout session and return its hosted URL.

    Creates or reuses the Stripe Customer for this user, opens a Checkout page
    for the requested subscription tier, and stores the Stripe customer ID on
    the local subscription row. The `client_reference_id` and session metadata
    carry the user_id + tier so the webhook can reconcile events back to our DB.
    """
    settings = get_settings()
    price_id = _price_id_for_tier(tier)
    sub = get_or_create_free_subscription(db, user_id)

    try:
        stripe.api_key = settings.stripe_secret_key  # noqa: S105 (not a password)

        # Create a Stripe Customer the first time this user initiates checkout.
        if not sub.stripe_customer_id:
            customer = stripe.Customer.create(
                email=email,
                metadata={"user_id": str(user_id)},
            )
            sub.stripe_customer_id = customer.id
            db.commit()

        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=sub.stripe_customer_id,
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=(
                f"{settings.frontend_url}/subscription"
                "?success=true&session_id={CHECKOUT_SESSION_ID}"
            ),
            cancel_url=f"{settings.frontend_url}/subscription?cancelled=true",
            client_reference_id=str(user_id),
            # Metadata on the session and on the resulting Stripe Subscription so
            # webhook handlers can identify the tier for both event types.
            metadata={"user_id": str(user_id), "tier": tier.value},
            subscription_data={
                "metadata": {"user_id": str(user_id), "tier": tier.value}
            },
        )
    except AppError:
        raise
    except Exception as exc:  # noqa: BLE001 — normalize Stripe SDK errors
        raise AppError(f"Stripe error: {exc}", status_code=502) from exc

    if not session.url:
        raise AppError("Stripe did not return a checkout URL", status_code=502)
    return session.url


def handle_webhook(db: Session, payload: bytes, sig: str | None) -> None:
    """Verify the Stripe webhook signature and dispatch the event.

    Raises AppError(400) for missing or invalid signatures — FastAPI's exception
    handler will return the 400 status code Stripe expects on verification failure,
    triggering automatic retries only for genuine delivery issues.
    """
    if not sig:
        raise AppError("Missing Stripe-Signature header", status_code=400)

    settings = get_settings()
    stripe.api_key = settings.stripe_secret_key  # noqa: S105

    try:
        event = stripe.Webhook.construct_event(
            payload, sig, settings.stripe_webhook_secret
        )
    except Exception as exc:  # noqa: BLE001
        raise AppError("Invalid webhook payload or signature", status_code=400) from exc

    event_type: str = event["type"]
    data_obj: Any = event["data"]["object"]

    if event_type == "checkout.session.completed":
        _handle_checkout_completed(db, data_obj)
    elif event_type == "customer.subscription.updated":
        _handle_subscription_event(db, data_obj, deleted=False)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_event(db, data_obj, deleted=True)
    # Unknown event types are silently ignored — Stripe sends many event types
    # and new ones may be added without requiring a backend change.


def _handle_checkout_completed(db: Session, session: Any) -> None:
    """Activate the subscription when a Stripe Checkout session completes."""
    user_id_str: str | None = getattr(session, "client_reference_id", None)
    if not user_id_str:
        return  # Cannot reconcile without our reference; skip.
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        return

    sub = db.get(Subscription, user_id)
    if sub is None:
        return  # Should not happen; belt-and-suspenders guard.

    metadata_obj = getattr(session, "metadata", None)
    try:
        tier_value = str(metadata_obj["tier"]) if metadata_obj is not None else "free"
    except (KeyError, TypeError, AttributeError):
        tier_value = "free"
    if tier_value not in TIER_WEEKLY_ALLOWANCE:
        tier_value = "free"

    stripe_sub_raw = getattr(session, "subscription", None)
    stripe_sub_id: str | None = (
        stripe_sub_raw if isinstance(stripe_sub_raw, str) else getattr(stripe_sub_raw, "id", None)
    )
    stripe_cust_raw = getattr(session, "customer", None)
    stripe_customer_id: str | None = (
        stripe_cust_raw if isinstance(stripe_cust_raw, str) else getattr(stripe_cust_raw, "id", None)
    )

    sub.tier = tier_value
    sub.status = "active"
    sub.sessions_allowed_per_week = TIER_WEEKLY_ALLOWANCE[tier_value]
    if stripe_sub_id:
        sub.stripe_subscription_id = stripe_sub_id
    if stripe_customer_id:
        sub.stripe_customer_id = stripe_customer_id
    db.commit()


def _handle_subscription_event(
    db: Session, stripe_sub: Any, *, deleted: bool
) -> None:
    """Sync tier and status when a Stripe Subscription is updated or deleted."""
    stripe_customer_id: str | None = getattr(stripe_sub, "customer", None)
    if not stripe_customer_id:
        return

    sub = db.scalar(
        select(Subscription).where(
            Subscription.stripe_customer_id == stripe_customer_id
        )
    )
    if sub is None:
        return  # Unknown Stripe customer; skip.

    if deleted:
        sub.status = "cancelled"
    else:
        stripe_status: str = getattr(stripe_sub, "status", "active")
        sub.status = _STRIPE_STATUS_MAP.get(stripe_status, "past_due")

        metadata_obj = getattr(stripe_sub, "metadata", None)
        tier_value: str | None = (
            metadata_obj.get("tier") if metadata_obj is not None else None
        )
        if tier_value and tier_value in TIER_WEEKLY_ALLOWANCE:
            sub.tier = tier_value
            sub.sessions_allowed_per_week = TIER_WEEKLY_ALLOWANCE[tier_value]

    db.commit()


def check_and_reset_quota(db: Session, user_id: uuid.UUID) -> bool:
    """Return True when the user has an active subscription with remaining quota.

    Lazily resets `sessions_used_this_week` to 0 if more than 7 days have elapsed
    since the last reset (`week_reset_at`), updating the reset timestamp in the
    same commit. This removes the need for a background cron job.
    """
    sub = get_or_create_free_subscription(db, user_id)

    now = datetime.now(timezone.utc)
    reset_at = sub.week_reset_at
    # Treat naive datetimes as UTC (matches PostgreSQL timestamptz storage).
    if reset_at.tzinfo is None:
        reset_at = reset_at.replace(tzinfo=timezone.utc)

    if now - reset_at > timedelta(days=7):
        sub.sessions_used_this_week = 0
        sub.week_reset_at = now
        db.commit()
        db.refresh(sub)

    return (
        sub.status == "active"
        and sub.sessions_used_this_week < sub.sessions_allowed_per_week
    )


def increment_sessions_used(db: Session, user_id: uuid.UUID) -> None:
    """Increment the weekly session counter by 1.

    Raises AppError(409) if the quota is already exhausted. This function is
    defined in this slice but called only by the sessions domain after a session
    starts — it is not called anywhere in this subscription slice.
    """
    sub = get_subscription(db, user_id)
    if sub.sessions_used_this_week >= sub.sessions_allowed_per_week:
        raise AppError("Session quota exhausted for this week", status_code=409)
    sub.sessions_used_this_week += 1
    db.commit()


def verify_and_activate_checkout(
    db: Session, session_id: str, user_id: uuid.UUID
) -> Subscription:
    """Verify a Stripe Checkout Session and activate the subscription immediately.

    Called by the frontend on the success return URL so the subscription is
    updated without waiting for the webhook. Idempotent — safe to call even
    after the webhook has already processed the same event.

    Raises AppError(400) if the session cannot be retrieved or payment is
    incomplete, and AppError(403) if the session belongs to a different user.
    """
    settings = get_settings()
    stripe.api_key = settings.stripe_secret_key  # noqa: S105

    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except Exception as exc:  # noqa: BLE001
        raise AppError("Could not retrieve checkout session from Stripe", status_code=400) from exc

    if str(getattr(session, "client_reference_id", None)) != str(user_id):
        raise AppError("Checkout session does not belong to this user", status_code=403)

    payment_status = getattr(session, "payment_status", "")
    if payment_status not in ("paid", "no_payment_required"):
        raise AppError("Payment not completed", status_code=400)

    sub = get_or_create_free_subscription(db, user_id)

    metadata_obj = getattr(session, "metadata", None)
    try:
        tier_value = str(metadata_obj["tier"]) if metadata_obj is not None else "free"
    except (KeyError, TypeError, AttributeError):
        tier_value = "free"
    if tier_value not in TIER_WEEKLY_ALLOWANCE:
        tier_value = "free"

    stripe_sub_raw = getattr(session, "subscription", None)
    stripe_sub_id: str | None = (
        stripe_sub_raw if isinstance(stripe_sub_raw, str) else getattr(stripe_sub_raw, "id", None)
    )
    stripe_cust_raw = getattr(session, "customer", None)
    stripe_customer_id: str | None = (
        stripe_cust_raw if isinstance(stripe_cust_raw, str) else getattr(stripe_cust_raw, "id", None)
    )

    sub.tier = tier_value
    sub.status = "active"
    sub.sessions_allowed_per_week = TIER_WEEKLY_ALLOWANCE[tier_value]
    if stripe_sub_id:
        sub.stripe_subscription_id = stripe_sub_id
    if stripe_customer_id:
        sub.stripe_customer_id = stripe_customer_id

    db.commit()
    db.refresh(sub)
    return sub
