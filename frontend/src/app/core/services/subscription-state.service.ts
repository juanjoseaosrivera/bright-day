import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, Observable, of, shareReplay, tap } from 'rxjs';

import { SubscriptionApi } from '@app/core/api/subscription.api';
import { CheckoutOut, SubscriptionOut, SubscriptionTier } from '@app/models/subscription.model';

/**
 * App-wide subscription state. Holds the current subscription as a signal so
 * components and guards react to it without zones.
 *
 * Guards and components that only need the state present call `ensureLoaded()`,
 * which fetches once and shares a single in-flight request; `load()` forces a
 * refresh (used by the subscription page). Because `hasActiveSubscription()` is
 * false both when unloaded and when there is no active plan, never read it
 * without having awaited `ensureLoaded()` (or checked `loaded()`) first.
 *
 * Call `clear()` on logout alongside `AuthStateService.clear()`.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionStateService {
  private readonly api = inject(SubscriptionApi);
  private readonly _subscription = signal<SubscriptionOut | null>(null);
  private readonly _loaded = signal(false);

  /** Shared request while a fetch is in flight, so concurrent callers dedupe. */
  private inFlight: Observable<SubscriptionOut | null> | null = null;

  /** Read-only view of the current subscription (null until a load resolves). */
  readonly subscription = this._subscription.asReadonly();

  /** True once a fetch has resolved — distinguishes "unknown" from "no plan". */
  readonly loaded = this._loaded.asReadonly();

  /** True when the subscription is loaded and has `status === 'active'`. */
  readonly hasActiveSubscription = computed(
    () => this._subscription()?.status === 'active',
  );

  /** Sessions still available this week (0 when not yet loaded). */
  readonly sessionsRemaining = computed(
    () => this._subscription()?.sessions_remaining ?? 0,
  );

  /**
   * Resolve the subscription state exactly once. Emits immediately when already
   * loaded, otherwise shares the pending request. Emits `null` if the fetch
   * fails, leaving the state unloaded so a later call retries.
   */
  ensureLoaded(): Observable<SubscriptionOut | null> {
    if (this._loaded()) return of(this._subscription());

    this.inFlight ??= this.api.getMySubscription().pipe(
      tap((sub) => this.setSubscription(sub)),
      catchError(() => {
        this.inFlight = null;
        return of(null);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.inFlight;
  }

  /**
   * Fetch the current subscription from the backend and update the signal.
   * Returns the Observable so callers can react after the load completes.
   */
  load(): Observable<SubscriptionOut> {
    return this.api.getMySubscription().pipe(
      tap((sub) => this.setSubscription(sub)),
    );
  }

  /**
   * Initiate a Stripe Checkout session for a paid tier.
   * The caller is responsible for redirecting to `result.checkout_url`.
   */
  checkout(tier: SubscriptionTier): Observable<CheckoutOut> {
    return this.api.createCheckoutSession(tier);
  }

  /**
   * Verify a completed Stripe Checkout session by its ID and update the
   * local subscription signal. Called on the success return URL so the UI
   * reflects the new plan without waiting for the webhook.
   */
  verify(sessionId: string): Observable<SubscriptionOut> {
    return this.api.verifyCheckout(sessionId).pipe(
      tap((sub) => this.setSubscription(sub)),
    );
  }

  /** Reset state on logout. */
  clear(): void {
    this._subscription.set(null);
    this._loaded.set(false);
    this.inFlight = null;
  }

  /** Single place where a resolved subscription lands, from any fetch path. */
  private setSubscription(sub: SubscriptionOut): void {
    this._subscription.set(sub);
    this._loaded.set(true);
    this.inFlight = null;
  }
}
