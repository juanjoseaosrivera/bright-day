Read `CLAUDE.md` before starting.

We're building the last client-facing piece: the **public home page**
at `/`. All product features (auth → subscription → sessions → diary →
insights → dashboard) are already implemented. This spec replaces the
incremental placeholder in `home.page.ts` with a polished marketing
page that completes the product's user journey and gives new visitors
a clear path to sign up.

No backend changes. Frontend only.

---

## What Changes

`features/home/pages/home.page.ts` (and its template/style files if
separated) — replace the current incremental stub with the full layout
described below. No new routes: the page already lives at `/` with no
`authGuard`.

---

## Layout & Sections

### Section 1 — Hero

Full-width, centered content. Generous vertical padding (`py-24
md:py-32`). Background: `--bg-base`.

Content (top to bottom):

- **Eyebrow**: "Your AI wellbeing companion" — `text-sm uppercase
  tracking-widest`, `--text-muted`.
- **Headline**: "Clarity starts with a conversation." — `text-4xl
  md:text-6xl font-semibold`, `--text-primary`.
- **Sub-headline**: "Voice therapy sessions, personal journaling, and
  AI-powered insights — all in one calm space." — `text-lg md:text-xl`,
  `--text-muted`, `max-w-2xl mx-auto`.
- **CTA row** (auth-aware, centered):
  - **Not authenticated**: primary Button "Get Started Free" →
    `/auth/register`; outline Button "Sign In" → `/auth/login`.
  - **Authenticated**: primary Button "Go to Dashboard" →
    `/dashboard`; outline Button "Start a Session" → `/sessions/new`.
- **Scope disclaimer** (below the buttons): "Bright Day is a
  complementary wellbeing tool and is not a substitute for
  professional mental health care." — `text-xs`, `--text-muted`,
  `max-w-md mx-auto`.

---

### Section 2 — Features

Section heading: "Everything you need to thrive" — `text-2xl
md:text-3xl font-semibold`, centered.

Four feature cards in a responsive grid (`sm:grid-cols-2
lg:grid-cols-4`, gap `gap-6`). Each card:

- `Card` primitive, `rounded-2xl`, `p-6`, centered column layout.
- Lucide icon `h-8 w-8` in `--accent-primary`, wrapped in a
  `rounded-full` `--accent-subtle` background pill (`p-3`).
- Title (`font-semibold`) and body text (`--text-muted`, `text-sm`).

| Icon (`@ng-icons/lucide`) | Title | Body |
|---|---|---|
| `lucideMic` | Voice Sessions | Talk freely in a guided, hands-free AI therapy session. |
| `lucideBookOpen` | Written Diary | Capture your thoughts privately and revisit them any time. |
| `lucideBrain` | AI Insights | Discover the behavioral patterns that shape your days. |
| `lucideSmile` | Mood Tracking | Log how you're feeling and watch your trends over time. |

---

### Section 3 — Pricing

Section heading: "Simple, flexible plans" — `text-2xl md:text-3xl
font-semibold`, centered.
Sub-heading: "Start free. Upgrade when you're ready." — `--text-muted`,
`text-lg`, centered.

Four pricing cards in a responsive grid (`sm:grid-cols-2
lg:grid-cols-4`, gap `gap-6`). The **Standard (3/week)** plan is
highlighted as "Most popular": add a `ring-2` border in
`--accent-primary` and a filled `Badge` at the top of the card.

| Plan | Sessions / week | Price label | CTA label |
|---|---|---|---|
| Free | 1 | Free forever | Get Started |
| Basic | 1 | From $X/mo | Start Basic |
| Standard | 3 | From $X/mo | Start Standard |
| Premium | 5 | From $X/mo | Start Premium |

Price amounts are static placeholder text (`"From $X/mo"`) — not
fetched from Stripe at runtime on this page.

Each card layout:
- Plan name (`font-semibold`, `text-lg`).
- Sessions-per-week `Badge` (outline).
- Price line (`text-2xl font-bold`, `--text-primary`).
- Feature list (3 bullet points, `text-sm`, `--text-muted`):
  - Free & Basic: "1 voice session per week", "Unlimited diary entries",
    "AI behavioral patterns".
  - Standard: "3 voice sessions per week", "Unlimited diary entries",
    "AI behavioral patterns".
  - Premium: "5 voice sessions per week", "Unlimited diary entries",
    "AI behavioral patterns + priority support".
- CTA Button:
  - Not authenticated → `/auth/register` for all plans.
  - Authenticated → `/subscription` for all plans.
  - Style: `variant="outline"` for all plans except Standard
    (`variant="default"` / filled primary).

---

### Section 4 — Footer

Minimal footer: `--bg-surface`, thin top border (`border-t
border-border-default`), centered, `py-8`.

Content (stacked, centered):
1. "© 2026 Bright Day. All rights reserved." — `text-sm`,
   `--text-muted`.
2. "Bright Day is not a licensed medical device and does not provide
   clinical diagnosis or treatment." — `text-xs`, `--text-muted`.

---

## Angular Implementation

### Component

Single standalone `OnPush` component. Template may be inline (if
compact) or in a separate `home.page.html` following `code-standards.md`
(inline only for small, lightweight components; this page warrants
a separate template file).

```ts
@Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, /* shared/ui primitives, NgIconComponent */],
  templateUrl: './home.page.html',
})
export class HomePage {
  protected readonly authState = inject(AuthStateService);
}
```

Injected services:
- `AuthStateService` — `isAuthenticated()` signal for CTA branching.

No API calls on init. No subscription state needed — pricing section
is static content.

### Auth-aware CTA branching

Use `@if (authState.isAuthenticated())` in the template to branch
between the two CTA sets in the Hero and in the pricing card CTAs.
No component logic required beyond the injected signal.

### Navigation

Use `RouterLink` for all internal navigation. No `window.location.href`
on this page.

### Colors and theme

All colors via CSS token utilities only (`text-text-primary`,
`text-text-muted`, `bg-bg-base`, `bg-bg-surface`,
`text-accent-primary`, `bg-accent-subtle`, `border-border-default`).
No hardcoded hex values. No `dark:` color literals — tokens remap
automatically under `.dark`.

---

## Invariants to Honor

- The home page is fully public — no `authGuard`. Accessible to
  unauthenticated visitors without any backend calls.
- Auth-state branching is client-side only via `AuthStateService.isAuthenticated()`.
- Price labels are static placeholder text — not fetched from Stripe.
- No new backend routes or domain logic is introduced in this spec.
- All `shared/ui` primitives are composed (not edited) per
  `ai-workflow-rules.md` Protected Files.
- The scope disclaimer ("not a substitute for professional mental
  health care") must appear in both the Hero and the Footer, honouring
  `project-overview.md` scope boundary and architecture invariant 6.

---

## Check When Done

- `/` renders for unauthenticated visitors: "Get Started Free" and
  "Sign In" buttons are visible; "Go to Dashboard" is absent.
- `/` renders for authenticated users: "Go to Dashboard" and
  "Start a Session" buttons are visible; "Get Started Free" is absent.
- All four feature cards render with the correct icon, title, and body.
- Four pricing cards render; Standard plan shows the "Most popular"
  ring and filled CTA button.
- Footer shows copyright and the medical disclaimer.
- No hardcoded hex values; page respects `.dark` mode via tokens.
- `npm run build` passes (frontend, zero warnings).
- `progress-tracker.md` updated to reflect the completed slice.
