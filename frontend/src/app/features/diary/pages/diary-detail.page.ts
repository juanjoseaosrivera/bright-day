import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { apiErrorMessage } from '@app/core/api/http-error';
import { DiaryApi } from '@app/core/api/diary.api';
import { DiaryEntryOut } from '@app/models/diary.model';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Spinner,
  ToastService,
} from '@app/shared/ui';

function formatCreated(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatEdited(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function sameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

@Component({
  selector: 'app-diary-detail-page',
  imports: [
    Button,
    Spinner,
    AlertDialog,
    AlertDialogCancel,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-bg-base p-6">
      <div class="mx-auto max-w-2xl">
        <button
          appButton
          variant="ghost"
          class="mb-6 -ml-2"
          (click)="goBack()"
        >
          ← Back to Diary
        </button>

        @if (loading()) {
          <div class="flex justify-center py-16">
            <app-spinner class="h-8 w-8 text-accent-primary" />
          </div>
        } @else if (entry()) {
          <!-- Header row -->
          <div class="mb-2 flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <h1 class="text-xl font-semibold text-text-primary">
                @if (entry()!.title) {
                  {{ entry()!.title }}
                } @else {
                  <span class="text-text-muted">Untitled Entry</span>
                }
              </h1>
              <p class="mt-1 font-mono text-xs text-text-muted">
                {{ formatCreated(entry()!.created_at) }}
              </p>
              @if (!sameDay(entry()!.created_at, entry()!.updated_at)) {
                <p class="font-mono text-xs text-text-muted">
                  Edited {{ formatEdited(entry()!.updated_at) }}
                </p>
              }
            </div>

            <!-- Action buttons -->
            <div class="flex shrink-0 items-center gap-2">
              <button
                appButton
                variant="ghost"
                class="p-2"
                title="Edit entry"
                (click)="goToEdit()"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                appButton
                variant="ghost"
                class="p-2 text-state-error hover:bg-state-error/10"
                title="Delete entry"
                (click)="confirmDelete.set(true)"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Content -->
          <div class="mt-6 rounded-lg border border-border-default bg-bg-surface p-5">
            <p class="whitespace-pre-wrap font-sans text-sm leading-relaxed text-text-primary">
              {{ entry()!.content }}
            </p>
          </div>
        }
      </div>
    </div>

    <!-- Delete confirmation dialog -->
    <app-alert-dialog [(open)]="confirmDelete">
      <app-alert-dialog-header>
        <app-alert-dialog-title>Delete this entry?</app-alert-dialog-title>
        <app-alert-dialog-description>
          This cannot be undone.
        </app-alert-dialog-description>
      </app-alert-dialog-header>
      <app-alert-dialog-footer>
        <button appButton variant="ghost" appAlertDialogCancel>Cancel</button>
        <button
          appButton
          variant="destructive"
          [disabled]="isDeleting()"
          (click)="deleteEntry()"
        >
          @if (isDeleting()) {
            <app-spinner class="mr-2 h-4 w-4" />
          }
          Delete
        </button>
      </app-alert-dialog-footer>
    </app-alert-dialog>
  `,
})
export class DiaryDetailPage {
  private readonly diaryApi = inject(DiaryApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly entry = signal<DiaryEntryOut | null>(null);
  protected readonly loading = signal(true);
  protected readonly confirmDelete = signal(false);
  protected readonly isDeleting = signal(false);

  protected readonly formatCreated = formatCreated;
  protected readonly formatEdited = formatEdited;
  protected readonly sameDay = sameDay;

  constructor() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.diaryApi.getEntry(id).subscribe({
      next: (e) => {
        this.entry.set(e);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.toast.error('Could not load entry', { description: apiErrorMessage(err) });
        void this.router.navigateByUrl('/diary');
      },
    });
  }

  protected goBack(): void {
    void this.router.navigateByUrl('/diary');
  }

  protected goToEdit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    void this.router.navigateByUrl(`/diary/${id}/edit`);
  }

  protected deleteEntry(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.isDeleting.set(true);
    this.diaryApi.deleteEntry(id).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.confirmDelete.set(false);
        this.toast.success('Entry deleted');
        void this.router.navigateByUrl('/diary');
      },
      error: (err: unknown) => {
        this.isDeleting.set(false);
        this.toast.error('Could not delete entry', { description: apiErrorMessage(err) });
      },
    });
  }
}
