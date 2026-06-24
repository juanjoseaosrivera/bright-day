import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  inject,
  input,
  model,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';

import { cn } from '@app/core/utils/tailwind.utils';

/**
 * Modal dialog. Two-way bindable via `[(open)]`. Centered panel over a soft
 * blurred backdrop (`rounded-3xl` per ui-context); closes on backdrop click
 * or Escape. Project `app-dialog-header` / `-footer` and friends inside.
 */
@Component({
  selector: 'app-dialog',
  imports: [NgIcon],
  providers: [provideIcons({ lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" (click)="close()"></div>
      <div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
        <div role="dialog" aria-modal="true" [class]="panelClasses()">
          <button
            type="button"
            class="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-base hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            aria-label="Close"
            (click)="close()"
          >
            <ng-icon name="lucideX" aria-hidden="true" />
          </button>
          <ng-content />
        </div>
      </div>
    }
  `,
  host: { '(document:keydown.escape)': 'close()' },
})
export class Dialog {
  readonly open = model(false);
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly panelClasses = computed(() =>
    cn(
      'pointer-events-auto relative w-full max-w-lg rounded-3xl border border-border-default bg-bg-surface p-6 text-text-primary shadow-lg',
      this.userClass(),
    ),
  );

  close(): void {
    if (this.open()) this.open.set(false);
  }
}

/** Closes the nearest dialog when clicked (e.g. a Cancel button). */
@Directive({
  selector: '[appDialogClose]',
  host: { '(click)': 'dialog.close()' },
})
export class DialogClose {
  protected readonly dialog = inject(Dialog);
}

@Component({
  selector: 'app-dialog-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'classes()' },
})
export class DialogHeader {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('flex flex-col gap-1.5 pr-8 text-left', this.userClass()),
  );
}

@Component({
  selector: 'app-dialog-title',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'classes()' },
})
export class DialogTitle {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('text-lg font-semibold leading-none tracking-tight', this.userClass()),
  );
}

@Component({
  selector: 'app-dialog-description',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'classes()' },
})
export class DialogDescription {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('text-sm text-text-muted', this.userClass()));
}

@Component({
  selector: 'app-dialog-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'classes()' },
})
export class DialogFooter {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', this.userClass()),
  );
}
