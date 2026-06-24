import { computed, Directive, input } from '@angular/core';

import { cn } from '@app/core/utils/tailwind.utils';

const BASE =
  'flex h-10 w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary shadow-sm transition-colors placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-text-primary';

/** Styles a native `<input>` element, shadcn-style. */
@Directive({
  selector: 'input[appInput]',
  host: { '[class]': 'classes()' },
})
export class Input {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn(BASE, this.userClass()));
}
