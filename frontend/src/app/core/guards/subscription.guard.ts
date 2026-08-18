import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';

import { SubscriptionStateService } from '@app/core/services/subscription-state.service';

/**
 * Allows access only to users with an active subscription; else → /subscription.
 *
 * Resolves the subscription state via `ensureLoaded()` before deciding, so a
 * first navigation into the sessions routes is not redirected merely because
 * the state has not been fetched yet. Concurrent activations share one request.
 * A failed fetch emits null, which redirects to the subscription page — that
 * page reports the error; a 401 is handled by the auth interceptor.
 *
 * Applied to the sessions route in `app.routes.ts`:
 *
 *   { path: 'sessions', canActivate: [subscriptionGuard], … }
 */
export const subscriptionGuard: CanActivateFn = () => {
  const state = inject(SubscriptionStateService);
  const router = inject(Router);
  return state
    .ensureLoaded()
    .pipe(map(() => (state.hasActiveSubscription() ? true : router.parseUrl('/subscription'))));
};
