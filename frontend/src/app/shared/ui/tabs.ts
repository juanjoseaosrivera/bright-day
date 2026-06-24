import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  inject,
  input,
  model,
} from '@angular/core';

import { cn } from '@app/core/utils/tailwind.utils';

/**
 * Tabs root. Owns the active value as a two-way bindable signal
 * (`[(value)]`); triggers and panels read it through element-injector DI.
 */
@Component({
  selector: 'app-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'classes()' },
})
export class Tabs {
  readonly value = model<string>('');
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly classes = computed(() => cn('block', this.userClass()));

  select(value: string): void {
    this.value.set(value);
  }

  isActive(value: string): boolean {
    return this.value() === value;
  }
}

@Component({
  selector: 'app-tabs-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { role: 'tablist', '[class]': 'classes()' },
})
export class TabsList {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'inline-flex h-10 items-center justify-center gap-1 rounded-md bg-bg-base p-1 text-text-muted',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: 'button[appTabsTrigger]',
  host: {
    type: 'button',
    role: 'tab',
    '[attr.aria-selected]': 'active()',
    '[class]': 'classes()',
    '(click)': 'tabs.select(value())',
  },
})
export class TabsTrigger {
  protected readonly tabs = inject(Tabs);
  readonly value = input.required<string>();
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly active = computed(() => this.tabs.isActive(this.value()));

  protected readonly classes = computed(() =>
    cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary disabled:pointer-events-none disabled:opacity-50',
      this.active()
        ? 'bg-bg-surface text-text-primary shadow-sm'
        : 'text-text-muted hover:text-text-primary',
      this.userClass(),
    ),
  );
}

@Component({
  selector: 'app-tabs-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (active()) {
      <ng-content />
    }
  `,
  host: {
    role: 'tabpanel',
    '[hidden]': '!active()',
    '[class]': 'classes()',
  },
})
export class TabsContent {
  protected readonly tabs = inject(Tabs);
  readonly value = input.required<string>();
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly active = computed(() => this.tabs.isActive(this.value()));
  protected readonly classes = computed(() =>
    cn(
      'mt-2 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
      this.userClass(),
    ),
  );
}
