# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- `auth` domain slice (feature-spec `03-auth`) implemented
  front-to-back: backend `domains/auth/` (router → service →
  schema → models) wired to Supabase Auth + Supabase Postgres,
  and the frontend `features/auth/` slice (core api/interceptor/
  guard/state + register, login, email-verification, onboarding
  pages). Backend boots cleanly and `/api/v1/auth/me` returns
  401 without a valid JWT; `npm run build` passes. One step
  remains to fully verify end to end: applying the Alembic
  migration against the database (blocked locally — see Session
  Notes / Open Questions).

## Current Goal

- Finish verifying the `auth` slice end to end (apply the
  migration via an IPv4 Supabase connection, then run
  register → verify → onboarding → login), then move to the
  `subscription` domain slice.

## Completed

- Step 00 — Setup & Scaffolding:
  - [x] Frontend Angular v22 scaffold (zoneless, OnPush,
    scss, `src/assets/`, routing) + full folder tree + tooling
    (Tailwind v4, shadcn/ui config, Prettier, Stylelint,
    strict TS). `npm run build` passes; boots zoneless with a
    placeholder shell.
  - [x] Backend FastAPI scaffold (app factory, CORS, env-driven
    Settings, Alembic init) + domain/ai/worker stubs. Boots
    cleanly under Uvicorn; `GET /api/v1/health` → `200
    {"status": "ok"}`. `/docs` & `/redoc` off outside dev.

- Step 01 — Design System & UI primitives:
  - [x] `cn()` helper at `core/utils/tailwind.utils.ts`
    (clsx + tailwind-merge); `components.json` `utils` alias
    and old `core/utils/cn.ts` retired in its favour. Verified
    conflict resolution (`cn('rounded-md','rounded-3xl')` →
    `rounded-3xl`).
  - [x] Installed `@ng-icons/core` + `@ng-icons/lucide` (Lucide,
    stroke-based) and wired a global `provideNgIconsConfig({
    size: '1rem' })` default in `app.config.ts` (zoneless
    providers left intact).
  - [x] Authored all 16 spec'd primitives in `shared/ui/` as
    standalone, OnPush, signal-driven Angular components, each
    re-exported from `shared/ui/index.ts`: Button, Card (+parts),
    Dialog (+parts), Input, Textarea, Tabs (+parts), ScrollArea,
    Table primitives (Data Table foundation), Sonner
    (`ToastService` + `<app-toaster>`), Alert Dialog (+parts),
    Badge, Checkbox, Combobox, Spinner, Switch, Tooltip. All use
    `cn()` + theme tokens only (no hardcoded hex, no `dark:`
    literals); `<app-toaster>` mounted once in the app shell.
  - [x] `npm run build` passes (all primitives type-check under
    `strictTemplates`).

