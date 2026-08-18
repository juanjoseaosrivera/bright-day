Read `CLAUDE.md` before starting.

We're adding a **restore subscription** flow as a thin front-to-back
vertical slice. A user whose subscription is `cancelled` or `past_due`
has no path to resubscribe today — the subscription page marks their old
tier as "Current plan" (disabled button) regardless of status, locking
them out of paid features with no escape. This slice adds that recovery
path.

Work back-to-front in this order:

1. Backend service + router changes
2. Frontend model, state-service, and page changes
3. Verify end-to-end

---

## What is broken today

In `subscription.page.ts` the helper `isActivePlan(tier)` checks only
`subscription()?.tier === tier`, ignoring `status`. So a user with
`tier = 'weekly_3'` and `status = 'cancelled'` sees the Standard card
rendered as "Current plan" (disabled) and has no visible action to
resubscribe.

In `subscription-state.service.ts`, `hasActiveSubscription` is
`status === 'active'`, which is correct — but nothing in the UI
surfaces the reason a user is blocked or gives them a way to recover.

---

## Backend — `app/domains/subscription/`

### `service.py`

Add one function:

```python
def restore_subscription(
    db: Session,
    user_id: uuid.UUID,
    tier: schemas.SubscriptionTier,
    email: str,
) -> str:
    """Open a new Stripe Checkout session to restore a cancelled/past_due subscription.

    Equivalent to `create_checkout_session`, but only callable when the current
    subscription status is not 'active'. Raises AppError(409) if the subscription
    is already active — use the upgrade flow instead.
    """
```

Implementation steps inside:
1. `get_or_create_free_subscription(db, user_id)` — fetch current row.
2. If `sub.status == 'active'` → raise `AppError("Subscription is already active", status_code=409)`.
3. Delegate to `create_checkout_session(db, user_id, tier, email)` — the
   Stripe Checkout session creation is identical; the guard above is the
   only difference.

No new model or migration is needed.

### `schemas.py`

Add `RestoreIn` — identical to `CheckoutIn` (a `tier` field validating
against paid tiers):

```python
class RestoreIn(BaseModel):
    tier: SubscriptionTier

    @field_validator("tier")
    @classmethod
    def must_be_paid(cls, v: SubscriptionTier) -> SubscriptionTier:
        if v == SubscriptionTier.FREE:
            raise ValueError("Cannot restore to the free tier")
        return v
```

Add `SubscriptionStatus` to `SubscriptionOut` so the frontend can
render status-aware UI without a separate request:

- `SubscriptionOut` already has `tier` and `sessions_remaining`; add
  `status: SubscriptionStatus` (expose the raw string field).

### `router.py`

Add one endpoint:

```python
@router.post(
    "/restore",
    response_model=schemas.CheckoutOut,
    status_code=status.HTTP_200_OK,
)
def restore_subscription(
    payload: schemas.RestoreIn,
    current_user: CurrentUser,
    db: DbSession,
) -> schemas.CheckoutOut:
    """Create a Stripe Checkout session to re-activate a cancelled subscription."""
    url = service.restore_subscription(
        db, current_user.user_id, payload.tier, current_user.email
    )
    return schemas.CheckoutOut(checkout_url=url)
```

The `checkout/verify` endpoint already handles post-checkout activation
and is reused unchanged — the same `?success=true&session_id=…` return
URL works for both upgrade and restore.

---

## Frontend — changes only; no new files unless noted

### `app/models/subscription.model.ts`

Add `status` to `SubscriptionOut`:

```ts
export interface SubscriptionOut {
  tier: SubscriptionTier;
  status: SubscriptionStatus;          // add this line
  sessions_used_this_week: number;
  sessions_allowed_per_week: number;
  sessions_remaining: number;
}
```

### `core/api/subscription.api.ts`

Add one call:

```ts
restore(tier: SubscriptionTier): Observable<CheckoutOut> {
  return this.http.post<CheckoutOut>(`${this.base}/restore`, { tier });
}
```

### `core/services/subscription-state.service.ts`

Add one method:

