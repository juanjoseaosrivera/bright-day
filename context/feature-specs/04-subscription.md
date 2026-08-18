Read `CLAUDE.md` before starting.

We're building the second domain slice: `subscription`, as a thin
front-to-back vertical slice. Subscriptions gate access to voice
sessions — a user must have an active, valid subscription with
remaining weekly quota before a session can start. Payment processing
runs through **Stripe Checkout** (hosted page); the backend records
subscription state and enforces quota server-side.

Work back-to-front, one slice at a time. Do not wire voice session
logic here — that belongs in the next domain slice.

## Architecture Decision to Confirm

**Payment processor: Stripe.** Subscription creation and billing
events flow through Stripe Checkout and webhooks. The backend stores
subscription state locally and updates it on Stripe webhook events.
Confirm this before implementing; record the decision in
`architecture.md` and add `stripe_secret_key`,
`stripe_webhook_secret`, and the three Stripe Price IDs to
`.env.example`.

## Backend — `app/domains/subscription/`

Build the domain package per `architecture.md`:

- `models.py` — `Subscription` ORM model, one row per user:
  - `user_id` (UUID, PK, FK → `profiles.user_id`)
  - `tier` (enum: `free` | `weekly_1` | `weekly_3` | `weekly_5`)
  - `status` (enum: `active` | `cancelled` | `past_due`)
  - `stripe_customer_id`, `stripe_subscription_id` (String, nullable — null
    for free tier)
  - `sessions_used_this_week` (Integer, default 0)
  - `sessions_allowed_per_week` (Integer — denormalized from tier for fast
    quota reads; `free`=1, `weekly_1`=1, `weekly_3`=3, `weekly_5`=5)
  - `week_reset_at` (DateTime with timezone — timestamp of the last weekly
    counter reset; set to `now()` on row creation)
  - `created_at`, `updated_at` timestamps

- `schemas.py` — Pydantic contracts:
  - `SubscriptionOut` — `tier`, `status`, `sessions_used_this_week`,
    `sessions_allowed_per_week`, `sessions_remaining` (computed property)
  - `CheckoutIn` — `tier` (must be one of the three paid tiers; free is not
    a valid checkout target)
  - `CheckoutOut` — `checkout_url` (Stripe-hosted checkout URL)

- `service.py` — domain logic (plain `def`, blocking I/O in FastAPI
  threadpool per `code-standards.md`):
  - `get_or_create_free_subscription(user_id, db)` — idempotently provisions
    a `free`/`active` row on first call; returns the `Subscription` row.
    Called from the auth `GET /me` handler so every registered user has a
    subscription record.
  - `get_subscription(user_id, db)` → `Subscription` — fetches the row,
    raises `AppError(404)` if not found.
  - `create_checkout_session(user_id, tier, db)` → `str` — upserts a Stripe
    Customer for the user if one does not exist, creates a Stripe Checkout
    Session for the correct Price ID, stores `stripe_customer_id` on the
    subscription row, returns the Checkout URL. `success_url` and
    `cancel_url` point to the frontend `/subscription` page with
    `?success=true` / `?cancelled=true` query params.
  - `handle_webhook(payload: bytes, stripe_signature: str, db)` — verifies
    the Stripe webhook signature (`stripe.Webhook.construct_event`); raises
    `AppError(400)` if invalid. Handles:
    - `checkout.session.completed` → activate subscription, set tier and
      `stripe_subscription_id`
    - `customer.subscription.updated` → sync `tier` and `status`
    - `customer.subscription.deleted` → set `status = cancelled`
  - `check_and_reset_quota(user_id, db)` → `bool` — lazily resets
    `sessions_used_this_week` to 0 if `week_reset_at` is more than 7 days
    ago (updating `week_reset_at` to now), then returns
    `sessions_used_this_week < sessions_allowed_per_week` and `status ==
    active`. Used by the sessions domain.
  - `increment_sessions_used(user_id, db)` — increments
    `sessions_used_this_week` by 1; called by the sessions domain after a
    session starts. Raises `AppError(409)` if quota is already exhausted.

- `router.py` — HTTP endpoints under `/api/v1/subscriptions`:
  - `GET /me` (protected) → `SubscriptionOut` — returns current subscription;
    auto-provisions the free tier if no row exists yet.
  - `POST /checkout` (protected) — body: `CheckoutIn` → `CheckoutOut` —
    creates a Stripe Checkout session and returns the URL.
  - `POST /webhook` (public, no JWT) — raw request body + `Stripe-Signature`
    header; calls `handle_webhook`; always returns `200` on success (Stripe
    retries on non-2xx).

