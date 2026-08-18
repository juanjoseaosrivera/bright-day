import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '@app/core/api/http-error';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  ToastService,
} from '@app/shared/ui';

import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Input,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen items-center justify-center bg-bg-base p-4">
      <app-card class="w-full max-w-md">
        <app-card-header>
          <app-card-title>Welcome back</app-card-title>
          <app-card-description>Sign in to continue your Bright Day.</app-card-description>
        </app-card-header>
        <app-card-content>
          <form class="flex flex-col gap-4" [formGroup]="form" (ngSubmit)="submit()">
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-text-primary" for="email">Email</label>
              <input
                appInput
                id="email"
                type="email"
                autocomplete="email"
                placeholder="you@example.com"
                formControlName="email"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-text-primary" for="password">Password</label>
              <input
                appInput
                id="password"
                type="password"
                autocomplete="current-password"
                placeholder="Your password"
                formControlName="password"
              />
            </div>
            <button
              appButton
              type="submit"
              class="mt-2 w-full"
              [loading]="submitting()"
              [disabled]="submitting()"
            >
              Sign in
            </button>
          </form>
          <p class="mt-4 text-center text-sm text-text-muted">
            New to Bright Day?
            <a class="text-accent-primary hover:underline" routerLink="/register">Create an account</a>
          </p>
        </app-card-content>
      </app-card>
    </div>
  `,
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();
    this.auth.login({ email, password }).subscribe({
      next: (res) => {
        this.toast.success('Welcome back');
        void this.router.navigateByUrl(res.user.onboarding_completed ? '/dashboard' : '/onboarding');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.toast.error('Sign in failed', { description: apiErrorMessage(err) });
      },
    });
  }
}
