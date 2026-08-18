import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { apiErrorMessage } from '@app/core/api/http-error';
import { DiaryApi } from '@app/core/api/diary.api';
import { DiaryEntryListItem } from '@app/models/diary.model';
import {
  Button,
  Card,
  CardContent,
  Spinner,
  ToastService,
} from '@app/shared/ui';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

@Component({
  selector: 'app-diary-list-page',
  imports: [Button, Card, CardContent, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen flex-col bg-bg-base p-6">
      <div class="mx-auto w-full max-w-2xl">
        <div class="mb-6 flex items-center justify-between">
          <h1 class="text-2xl font-semibold text-text-primary">My Diary</h1>
          <button appButton (click)="goToNew()">New Entry</button>
        </div>

        @if (loading()) {
          <div class="flex justify-center py-16">
            <app-spinner class="h-8 w-8 text-accent-primary" />
          </div>
        } @else if (entries().length === 0) {
          <div class="flex flex-col items-center gap-4 py-20 text-center">
            <p class="text-text-muted">No entries yet. Start writing your first entry.</p>
            <button appButton (click)="goToNew()">New Entry</button>
          </div>
        } @else {
          <div class="flex flex-col gap-3">
            @for (entry of entries(); track entry.id) {
              <app-card
                class="cursor-pointer transition-shadow hover:shadow-md"
                (click)="goToDetail(entry.id)"
              >
                <app-card-content class="flex items-center gap-4 py-4">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-semibold text-text-primary">
                      {{ entry.title ?? entry.content_preview }}
                    </p>
                    @if (entry.title) {
                      <p class="mt-0.5 line-clamp-2 text-xs text-text-muted">
                        {{ entry.content_preview }}
                      </p>
                    }
                    <p class="mt-1 font-mono text-xs text-text-muted">
                      {{ formatDate(entry.created_at) }}
                    </p>
                  </div>
                  <svg
                    class="h-4 w-4 shrink-0 text-text-muted"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </app-card-content>
              </app-card>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class DiaryListPage {
  private readonly diaryApi = inject(DiaryApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly entries = signal<DiaryEntryListItem[]>([]);
  protected readonly loading = signal(true);

  protected readonly formatDate = formatDate;

  constructor() {
    this.diaryApi.listEntries().subscribe({
      next: (list) => {
        this.entries.set(list);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.toast.error('Could not load diary entries', { description: apiErrorMessage(err) });
      },
    });
  }

  protected goToDetail(id: string): void {
    void this.router.navigateByUrl(`/diary/${id}`);
  }

  protected goToNew(): void {
    void this.router.navigateByUrl('/diary/new');
  }
}