- Feature-spec `03-auth` — auth vertical slice:
  - Backend `app/domains/auth/`:
    - [x] `models.py` — `Profile` (PK `user_id` = Supabase auth
      user id; email, display_name, onboarding_completed,
      timestamps) and `OnboardingResponse` (1:1, FK→profile,
      concrete answer columns + `ARRAY(String)` focus_areas).
    - [x] `schemas.py` — Pydantic v2 contracts (register, login,
      onboarding with enum/range validators, `MeOut`/`AuthTokenOut`).
    - [x] `service.py` — wraps Supabase Auth (`sign_up` with
      `email_redirect_to`, `sign_in_with_password`) and persists
      profile + onboarding; `get_supabase_client()` uses the
      secret key; Supabase errors mapped to `AppError`.
    - [x] `dependencies.py` — `get_current_user` (HTTPBearer →
      `verify_supabase_jwt` → get-or-create profile); `CurrentUser`.
    - [x] `router.py` — `POST /register`, `POST /login`,
      `POST /onboarding` (protected), `GET /me` (protected); wired
      in `main.py` under `/api/v1/auth`.
  - Backend core/db:
    - [x] `core/security.py` — Supabase JWT verification via JWKS
      (`PyJWKClient`, ES256, aud/iss/exp).
    - [x] `db/session.py` — declarative `Base`, lazy sync engine,
      `SessionLocal`, `get_db`.
    - [x] `config.py` — settings renamed to the new env vars
      (`supabase_publishable_key`/`supabase_secret_key`/
      `supabase_jwt_signin_id`), `frontend_url`, `supabase_jwks_url`.
    - [x] Deps added (`sqlalchemy`, `psycopg[binary]`, `supabase`,
      `pyjwt[crypto]`, `pydantic[email]`); `uv sync` done.
    - [x] Alembic: `env.py` → `target_metadata = Base.metadata`
      (reads URL directly to avoid ConfigParser `%`-interpolation);
      `alembic.ini` `prepend_sys_path = .`; revision
      `0001_create_auth_tables` creates both tables (verified by
      rendering clean SQL with `alembic upgrade head --sql`).
    - [x] App boots; `GET /api/v1/auth/me` → 401 without a token
      (verified via TestClient).
    - [ ] `alembic upgrade head` applied to the DB — pending an
      IPv4 connection (see Open Questions).
  - Frontend `features/auth/` + `core/`:
    - [x] `core/api/` — `API_BASE_URL` token + `auth.api.ts`
      (only backend caller) + `http-error.ts`.
    - [x] `core/services/auth-state.service.ts` — signal token +
      user, `isAuthenticated`, localStorage hydrate/clear.
    - [x] `core/interceptors/auth.interceptor.ts` (Bearer + 401→login)
      and `core/guards/auth.guard.ts`; registered in `app.config.ts`.
    - [x] `features/auth/services/auth.service.ts` + `state/`
      (pending email); pages: `register`, `login`,
      `email-verification` (dual-mode magic-link callback),
      `onboarding` (concrete set). Routes lazy-loaded; onboarding
      guarded. Minimal guarded `features/home` landing as the
      post-auth destination (placeholder for later slices).
    - [x] `src/environments/` + `angular.json` `fileReplacements`.
    - [x] `npm run build` passes.

## In Progress

- Feature-spec `02-reusable-components` — reviewed 2026-06-13.
  All 16 requested components (Button, Card, Dialog, Input,
  Textarea, Tabs, ScrollArea, Data Table, Sonner, Alert Dialog,
  Badge, Checkbox, Combobox, Spinner, Switch, Tooltip) were
  already delivered as the Step 01 `shared/ui/` primitives and
  verified as full, spec-compliant implementations (standalone,
  OnPush, signal-driven, `cn()` + theme tokens only). The spec's
  completion check passes: `npm run build` ✔ (no build errors).
  No re-implementation performed — `shared/ui/*` are Protected
  (see `ai-workflow-rules.md`); the existing set already
  satisfies the spec. Treat this feature-spec as fulfilled by the
  Step 01 work below.

## Next Up

- Apply the `0001_create_auth_tables` migration over an IPv4
  Supabase connection and run the end-to-end auth flow, then
  start the `subscription` domain slice.

## Open Questions

- The local machine has no IPv6 route to Supabase, so the
  direct DB host `db.<ref>.supabase.co:5432` (IPv6-only without
  the IPv4 add-on) is unreachable here (`alembic upgrade` →
  "No route to host"). Resolution: set `DATABASE_URL` to the
  **Session pooler** (IPv4) connection string from the Supabase
  dashboard (Connect → Session pooler), keeping the
  `+psycopg` driver and `%23`-encoded password. App code and
  the migration are otherwise ready.
- Supabase dashboard config required before the email-verification
  flow works: enable Auth → Email "Confirm email", and add
  `http://localhost:4200/auth/verify-email` to Auth → URL
  Configuration → Redirect URLs.

## Architecture Decisions

- 2026-06-22 — Auth slice: "the backend issues/validates
  stateless JWTs" is realised as **Supabase mints, backend
  validates/relays**. Supabase Auth signs access tokens
  (asymmetric ES256 signing keys); the backend verifies them at
  the boundary against the project's public JWKS endpoint
  (`/auth/v1/.well-known/jwks.json`, `core/security.py`) — no
  shared secret, and key rotation is handled by the token `kid`.
  `SUPABASE_JWT_SIGNIN_ID` (the current signing-key id) is read
  into settings but intentionally **not** used in verification.
  Login relays Supabase's `access_token` to the client.
