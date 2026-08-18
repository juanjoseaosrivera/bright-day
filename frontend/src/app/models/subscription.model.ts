/**
 * API request/response contracts for the subscription domain. These mirror the
 * backend Pydantic schemas (`app/domains/subscription/schemas.py`) and form the
 * single typed boundary between the two apps.
 */

export type SubscriptionTier = 'free' | 'weekly_1' | 'weekly_3' | 'weekly_5';
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due';

export interface SubscriptionOut {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  sessions_used_this_week: number;
  sessions_allowed_per_week: number;
  /** Computed by the backend: max(0, allowed − used). */
  sessions_remaining: number;
}

export interface CheckoutOut {
  /** Stripe-hosted Checkout URL; redirect the browser here to start payment. */
  checkout_url: string;
}
