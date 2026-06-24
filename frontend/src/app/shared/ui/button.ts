import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoaderCircle } from '@ng-icons/lucide';

import { cn } from '@app/core/utils/tailwind.utils';

export type ButtonVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';

export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

/**
 * Variant/size class maps. The accent token carries primary intent and the
 * error token destructive intent; every surface/border/text colour resolves
 * through the themeable tokens in `styles/theme.css`, so buttons re-theme in
 * dark mode without `dark:` literals.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  default: 'bg-accent-primary text-white shadow-sm hover:bg-accent-hover',
  secondary: 'bg-accent-subtle text-accent-hover hover:bg-accent-subtle/70',
  destructive: 'bg-state-error text-white shadow-sm hover:bg-state-error/90',
  outline:
    'border border-border-default bg-bg-surface text-text-primary shadow-sm hover:bg-bg-base',
  ghost: 'text-text-primary hover:bg-bg-base',
  link: 'text-accent-primary underline-offset-4 hover:underline',
};

const SIZES: Record<ButtonSize, string> = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 rounded-md px-3',
  lg: 'h-11 rounded-md px-6',
  icon: 'h-10 w-10',
};

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:pointer-events-none disabled:opacity-50';

/** Compose button classes outside the component (e.g. on an anchor). */
export function buttonVariants(
  opts: { variant?: ButtonVariant; size?: ButtonSize; class?: string } = {},
): string {
  return cn(BASE, VARIANTS[opts.variant ?? 'default'], SIZES[opts.size ?? 'default'], opts.class);
}

@Component({
  selector: 'button[appButton]',
  imports: [NgIcon],
  providers: [provideIcons({ lucideLoaderCircle })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <ng-icon name="lucideLoaderCircle" class="animate-spin" aria-hidden="true" />
    }
    <ng-content />
  `,
  host: {
    '[class]': 'classes()',
    '[disabled]': 'disabled() || loading() || null',
    '[attr.aria-busy]': 'loading() || null',
  },
})
export class Button {
  readonly variant = input<ButtonVariant>('default');
  readonly size = input<ButtonSize>('default');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly classes = computed(() =>
    cn(BASE, VARIANTS[this.variant()], SIZES[this.size()], this.userClass()),
  );
}
