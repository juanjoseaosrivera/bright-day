# Architecture Context

The system is split into two independently deployable
applications that communicate only over HTTP(S): a Python
**backend** (API + AI processing) and an Angular **frontend**
(SPA client). Neither shares code or a runtime with the other;
the API contract (Pydantic schemas ↔ typed HTTP calls) is the
single boundary between them.

```
bright-day/
├── backend/    # FastAPI service — business logic, AI, persistence
├── frontend/   # Angular SPA — client experience
└── context/    # Project governance docs (this folder)
```

---

# Backend

## Stack

| Layer                   | Technology                                   | Role                           |
| ----------------------- | -------------------------------------------- | ------------------------------ |
| Framework               | FastAPI + Uvicorn                            | Asynchronous Server Core       |
| Validation & Security   | Pydantic v2                                  | Data Guardian & API Contract   |
| AI Orchestration        | LangChain / LangGraph                        | Agent Flow & Abstraction Layer |
| Language Model (LLM)    | Llama 3.1 (8B/70B) / Mistral (7B)            | Reasoning Engine (Self-Hosted) |
| Speech-to-Text (STT)    | Faster-Whisper (OpenAI Whisper)              | Real-time Audio Transcription  |
| Text-to-Speech (TTS)    | Kokoro-82M / XTTS v2                         | Open-Source Audio Synthesis    |
| Voice agent (alternate) | ElevenLabs Agents Platform                   | Third-party STT + LLM + TTS    |

The LLM / STT / TTS rows describe `VOICE_PROVIDER=local`, the default. Under
`VOICE_PROVIDER=elevenlabs` the live voice session uses none of them — STT, the
LLM, and TTS for that flow are all third-party. Diary pattern detection and
session overviews stay on the self-hosted LLM in both modes.
| Database & Embeddings   | Supabase (PostgreSQL + pgvector)             | Vector Storage & Chat History  |
| Authentication          | Supabase Auth (JWT)                          | Stateless Access Control       |
| Payments                | Stripe Checkout + Webhooks                   | Subscription Billing           |
| Storage                 | Supabase Storage (Bucket)                    | Physical audio file storage    |

## Boundaries

- `backend/app/domains/` — Owns all business logic, grouped by
  domain (`auth`, `subscription`, `sessions`, `diary`,
  `insights`, `mood`). Each domain exposes its own router,
  Pydantic schemas, ORM models, and service layer. No domain
  reaches into another domain's internals — they collaborate
  through services, not shared state.
- `backend/app/ai/` — Owns all interaction with the reasoning
  and speech stack (LLM clients, STT/TTS, prompt templates and
  versions, structured-output schemas, retry wrappers). Domains
  consume AI capabilities only through this layer.
- `backend/app/workers/` — Owns heavy/long-running AI
  processing (transcription, behavioral-pattern detection,
  session overviews). Request handlers delegate here; they do
  not perform this work inline.
- `backend/app/storage/` & `backend/app/db/` — Own persistence:
  `storage/` adapts object storage for audio files and issues
  signed URLs; `db/` owns engine/session setup, connection
  pooling, and Alembic migrations.
- `backend/app/core/` — Owns cross-cutting infrastructure:
  configuration (`BaseSettings`), JWT verification, lifespan
  startup of heavy clients, global exception handlers, logging.

## Folder Structure

```
backend/
├── app/
│   ├── main.py                  # FastAPI app factory, router registration
│   ├── domains/                 # Business logic, one package per domain
│   │   ├── auth/
│   │   │   ├── router.py        # HTTP endpoints
│   │   │   ├── schemas.py       # Pydantic request/response contracts
│   │   │   ├── models.py        # SQLAlchemy ORM models
│   │   │   ├── service.py       # Domain logic (the only cross-domain entry)
│   │   │   └── dependencies.py  # Domain-scoped FastAPI dependencies
│   │   ├── subscription/        # (same internal layout as auth/)
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
│   │   ├── patterns.py          # Behavioral-pattern detection
│   │   └── overviews.py         # Session overview generation
│   ├── storage/                 # Object storage adapter + signed URLs
│   │   └── audio.py
│   ├── db/                      # Engine, sessions, pooling
│   │   ├── session.py
│   │   └── migrations/          # Alembic migrations
│   └── core/                    # Cross-cutting infrastructure
│       ├── config.py            # BaseSettings configuration
│       ├── security.py          # JWT verification
│       ├── lifespan.py          # Startup/shutdown of heavy clients
│       ├── exceptions.py        # Global exception handlers
│       └── logging.py
├── tests/
├── alembic.ini
└── pyproject.toml
```

---

# Frontend

## Stack

| Layer             | Technology                                    | Role                                           |
| ----------------- | --------------------------------------------- | ---------------------------------------------- |
| Framework         | Angular v22 + Signals                         | SPA Engine + State management & Real-time Stream |
| UI                | Tailwind v4 + shadcn/ui                       | Utility-First Styling Framework                |
| Auth              | Supabase Auth Client through backend          | Authentication through a Backend               |
| Audio Processing  | Web Audio API                                 | Hardware-Level Microphone & Speaker Control    |

