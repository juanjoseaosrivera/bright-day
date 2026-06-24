# 00 — Setup & Scaffolding

Read `CLAUDE.md` before starting.

## Goal

Stand up the empty, buildable skeletons for both applications
in the monorepo so future feature specs have a canonical place
to land code. This step creates **structure only** — no product
behavior, no business logic. Each app must build/start cleanly
on an empty shell.

The repo root holds two independently deployable apps that
communicate only over HTTP(S), plus the existing `context/`
docs (see `architecture.md`):

```
bright-day/
├── backend/    # FastAPI service — business logic, AI, persistence
├── frontend/   # Angular SPA — client experience
└── context/    # Project governance docs (already present)
```

Build the frontend first, then the backend. Do not combine the
two into a single verifiable step (`ai-workflow-rules.md` →
*When to Split Work*).

---

## Frontend

We are starting the scaffold for the frontend using `ng new frontend`
and creating the different folders we are going to use in the future.

Set Angular to use Zonless, OnPush ChangeDetectionStrategy, default
style scss, assets folder inside src folder.

### Generation

- Run `ng new frontend` (Angular v22, standalone — no NgModules).
- Configure during/after generation:
  - **Zoneless** change detection (`provideZonelessChangeDetection()`
    in `app.config.ts`; remove `zone.js` from polyfills).
  - **OnPush** as the default `ChangeDetectionStrategy` for components.
  - Default style: **scss**.
  - `assets/` folder lives **inside `src/`** (`src/assets/`).
  - Routing enabled (generates `app.routes.ts`).

### Folder structure to create

Create the empty folders below (keep them with a `.gitkeep` until
real code lands). Mirror `architecture.md` → *Frontend / Folder
Structure* exactly:

```
frontend/
├── src/
│   ├── app/
│   │   ├── app.config.ts        # Standalone providers (zoneless, router, http)
│   │   ├── app.routes.ts        # Top-level routing (empty shell routes)
│   │   ├── core/
│   │   │   ├── api/             # Base HTTP client (only backend caller)
│   │   │   ├── guards/          # Route guards (auth, subscription)
│   │   │   ├── utils/           # Helpers incl. cn()
│   │   │   ├── interceptors/    # JWT/Bearer + error interceptors
│   │   │   └── services/        # Cross-feature services (auth state)
│   │   ├── features/
│   │   │   ├── auth/            # pages/ components/ services/ state/
│   │   │   ├── subscription/
│   │   │   ├── sessions/
│   │   │   ├── diary/
│   │   │   ├── dashboard/
│   │   │   └── home/
│   │   ├── models/             # Shared API request/response types
│   │   └── shared/
│   │       ├── ui/             # shadcn/ui primitives (via CLI later)
│   │       ├── directives/
│   │       └── pipes/
│   ├── assets/                 # Static images, icons, fonts
│   ├── styles/                 # Tailwind v4 entry + theme tokens
│   ├── index.html
│   └── main.ts
├── angular.json
├── tailwind.config.ts
└── package.json
```

Each `features/<domain>/` follows the same internal layout:
`pages/`, `components/`, `services/`, `state/`.

### Tooling to wire (config only, no feature code)

- **Tailwind v4** + the `@theme` entry in `src/styles/`, exposing the
  color/typography/radius tokens from `ui-context.md` (light + `.dark`).
  Do not hardcode hex in components — tokens only.
- **shadcn/ui** initialized so primitives generate into
  `src/app/shared/ui/` (these are Protected Files — manage via CLI).
- **Prettier** (and Stylelint per `code-standards.md` → Styling).
- TypeScript **strict mode** on.
- Fonts: Inter (`--font-sans`), JetBrains Mono (`--font-mono`).

### Done when

- `npm run build` passes on the empty shell.
- App boots zoneless with the default route rendering a placeholder.
- Folder tree matches `architecture.md`; no domain logic present.

---

## Backend

Scaffold the FastAPI service as an empty, importable package that
starts cleanly with no schema/validation errors. Structure only —
no domain logic, no AI calls, no migrations content yet.

### Generation

