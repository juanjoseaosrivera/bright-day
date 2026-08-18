"""subscription — HTTP endpoints under `/api/v1/subscriptions`.

Three routes:
  GET  /me        — returns the current subscription (auto-provisions free tier).
  POST /checkout  — creates a Stripe Checkout session (protected, paid tiers only).
  POST /webhook   — receives Stripe billing events (public, signature-verified).

The webhook handler is `async def` so it can `await request.body()` to capture
the raw bytes required for Stripe's signature verification. The blocking service
call is offloaded to a thread via `run_in_threadpool`, keeping the async handler
non-blocking.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.db.session import get_db
from app.domains.auth.dependencies import CurrentUser
from app.domains.subscription import schemas, service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("/me", response_model=schemas.SubscriptionOut)
def get_my_subscription(current_user: CurrentUser, db: DbSession) -> schemas.SubscriptionOut:
    """Return the current user's subscription, provisioning a free row if needed."""
    sub = service.get_or_create_free_subscription(db, current_user.user_id)
    return schemas.SubscriptionOut.model_validate(sub)


@router.post(
    "/checkout",
    response_model=schemas.CheckoutOut,
    status_code=status.HTTP_200_OK,
)
def create_checkout(
    payload: schemas.CheckoutIn,
    current_user: CurrentUser,
    db: DbSession,
) -> schemas.CheckoutOut:
    """Create a Stripe Checkout session for the requested paid tier."""
    url = service.create_checkout_session(
        db, current_user.user_id, payload.tier, current_user.email
    )
    return schemas.CheckoutOut(checkout_url=url)


@router.post(
    "/checkout/verify",
    response_model=schemas.SubscriptionOut,
    status_code=status.HTTP_200_OK,
)
def verify_checkout(
    payload: schemas.VerifyCheckoutIn,
    current_user: CurrentUser,
    db: DbSession,
) -> schemas.SubscriptionOut:
    """Verify a completed Stripe Checkout session and activate the subscription.

    The frontend calls this on the success return URL before the webhook may
    have arrived, passing the `session_id` Stripe appended to the URL. Safe to
    call multiple times (idempotent with the webhook handler).
    """
    sub = service.verify_and_activate_checkout(db, payload.session_id, current_user.user_id)
    return schemas.SubscriptionOut.model_validate(sub)


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request, db: DbSession) -> dict[str, bool]:
    """Receive and process Stripe billing events.

    Public endpoint (no JWT). Stripe's signature is verified inside
    `service.handle_webhook` — any failure returns 400, causing Stripe to retry.
    The blocking service call runs in a thread via `run_in_threadpool` so the
    event loop is not blocked.
    """
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    await run_in_threadpool(service.handle_webhook, db, payload, sig)
    return {"received": True}