- 2026-06-22 — Auth slice: synchronous backend stack
  (SQLAlchemy + `psycopg` v3, sync `supabase-py`); route
  handlers are plain `def` so FastAPI runs the blocking DB /
  Supabase I/O in its threadpool, per `code-standards.md`
  ("std `def` for blocking I/O"). Sync `psycopg` also sidesteps
  the asyncpg/Supabase transaction-pooler prepared-statement
  pitfalls. Async stays reserved for the `ai/` layer.
- 2026-06-22 — Auth slice: email verification uses the
  **magic-link redirect**, not OTP-code entry. Supabase's shared
  email service blocks email-template editing (custom SMTP
  required), so the default confirmation **link** is used:
  `sign_up` sets `email_redirect_to={frontend}/auth/verify-email`;
  the user clicks the link, Supabase verifies and redirects with
  the session in the URL fragment; the frontend
  `email-verification` page captures the access token and
  finalizes through the backend (`GET /me`, which provisions the
  profile). Documented deviation from strict "frontend
  authenticates only via the backend": for this one redirect the
  browser receives the Supabase-issued token directly; the
  backend still validates every protected request. The page also
  handles the PKCE `?code=` shape (route to /login) and error
  fragments.
- 2026-06-22 — Auth slice: onboarding questions were undefined
  in the context docs; a concrete, non-clinical set was defined
  and implemented: `display_name`, `primary_focus`,
  `focus_areas[]`, `current_stress` (1–5), `checkin_frequency`,
  `used_wellbeing_tools_before`, optional `goals_note`, and a
  required `acknowledged_not_medical` acknowledgment (honours the
  product scope boundary). Stored one-row-per-user in
  `onboarding_responses` (owned by `user_id`); `display_name`
  lives on `profiles`.
- 2026-06-22 — Auth slice: env var names aligned to the new
  Supabase key format already present in `.env.example`
  (`SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY`/
  `SUPABASE_JWT_SIGNIN_ID`); `config.py` renamed accordingly
  (old `*_anon_key`/`*_service_role_key`/`*_jwt_secret` dropped).
  `DATABASE_URL` must use the `postgresql+psycopg://` scheme and
  percent-encode `#`→`%23` in the password (raw `#` is a URL
  fragment). Alembic `env.py` reads the URL straight from
  settings (not via `set_main_option`) to avoid ConfigParser
  treating `%23` as interpolation.

- 2026-06-12 — Design system: shadcn/ui has no native Angular
  generator (its CLI emits React `.tsx`), so "Tailwind +
  shadcn/ui" from `architecture.md` is realised as
  **hand-authored, shadcn-style standalone Angular primitives**
  in `shared/ui/` rather than CLI-generated files. Confirmed
  with the user. Each primitive is OnPush + signal-driven
  (`input()`/`model()`/`computed()`), composes classes through
  `cn()`, and references theme tokens only (e.g.
  `bg-accent-primary`, `text-text-primary`, `border-border-default`)
  so it re-themes under `.dark` with no `dark:` colour literals.
  Consumer class overrides flow through a `class` input
  (aliased) into `cn()` so `tailwind-merge` resolves conflicts.
  Icons via `@ng-icons/lucide` (stroke-based Lucide). The
  `shared/ui/*` files remain Protected (per
  `ai-workflow-rules.md`) — composed/wrapped, not hand-edited,
  by feature code. The `Data Table` entry is delivered as the
  styled `Table` primitive set (the foundation a feature-level
  data table composes on); Sonner is a signal-based
  `ToastService` + `<app-toaster>` outlet mounted in the app
  shell. `cn()` lives at `core/utils/tailwind.utils.ts` (the
  spec's name); the Step 00 `core/utils/cn.ts` placeholder and
  the `components.json` `utils` alias were updated to match.
- 2026-06-12 — Restructured `context/architecture.md` into
  separate Backend and Frontend sections, each with its own
  stack, boundaries, and concrete folder structure tree, plus a
  shared Cross-Cutting Concerns section (storage, auth,
  invariants). Reason: make the frontend/backend split explicit
  as two independently deployable apps communicating only over
  the HTTP API contract, and give implementation a canonical
  folder layout to follow. Added invariant #8 (no shared
  code/runtime between frontend and backend).
