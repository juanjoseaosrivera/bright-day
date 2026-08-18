import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { CheckoutOut, SubscriptionOut, SubscriptionTier } from '@app/models/subscription.model';

import { API_BASE_URL } from './api.config';

/**
 * Typed client for the backend `/subscriptions` endpoints. This is the only
 * place that talks to the subscription API (architecture invariant 8) — the
 * `SubscriptionStateService` and the subscription page go through this service.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  getMySubscription(): Observable<SubscriptionOut> {
    return this.http.get<SubscriptionOut>(`${this.baseUrl}/subscriptions/me`);
  }

  createCheckoutSession(tier: SubscriptionTier): Observable<CheckoutOut> {
    return this.http.post<CheckoutOut>(`${this.baseUrl}/subscriptions/checkout`, { tier });
  }

  verifyCheckout(sessionId: string): Observable<SubscriptionOut> {
    return this.http.post<SubscriptionOut>(`${this.baseUrl}/subscriptions/checkout/verify`, {
      session_id: sessionId,
    });
  }
}
