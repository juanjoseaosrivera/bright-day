# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Application Building Context

Read the following files in order before implementing
or making any architectural decision:

1. `context/project-overview.md` — product definition,
   goals, features, and scope
2. `context/architecture.md` — system structure,
   boundaries, storage model, and invariants
3. `context/ui-context.md` — theme, colors, typography,
   and component conventions
4. `context/code-standards.md` — implementation rules
   and conventions
5. `context/ai-workflow-rules.md` — development workflow,
   scoping rules, and delivery approach
6. `context/progress-tracker.md` — current phase,
   completed work, open questions, and next steps

Per-feature specs live in `context/feature-specs/` (`00`–`10`),
numbered in the order the slices were built.

Update `context/progress-tracker.md` after each
meaningful implementation change.

If implementation changes the architecture, scope, or
standards documented in the context files, update the
relevant file before continuing.

## Commands

Backend (run from `backend/`, managed with `uv`, Python 3.12):

```bash
uv sync                                                    # install from lockfile
uv run uvicorn app.main:app --reload                       # dev server on :8000
uv run alembic upgrade head                                # apply migrations
uv run alembic revision --autogenerate -m "describe"       # new migration
uv run alembic upgrade head --sql                          # render SQL offline (no DB needed)
uv run pytest                                              # tests (testpaths = tests/)
uv run pytest tests/path/to/test_x.py::test_name           # single test
```

Frontend (run from `frontend/`, **requires Node 24.15.0 — run `nvm use` first**):

```bash
npm start                                                  # dev server on :4200
npm run build                                              # production build — the gate before finishing a slice
npm test                                                   # unit tests (@angular/build:unit-test + vitest)
npm test -- --include src/app/core/guards/subscription.guard.spec.ts   # single spec file
npm test -- --filter "redirects"                           # single test by name
npm run format                                             # prettier
npm run lint:style                                         # stylelint
```

Local infrastructure the backend expects: Ollama (`ollama serve` + `ollama pull llama3.1`),
a Supabase project (Postgres + Auth + Storage), Stripe CLI for webhooks
(`stripe listen --forward-to http://localhost:8000/api/v1/subscriptions/webhook`), and
`espeak-ng` + the Kokoro model files for voice output — see `backend/README.md`.

## Architecture

Two independently deployable apps that share no code or runtime and communicate only over
the HTTP/WS API contract: `backend/` (FastAPI) and `frontend/` (Angular v22, zoneless,
standalone, signals). `context/architecture.md` holds the authoritative invariants; the
points below are the ones that span many files.

### Backend layering

`domains/<name>/` (auth, subscription, sessions, diary, insights, mood) each hold
`router.py` / `schemas.py` (Pydantic) / `models.py` (SQLAlchemy) / `service.py` /
`dependencies.py`. A domain never imports another domain's internals — cross-domain
collaboration goes through the other domain's **service or dependency** only. Existing
legitimate examples: `auth/router.py` calls `subscription_service.get_or_create_free_subscription`;
`sessions/router.py` uses `RequireActiveSubscription` from `subscription/dependencies.py`.

All LLM/STT/TTS access goes through `app/ai/` — domains never call a model directly.
`ai/graph.py` is a LangGraph `StateGraph` running one turn (transcribe → generate_response →
synthesize_speech) with tenacity retry on the LLM call.

Heavy AI work never runs inline in a request handler. `app/workers/` tasks
(`transcription.py`, `patterns.py`, `overviews.py`) are fired with `asyncio.create_task`
and **open their own DB session** — never reuse the caller's. Trigger points:
diary create/update → `detect_patterns_task` (needs ≥3 entries); end of transcription →
`generate_overview_task`.

Heavy clients are built once in `core/lifespan.py` and hung on `app.state`
(`whisper_model`, `tts_pipeline`, `llm_client`, `supabase_storage`); workers receive them
through module-level setters (`set_whisper_model`, `set_llm_client`) wired at startup.
Lifespan also auto-creates the storage bucket if missing.

The stack is **synchronous** for DB/Supabase I/O (SQLAlchemy + psycopg v3, sync
`supabase-py`), so route handlers are plain `def` and FastAPI runs them in its threadpool.
`async def` is reserved for the `ai/` layer and the WebSocket loop; blocking calls inside
async paths go through `asyncio.to_thread`.

