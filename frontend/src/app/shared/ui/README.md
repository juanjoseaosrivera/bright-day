# UI Components (`shared/ui`)

Hand-authored, shadcn-style standalone Angular primitives, themed to the
project's design tokens. Each one is standalone, `OnPush`, signal-driven, and
composes its classes through `cn()` against the tokens in
[`styles/theme.css`](../../../styles/) — so they re-theme under `.dark` with no
`dark:` literals.

> **These files are Protected.** Compose or wrap them in feature components;
> don't hand-edit the files in this folder (see
> [`ai-workflow-rules.md`](../../../../../context/ai-workflow-rules.md)). When a
> genuinely new primitive is needed, add it here following the same conventions.

## The 3 rules

1. **Import from the barrel `@app/shared/ui`** — never deep-import a file.
2. **Add the class(es) to your component's `imports: [...]`** array (standalone,
   so no NgModule).
3. **Override styles via `class="…"`** on any of them — it flows through `cn()`,
   so `tailwind-merge` resolves conflicts (e.g. `class="w-full"` wins over a
   default width).

`<app-toaster>` is already mounted once in the app shell (`app.ts`), so toasts
work app-wide with no extra setup.

### Minimal example

```ts
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@app/shared/ui';

@Component({
  selector: 'app-example',
  imports: [Button, Card, CardHeader, CardTitle, CardContent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card class="max-w-md">
      <app-card-header><app-card-title>Welcome back</app-card-title></app-card-header>
      <app-card-content>
        <button appButton variant="default" (click)="count.update(c => c + 1)">
          Clicked {{ count() }}×
        </button>
      </app-card-content>
    </app-card>
  `,
})
export class Example {
  readonly count = signal(0);
}
```

## Two flavors: directives vs. components

**Directives** style a *native element* — keep using the real tag and its
attributes:

| Use      | Markup                                                       |
| -------- | ----------------------------------------------------------- |
| Button   | `<button appButton variant="default" size="lg" [loading]="busy()">Save</button>` |
| Input    | `<input appInput type="email" [(ngModel)]="email" />`       |
| Textarea | `<textarea appTextarea rows="4"></textarea>`                |
| Checkbox | `<button appCheckbox [(checked)]="agreed"></button>`        |
| Switch   | `<button appSwitch [(checked)]="darkMode"></button>`        |
| Table    | `<table appTable>…<tr appTableRow><td appTableCell>…`        |

**Components** are `<app-*>` elements with content projection: `app-card`,
`app-dialog`, `app-alert-dialog`, `app-tabs`, `app-scroll-area`, `app-badge`,
`app-combobox`, `app-spinner`, `app-tooltip`, `app-toaster`.

## Component reference

### Button

`variant`: `default | secondary | destructive | outline | ghost | link` ·
`size`: `default | sm | lg | icon` · `[loading]`, `[disabled]`.
A `buttonVariants({ variant, size, class })` helper is exported to style an
`<a>` like a button.

```html
<button appButton variant="destructive" size="sm" [loading]="saving()">Delete</button>
```

### Badge

`variant`: `default | secondary | destructive | outline | success | warning`.

```html
<app-badge variant="success">Active</app-badge>
```

### Card

Parts: `app-card` + `app-card-header`, `app-card-title`, `app-card-description`,
`app-card-content`, `app-card-footer`.

### Dialog

Two-way `[(open)]`; closes on backdrop click / Escape. Parts:
`app-dialog-header`, `-title`, `-description`, `-footer`. Put `appDialogClose`
on a button to close it.

```html
<button appButton (click)="open.set(true)">Open</button>
<app-dialog [(open)]="open">
  <app-dialog-header><app-dialog-title>End session?</app-dialog-title></app-dialog-header>
  <app-dialog-footer>
    <button appButton variant="outline" appDialogClose>Cancel</button>
    <button appButton variant="destructive" (click)="end()">End</button>
  </app-dialog-footer>
</app-dialog>
```

### Alert Dialog

Like Dialog but *interruptive*: does **not** close on backdrop/Escape. Wire
`appAlertDialogCancel` on the cancel button; same `-header/-title/-description/-footer`
parts.

### Tabs

Root holds `[(value)]`; triggers are `button appTabsTrigger value="…"`, panels
are `app-tabs-content value="…"`.

```html
<app-tabs [(value)]="tab">
  <app-tabs-list>
    <button appTabsTrigger value="history">History</button>
    <button appTabsTrigger value="diary">Diary</button>
  </app-tabs-list>
  <app-tabs-content value="history">…</app-tabs-content>
  <app-tabs-content value="diary">…</app-tabs-content>
</app-tabs>
```

### Combobox

Searchable single-select. `[options]` is `{ label, value }[]`, two-way
`[(value)]`, plus `placeholder`, `searchPlaceholder`, `emptyText`.

```html
<app-combobox [options]="moods" [(value)]="selectedMood" placeholder="Pick a mood" />
```

### Checkbox / Switch

Both `[(checked)]` + `[disabled]`.

### ScrollArea

Give the host a height: `<app-scroll-area class="h-72">…</app-scroll-area>`.
Wrap a `<table appTable>` in it for overflow.

### Table

Directive set on native elements: `appTable`, `appTableHeader`, `appTableBody`,
`appTableFooter`, `appTableRow`, `appTableHead` (th), `appTableCell` (td),
`appTableCaption`. This is the styled *foundation* — build sorting, paging, and
selection in your feature component on top of it.

### Spinner

`<app-spinner size="1.5rem" />` (NgIcon size token, e.g. `1rem`, `1.25rem`).

### Tooltip

Wraps a trigger; `content` required, `side`: `top | bottom | left | right`
(pure CSS, hover/focus).

```html
<app-tooltip content="Start a voice session" side="bottom">
  <button appButton size="icon">▶</button>
</app-tooltip>
```

### Sonner (toasts)

Inject `ToastService` and call `success / error / warning / message(title, {
description?, duration? })`. No template needed — `<app-toaster>` is mounted in
the app shell. `duration: 0` keeps a toast until dismissed.

```ts
private readonly toast = inject(ToastService);
this.toast.success('Session saved', { description: 'Added to your history.' });
```

## Notes

- All style overrides go through the `class` input — don't edit the
  `shared/ui/*` files; compose/wrap them in feature components.
- The `[(ngModel)]` Input example assumes that component imports `FormsModule`.
  The Input directive only handles styling, so use it with `ngModel`, reactive
  forms, or plain `[value]` / `(input)` as you prefer.

## Full export list

Button · Card (+ parts) · Dialog (+ parts) · Input · Textarea · Tabs (+ parts) ·
ScrollArea · Table (data-table foundation) · Sonner (`ToastService` +
`<app-toaster>`) · Alert Dialog (+ parts) · Badge · Checkbox · Combobox ·
Spinner · Switch · Tooltip — all re-exported from
[`index.ts`](./index.ts).
