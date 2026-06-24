import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck } from '@ng-icons/lucide';

import { cn } from '@app/core/utils/tailwind.utils';

/** Checkbox. Two-way bindable via `[(checked)]`; native-button keyboard. */
@Component({
  selector: 'button[appCheckbox]',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (checked()) {
      <ng-icon name="lucideCheck" size="0.875rem" aria-hidden="true" />
    }
  `,
  host: {
    type: 'button',
    role: 'checkbox',
    '[attr.aria-checked]': 'checked()',
    '[disabled]': 'disabled() || null',
    '[class]': 'classes()',
    '(click)': 'toggle()',
  },
})
export class Checkbox {
  readonly checked = model(false);
  readonly disabled = input(false);
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly classes = computed(() =>
    cn(
      'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:cursor-not-allowed disabled:opacity-50',
      this.checked()
        ? 'border-accent-primary bg-accent-primary text-white'
        : 'border-border-default bg-bg-surface',
      this.userClass(),
    ),
  );

  protected toggle(): void {
    if (this.disabled()) return;
    this.checked.set(!this.checked());
  }
}
