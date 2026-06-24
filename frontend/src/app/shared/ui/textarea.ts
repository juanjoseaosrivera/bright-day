import { computed, Directive, input } from '@angular/core';

import { cn } from '@app/core/utils/tailwind.utils';

const BASE =
  'flex min-h-20 w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary shadow-sm transition-colors placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:cursor-not-allowed disabled:opacity-50';

/** Styles a native `<textarea>` element, shadcn-style. */
@Directive({
  selector: 'textarea[appTextarea]',
  host: { '[class]': 'classes()' },
})
export class Textarea {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn(BASE, this.userClass()));
}
