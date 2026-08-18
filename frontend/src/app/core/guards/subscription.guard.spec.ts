import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { SubscriptionApi } from '@app/core/api/subscription.api';
import { SubscriptionStateService } from '@app/core/services/subscription-state.service';
import { SubscriptionOut } from '@app/models/subscription.model';

import { subscriptionGuard } from './subscription.guard';

const ACTIVE: SubscriptionOut = {
  tier: 'free',
  status: 'active',
  sessions_used_this_week: 0,
  sessions_allowed_per_week: 1,
  sessions_remaining: 1,
};

function setup(response: Observable<SubscriptionOut>) {
  const getMySubscription = vi.fn(() => response);
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: SubscriptionApi, useValue: { getMySubscription } }],
  });
  return { getMySubscription };
}

function run() {
  return TestBed.runInInjectionContext(
    () =>
      subscriptionGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot) as Observable<
        boolean | UrlTree
      >,
  );
}

describe('subscriptionGuard', () => {
  it('allows the FIRST activation by loading state before deciding', async () => {
    const { getMySubscription } = setup(of(ACTIVE));

    await expect(firstValueFrom(run())).resolves.toBe(true);
    expect(getMySubscription).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent activations into one request', async () => {
    const { getMySubscription } = setup(of(ACTIVE));

    const [a, b] = await Promise.all([firstValueFrom(run()), firstValueFrom(run())]);

    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(getMySubscription).toHaveBeenCalledTimes(1);
  });

  it('does not refetch once loaded', async () => {
    const { getMySubscription } = setup(of(ACTIVE));

    await firstValueFrom(run());
    await firstValueFrom(run());

    expect(getMySubscription).toHaveBeenCalledTimes(1);
  });

  it('redirects to /subscription when the fetch fails, and retries next time', async () => {
    const { getMySubscription } = setup(throwError(() => new Error('offline')));

    const result = await firstValueFrom(run());
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/subscription');

    await firstValueFrom(run());
    expect(getMySubscription).toHaveBeenCalledTimes(2);
  });

  it('redirects when the loaded subscription is not active', async () => {
    setup(of({ ...ACTIVE, status: 'cancelled' }));

    const result = await firstValueFrom(run());
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/subscription');
  });

  it('clear() resets loaded state so the next activation refetches', async () => {
    const { getMySubscription } = setup(of(ACTIVE));

    await firstValueFrom(run());
    TestBed.inject(SubscriptionStateService).clear();
    await firstValueFrom(run());

    expect(getMySubscription).toHaveBeenCalledTimes(2);
  });
});
