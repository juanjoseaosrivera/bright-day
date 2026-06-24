import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronsUpDown } from '@ng-icons/lucide';

import { cn } from '@app/core/utils/tailwind.utils';

import { Input } from './input';

export interface ComboboxOption {
  readonly label: string;
  readonly value: string;
}

/**
 * Combobox — a button trigger that opens a searchable, single-select popover.
 * Two-way bindable via `[(value)]`. State (open/query) is held in signals, so
 * it behaves correctly under zoneless change detection. An invisible backdrop
 * layer handles click-outside dismissal.
 */
@Component({
  selector: 'app-combobox',
  imports: [NgIcon, Input],
  providers: [provideIcons({ lucideCheck, lucideChevronsUpDown })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative">
      <button
        type="button"
        [class]="triggerClasses()"
        [attr.aria-expanded]="open()"
        (click)="toggle()"
      >
        <span [class.text-text-muted]="!selectedLabel()">
          {{ selectedLabel() ?? placeholder() }}
        </span>
        <ng-icon name="lucideChevronsUpDown" class="shrink-0 opacity-60" aria-hidden="true" />
      </button>

      @if (open()) {
        <div class="fixed inset-0 z-40" (click)="open.set(false)"></div>
        <div
          role="listbox"
          class="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border-default bg-bg-surface p-1 shadow-lg"
        >
          <input
            appInput
            class="mb-1 h-9 border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            type="text"
            [value]="query()"
            [placeholder]="searchPlaceholder()"
            (input)="onQuery($event)"
          />
          <div class="max-h-60 overflow-auto">
            @for (option of filtered(); track option.value) {
              <button
                type="button"
                role="option"
                [attr.aria-selected]="option.value === value()"
                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary transition-colors hover:bg-bg-base focus-visible:outline-none focus-visible:bg-bg-base"
                (click)="select(option)"
              >
                <ng-icon
                  name="lucideCheck"
                  size="0.875rem"
                  class="shrink-0 text-accent-primary"
                  [class.opacity-0]="option.value !== value()"
                  aria-hidden="true"
                />
                <span class="truncate">{{ option.label }}</span>
              </button>
            } @empty {
              <div class="px-2 py-6 text-center text-sm text-text-muted">
                {{ emptyText() }}
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  host: { '[class]': 'classes()' },
})
export class Combobox {
  readonly options = input<readonly ComboboxOption[]>([]);
  readonly value = model<string | null>(null);
  readonly placeholder = input<string>('Select an option');
  readonly searchPlaceholder = input<string>('Search…');
  readonly emptyText = input<string>('No results found.');
  readonly userClass = input<string>('', { alias: 'class' });

  protected readonly open = signal(false);
  protected readonly query = signal('');

  protected readonly classes = computed(() => cn('block w-full', this.userClass()));

  protected readonly triggerClasses = computed(() =>
    cn(
      'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary shadow-sm transition-colors hover:bg-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
    ),
  );

  protected readonly selectedLabel = computed(() => {
    const current = this.value();
    return this.options().find((o) => o.value === current)?.label ?? null;
  });

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.options();
    return this.options().filter((o) => o.label.toLowerCase().includes(q));
  });

  protected toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) this.query.set('');
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected select(option: ComboboxOption): void {
    this.value.set(option.value);
    this.open.set(false);
    this.query.set('');
  }
}
