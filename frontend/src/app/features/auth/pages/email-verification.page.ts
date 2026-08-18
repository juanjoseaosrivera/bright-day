import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '@app/core/api/http-error';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
  ToastService,
} from '@app/shared/ui';

import { AuthService } from '../services/auth.service';
import { AuthFeatureState } from '../state/auth-feature.state';

type VerifyState = 'pending' | 'verifying' | 'error';

/**
 * Dual-mode page mounted at the Supabase email redirect target
 * (`/auth/verify-email`):
 *  - after registration (no URL fragment) it shows "check your inbox";
 *  - when the user returns from the confirmation link, Supabase appends the
 *    session to the URL fragment — we capture the access token, finalize the
 *    session through the backend, and route into onboarding.
 */
@Component({
  selector: 'app-email-verification-page',
  imports: [
    RouterLink,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Spinner,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen items-center justify-center bg-bg-base p-4">
      <app-card class="w-full max-w-md">
        @switch (state()) {
          @case ('verifying') {
            <app-card-header>
              <app-card-title>Verifying your email…</app-card-title>
              <app-card-description>Hang tight, this only takes a moment.</app-card-description>
            </app-card-header>
            <app-card-content>
              <div class="flex justify-center py-6"><app-spinner size="2rem" /></div>
            </app-card-content>
          }
          @case ('error') {
            <app-card-header>
              <app-card-title>Verification link problem</app-card-title>
              <app-card-description>{{ errorMessage() }}</app-card-description>
            </app-card-header>
            <app-card-content class="flex flex-col gap-3">
              <button appButton routerLink="/login" class="w-full">Go to sign in</button>
              <button appButton variant="outline" routerLink="/register" class="w-full">
                Register again
              </button>
            </app-card-content>
          }
          @default {
            <app-card-header>
              <app-card-title>Check your inbox</app-card-title>
              <app-card-description>
                @if (pendingEmail()) {
                  We sent a verification link to <strong>{{ pendingEmail() }}</strong>.
                } @else {
                  We sent you a verification link.
                }
                Open it on this device to confirm your account.
              </app-card-description>
            </app-card-header>
            <app-card-content>
              <p class="text-sm text-text-muted">
                Already confirmed?
                <a class="text-accent-primary hover:underline" routerLink="/login">Sign in</a>
              </p>
            </app-card-content>
          }
        }
      </app-card>
    </div>
  `,
})
export class EmailVerificationPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly feature = inject(AuthFeatureState);

  protected readonly state = signal<VerifyState>('pending');
  protected readonly errorMessage = signal('');
  protected readonly pendingEmail = this.feature.pendingEmail;

  ngOnInit(): void {
    const params = new URLSearchParams(this.route.snapshot.fragment ?? '');
    const accessToken = params.get('access_token');
    const fragmentError = params.get('error_description') ?? params.get('error');
    const pkceCode = this.route.snapshot.queryParamMap.get('code');

    if (accessToken) {
      this.finalize(accessToken);
      return;
    }
    if (pkceCode) {
      // PKCE flow: the session isn't in the fragment. Email is verified —
      // password sign-in now works, so send the user to login.
      this.toast.message('Email verified', { description: 'Please sign in to continue.' });
      void this.router.navigateByUrl('/login');
      return;
    }
    if (fragmentError) {
      this.state.set('error');
      this.errorMessage.set(fragmentError);
      return;
    }
    this.state.set('pending');
  }

  private finalize(accessToken: string): void {
    this.state.set('verifying');
    this.auth.establishSession(accessToken).subscribe({
      next: (me) => {
        this.toast.success('Email verified');
        void this.router.navigateByUrl(me.onboarding_completed ? '/dashboard' : '/onboarding');
      },
      error: (err: unknown) => {
        this.state.set('error');
        this.errorMessage.set(apiErrorMessage(err, 'This link is invalid or has expired.'));
      },
    });
  }
}