- Create `backend/` with a `pyproject.toml` (FastAPI + Uvicorn,
  Pydantic v2, Pydantic Settings). Use a virtual environment.
- `app/main.py` exposes a FastAPI **app factory** that registers
  routers and middleware. Include a single `GET /api/v1/health`
  endpoint returning `{"status": "ok"}` so the app is verifiable.
- `app/core/config.py` defines `Settings(BaseSettings)` (cached),
  reading from `.env` (provide `.env.example`, never commit secrets).
- Configure CORS via `CORSMiddleware` with explicit allowed origins
  (the frontend dev origin), not a wildcard.
- Disable `/docs` and `/redoc` when not in development.
- Initialize Alembic (`alembic.ini` + `app/db/migrations/`) — config
  only, no migration scripts.

### Folder structure to create

Create the empty packages below (each Python package gets an
`__init__.py`; empty dirs get `.gitkeep`). Mirror `architecture.md`
→ *Backend / Folder Structure* exactly:

```
backend/
├── app/
│   ├── main.py                  # FastAPI app factory, router registration
│   ├── domains/                 # One package per domain
│   │   ├── auth/                # router.py schemas.py models.py service.py dependencies.py
│   │   ├── subscription/
│   │   ├── sessions/
│   │   ├── diary/
│   │   ├── insights/
│   │   └── mood/
│   ├── ai/                      # Sole gateway to LLM / STT / TTS
│   │   ├── llm/                 # Model clients + retry wrappers
│   │   ├── stt/                 # Faster-Whisper transcription
│   │   ├── tts/                 # Kokoro / XTTS synthesis
│   │   ├── prompts/             # Versioned prompt templates
│   │   ├── schemas.py           # Structured-output schemas
│   │   └── graph.py             # LangGraph agent flow
│   ├── workers/                 # Heavy/long-running background jobs
│   │   ├── transcription.py
│   │   ├── patterns.py
│   │   └── overviews.py
│   ├── storage/
│   │   └── audio.py             # Object storage adapter + signed URLs
│   ├── db/
│   │   ├── session.py           # Engine, sessions, pooling
│   │   └── migrations/          # Alembic migrations (init only)
│   └── core/
│       ├── config.py            # BaseSettings configuration
│       ├── security.py          # JWT verification
│       ├── lifespan.py          # Startup/shutdown of heavy clients
│       ├── exceptions.py        # Global exception handlers
│       └── logging.py
├── tests/                       # Mirrors domains/ structure
├── alembic.ini
└── pyproject.toml
```

Each `domains/<domain>/` package is created with its five files
as empty stubs: `router.py`, `schemas.py`, `models.py`,
`service.py`, `dependencies.py`.

### Conventions to honor (from `code-standards.md`)

- Domain-based structure; Pydantic schemas kept separate from ORM
  models.
- `Annotated` dependency injection style; `async def` only with
  async libraries.
- Global exception handlers wired in `core/exceptions.py` (no
  scattered try/except).
- Heavy clients (LLM/STT/TTS, DB) initialized once via
  `core/lifespan.py` — empty hooks for now.
- API routes are versioned under `/api/v1`, plural nouns, kebab-case.

### Done when

- The app imports and starts with Uvicorn cleanly (no schema/
  validation errors).
- `GET /api/v1/health` returns `200 {"status": "ok"}`.
- Folder tree matches `architecture.md`; all domain/AI/worker files
  are empty stubs with no business logic.

---

## Out of Scope for this step

- Any authentication, subscription, session, diary, insight, mood,
  or dashboard logic.
- Database tables / Alembic migration content.
- AI model wiring (LLM/STT/TTS), prompts, or LangGraph flows.
- Supabase integration beyond the config placeholders.

These arrive in later, per-domain feature specs, working
front-to-back one domain at a time (`auth` → `subscription` →
`sessions` → `diary` → `insights`/`mood` → `dashboard` → `home`).

## After completing this step

Update `context/progress-tracker.md`:
- Mark Current Phase as scaffolding complete.
- Set Next Up to the first domain slice (`auth`).
- Record any setup decisions (tooling versions, config choices)
  under Architecture Decisions.
