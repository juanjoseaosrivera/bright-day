import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { cn } from '@app/core/utils/tailwind.utils';

/**
 * Card surface family. Per ui-context, cards use `rounded-2xl` on the
 * `--bg-surface` token and lean on `--border-default` + a soft shadow for
 * separation rather than hard borders.
 */
@Component({
  selector: 'app-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'classes()' },
})
export class Card {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'block rounded-2xl border border-border-default bg-bg-surface text-text-primary shadow-sm',
      this.userClass(),
    ),
  );
}

@Component({
  selector: 'app-card-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'classes()' },
})
export class CardHeader {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('flex flex-col gap-1.5 p-6', this.userClass()));
}

@Component({
  selector: 'app-card-title',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'classes()' },
})
export class CardTitle {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('text-lg font-semibold leading-none tracking-tight', this.userClass()),
  );
}

@Component({
  selector: 'app-card-description',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'classes()' },
})
export class CardDescription {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('text-sm text-text-muted', this.userClass()));
}

@Component({
  selector: 'app-card-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'classes()' },
})
export class CardContent {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('block p-6 pt-0', this.userClass()));
}

@Component({
  selector: 'app-card-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { '[class]': 'classes()' },
})
export class CardFooter {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('flex items-center p-6 pt-0', this.userClass()));
}