- 2026-06-12 — Frontend scaffolded with Angular CLI v22
  (standalone, no NgModules). Zoneless change detection via
  `provideZonelessChangeDetection()` in `app.config.ts` (the
  v22 scaffold ships without `zone.js`); OnPush set as the
  default component strategy via `angular.json` schematics and
  on the root `App`. Default style scss, assets at
  `src/assets/` (mapped in `angular.json`), routing enabled
  (empty shell routes). TS strict + `strictTemplates` on.
  Reason: match the spec's required Angular configuration.
- 2026-06-12 — Styling: Tailwind v4 wired via
  `@tailwindcss/postcss` (`.postcssrc.json`); global entry is
  `src/styles/styles.css`. Design tokens live in
  `src/styles/theme.css` as raw CSS vars (light `:root` + `.dark`)
  mapped into Tailwind's color namespace with `@theme inline`
  so utilities re-theme on `.dark`; typography tokens
  (`--font-sans` Inter, `--font-mono` JetBrains Mono, loaded
  via Google Fonts in `index.html`) in `@theme`. Chose CSS over
  SCSS for the global entry because Tailwind v4's `@import
  "tailwindcss"` is a PostCSS at-rule that conflicts with
  Dart-Sass `@import` resolution. Tokens only — no hardcoded
  hex in components. `cn()` helper in `core/utils/cn.ts`
  (clsx + tailwind-merge); shadcn/ui initialized via
  `components.json` aliasing primitives into
  `src/app/shared/ui/` (generated later via CLI).
- 2026-06-12 — Node toolchain: Angular v22 requires Node
  ≥ 24.15.0; the machine's default was 24.14.1, so installed
  24.15.0 via nvm and pinned it in `frontend/.nvmrc`. Run
  frontend `npm`/`ng` commands under `nvm use` (Node 24.15.0).
- 2026-06-12 — Backend scaffolded as a FastAPI app factory
  (`app/main.py` → `create_app()`), single `GET /api/v1/health`
  probe, explicit-origin CORS, `/docs`+`/redoc`+`/openapi.json`
  enabled only in development. `Settings(BaseSettings)` cached
  via `get_settings()`, reads `.env` (`.env.example` provided;
  Supabase/DB values are placeholders only). Global exception
  handling in `core/exceptions.py` (`AppError` base + handler);
  empty `core/lifespan.py` hooks for heavy clients. Alembic
  initialized config-only: `alembic.ini` (`script_location =
  app/db/migrations`, URL resolved at runtime from settings)
  with `env.py`/`script.py.mako`, `target_metadata = None`, no
  revisions. Domain/AI/worker files are docstring-only stubs.
- 2026-06-12 — Backend runtime: pinned Python 3.12 (via `uv
  venv --python 3.12`) rather than the machine default 3.14,
  for current FastAPI/Pydantic-v2 wheel compatibility. Deps:
  fastapi, uvicorn[standard], pydantic v2, pydantic-settings,
  alembic (httpx for tests). Env managed with `uv`; `.venv/`
  gitignored.

## Session Notes

- Frontend: build/serve must run under Node 24.15.0
  (`cd frontend && nvm use`). Verified with `npm run build`.
- Backend: run with `uv` (`cd backend && uv run uvicorn
  app.main:app`); deps in `pyproject.toml`. Config reads
  `backend/.env` (gitignored; created this slice from
  `.env.example` with the `+psycopg`/`%23` `DATABASE_URL` fix).
- Backend auth slice verified so far: app imports/boots cleanly,
  all four `/api/v1/auth` routes are registered, and `GET
  /api/v1/auth/me` returns 401 without a bearer token. The
  migration renders correct SQL offline (`alembic upgrade head
  --sql`). Remaining: `alembic upgrade head` + live flow once an
  IPv4 DB URL is set (Open Questions) and the Supabase dashboard
  toggles are applied.
- Next domain slice (per `ai-workflow-rules.md`):
  `subscription`, front-to-back.
