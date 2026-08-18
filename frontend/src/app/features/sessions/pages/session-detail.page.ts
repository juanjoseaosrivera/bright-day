import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { apiErrorMessage } from '@app/core/api/http-error';
import { SessionApi } from '@app/core/api/session.api';
import { SessionOut } from '@app/models/session.model';
import { Badge, Button, Spinner, ToastService } from '@app/shared/ui';

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '--:--';
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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
  selector: 'app-session-detail-page',
  imports: [Badge, Button, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-bg-base p-6">
      <div class="mx-auto max-w-4xl">
        <!-- Back button -->
        <button
          appButton
          variant="ghost"
          class="mb-6 -ml-2"
          (click)="goBack()"
        >
          ← Back to Sessions
        </button>

        @if (loading()) {
          <div class="flex justify-center py-16">
            <app-spinner class="h-8 w-8 text-accent-primary" />
          </div>
        } @else if (session()) {
          <!-- Header -->
          <div class="mb-6 flex flex-wrap items-center gap-3">
            <h1 class="text-xl font-semibold text-text-primary">
              {{ formatDate(session()!.started_at) }}
            </h1>
            <span class="font-mono text-sm text-text-muted">
              {{ formatDuration(session()!.duration_seconds) }}
            </span>
            <app-badge [variant]="statusVariant(session()!.status)">
              {{ session()!.status }}
            </app-badge>
          </div>

          <!-- Two-column layout -->
          <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
            <!-- Main: transcript -->
            <div class="md:col-span-2">
              <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
                Transcript
              </h2>
              <div class="rounded-lg border border-border-default bg-bg-surface p-5">
                @if (session()!.status === 'processing') {
                  <div class="flex items-center gap-3 text-text-muted">
                    <app-spinner class="h-5 w-5" />
                    <span class="text-sm">Transcript is being generated…</span>
                  </div>
                } @else if (session()!.status === 'failed') {
                  <p class="text-sm text-state-error">Transcript unavailable.</p>
                } @else if (session()!.transcript) {
                  <p class="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
                    {{ session()!.transcript }}
                  </p>
                } @else {
                  <p class="text-sm text-text-muted">No transcript available.</p>
                }
              </div>
            </div>

            <!-- Side: audio player -->
            <div class="md:sticky md:top-6 md:self-start">
              <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
                Recording
              </h2>
              <div class="rounded-lg border border-border-default bg-bg-surface p-4">
                @if (session()!.audio_url) {
                  <audio
                    controls
                    class="w-full"
                    [src]="session()!.audio_url!"
                  ></audio>
                } @else {
                  <p class="text-sm text-text-muted">Audio not yet available.</p>
                }
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class SessionDetailPage {
  private readonly sessionApi = inject(SessionApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly session = signal<SessionOut | null>(null);
  protected readonly loading = signal(true);

  protected readonly formatDate = formatDate;
  protected readonly formatDuration = formatDuration;

  constructor() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.sessionApi.getSession(id).subscribe({
      next: (s) => {
        this.session.set(s);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.toast.error('Could not load session', { description: apiErrorMessage(err) });
        void this.router.navigateByUrl('/sessions');
      },
    });
  }

  protected statusVariant(status: string): 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive' {
    return STATUS_VARIANT[status] ?? 'outline';
  }

  protected goBack(): void {
    void this.router.navigateByUrl('/sessions');
  }
}
