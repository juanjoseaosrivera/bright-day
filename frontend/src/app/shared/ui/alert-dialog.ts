import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  inject,
  input,
  model,
} from '@angular/core';

import { cn } from '@app/core/utils/tailwind.utils';

/**
 * Alert dialog — an interruptive confirmation that demands an explicit choice.
 * Unlike `app-dialog`, it does NOT dismiss on backdrop click or Escape; the
 * consumer wires Action/Cancel. Two-way bindable via `[(open)]`.
 */
@Component({
  selector: 'app-alert-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"></div>
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div role="alertdialog" aria-modal="true" [class]="panelClasses()">
          <ng-content />
        </div>
      </div>
    }
  `,
})
export class AlertDialog {
  readonly open = model(false);
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly panelClasses = computed(() =>
    cn(
      'relative w-full max-w-lg rounded-3xl border border-border-default bg-bg-surface p-6 text-text-primary shadow-lg',
      this.userClass(),
    ),
  );

  close(): void {
    if (this.open()) this.open.set(false);
  }
}

/** Dismisses the alert dialog (Cancel affordance). */
@Directive({
  selector: '[appAlertDialogCancel]',
  host: { '(click)': 'dialog.close()' },
})
export class AlertDialogCancel {
  protected readonly dialog = inject(AlertDialog);
}

@Component({
  selector: 'app-alert-dialog-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'classes()' },
})
export class AlertDialogHeader {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('flex flex-col gap-2 text-left', this.userClass()),
  );
}

@Component({
  selector: 'app-alert-dialog-title',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'classes()' },
})
export class AlertDialogTitle {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('text-lg font-semibold leading-none tracking-tight', this.userClass()),
  );
}

@Component({
  selector: 'app-alert-dialog-description',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'classes()' },
})
export class AlertDialogDescription {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('text-sm text-text-muted', this.userClass()));
}

@Component({
  selector: 'app-alert-dialog-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'classes()' },
})
export class AlertDialogFooter {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', this.userClass()),
  );
}
