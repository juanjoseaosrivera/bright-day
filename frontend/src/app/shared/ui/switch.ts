import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

import { cn } from '@app/core/utils/tailwind.utils';

/**
 * Toggle switch. Two-way bindable via `[(checked)]`; renders as a native
 * `<button>` so Space/Enter toggle it for free. The accent token marks the
 * "on" state.
 */
@Component({
  selector: 'button[appSwitch]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="pointer-events-none block h-5 w-5 rounded-full bg-bg-surface shadow-sm transition-transform"
      [class.translate-x-5]="checked()"
      [class.translate-x-0]="!checked()"
    ></span>
  `,
  host: {
    type: 'button',
    role: 'switch',
    '[attr.aria-checked]': 'checked()',
    '[disabled]': 'disabled() || null',
    '[class]': 'classes()',
    '(click)': 'toggle()',
  },
})
export class Switch {
  readonly checked = model(false);
  readonly disabled = input(false);
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly classes = computed(() =>
    cn(
      'inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:cursor-not-allowed disabled:opacity-50',
      this.checked() ? 'bg-accent-primary' : 'bg-border-default',
      this.userClass(),
    ),
  );

  protected toggle(): void {
    if (this.disabled()) return;
    this.checked.set(!this.checked());
  }
}