```ts
restore(tier: SubscriptionTier): Observable<CheckoutOut> {
  return this.api.restore(tier).pipe(
    tap((res) => window.location.href = res.checkout_url),
  );
}
```

`hasActiveSubscription` stays as-is (`status === 'active'`).

Add a computed signal for convenient status access in templates:

```ts
readonly subscriptionStatus = computed(
  () => this.subscription()?.status ?? null,
);
```

### `features/subscription/pages/subscription.page.ts`

Three targeted changes:

**1. Fix `isActivePlan` to require `status === 'active'`:**

```ts
protected isActivePlan(tier: SubscriptionTier): boolean {
  const sub = this.subscriptionState.subscription();
  return sub?.tier === tier && sub?.status === 'active';
}
```

**2. Add a computed that detects a restorable state:**

```ts
protected readonly isRestorable = computed(() => {
  const sub = this.subscriptionState.subscription();
  return (
    sub !== null &&
    (sub.status === 'cancelled' || sub.status === 'past_due')
  );
});
```

**3. Add a `restore()` action and `restoring` signal:**

```ts
protected readonly restoring = signal<SubscriptionTier | null>(null);

protected startRestore(tier: SubscriptionTier): void {
  this.restoring.set(tier);
  this.subscriptionState.restore(tier).subscribe({
    error: (err: unknown) => {
      this.restoring.set(null);
      this.toast.error('Restore failed', { description: apiErrorMessage(err) });
    },
  });
}
```

**4. Update the plan-card footer template block:**

Replace the existing `@else if (plan.isPaid)` block with:

```html
} @else if (plan.isPaid && isRestorable()) {
  <button
    appButton
    class="w-full"
    [loading]="restoring() === plan.tier"
    [disabled]="restoring() !== null || checkingOut() !== null"
    (click)="startRestore(plan.tier)"
  >
    Restore
  </button>
} @else if (plan.isPaid) {
  <button
    appButton
    class="w-full"
    [loading]="checkingOut() === plan.tier"
    [disabled]="checkingOut() !== null"
    (click)="startCheckout(plan.tier)"
  >
    Upgrade
  </button>
```

**5. Add a status banner above the plan grid (restorable state only):**

```html
@if (isRestorable()) {
  <div
    class="mb-6 rounded-lg border border-state-warning bg-state-warning/10 px-4 py-3 text-sm text-text-primary"
  >
    Your subscription is no longer active. Choose a plan below to restore
    access to voice sessions.
  </div>
}
```

---

## Invariants to honor

- Quota enforcement is server-side only; the "Restore" button in the UI
  is a convenience — `require_active_subscription` still gates session
  starts (invariants 2 & 3).
- `user_id` is always sourced from the verified JWT, never from the
  request body.
- `restore_subscription` in the service raises 409 when the subscription
  is already active, preventing duplicate Stripe Checkout sessions.
- The existing `checkout/verify` endpoint handles post-restore
  activation — no new verification route is needed.
- The Stripe webhook (`customer.subscription.updated`) already sets
  `status = 'active'` on renewal; this slice is purely about providing
  a re-entry UI for the manually-cancelled/past_due case.

---

## Check when done

- `GET /api/v1/subscriptions/me` returns a `status` field alongside
  `tier` and `sessions_remaining`.
- `POST /api/v1/subscriptions/restore` with a valid cancelled user and
  a paid tier returns a Stripe Checkout URL.
- `POST /api/v1/subscriptions/restore` with an active subscription
  returns HTTP 409.
- `POST /api/v1/subscriptions/restore` with `tier = 'free'` returns
  HTTP 422.
- A user with `status = 'cancelled'` or `status = 'past_due'` visiting
  `/subscription` sees the warning banner and "Restore" buttons instead
  of "Upgrade" buttons.
- A user with `status = 'active'` sees the existing "Current plan" /
  "Upgrade" layout unchanged.
- After completing a restore Stripe Checkout and returning to
  `/subscription?success=true&session_id=…`, the page calls
  `verify`, the subscription shows `status = 'active'`, and a success
  toast appears.
- `npm run build` passes (frontend).
- `progress-tracker.md` updated to reflect the completed slice.
