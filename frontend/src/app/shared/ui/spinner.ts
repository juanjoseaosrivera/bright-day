import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoaderCircle } from '@ng-icons/lucide';

import { cn } from '@app/core/utils/tailwind.utils';

/** Indeterminate loading indicator (stroke-based Lucide, spinning). */
@Component({
  selector: 'app-spinner',
  imports: [NgIcon],
  providers: [provideIcons({ lucideLoaderCircle })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <ng-icon name="lucideLoaderCircle" class="animate-spin" [size]="size()" /> `,
  host: {
    '[class]': 'classes()',
    role: 'status',
    'aria-live': 'polite',
    'aria-label': 'Loading',
  },
})
export class Spinner {
  /** NgIcon size token (e.g. `1rem`, `1.25rem`, `2rem`). */
  readonly size = input<string>('1.25rem');
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly classes = computed(() =>
    cn('inline-flex text-accent-primary', this.userClass()),
  );
}
