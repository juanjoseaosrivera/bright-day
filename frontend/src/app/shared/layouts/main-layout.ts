import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { lucideBookOpen, lucideCreditCard, lucideLayoutDashboard, lucideLogOut, lucideMic } from '@ng-icons/lucide';

import { AuthStateService } from '@app/core/services/auth-state.service';
import { SubscriptionStateService } from '@app/core/services/subscription-state.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, NgIconComponent],
  providers: [provideIcons({ lucideLayoutDashboard, lucideMic, lucideBookOpen, lucideCreditCard, lucideLogOut })],
  template: `
    <nav
      class="fixed left-0 right-0 top-0 z-50 h-16 border-b border-border-default bg-bg-surface"
    >
      <div class="mx-auto flex h-full max-w-5xl items-center justify-between px-4">
        <!-- Logo -->
        <a
          routerLink="/dashboard"
          class="text-lg font-semibold text-text-primary transition-opacity hover:opacity-80"
        >
          bright day
        </a>

        <!-- Primary nav links -->
        <div class="flex items-center gap-1">
          <a
            routerLink="/dashboard"
            routerLinkActive="bg-bg-base text-accent-primary"
            [routerLinkActiveOptions]="{ exact: true }"
            class="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-bg-base hover:text-text-primary"
          >
            <ng-icon name="lucideLayoutDashboard" class="h-4 w-4" />
            Dashboard
          </a>
          <a
            routerLink="/sessions"
            routerLinkActive="bg-bg-base text-accent-primary"
            class="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-bg-base hover:text-text-primary"
          >
            <ng-icon name="lucideMic" class="h-4 w-4" />
            Sessions
          </a>
          <a
            routerLink="/diary"
            routerLinkActive="bg-bg-base text-accent-primary"
            class="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-bg-base hover:text-text-primary"
          >
            <ng-icon name="lucideBookOpen" class="h-4 w-4" />
            Diary
          </a>
        </div>

        <!-- User section -->
        <div class="flex items-center gap-3">
          @if (displayName()) {
            <span class="hidden text-sm text-text-muted sm:block">{{ displayName() }}</span>
          }
          <a
            routerLink="/subscription"
            routerLinkActive="bg-bg-base text-accent-primary"
            class="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-bg-base hover:text-text-primary"
          >
            <ng-icon name="lucideCreditCard" class="h-4 w-4" />
            <span class="hidden sm:block">Subscription</span>
          </a>
          <button
            (click)="logout()"
            class="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-bg-base hover:text-text-primary"
            aria-label="Log out"
          >
            <ng-icon name="lucideLogOut" class="h-4 w-4" />
            <span class="hidden sm:block">Log out</span>
          </button>
        </div>
      </div>
    </nav>

    <main class="min-h-screen bg-bg-base pt-16">
      <router-outlet />
    </main>
  `,
})
export class MainLayout {
  private readonly authState = inject(AuthStateService);
  private readonly subscriptionState = inject(SubscriptionStateService);
  private readonly router = inject(Router);

  protected readonly displayName = computed(() => {
    const user = this.authState.currentUser();
    return user?.display_name ?? user?.email ?? null;
  });

  constructor() {
    // Warm the subscription state once for the whole authenticated shell, so
    // quota-dependent UI (e.g. the dashboard FAB) is correct without visiting
    // the subscription page. Deduped with the sessions guard's own fetch.
    this.subscriptionState.ensureLoaded().subscribe();
  }

  protected logout(): void {
    this.authState.clear();
    this.router.navigateByUrl('/login');
  }
}
