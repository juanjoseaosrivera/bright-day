import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injectable,
  input,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideCircleCheck,
  lucideInfo,
  lucideTriangleAlert,
  lucideX,
} from '@ng-icons/lucide';

import { cn } from '@app/core/utils/tailwind.utils';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning';

export interface Toast {
  readonly id: number;
  readonly title: string;
  readonly description?: string;
  readonly variant: ToastVariant;
}

export interface ToastOptions {
  readonly description?: string;
  /** Auto-dismiss delay in ms; `0` keeps the toast until dismissed. */
  readonly duration?: number;
}

const DEFAULT_DURATION = 4000;

/**
 * Toast notifications, sonner-style. Inject `ToastService` anywhere and call
 * `success` / `error` / `warning` / `message`; render `<app-toaster />` once
 * near the app root. State is a signal, so toasts surface without zones.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly list = signal<Toast[]>([]);
  private seq = 0;

  /** Live, read-only view of the active toasts. */
  readonly toasts = this.list.asReadonly();

  message(title: string, options?: ToastOptions): number {
    return this.push(title, 'default', options);
  }

  success(title: string, options?: ToastOptions): number {
    return this.push(title, 'success', options);
  }

  error(title: string, options?: ToastOptions): number {
    return this.push(title, 'error', options);
  }

  warning(title: string, options?: ToastOptions): number {
    return this.push(title, 'warning', options);
  }

  dismiss(id: number): void {
    this.list.update((toasts) => toasts.filter((t) => t.id !== id));
  }

  private push(title: string, variant: ToastVariant, options?: ToastOptions): number {
    const id = ++this.seq;
    this.list.update((toasts) => [
      ...toasts,
      { id, title, description: options?.description, variant },
    ]);

    const duration = options?.duration ?? DEFAULT_DURATION;
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
    return id;
  }
}

const VARIANT_ICON: Record<ToastVariant, string> = {
  default: 'lucideInfo',
  success: 'lucideCircleCheck',
  error: 'lucideCircleAlert',
  warning: 'lucideTriangleAlert',
};

const VARIANT_ICON_COLOR: Record<ToastVariant, string> = {
  default: 'text-text-muted',
  success: 'text-state-success',
  error: 'text-state-error',
  warning: 'text-state-warning',
};

@Component({
  selector: 'app-toaster',
  imports: [NgIcon],
  providers: [
    provideIcons({
      lucideCircleCheck,
      lucideCircleAlert,
      lucideTriangleAlert,
      lucideInfo,
      lucideX,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end sm:max-w-sm"
    >
      @for (toast of toasts(); track toast.id) {
        <div role="status" [class]="toastClasses()">
          <ng-icon
            [name]="icon(toast.variant)"
            size="1.125rem"
            class="mt-0.5 shrink-0"
            [class]="iconColor(toast.variant)"
            aria-hidden="true"
          />
          <div class="flex-1">
            <p class="text-sm font-medium text-text-primary">{{ toast.title }}</p>
            @if (toast.description) {
              <p class="mt-1 text-sm text-text-muted">{{ toast.description }}</p>
            }
          </div>
          <button
            type="button"
            class="shrink-0 rounded-md text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            aria-label="Dismiss"
            (click)="dismiss(toast.id)"
          >
            <ng-icon name="lucideX" size="0.875rem" aria-hidden="true" />
          </button>
        </div>
      }
    </div>
  `,
  host: { class: 'contents' },
})
export class Toaster {
  private readonly service = inject(ToastService);

  /** Extra classes applied to each toast card. */
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly toasts = this.service.toasts;

  protected readonly toastClasses = computed(() =>
    cn(
      'pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-border-default bg-bg-surface p-4 shadow-lg',
      this.userClass(),
    ),
  );

  protected icon(variant: ToastVariant): string {
    return VARIANT_ICON[variant];
  }

  protected iconColor(variant: ToastVariant): string {
    return VARIANT_ICON_COLOR[variant];
  }

  protected dismiss(id: number): void {
    this.service.dismiss(id);
  }
}
