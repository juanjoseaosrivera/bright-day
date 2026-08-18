import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { apiErrorMessage } from '@app/core/api/http-error';
import { SessionApi } from '@app/core/api/session.api';
import { SessionListItem } from '@app/models/session.model';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Spinner,
  ToastService,
} from '@app/shared/ui';

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '--:--';
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive'> = {
  ready: 'success',
  processing: 'warning',
  recording: 'secondary',
  failed: 'destructive',
};

@Component({
  selector: 'app-session-history-page',
  imports: [Badge, Button, Card, CardContent, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen flex-col bg-bg-base p-6">
      <div class="mx-auto w-full max-w-2xl">
        <div class="mb-6 flex items-center justify-between">
          <h1 class="text-2xl font-semibold text-text-primary">Sessions</h1>
          <button appButton (click)="goToNew()">Start Session</button>
        </div>

        @if (loading()) {
          <div class="flex justify-center py-16">
            <app-spinner class="h-8 w-8 text-accent-primary" />
          </div>
        } @else if (sessions().length === 0) {
          <div class="flex flex-col items-center gap-4 py-20 text-center">
            <p class="text-text-muted">No sessions yet. Start your first session.</p>
            <button appButton (click)="goToNew()">Start Session</button>
          </div>
        } @else {
          <div class="flex flex-col gap-3">
            @for (session of sessions(); track session.id) {
              <app-card
                class="cursor-pointer transition-shadow hover:shadow-md"
                (click)="goToDetail(session.id)"
              >
                <app-card-content class="flex items-center gap-4 py-4">
                  <div class="flex-1">
                    <p class="text-sm font-medium text-text-primary">
                      {{ formatDate(session.started_at) }}
                      <span class="ml-2 font-mono text-xs text-text-muted">
                        {{ formatTime(session.started_at) }}
                      </span>
                    </p>
                    <p class="mt-0.5 font-mono text-xs text-text-muted">
                      {{ formatDuration(session.duration_seconds) }}
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <app-badge [variant]="statusVariant(session.status)">
                      {{ session.status }}
                    </app-badge>
                    <svg
                      class="h-4 w-4 text-text-muted"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </app-card-content>
              </app-card>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class SessionHistoryPage {
  private readonly sessionApi = inject(SessionApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly sessions = signal<SessionListItem[]>([]);
  protected readonly loading = signal(true);

  protected readonly formatDate = formatDate;
  protected readonly formatTime = formatTime;
  protected readonly formatDuration = formatDuration;

  constructor() {
    this.sessionApi.listSessions().subscribe({
      next: (list) => {
        this.sessions.set(list);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.toast.error('Could not load sessions', { description: apiErrorMessage(err) });
      },
    });
  }

  protected statusVariant(status: string): 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive' {
    return STATUS_VARIANT[status] ?? 'outline';
  }

  protected goToDetail(id: string): void {
    void this.router.navigateByUrl(`/sessions/${id}`);
  }

  protected goToNew(): void {
    void this.router.navigateByUrl('/sessions/new');
  }
}