- `dependencies.py` — `require_active_subscription`: calls
  `check_and_reset_quota` for the current user; raises `HTTP 403` with a
  clear message if quota is zero or subscription is not active. Exported for
  use in the sessions domain router (not wired there in this slice — just
  define and export it here).

- Add an Alembic revision `0002_create_subscriptions_table` for the
  `subscriptions` table. Do not edit the applied `0001` revision.

- Add `stripe` to `pyproject.toml` deps; run `uv sync`.

- Extend `core/config.py` with:
  - `stripe_secret_key: str`
  - `stripe_webhook_secret: str`
  - `stripe_price_id_weekly_1: str`
  - `stripe_price_id_weekly_3: str`
  - `stripe_price_id_weekly_5: str`

## Frontend — `features/subscription/`

Compose the existing `shared/ui` primitives (do not modify
`shared/ui/*`):

- `core/api/subscription.api.ts` — typed HTTP calls following the same
  pattern as `core/api/auth.api.ts`:
  - `getMySubscription()` → `Observable<SubscriptionOut>`
  - `createCheckoutSession(tier: SubscriptionTier)` → `Observable<CheckoutOut>`

- `core/services/subscription-state.service.ts` — signal-based singleton
  (parallel to `auth-state.service.ts`):
  - `subscription` signal (nullable `SubscriptionOut`)
  - `hasActiveSubscription` computed — `status === 'active'`
  - `sessionsRemaining` computed — `sessions_allowed_per_week - sessions_used_this_week`
  - `load()` — fetches `GET /me`, sets `subscription` signal; call this from
    the subscription page on init and after a successful Stripe return.
  - `clear()` — resets to null (called on logout alongside auth state clear).

- `core/guards/subscription.guard.ts` — `CanActivateFn` that reads
  `SubscriptionStateService.hasActiveSubscription()`; if false, redirects to
  `/subscription`. Wire it in `app.config.ts` and export it for use in the
  sessions route (not applied to sessions in this slice — just define and
  export it here).

- `features/subscription/pages/subscription.page.ts` — plan-selection page:
  - On init: calls `SubscriptionStateService.load()`.
  - Displays four plan cards (Free, 1 session/week, 3 sessions/week, 5
    sessions/week) using the Card primitives. Mark the active plan visually.
  - Clicking a paid plan calls `createCheckoutSession(tier)`, then performs a
    `window.location.href` redirect to the returned `checkout_url`.
  - On mount, reads `ActivatedRoute` query params:
    - `?success=true` → call `load()` to refresh state, show a success toast
      via `ToastService`.
    - `?cancelled=true` → show a cancelled toast; stay on the page.
  - Free plan card is informational only (no checkout action); show a "Your
    current plan" badge if the user is on free.
  - Show `sessionsRemaining()` on the active plan card.

- Add route `/subscription` (lazy-loaded, protected by `authGuard`) to
  `app.routes.ts`.

- Shared TypeScript types in `app/models/subscription.model.ts`:
  - `SubscriptionTier`, `SubscriptionStatus`, `SubscriptionOut`,
    `CheckoutOut` matching the backend Pydantic schemas.

## Invariants to honor

- Quota enforcement is server-side only (invariant 2 & 3); the frontend
  reflects state but never gates business logic client-side.
- The Stripe webhook endpoint is public but must verify the Stripe signature
  before trusting or processing any event payload.
- `user_id` on every subscription row is set from the verified JWT, never
  from the request body.
- `increment_sessions_used` is defined here but called only by the sessions
  domain (next slice) — do not call it from this slice.

## Check when done

- An authenticated user hitting `GET /api/v1/subscriptions/me` for the first
  time receives a `free`/`active` subscription row (auto-provisioned).
- Clicking a paid plan on the subscription page redirects to a Stripe
  Checkout page (use Stripe test mode).
- After completing Stripe test checkout and returning to
  `/subscription?success=true`, the subscription state updates and a success
  toast appears.
- `POST /api/v1/subscriptions/webhook` returns `400` when the Stripe
  signature header is missing or invalid.
- `check_and_reset_quota` returns `True` for a free-tier user with 0
  sessions used; `False` for a user at quota.
- `require_active_subscription` dependency raises `HTTP 403` when quota is
  exhausted.
- The Alembic migration renders clean SQL (`alembic upgrade head --sql`) and
  applies against the database.
- `npm run build` passes (frontend).
- `progress-tracker.md` updated to reflect the completed slice.
