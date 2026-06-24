import { computed, Directive, input } from '@angular/core';

import { cn } from '@app/core/utils/tailwind.utils';

/**
 * Table primitives — the styled foundation a feature-level data table
 * (sorting, paging, selection) composes on top of. Each is a directive on the
 * matching native element, so semantics (`thead`/`tbody`/`tr`/`th`/`td`) stay
 * intact. Wrap a `<table appTable>` in `<app-scroll-area>` for overflow.
 */
@Directive({
  selector: 'table[appTable]',
  host: { '[class]': 'classes()' },
})
export class Table {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('w-full caption-bottom text-sm text-text-primary', this.userClass()),
  );
}

@Directive({
  selector: 'thead[appTableHeader]',
  host: { '[class]': 'classes()' },
})
export class TableHeader {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('[&_tr]:border-b [&_tr]:border-border-default', this.userClass()),
  );
}

@Directive({
  selector: 'tbody[appTableBody]',
  host: { '[class]': 'classes()' },
})
export class TableBody {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('[&_tr:last-child]:border-0', this.userClass()));
}

@Directive({
  selector: 'tfoot[appTableFooter]',
  host: { '[class]': 'classes()' },
})
export class TableFooter {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('border-t border-border-default bg-bg-base/50 font-medium', this.userClass()),
  );
}

@Directive({
  selector: 'tr[appTableRow]',
  host: { '[class]': 'classes()' },
})
export class TableRow {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'border-b border-border-default transition-colors hover:bg-bg-base/60 data-[state=selected]:bg-accent-subtle',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: 'th[appTableHead]',
  host: { '[class]': 'classes()' },
})
export class TableHead {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('h-12 px-4 text-left align-middle font-medium text-text-muted', this.userClass()),
  );
}

@Directive({
  selector: 'td[appTableCell]',
  host: { '[class]': 'classes()' },
})
export class TableCell {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('p-4 align-middle', this.userClass()));
}

@Directive({
  selector: 'caption[appTableCaption]',
  host: { '[class]': 'classes()' },
})
export class TableCaption {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('mt-4 text-sm text-text-muted', this.userClass()));
}
