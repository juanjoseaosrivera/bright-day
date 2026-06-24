import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AuthStateService } from '@app/core/services/auth-state.service';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@app/shared/ui';

/**
 * Minimal authenticated landing. A placeholder for the dashboard/home slices —
 * it confirms the session works end to end (guarded route + signed-in user +
 * sign-out) without pulling future features into this auth slice.
 */
@Component({
  selector: 'app-home-page',
  imports: [Button, Card, CardContent, CardDescription, CardHeader, CardTitle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen items-center justify-center bg-bg-base p-4">
      <app-card class="w-full max-w-md">
        <app-card-header>
          <app-card-title>Hello, {{ greetingName() }}</app-card-title>
          <app-card-description>
            You're signed in. Your dashboard and voice sessions arrive in upcoming
            slices.
          </app-card-description>
        </app-card-header>
        <app-card-content>
          <button appButton variant="outline" class="w-full" (click)="signOut()">Sign out</button>
        </app-card-content>
      </app-card>
    </div>
  `,
})
export class HomePage {
  private readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);

  protected readonly greetingName = computed(() => {
    const user = this.authState.currentUser();
    return user?.display_name || user?.email || 'there';
  });

  protected signOut(): void {
    this.authState.clear();
    void this.router.navigateByUrl('/login');
  }
}
