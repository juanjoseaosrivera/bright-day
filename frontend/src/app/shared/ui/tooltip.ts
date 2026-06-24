import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { cn } from '@app/core/utils/tailwind.utils';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

const SIDE: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
};

/**
 * Tooltip — wraps a trigger and reveals an inverted bubble on hover/focus.
 * Pure CSS (group-hover / group-focus-within), so it needs no JS state and
 * stays correct under zoneless change detection. The bubble uses the
 * `--text-primary` / `--bg-surface` tokens, which invert between themes for a
 * naturally contrasting tooltip.
 */
@Component({
  selector: 'app-tooltip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="group relative inline-flex">
      <ng-content />
      <span role="tooltip" [class]="bubbleClasses()">{{ content() }}</span>
    </span>
  `,
  host: { class: 'contents' },
})
export class Tooltip {
  readonly content = input.required<string>();
  readonly side = input<TooltipSide>('top');
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly bubbleClasses = computed(() =>
    cn(
      'pointer-events-none absolute z-50 w-max max-w-xs scale-95 whitespace-nowrap rounded-md bg-text-primary px-3 py-1.5 text-xs font-medium text-bg-surface opacity-0 shadow-md transition-all duration-150 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100',
      SIDE[this.side()],
      this.userClass(),
    ),
  );
}