## Boundaries

- `frontend/src/app/features/` — Owns the client experience per
  domain (`auth`, `subscription`, `sessions`, `diary`,
  `dashboard`, `home`), including feature-scoped signal state.
- `frontend/src/app/core/` — Owns guards, interceptors, and the
  base API client (the single place that talks to the backend).
- `frontend/src/app/shared/` — Owns reusable UI primitives.
- Features never call the backend directly or reach into each
  other — they go through `core/` services and own only their
  own signal state.

## Folder Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── app.config.ts        # Standalone app providers
│   │   ├── app.routes.ts        # Top-level routing
│   │   ├── core/                # App-wide singletons
│   │   │   ├── api/             # Base HTTP client (only backend caller)
│   │   │   ├── guards/          # Route guards (auth, subscription)
│   │   │   ├── utils/           # Here lives our helper cn() and other core utils
│   │   │   ├── interceptors/    # JWT/Bearer + error interceptors
│   │   │   └── services/        # Cross-feature services (auth state)
│   │   ├── features/            # One folder per client domain
│   │   │   ├── auth/
│   │   │   │   ├── pages/       # Routed components
│   │   │   │   ├── components/  # Feature-local components
│   │   │   │   ├── services/    # Feature API calls (via core/api)
│   │   │   │   └── state/       # Feature-scoped signal state
│   │   │   ├── subscription/    # (same internal layout as auth/)
│   │   │   ├── sessions/        # Voice session + Web Audio capture
│   │   │   ├── diary/
│   │   │   ├── dashboard/       # Insights, mood, overviews
│   │   │   └── home/
│   │   └── shared/              # Reusable, domain-agnostic UI
│   │       ├── ui/              # shadcn/ui primitives
│   │       ├── directives/
│   │       └── pipes/
│   ├── styles/                  # Tailwind v4 entry + theme tokens
│   ├── index.html
│   └── main.ts
├── angular.json
├── tailwind.config.ts
└── package.json
```

---

# Cross-Cutting Concerns

## Storage Model

- **Database (Supabase / PostgreSQL + pgvector)**: System of
  record for all structured data and ownership — user profiles
  and onboarding answers, subscription tier and quota, session
  records (transcript text, audio URL reference, timestamps),
  diary entries, detected behavioral patterns and embeddings,
  session overviews, and daily mood logs. Every row is owned by
  exactly one user (`user_id`).
- **Object Storage (Supabase Storage bucket)**: Holds large
  binary artifacts — the recorded session audio files. The
  database stores only the secure URL reference and metadata;
  raw audio never lives in the database. Clients access audio
  through signed/short-lived URLs, never via public paths.

## Billing Model

- **Payment processor: Stripe.** Subscription creation and billing events
  flow through Stripe Checkout (hosted page) and webhooks. The backend stores
  subscription state locally (`subscriptions` table: tier, status, weekly
  quota counters, Stripe IDs) and updates it on Stripe webhook events. The
  Stripe webhook endpoint is public but must verify the Stripe signature
  before processing any payload.
- Tiers: `free` (1 session/week, no charge), `weekly_1` (1/week, paid),
  `weekly_3` (3/week, paid), `weekly_5` (5/week, paid). The weekly session
  counter resets lazily (checked on quota reads, not via cron) when
  `week_reset_at` is more than 7 days ago.

## Auth and Access Model

- Every user authenticates through Supabase Auth. The frontend
  authenticates via the backend (not directly against
  Supabase), and the backend issues/validates stateless JWTs.
- Protected requests carry the token as
  `Authorization: Bearer <token>`; credentials are never passed
  in the URL path. The backend validates the JWT at the system
  boundary before any handler logic runs.
- Every resource (session, diary entry, mood log, insight) has
  a single owner. A user can only read or mutate their own
  resources — ownership is enforced server-side on every
  request, never assumed from the client.
- Starting a voice session additionally requires a backend
  subscription check: the user must have an active, valid
  subscription with remaining weekly quota (free / 1 / 3 / 5
  sessions per week).

## Invariants

1. Request handlers do not run long-lived or heavy AI work
   inline — transcription, pattern detection, and overview
   generation are delegated to background workers.
2. Authentication and ownership are enforced server-side on
   every protected request; the client is never trusted to
   assert identity, ownership, or subscription status.
3. A voice session can only be started for a user with an
   active subscription and remaining weekly quota; this is
   verified by the backend, not the UI.
4. Raw audio is stored only in object storage; the database
   holds metadata and a URL reference, and audio is served only
   through signed URLs. (Amended 2026-09-06: under
   `VOICE_PROVIDER=elevenlabs` the audio also transits and is
   retained by ElevenLabs, which records the conversation and
   hands the backend a copy to archive. The invariant still
   holds for our own systems — the DB stores only a path, and
   playback is still signed-URL only — but ElevenLabs is a
   second resting place for session audio and transcripts, with
   a retention period configured on their side.)
5. External input (request payloads, LLM outputs) is validated
   against Pydantic schemas at the boundary before it is
   trusted or persisted.
6. The AI agent stays within scope — it engages only with
   psychological-wellbeing topics, declines off-topic requests,
   and never positions itself as a replacement for professional
   care.
7. Domains stay isolated: a domain never imports another
   domain's internals, and all model/LLM access goes through
   the `ai/` layer.
8. Frontend and backend share no code or runtime — they
   communicate only over the HTTP API contract, and the
   frontend reaches the backend exclusively through `core/`.

## Architecture Decisions

- 2026-06-28 — Insights/mood slice: **pattern detection trigger via asyncio.create_task**.
  detect_patterns_task is queued in diary/router.py after create_entry and update_entry
  succeed. Runs as a lightweight background task (same pattern as transcription); not
  Celery — deferred enough to avoid blocking the request handler, light enough to skip
  a queue. Requires ≥3 diary entries before running.
- 2026-06-28 — Insights/mood slice: **atomic pattern replace** (delete + insert in one
  transaction). Prevents the dashboard from seeing zero patterns between operations.
- 2026-06-28 — Insights/mood slice: **session overview trigger**. generate_overview_task
  is queued via asyncio.create_task at the end of transcription.py after complete_transcription
  succeeds, using the session's user_id already fetched in the worker's DB session.
- 2026-06-28 — Insights/mood slice: **mood scale 1–5**. One log per user per calendar day;
  second POST /today within the same day upserts the existing row (200, not 201).
- 2026-06-28 — Insights/mood slice: **dashboard as primary post-auth landing**. /dashboard
  receives all post-login, post-onboarding, and post-email-verification redirects. The
  public home page at / remains for unauthenticated visitors and shows a "Go to Dashboard"
  CTA when authenticated.
- 2026-06-28 — Insights/mood slice: **overview in SessionListItem**. overview: str | None
  added to SessionListItemOut so the dashboard avoids a second round-trip to the session
  detail endpoint.

- 2026-09-06 — ElevenLabs voice sessions: **`VOICE_PROVIDER` selects the live voice
  loop**, `local` (default) or `elevenlabs`. It governs the voice turn loop only —
  `workers/patterns.py` and `workers/overviews.py` always use Ollama, because ElevenLabs
  has no general chat-completions API. Whisper and Kokoro are not loaded at all in
  ElevenLabs mode; the Ollama client and Supabase Storage are built in both.
- 2026-09-06 — ElevenLabs voice sessions: **browser-direct, not a backend relay**. The
  browser connects to the agent itself with `@elevenlabs/client`; the backend mints a
  signed URL and reconciles the conversation afterwards. A relay was rejected because it
  would put an asyncio hop on every audio frame in a full-duplex barge-in loop, and would
  mean reimplementing the mic capture, playback queueing, and interruption handling the SDK
  already provides. (The often-cited reason — that ElevenLabs needs PCM while the browser
  produces WebM/Opus — is *not* the reason: an `AudioWorklet` can produce PCM directly.)
- 2026-09-06 — ElevenLabs voice sessions: **no client-side conversation overrides**. Since
  the browser holds the signed URL, it is also what sends
  `conversation_config_override`. Enabling system-prompt override would let any subscriber
  replace the prompt from devtools and strip the invariant-6 topic guard, so all overrides
  stay disabled on the agent and the prompt is pushed server-side from
  `ai/prompts/therapy.py`. Consequence: `{display_name}` personalization is dropped in
  ElevenLabs mode rather than being passed as a client-supplied dynamic variable.
- 2026-09-06 — ElevenLabs voice sessions: **the backend mints the conversation id**, via
  `get-signed-url?include_conversation_id=true`, and stores it before responding. The
  client never asserts which conversation belongs to a session (invariant 2), and
  `POST /sessions/{id}/complete` therefore takes no body.
- 2026-09-06 — ElevenLabs voice sessions: **quota is charged after the transcript is
  persisted**, not after the audio upload as in the local path. The user got the value the
  moment the conversation happened, and the audio download can fail independently. Charging
  is exactly-once via a compare-and-swap on `sessions.status`, so a late `/complete`, a
  re-armed poller, and a restart retry cannot double-charge.

## Architecture Carve-outs

- **WebSocket JWT query param (sessions slice, 2026-06-27)**: The
  WebSocket endpoint `WS /api/v1/sessions/ws/{session_id}` reads the
  JWT from `?token=` rather than an `Authorization` header. This is a
  justified deviation from invariant 2's "credentials never in the URL
  path" guideline: browser `WebSocket()` constructors do not support
  custom headers. The carve-out is scoped to this single endpoint only;
  all HTTP routes continue to use `Authorization: Bearer <token>`.
