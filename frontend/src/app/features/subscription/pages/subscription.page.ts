import { ChangeDetectionStrategy, Component, inject, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { apiErrorMessage } from '@app/core/api/http-error';
import { SubscriptionStateService } from '@app/core/services/subscription-state.service';
import { SubscriptionTier } from '@app/models/subscription.model';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Spinner,
  ToastService,
} from '@app/shared/ui';

interface PlanCard {
  tier: SubscriptionTier;
  label: string;
  sessionsPerWeek: number;
  description: string;
  isPaid: boolean;
}

const PLANS: PlanCard[] = [
  {
    tier: 'free',
    label: 'Free',
    sessionsPerWeek: 1,
    description: 'One voice session per week to explore Bright Day.',
    isPaid: false,
  },
  {
    tier: 'weekly_1',
    label: 'Basic',
    sessionsPerWeek: 1,
    description: 'One dedicated session per week with full feature access.',
    isPaid: true,
  },
  {
    tier: 'weekly_3',
    label: 'Standard',
    sessionsPerWeek: 3,
    description: 'Three sessions per week for consistent wellbeing support.',
    isPaid: true,
  },
  {
    tier: 'weekly_5',
    label: 'Premium',
    sessionsPerWeek: 5,
    description: 'Five sessions per week for intensive, ongoing guidance.',
    isPaid: true,
  },
];

@Component({
  selector: 'app-subscription-page',
  imports: [
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    Spinner,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen flex-col items-center bg-bg-base p-6">
      <div class="w-full max-w-4xl">
        <div class="mb-8">
          <h1 class="text-2xl font-semibold text-text-primary">Choose your plan</h1>
          <p class="mt-1 text-sm text-text-muted">
            All plans include your session history, personal diary, and AI insights.
          </p>
        </div>

        @if (loading()) {
          <div class="flex flex-col items-center gap-3 py-16">
            <app-spinner class="h-8 w-8 text-accent-primary" />
            @if (awaitingWebhook()) {
              <p class="text-sm text-text-muted">Activating your plan…</p>
            }
          </div>
        } @else {
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            @for (plan of plans; track plan.tier) {
              <app-card
                [class]="
                  isActivePlan(plan.tier)
                    ? 'ring-2 ring-accent-primary'
                    : ''
                "
              >
                <app-card-header>
                  <div class="flex items-start justify-between gap-2">
                    <app-card-title>{{ plan.label }}</app-card-title>
                    @if (isActivePlan(plan.tier)) {
                      <app-badge variant="default" class="shrink-0">Active</app-badge>
                    }
                  </div>
                  <app-card-description>
                    {{ plan.sessionsPerWeek }}
                    {{ plan.sessionsPerWeek === 1 ? 'session' : 'sessions' }} / week
                  </app-card-description>
                </app-card-header>

                <app-card-content>
                  <p class="text-sm text-text-muted">{{ plan.description }}</p>
                  @if (isActivePlan(plan.tier)) {
                    <p class="mt-3 text-sm font-medium text-text-primary">
                      {{ sessionsRemaining() }}
                      {{ sessionsRemaining() === 1 ? 'session' : 'sessions' }}
                      remaining this week
                    </p>
                  }
                </app-card-content>

                <app-card-footer>
                  @if (isActivePlan(plan.tier)) {
                    <button appButton variant="outline" class="w-full" [disabled]="true">
                      Current plan
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
                  } @else {
                    <button appButton variant="ghost" class="w-full" [disabled]="true">
                      Included
                    </button>
                  }
                </app-card-footer>
              </app-card>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class SubscriptionPage implements OnDestroy {
  private readonly subscriptionState = inject(SubscriptionStateService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  protected readonly plans = PLANS;
  protected readonly loading = signal(true);
  protected readonly awaitingWebhook = signal(false);
  protected readonly checkingOut = signal<SubscriptionTier | null>(null);

  protected readonly sessionsRemaining = this.subscriptionState.sessionsRemaining;

  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const sessionId = params.get('session_id');
    const success = params.get('success') === 'true';
    const cancelled = params.get('cancelled') === 'true';

    if (success && sessionId) {
      this.awaitingWebhook.set(true);
      this.subscriptionState.verify(sessionId).subscribe({
        next: () => {
          this.awaitingWebhook.set(false);
          this.loading.set(false);
          this.toast.success('Plan updated', {
            description: 'Your subscription is now active.',
          });
        },
        error: () => {
          this.awaitingWebhook.set(false);
          this.loading.set(false);
          this.toast.error('Could not activate subscription', {
            description: 'Please refresh the page or contact support.',
          });
        },
      });
    } else {
      this.subscriptionState.load().subscribe({
        next: () => {
          this.loading.set(false);
          if (cancelled) {
            this.toast.message('Checkout cancelled', {
              description: 'No changes were made to your plan.',
            });
          }
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.toast.error('Could not load subscription', {
            description: apiErrorMessage(err),
          });
        },
      });
    }
  }

  ngOnDestroy(): void {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
  }

  protected isActivePlan(tier: SubscriptionTier): boolean {
    return this.subscriptionState.subscription()?.tier === tier;
  }

  protected startCheckout(tier: SubscriptionTier): void {
    this.checkingOut.set(tier);
    this.subscriptionState.checkout(tier).subscribe({
      next: (res) => {
        window.location.href = res.checkout_url;
      },
      error: (err: unknown) => {
        this.checkingOut.set(null);
        this.toast.error('Checkout failed', { description: apiErrorMessage(err) });
      },
    });
  }
}
