import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { apiErrorMessage } from '@app/core/api/http-error';
import { DiaryApi } from '@app/core/api/diary.api';
import { DiaryEntryOut } from '@app/models/diary.model';
import { Button, Input, Spinner, Textarea, ToastService } from '@app/shared/ui';

type Mode = 'create' | 'edit';

@Component({
  selector: 'app-diary-editor-page',
  imports: [Button, Input, Spinner, Textarea, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen flex-col bg-bg-base p-6">
      <div class="mx-auto w-full max-w-2xl">
        <div class="mb-6 flex items-center justify-between">
          <h1 class="text-xl font-semibold text-text-primary">
            {{ mode() === 'create' ? 'New Entry' : 'Edit Entry' }}
          </h1>
          <button
            appButton
            variant="ghost"
            (click)="cancel()"
          >
            Cancel
          </button>
        </div>

        @if (loadingEntry()) {
          <div class="flex justify-center py-16">
            <app-spinner class="h-8 w-8 text-accent-primary" />
          </div>
        } @else {
          <div class="flex flex-col gap-4">
            <input
              appInput
              type="text"
              placeholder="Title (optional)"
              [(ngModel)]="title"
              (ngModelChange)="markDirty()"
            />
            <textarea
              appTextarea
              placeholder="Write your thoughts…"
              rows="12"
              [(ngModel)]="content"
              (ngModelChange)="markDirty()"
            ></textarea>

            <button
              appButton
              class="w-full"
              [disabled]="!canSave()"
              (click)="save()"
            >
              @if (isSaving()) {
                <app-spinner class="mr-2 h-4 w-4" />
              }
              Save
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class DiaryEditorPage {
  private readonly diaryApi = inject(DiaryApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly mode = signal<Mode>('create');
  protected readonly entry = signal<DiaryEntryOut | null>(null);
  protected readonly isSaving = signal(false);
  protected readonly isDirty = signal(false);
  protected readonly loadingEntry = signal(false);

  protected title = '';
  protected content = '';

  protected readonly canSave = computed(
    () => this.isDirty() && !this.isSaving() && this.content.trim().length > 0,
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.mode.set('edit');
      this.loadingEntry.set(true);
      this.diaryApi.getEntry(id).subscribe({
        next: (e) => {
          this.entry.set(e);
          this.title = e.title ?? '';
          this.content = e.content;
          this.isDirty.set(false);
          this.loadingEntry.set(false);
        },
        error: (err: unknown) => {
          this.loadingEntry.set(false);
          this.toast.error('Could not load entry', { description: apiErrorMessage(err) });
          void this.router.navigateByUrl('/diary');
        },
      });
    }
  }

  protected markDirty(): void {
    this.isDirty.set(true);
  }

  protected cancel(): void {
    if (this.isDirty()) {
      if (!confirm('You have unsaved changes. Discard them?')) return;
    }
    const id = this.route.snapshot.paramMap.get('id');
    void this.router.navigateByUrl(id ? `/diary/${id}` : '/diary');
  }

  protected save(): void {
    if (!this.canSave()) return;
    this.isSaving.set(true);

    const body = {
      title: this.title.trim() || undefined,
      content: this.content,
    };

    const id = this.route.snapshot.paramMap.get('id');

    const req$ = id
      ? this.diaryApi.updateEntry(id, body)
      : this.diaryApi.createEntry(body);

    req$.subscribe({
      next: (saved) => {
        this.isSaving.set(false);
        this.isDirty.set(false);
        this.toast.success(id ? 'Entry updated' : 'Entry created');
        void this.router.navigateByUrl(`/diary/${saved.id}`);
      },
      error: (err: unknown) => {
        this.isSaving.set(false);
        this.toast.error('Could not save entry', { description: apiErrorMessage(err) });
      },
    });
  }
}
