import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { cn } from '@app/core/utils/tailwind.utils';

/**
 * Scrollable region with a slim, theme-aware scrollbar. The viewport lives in
 * the component template, so the scoped `::-webkit-scrollbar` rules below
 * apply only here; the thumb reads `--border-default` and re-themes in dark
 * mode. Give the host a height (e.g. `class="h-72"`) to enable scrolling.
 */
@Component({
  selector: 'app-scroll-area',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ui-scroll-viewport h-full w-full overflow-auto rounded-[inherit]">
      <ng-content />
    </div>
  `,
  styles: [
    `
      .ui-scroll-viewport {
        scrollbar-width: thin;
        scrollbar-color: var(--border-default) transparent;
      }
      .ui-scroll-viewport::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      .ui-scroll-viewport::-webkit-scrollbar-track {
        background: transparent;
      }
      .ui-scroll-viewport::-webkit-scrollbar-thumb {
        background-color: var(--border-default);
        border-radius: 9999px;
      }
    `,
  ],
  host: { '[class]': 'classes()' },
})
export class ScrollArea {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('relative block overflow-hidden', this.userClass()),
  );
}