Errors: raise `AppError(message, status_code)` from `core/exceptions.py` rather than
scattering try/except — a global handler maps it to JSON. Settings come only from
`core/config.py` (`get_settings()`, `lru_cache`d).

### Auth and ownership

Supabase Auth mints the JWT; the backend **verifies** it against the project JWKS
(`core/security.py`, ES256) — there is no shared secret. `CurrentUser` in
`auth/dependencies.py` resolves (and lazily provisions) the caller's `Profile` from the
verified claims; identity is never taken from the request body. Every row is owned by one
`user_id`, and ownership is re-checked server-side on every read/mutation (services 404 on
mismatch rather than leaking existence).

Documented carve-out: `WS /api/v1/sessions/ws/{session_id}` takes the JWT as `?token=`
because browser `WebSocket()` cannot send headers. This is the **only** endpoint where a
credential appears in the URL — all HTTP routes use `Authorization: Bearer`.

### Voice session lifecycle (the most cross-cutting flow)

`POST /sessions` (guarded by `RequireActiveSubscription`) creates a `recording` row and
returns a ws token → client opens the WS → client streams binary WebM/Opus chunks with
`end_utterance` / `end_session` text frames → server replies with `ai_text` and optional
WAV bytes per turn.

Two subtleties in `sessions/router.py` that are easy to break:

- The browser records **one continuous WebM stream**, so only the first chunk carries the
  EBML container header. The server keeps `header_bytes` and prepends it to every utterance
  after the first, otherwise Whisper cannot decode them.
- Ordering after the loop: empty session → mark `failed`, no upload, **no quota charge**;
  otherwise upload first, and only on success `increment_sessions_used` **and** queue
  `transcribe_session_task`. Quota must never be charged for audio that was not stored.

### Frontend layering

`core/` is the only thing that talks to the backend: one typed client per domain in
`core/api/*.api.ts` (base URL via the `API_BASE_URL` injection token), plus guards,
the auth interceptor, and app-wide signal state. `features/<domain>/` own their pages and
feature-scoped state and never call HTTP directly or reach into another feature. Shared
payload types live in `src/app/models/`. Import via the `@app/*` path alias.

Components are standalone + `OnPush` + signal-driven (`signal()`, `computed()`, `input()`,
`model()`), with `@if` / `@for` (always `track`) in templates. Routing is fully lazy
(`loadComponent`); authenticated routes are nested under the `MainLayout` shell in
`app.routes.ts` and `/sessions` additionally carries `subscriptionGuard`.

State that a guard depends on must be loaded before the guard reads it — see
`SubscriptionStateService.ensureLoaded()` (fetch-once, `shareReplay`-deduped, with a
`loaded` signal separating "unknown" from "no plan"). `hasActiveSubscription()` is false in
both cases, so never read it without having awaited `ensureLoaded()`.

Styling is Tailwind v4 with CSS custom-property tokens in `src/styles/theme.css`. Use token
utilities (`bg-accent-primary`, `text-text-primary`, `border-border-default`) — **no
hardcoded hex, no `dark:` color literals**; dark mode works by remapping tokens under
`.dark`. Compose classes through `cn()` (`core/utils/tailwind.utils.ts`). Icons come from
`@ng-icons/lucide`.

## Working agreements

- Build one vertical slice at a time (route → service → schema → persistence, then UI).
  Do not combine a request-handler change with a background-worker change in one step.
- **Protected — do not hand-edit:** `frontend/src/app/shared/ui/*` (compose/wrap these
  primitives instead), already-applied Alembic migrations (add a new revision), and the
  source context docs (`project-overview.md`, `architecture.md`, `code-standards.md`) except
  by deliberate decision.
- Before moving on: `npm run build` passes, the backend boots cleanly, no
  `architecture.md` invariant was violated, and `progress-tracker.md` reflects the work.
- Local gotchas worth knowing: `DATABASE_URL` must use the Supabase **Session pooler**
  (IPv4) with the `postgresql+psycopg://` scheme and `#` percent-encoded as `%23`; Alembic
  `env.py` reads the URL straight from settings to dodge ConfigParser interpolation;
  missing Kokoro model files or `espeak-ng` degrade voice sessions to text-only (logged as
  an error, not silently).
