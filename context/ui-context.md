# UI Context

## Theme

Light, calm, and warm — the visual language of a wellbeing
companion, not a technical dashboard. Soft off-white
backgrounds, gently layered surfaces, generous whitespace,
and a single soothing accent (calm teal/green) reserved for
primary actions and the live-session state. The goal is to
lower cognitive load and feel safe: rounded corners, soft
shadows over hard borders, and quiet, low-contrast secondary
text. No harsh pure-black-on-white, no aggressive reds except
for genuine error/destructive states.

Dark mode preserves this calm, warm character — it is not a
pure-black inversion. Deep desaturated charcoal-greens replace
the off-whites, surfaces stay gently layered, and the teal
accent is lifted slightly in lightness to hold contrast on
dark surfaces. Components reference tokens only, so the same
markup renders in either mode (see Dark Mode below).

## Colors

Defined as CSS custom properties and exposed to Tailwind v4
via `@theme`. All components must use these tokens — no
hardcoded hex values.

| Role            | CSS Variable       | Value     |
| --------------- | ------------------ | --------- |
| Page background | `--bg-base`        | `#F7F6F2` |
| Surface         | `--bg-surface`     | `#FFFFFF` |
| Primary text    | `--text-primary`   | `#1F2A2E` |
| Muted text      | `--text-muted`     | `#6B7A80` |
| Primary accent  | `--accent-primary` | `#3FA796` |
| Border          | `--border-default` | `#E4E2DB` |
| Error           | `--state-error`    | `#D9534F` |
| Success         | `--state-success`  | `#4C9A75` |

Supporting state tokens (for the live voice session and
mood logging):

| Role               | CSS Variable        | Value     |
| ------------------ | ------------------- | --------- |
| Accent (hover)     | `--accent-hover`    | `#34897A` |
| Accent (soft fill) | `--accent-subtle`   | `#E3F1EE` |
| Recording / live   | `--state-recording` | `#E0795B` |
| Warning / quota    | `--state-warning`   | `#E0A458` |

## Dark Mode

Applied via a `.dark` class on the document root (or
`prefers-color-scheme`), overriding the same CSS custom
properties. Components never branch on theme — they read
tokens, and the tokens swap. No hardcoded hex, no `dark:`
color literals in components.

Core tokens:

| Role            | CSS Variable       | Value     |
| --------------- | ------------------ | --------- |
| Page background | `--bg-base`        | `#14181A` |
| Surface         | `--bg-surface`     | `#1C2225` |
| Primary text    | `--text-primary`   | `#ECEFEE` |
| Muted text      | `--text-muted`     | `#9AA8AD` |
| Primary accent  | `--accent-primary` | `#4FB8A6` |
| Border          | `--border-default` | `#2C3438` |
| Error           | `--state-error`    | `#E5736F` |
| Success         | `--state-success`  | `#5FAE89` |

Supporting state tokens:

| Role               | CSS Variable        | Value     |
| ------------------ | ------------------- | --------- |
| Accent (hover)     | `--accent-hover`    | `#5FC7B5` |
| Accent (soft fill) | `--accent-subtle`   | `#1E3A36` |
| Recording / live   | `--state-recording` | `#E88A6E` |
| Warning / quota    | `--state-warning`   | `#E5B26B` |

Notes:

- Surfaces lighten as they stack (base → surface) rather than
  using shadows, which read poorly on dark backgrounds; lean
  on `--border-default` and surface elevation for separation.
- Keep secondary text at `--text-muted` for low contrast, but
  verify it still clears WCAG AA (4.5:1) on `--bg-surface`.
- The recording/live and warning hues stay warm and only
  marginally brighter, so the live-session state remains
  unmistakable without glowing.

## Typography

| Role      | Font                    | Variable      |
| --------- | ----------------------- | ------------- |
| UI text   | Inter (sans-serif)      | `--font-sans` |
| Code/mono | JetBrains Mono          | `--font-mono` |

Use `--font-sans` for all product UI, including session
transcripts and diary text. `--font-mono` is reserved for
timestamps, durations, and any technical/debug surfaces.

## Border Radius

| Context           | Class          |
| ----------------- | -------------- |
| Inline / small UI | `rounded-md`   |
| Cards / panels    | `rounded-2xl`  |
| Modals / overlays | `rounded-3xl`  |
| Pills / icons     | `rounded-full` |

## Component Library

shadcn-style primitives on top of Tailwind v4, living in
`frontend/src/app/shared/ui/` and re-exported from
`shared/ui/index.ts`. Because shadcn/ui has no native Angular
generator (its CLI emits React), these are hand-authored as
standalone, OnPush, signal-driven Angular components that
reproduce the shadcn look against our theme tokens. Each one
composes classes through `cn()`
(`core/utils/tailwind.utils.ts`), references colour tokens only
(no hardcoded hex, no `dark:` literals), and accepts consumer
overrides via a `class` input that flows through `cn()` so
`tailwind-merge` resolves conflicts. Icons come from
`@ng-icons/lucide` (stroke-based Lucide).

Treat `shared/ui/*` as Protected (see `ai-workflow-rules.md`):
wrap or compose these primitives in feature components rather
than editing them directly. When a genuinely new primitive is
needed, add it here following the same conventions; everyday
feature work should compose the existing set.

Available primitives: Button, Card, Dialog, Input, Textarea,
Tabs, ScrollArea, Table (the styled foundation for data
tables), Sonner (`ToastService` + `<app-toaster>`), Alert
Dialog, Badge, Checkbox, Combobox, Spinner, Switch, Tooltip.

## Layout Patterns

- **App shell**: fixed top navbar (logo, nav, account menu)
  with a soft bottom border; content area max-width centered
  with comfortable horizontal padding.
- **Dashboard**: responsive card grid — top-3 behavioral
  patterns, last-session overview, and the daily-mood logger
  as distinct surface cards on `--bg-surface`.
- **Voice session**: full-viewport focused view, minimal
  chrome, a single large central control (Start / End) whose
  visual state reflects connecting → connected/recording →
  processing; the `--state-recording` color signals the live
  state.
- **History & diary lists**: single-column chronological
  lists (newest first) of tappable cards; detail views open
  in a dedicated route, not a modal.
- **Session detail**: transcript column paired with a sticky
  audio player.
- **Modals**: centered overlay with a soft backdrop blur,
  used only for short confirmations (e.g. end-session,
  destructive actions).

## Responsive Strategy

Mobile-first. Author base styles for small screens and layer
larger layouts with `min-width` breakpoints, per
`code-standards.md`. The voice session and mood logging must
be fully usable on mobile.

## Icons

Lucide (stroke-based icons only). Sizes: `h-4 w-4` for inline
text, `h-5 w-5` for buttons and nav. Mood logging uses a
small fixed set of expressive mood icons mapped to the daily
mood scale.
