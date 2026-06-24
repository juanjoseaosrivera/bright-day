import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { cn } from '@app/core/utils/tailwind.utils';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning';

const VARIANTS: Record<BadgeVariant, string> = {
  default: 'border-transparent bg-accent-primary text-white',
  secondary: 'border-transparent bg-accent-subtle text-accent-hover',
  destructive: 'border-transparent bg-state-error text-white',
  outline: 'border-border-default text-text-primary',
  success: 'border-transparent bg-state-success text-white',
  warning: 'border-transparent bg-state-warning text-white',
};

const BASE =
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors';

@Component({
  selector: 'app-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'classes()' },
})
export class Badge {
  readonly variant = input<BadgeVariant>('default');
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly classes = computed(() => cn(BASE, VARIANTS[this.variant()], this.userClass()));
}
