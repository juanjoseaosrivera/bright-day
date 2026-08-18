import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { InsightsApi } from '@app/core/api/insights.api';
import { MoodApi } from '@app/core/api/mood.api';
import { SessionApi } from '@app/core/api/session.api';
import { AuthStateService } from '@app/core/services/auth-state.service';
import { SubscriptionStateService } from '@app/core/services/subscription-state.service';
import { BehavioralPatternOut } from '@app/models/insights.model';
import { MoodOut } from '@app/models/mood.model';
import { SessionListItem } from '@app/models/session.model';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
  ToastService,
} from '@app/shared/ui';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucideMic } from '@ng-icons/lucide';

const MOODS = [
  { value: 1, emoji: '😢', label: 'Terrible' },
  { value: 2, emoji: '😕', label: 'Not great' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😊', label: 'Great' },
];

@Component({
  selector: 'app-dashboard-page',
  imports: [
    RouterLink,
    Badge,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Spinner,
    NgIconComponent,
  ],
  viewProviders: [provideIcons({ lucideChevronRight, lucideMic })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-bg-base p-4 pb-24">
      <div class="mx-auto max-w-4xl">
        <!-- Page header -->
        <header class="mb-8 mt-4">
          <h1 class="text-2xl font-semibold text-text-primary">
            Good {{ timeOfDay() }}, {{ displayName() }}.
          </h1>
        </header>

        @if (isLoading()) {
          <div class="flex justify-center py-16">
            <app-spinner size="lg" />
          </div>
        } @else {
          <div class="grid gap-4 md:grid-cols-2">
            <!-- Behavioral Patterns Card -->
            <app-card>
              <app-card-header>
                <app-card-title>Your Patterns</app-card-title>
              </app-card-header>
              <app-card-content>
                @if (patterns().length === 0) {
                  <p class="text-sm text-text-muted">
                    Write more diary entries to reveal your behavioral patterns.
                    <a class="text-accent-primary hover:underline" routerLink="/diary/new">
                      Start writing
                    </a>
                  </p>
                } @else {
                  <ol class="flex flex-col gap-3">
                    @for (p of patterns(); track p.id) {
                      <li class="flex items-start gap-3">
                        <span
                          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary text-xs font-semibold text-white"
                        >
                          {{ p.rank }}
                        </span>
                        <span class="text-sm text-text-primary">{{ p.pattern_text }}</span>
                      </li>
                    }
                  </ol>
                  <p class="mt-4 font-mono text-xs text-text-muted">
                    Last detected: {{ latestDetectedAt() }}
                  </p>
                }
              </app-card-content>
            </app-card>

            <!-- Daily Mood Card -->
            <app-card>
              <app-card-header>
                <app-card-title>How are you feeling today?</app-card-title>
              </app-card-header>
              <app-card-content>
                @if (moodLogging()) {
                  <div class="flex justify-center py-4">
                    <app-spinner />
                  </div>
                } @else if (todayMood() !== null) {
                  <div class="flex flex-col items-center gap-2">
                    <span class="text-4xl">{{ moodEmoji() }}</span>
                    <p class="text-sm text-text-primary">
                      You're feeling {{ moodEmoji() }} {{ moodLabel() }} today.
                    </p>
                    <div class="mt-3 flex gap-2">
                      @for (m of moods; track m.value) {
                        <button
                          class="rounded-full px-2 py-1 text-xl text-text-muted opacity-60 transition-all hover:scale-110 hover:opacity-100"
                          [attr.aria-label]="m.label"
                          (click)="logMood(m.value)"
                        >
                          {{ m.emoji }}
                        </button>
                      }
                    </div>
                  </div>
                } @else {
                  <div class="flex justify-center gap-2">
                    @for (m of moods; track m.value) {
                      <button
                        class="rounded-full border border-border-default px-3 py-2 text-2xl transition-all hover:scale-110 hover:border-accent-primary"
                        [attr.aria-label]="m.label"
                        (click)="logMood(m.value)"
                      >
                        {{ m.emoji }}
                      </button>
                    }
                  </div>
                }
              </app-card-content>
            </app-card>

            <!-- Last Session Card -->
            <app-card class="md:col-span-2">
              <app-card-header>
                <app-card-title>Last Session</app-card-title>
              </app-card-header>
              <app-card-content>
                @if (lastSession() === null) {
                  <div class="flex flex-col items-start gap-4">
                    <p class="text-sm text-text-muted">No sessions yet.</p>
                    <button appButton routerLink="/sessions/new">Start Your First Session</button>
                  </div>
                } @else {
                  <div class="flex flex-col gap-3">
                    <div class="flex flex-wrap items-center gap-3">
                      <span class="text-sm text-text-primary">{{ sessionDate() }}</span>
                      <span class="font-mono text-sm text-text-muted">{{ sessionTime() }}</span>
                      @if (lastSession()!.duration_seconds !== null) {
                        <span class="font-mono text-sm text-text-muted">
                          {{ sessionDuration() }}
                        </span>
                      }
                      <app-badge [variant]="sessionBadgeVariant()">
                        {{ lastSession()!.status }}
                      </app-badge>
                    </div>
                    @if (lastSession()!.overview !== null) {
                      <p class="text-sm text-text-primary">{{ lastSession()!.overview }}</p>
                    } @else if (lastSession()!.status === 'ready') {
                      <div class="flex items-center gap-2 text-sm text-text-muted">
                        <app-spinner size="sm" />
                        Overview is being generated…
                      </div>
                    }
                    <a
                      class="flex items-center gap-1 text-sm text-accent-primary hover:underline"
                      [routerLink]="['/sessions', lastSession()!.id]"
                    >
                      View session
                      <ng-icon name="lucideChevronRight" class="h-4 w-4" />
                    </a>
                  </div>
                }
              </app-card-content>
            </app-card>
          </div>
        }
      </div>
    </div>

    <!-- Floating action button — visible only with active subscription + quota -->
    @if (showFab()) {
      <button
        appButton
        class="fixed bottom-6 right-6 flex items-center gap-2 rounded-full px-5 py-3 shadow-lg"
        routerLink="/sessions/new"
      >
        <ng-icon name="lucideMic" class="h-5 w-5" />
        Start Session
      </button>
    }
  `,
})
export class DashboardPage implements OnInit {
  private readonly insightsApi = inject(InsightsApi);
  private readonly moodApi = inject(MoodApi);
  private readonly sessionApi = inject(SessionApi);
  private readonly authState = inject(AuthStateService);
  private readonly subState = inject(SubscriptionStateService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly moods = MOODS;

  protected readonly patterns = signal<BehavioralPatternOut[]>([]);
  protected readonly todayMood = signal<MoodOut | null>(null);
  protected readonly lastSession = signal<SessionListItem | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly moodLogging = signal(false);

  protected readonly displayName = computed(() => {
    const user = this.authState.currentUser();
    return user?.display_name || user?.email || 'there';
  });

  protected readonly timeOfDay = computed(() => {
    const h = new Date().getHours();
    if (h >= 5 && h <= 11) return 'morning';
    if (h >= 12 && h <= 17) return 'afternoon';
    return 'evening';
  });

  protected readonly latestDetectedAt = computed(() => {
    const p = this.patterns();
    if (!p.length) return '';
    const latest = p.reduce((a, b) =>
      new Date(a.detected_at) > new Date(b.detected_at) ? a : b,
    );
    return new Date(latest.detected_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  });

  protected readonly moodEmoji = computed(() => {
    const m = this.todayMood();
    return m ? (MOODS.find((x) => x.value === m.mood)?.emoji ?? '') : '';
  });

  protected readonly moodLabel = computed(() => {
    const m = this.todayMood();
    return m ? (MOODS.find((x) => x.value === m.mood)?.label ?? '') : '';
  });

  protected readonly sessionDate = computed(() => {
    const s = this.lastSession();
    if (!s) return '';
    return new Date(s.started_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  });

  protected readonly sessionTime = computed(() => {
    const s = this.lastSession();
    if (!s) return '';
    return new Date(s.started_at).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  });

  protected readonly sessionDuration = computed(() => {
    const s = this.lastSession();
    if (!s || s.duration_seconds === null) return '';
    const m = Math.floor(s.duration_seconds / 60)
      .toString()
      .padStart(2, '0');
    const sec = (s.duration_seconds % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  });

  protected readonly sessionBadgeVariant = computed((): 'default' | 'secondary' | 'destructive' | 'outline' => {
    const s = this.lastSession();
    if (!s) return 'default';
    if (s.status === 'ready') return 'default';
    if (s.status === 'failed') return 'destructive';
    return 'secondary';
  });

  protected readonly showFab = computed(
    () =>
      this.subState.hasActiveSubscription() && this.subState.sessionsRemaining() > 0,
  );

  ngOnInit(): void {
    forkJoin({
      patterns: this.insightsApi.getPatterns(),
      mood: this.moodApi.getTodayMood(),
      sessions: this.sessionApi.listSessions(),
    }).subscribe({
      next: ({ patterns, mood, sessions }) => {
        this.patterns.set(patterns);
        this.todayMood.set(mood);
        this.lastSession.set(sessions.length > 0 ? sessions[0] : null);
        this.isLoading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load dashboard', {
          description: 'Please refresh the page.',
        });
        this.isLoading.set(false);
      },
    });
  }

  protected logMood(value: number): void {
    this.moodLogging.set(true);
    this.moodApi.logMood({ mood: value }).subscribe({
      next: (log) => {
        this.todayMood.set(log);
        this.moodLogging.set(false);
      },
      error: () => {
        this.toast.error('Could not log mood', { description: 'Please try again.' });
        this.moodLogging.set(false);
      },
    });
  }
}
