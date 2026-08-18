Read `CLAUDE.md` before starting.

We're building the third domain slice: `sessions`, as a thin
front-to-back vertical slice. This is the most complex domain;
it covers the live bidirectional voice session loop (WebSocket +
STT + LLM + TTS), audio storage in Supabase Storage, a
post-session transcription background task, and the session
history and detail views.

**Implement in this order — one verifiable increment at a time**:

1. Session models + Alembic migration + REST CRUD (start / list / detail)
2. `app/storage/audio.py` adapter (Supabase Storage upload + signed URL)
3. `app/ai/` layer (Faster-Whisper STT, Kokoro TTS, Ollama LLM, LangGraph graph)
4. `app/core/lifespan.py` — initialize heavy clients at startup
5. WebSocket endpoint (live voice loop, end-of-session audio upload)
6. `app/workers/transcription.py` — post-session background transcription
7. Frontend pages (session UI, history list, session detail)

Do not bundle unrelated system boundaries in a single step
(per `ai-workflow-rules.md`). The REST routes and the WebSocket
handler are separate steps; the background transcription task
is a third. Verify each step before continuing.

---

## Architecture Decisions to Confirm

Record each decision in `architecture.md` and add the new env vars
to `.env.example` before implementing.

1. **LLM inference: Ollama** (OpenAI-compatible local API) rather
   than in-process model loading. The backend calls the Ollama
   HTTP server via the `openai` Python client (pointed at
   `OLLAMA_BASE_URL`). This keeps GPU/model management outside the
   FastAPI process and works with any Ollama-compatible model.

2. **Real-time voice transport: WebSocket** (not WebRTC). WebSocket
   requires no ICE negotiation and is sufficient for a server-side
   AI pipeline on a shared host. The frontend connects to
   `ws://{host}/api/v1/sessions/ws/{session_id}?token={jwt}`.
   The JWT is passed as a query parameter because browser
   `WebSocket` constructors do not support custom headers.

3. **Audio format: WebM/Opus** from the browser (native
   `MediaRecorder` output). The client sends binary WebSocket
   frames (250 ms slices). The server accumulates all frames
   in-memory and assembles them into a single `bytes` blob
   when the session ends. Kokoro TTS output is sent back as
   PCM/WAV binary frames; the client decodes them with
   `AudioContext.decodeAudioData`.

4. **Audio storage: Supabase Storage**. A single `sessions-audio`
   bucket; objects keyed by `{user_id}/{session_id}.webm`.
   Audio is served only through signed URLs (1-hour expiry)
   — never via public paths (architecture invariant 4).

5. **Post-session transcription: FastAPI `BackgroundTasks`**.
   Triggered from inside the WebSocket handler after end-of-session
   audio upload. Reads audio from Supabase Storage, runs
   Faster-Whisper, updates the session record. Heavy enough to be
   a background task; light enough to skip a Celery worker for
   this slice (revisit for prod scale).

---

## Backend — `app/core/config.py` additions

```
ollama_base_url: str = "http://localhost:11434/v1"
ollama_model: str = "llama3.1"
whisper_model_size: str = "base"
supabase_storage_bucket: str = "sessions-audio"
```

Add all four to `.env.example` with comments.

---

## Backend — `app/core/lifespan.py`

Initialize heavy clients once at startup; shut them down on
shutdown. Attach to `app.state` so request handlers and the
WebSocket handler can access them without re-initialization.

- `app.state.whisper_model` — `WhisperModel(settings.whisper_model_size, device="cpu", compute_type="int8")`.
- `app.state.tts_pipeline` — Kokoro pipeline; if import fails
  (package not installed), log a warning and set to `None`.
  The WebSocket handler degrades to text-only mode when `None`.
- `app.state.llm_client` — `openai.AsyncOpenAI(base_url=settings.ollama_base_url, api_key="ollama")`.
- `app.state.supabase_storage` — Supabase client for storage ops
  (reuse the same supabase-py client already created for auth).

Add `faster-whisper`, `kokoro-onnx`, and `openai` to `pyproject.toml`;
run `uv sync`. If `kokoro-onnx` wheels are unavailable for the
dev machine architecture, make the import conditional (try/except)
in `lifespan.py` and set `tts_pipeline = None`.

---

## Backend — `app/storage/audio.py`

Object-storage adapter (thin wrapper over the Supabase Storage API):

- `upload_audio(user_id: str, session_id: str, audio_bytes: bytes) → str`
  — uploads to `{user_id}/{session_id}.webm` in the configured
  bucket; returns the storage path string (not a signed URL).
  Raises `AppError(500)` if the upload fails.

- `get_signed_url(storage_path: str, expires_in: int = 3600) → str`
  — creates a signed URL valid for `expires_in` seconds; returns
  the URL string. Raises `AppError(500)` on failure.

Both functions accept the Supabase client as a parameter (passed
from the caller) — no module-level singleton to avoid initialization
order issues.

---

## Backend — `app/ai/`

The sole gateway to LLM / STT / TTS (architecture invariant 7).
Domain code must never call model libraries directly.

### `ai/stt/whisper.py`

- `transcribe_full(audio_bytes: bytes, model: WhisperModel) → str`
  — writes bytes to a temp file, runs `model.transcribe()`,
  joins and returns the full transcript text.

- `transcribe_chunk(audio_bytes: bytes, model: WhisperModel) → str`
  — same as above but for short live-session utterance chunks.
  Returns the partial transcript text (used during the WebSocket
  turn loop to convert the user's utterance to text for the LLM).

### `ai/tts/kokoro.py`

- `synthesize(text: str, pipeline) → bytes | None`
  — runs Kokoro synthesis on `text`; returns raw PCM/WAV bytes.
  Returns `None` if `pipeline is None` (graceful text-only
  degradation).

### `ai/llm/client.py`

No public functions needed beyond the client factory called in
`lifespan.py`. The LLM client is accessed via `request.app.state.llm_client`
in the WebSocket handler.

Wrap the streaming call in `generate_response` (see `ai/graph.py`) with
`tenacity` retry logic (exponential backoff, 3 attempts) per
`code-standards.md` ("Add Retry Logic for External APIs"). Add
`tenacity` to `pyproject.toml` and `uv sync`.

### `ai/prompts/therapy.py`

Versioned system prompt for the therapy agent. Required behaviour:

- Establishes the AI as a compassionate wellbeing companion.
- Stays strictly within psychological wellbeing topics; declines
  off-topic requests (math, coding, etc.) with a gentle redirect
  (architecture invariant 6).
- Explicitly states it is not a replacement for professional care.
- Parameterized by `{display_name}` (Python `str.format`).

```python
THERAPY_SYSTEM_PROMPT_V1 = (
    "You are Bright Day, a compassionate AI wellbeing companion "
    "speaking with {display_name}. ..."
)
```

### `ai/graph.py`

LangGraph graph for a single conversation turn:

**State schema**:
```
{
  "user_audio":   bytes,      # raw audio chunk
  "user_text":    str,        # STT output
  "ai_text":      str,        # LLM response
  "ai_audio":     bytes|None, # TTS output
  "history":      list[dict], # running message history
  "app_state":    Any,        # app.state (carries model clients)
  "display_name": str,        # formatted into the system prompt each turn
}
```

**Nodes**: `transcribe` → `generate_response` → `synthesize_speech`

- `transcribe` — calls `ai.stt.whisper.transcribe_chunk` with
  `user_audio`; sets `user_text`.
- `generate_response` — builds the message list: a system message
  using `THERAPY_SYSTEM_PROMPT_V1.format(display_name=state["display_name"])`
  (imported from `ai.prompts.therapy`), followed by `history`, then the
  new user message; calls `app_state.llm_client.chat.completions.create`
  with `model=settings.ollama_model` and `stream=True` (wrapped in tenacity
  retry — 3 attempts, exponential backoff); accumulates streamed tokens into
  `ai_text`; appends both the user and AI turns to `history`.
- `synthesize_speech` — calls `ai.tts.kokoro.synthesize`; sets
  `ai_audio`.

**Entry point**:
```python
async def run_turn(
    user_audio: bytes,
    history: list[dict],
    app_state,
    display_name: str,
) -> dict:  # returns updated state
```

---

## Backend — `app/domains/sessions/`

### `models.py`

`Session` ORM model (one row per voice session):

| Column              | Type                       | Constraints                          |
| ------------------- | -------------------------- | ------------------------------------ |
| `id`                | UUID, PK                   | `default=uuid4`                      |
| `user_id`           | UUID, FK → `profiles`      | not null, indexed                    |
| `status`            | String(16)                 | not null; see statuses below         |
| `audio_path`        | String                     | nullable (null until session ends)   |
| `transcript`        | Text                       | nullable (null until transcription)  |
| `overview`          | Text                       | nullable (reserved for insights)     |
| `duration_seconds`  | Integer                    | nullable                             |
| `started_at`        | DateTime(tz)               | not null                             |
| `ended_at`          | DateTime(tz)               | nullable                             |
| `created_at`        | DateTime(tz)               | server default now()                 |
| `updated_at`        | DateTime(tz)               | server default now(), onupdate now() |

Statuses: `recording` → `processing` → `ready` | `failed`.

### `schemas.py`

- `SessionStatus` — `Enum`: `recording`, `processing`, `ready`, `failed`
- `SessionOut` — full session: `id`, `status`, `transcript`, `overview`,
  `audio_url` (`str | None` — caller populates from a signed URL),
  `duration_seconds`, `started_at`, `ended_at`, `created_at`
- `SessionListItem` — list projection: `id`, `status`,
  `duration_seconds`, `started_at`, `ended_at`, `created_at`,
  `has_transcript` (computed `bool`)
- `StartSessionOut` — `id` (UUID), `ws_token` (str — the caller's JWT,
  echoed back for the client to use as the WebSocket `?token=` param)

### `service.py`

Plain `def` (blocking I/O in FastAPI threadpool):

- `start_session(user_id: str, db: Session) → Session`
  — calls `subscription_service.check_and_reset_quota`; raises
  `AppError(403)` if quota exhausted or subscription not active;
  calls `subscription_service.increment_sessions_used`; creates
  and returns a new `Session` row with `status = "recording"` and
  `started_at = now()`.

- `end_session(session_id: UUID, user_id: str, audio_bytes: bytes, duration_seconds: int, supabase_client, db: Session) → Session`
  — fetches session (enforces `user_id` ownership); calls
  `storage.audio.upload_audio`; updates `audio_path`, `ended_at`,
  `duration_seconds`, `status = "processing"`; commits; returns row.

- `complete_transcription(session_id: UUID, transcript: str, db: Session) → None`
  — sets `transcript`, `status = "ready"`, `updated_at`.

- `fail_transcription(session_id: UUID, db: Session) → None`
  — sets `status = "failed"`, `updated_at`.

- `get_session(session_id: UUID, user_id: str, db: Session) → Session`
  — fetches by `(id, user_id)`; raises `AppError(404)` if not found.

- `list_sessions(user_id: str, db: Session) → list[Session]`
  — all sessions for `user_id`, ordered `started_at DESC`.

### `dependencies.py`

No additional dependencies beyond `CurrentUser` and `get_db` imported
from auth and db modules. Session ownership is enforced inside
`service.py` on every fetch.

### `router.py`

Register under `/api/v1/sessions` in `main.py`.

**HTTP routes**:

- `POST /` (protected, `require_active_subscription`) → `StartSessionOut (201)`
  — calls `start_session`; returns `{ id, ws_token: <the caller's JWT> }`.

- `GET /` (protected) → `list[SessionListItem]`
  — calls `list_sessions`; returns newest-first.

- `GET /{session_id}` (protected) → `SessionOut`
  — calls `get_session`; if `audio_path` is set, calls
  `storage.audio.get_signed_url` and populates `audio_url`; returns
  `SessionOut`. If `audio_path` is null, `audio_url` is null.

**WebSocket route** — `WS /ws/{session_id}`:

This is an `async def` route (WebSocket is inherently async). It
performs the following sequence:

1. **Authenticate**: read `?token=` query param; call
   `verify_supabase_jwt` from `core/security.py` synchronously
   (via `asyncio.to_thread`); close with code `4001` if invalid.
   *(Note: passing the JWT as a query parameter is a justified deviation
   from the architecture invariant "credentials never passed in the URL
   path" — browser `WebSocket` constructors do not support custom headers.
   Record this carve-out in `architecture.md` before implementing.)*
2. **Verify session**: load the session from DB; verify
   `session.user_id == user_id`; close with code `4003` if not found
   or not owned. Verify `session.status == "recording"`; close with
   code `4004` if not.
3. **Send ready**: `await ws.send_text('{"type":"ready"}')`.
4. **Voice loop**: receive frames in a loop:
   - Binary frame → append to `audio_chunks: list[bytes]`.
   - When a `{"type":"end_utterance"}` JSON text frame arrives:
     - Assemble latest chunk(s) into bytes.
     - `result = await ai.graph.run_turn(chunk_bytes, history, request.app.state, display_name)`.
     - Send `{"type":"ai_text","text":"..."}` text frame.
     - If `result["ai_audio"]` is not `None`, send binary frame with TTS audio.
     - Append AI turn to `history`.
   - `{"type":"end_session"}` JSON text frame → break the loop.
   - `WebSocketDisconnect` → break the loop.
5. **End session**: after the loop, assemble `b"".join(audio_chunks)`;
   call `await asyncio.to_thread(session_service.end_session, ...)`;
   queue `transcription_background_task` via `asyncio.create_task`.
6. **Confirm**: send `{"type":"session_ended","session_id":"..."}`;
   close the WebSocket normally.

---

## Backend — `app/workers/transcription.py`

`async def transcribe_session_task(session_id: UUID, db_url: str) → None`:

- Creates its own DB session (`SessionLocal()`) — does not share the
  HTTP request's DB session.
- Fetches the session record.
- Gets the signed URL from `storage.audio.get_signed_url(session.audio_path)`.
- Downloads audio bytes via `httpx.get(signed_url).content`.
- Calls `ai.stt.whisper.transcribe_full(audio_bytes, whisper_model)`.
  Access the Whisper model via a module-level reference set during
  lifespan startup (not via `request.app.state`, which is unavailable
  in a background task).
- Calls `session_service.complete_transcription` on success, or
  `session_service.fail_transcription` on any exception.
- Logs errors; does not propagate exceptions (a background task that
  raises silently discards the error).

The Whisper model reference pattern:
```python
# transcription.py module level
_whisper_model = None

def set_whisper_model(model):
    global _whisper_model
    _whisper_model = model
```

Call `set_whisper_model(app.state.whisper_model)` in `lifespan.py`
startup after the model is loaded.

---

## Backend — Alembic migration

Add revision `0003_create_sessions_table` for the `sessions` table.
Do not edit applied `0001` or `0002` revisions.
Register `sessions.models` in `db/migrations/env.py`.

---

## Frontend — `features/sessions/`

Compose the existing `shared/ui` primitives (do not modify
`shared/ui/*`).

### `app/models/session.model.ts`

TypeScript interfaces matching the backend Pydantic schemas:

```ts
export type SessionStatus = 'recording' | 'processing' | 'ready' | 'failed';

export interface SessionOut {
  id: string;
  status: SessionStatus;
  transcript: string | null;
  overview: string | null;
  audio_url: string | null;
  duration_seconds: number | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface SessionListItem {
  id: string;
  status: SessionStatus;
  duration_seconds: number | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  has_transcript: boolean;
}

export interface StartSessionOut {
  id: string;
  ws_token: string;
}
```

### `core/api/session.api.ts`

Typed HTTP calls following the pattern of `core/api/subscription.api.ts`:

- `startSession()` → `Observable<StartSessionOut>`
- `listSessions()` → `Observable<SessionListItem[]>`
- `getSession(sessionId: string)` → `Observable<SessionOut>`

No HTTP `endSession` call is needed — session termination is handled
entirely by the WebSocket handler on the server.

### `features/sessions/pages/session.page.ts`

Full-viewport voice session page (per `ui-context.md` Layout Patterns:
"minimal chrome, a single large central control").

**Signal-based state machine** — `sessionState` signal with values:

| State            | Description                                                  |
| ---------------- | ------------------------------------------------------------ |
| `idle`           | Initial; "Start Session" button visible                     |
| `requesting_mic` | Awaiting `navigator.mediaDevices.getUserMedia` permission   |
| `connecting`     | WebSocket connecting                                         |
| `listening`      | WebSocket open; MediaRecorder active; user can speak         |
| `ai_thinking`    | Server received utterance; AI generating response            |
| `ai_speaking`    | TTS audio playing; microphone send paused                    |
| `ending`         | User clicked "End Session"; server finalizing                |
| `done`           | Session ended; navigate to `/sessions`                       |

**UI**:

- Centered "orb" — a round div with `rounded-full` and a CSS
  breathing animation (scale + opacity keyframes). Color:
  - `idle` / `connecting` → `bg-accent-subtle`
  - `listening` → `bg-accent-primary` (pulsing animation)
  - `ai_thinking` → `bg-accent-subtle` (slow pulse)
  - `ai_speaking` → `bg-state-recording` (warm, to distinguish
    AI from user speaking state)
  - `ending` → `bg-border-default`
- "Start Session" Button (primary, large) shown at `idle`.
- "End Session" Button (outlined, destructive-colored border) shown at
  `listening`, `ai_thinking`, `ai_speaking`.
- Live transcript area: `ScrollArea` or a scrollable div showing the
  running dialogue — user utterances labeled "You" and AI responses
  labeled "Bright Day". Appended in real time from WebSocket messages.
- Sessions-remaining Badge in top-right corner (from
  `SubscriptionStateService.sessionsRemaining`).
- `Spinner` shown at `connecting` and `ending`.

**Implementation**:

- On "Start Session" click:
  1. Set state to `requesting_mic`.
  2. Call `getUserMedia({ audio: true })`.
  3. Call `sessionApi.startSession()` → `{ id, ws_token }`.
  4. Set state to `connecting`.
  5. Open `WebSocket` to `/api/v1/sessions/ws/{id}?token={ws_token}`.
  6. On `onmessage` (text): parse JSON; if `type === "ready"` → set
     state to `listening`, start `MediaRecorder`.
  7. Start `MediaRecorder` with `mimeType: 'audio/webm;codecs=opus'`,
     `timeslice: 250` (ms). On `ondataavailable`: send blob as binary
     WebSocket frame; push blob into `recordedChunks` array.

- User-to-AI turn (client side):
  - The client sends audio chunks continuously. When a pause of ≥1 s
    in the user's speech is detected (use a simple silence-detection
    heuristic via `AudioContext.createAnalyser` + `getByteFrequencyData`),
    send `{"type":"end_utterance"}` as a text frame; set state to
    `ai_thinking`.
  - On `type === "ai_text"` from server: append the AI turn to the
    transcript area.
  - On binary frame from server: decode with
    `AudioContext.decodeAudioData`, play with `AudioBufferSourceNode`;
    set state to `ai_speaking` while playing; revert to `listening`
    when playback ends.

- On "End Session" click:
  1. Stop `MediaRecorder`.
  2. Send `{"type":"end_session"}` text frame.
  3. Set state to `ending`.
  4. On `type === "session_ended"`: close WebSocket; set state to
     `done`; navigate to `/sessions`.

- On WebSocket `onerror` / unexpected close: show an error toast via
  `ToastService`; navigate to `/sessions`.

### `features/sessions/pages/session-history.page.ts`

Session history list page:

- On init: call `sessionApi.listSessions()`; display a chronological
  list (newest first) using Card primitives.
- Each card row: formatted `started_at` date (with `--font-mono` for
  the time portion), `duration_seconds` as `mm:ss`, a `Badge` for
  `status`, and a right-chevron icon (`lucideChevronRight`).
- Clicking a card navigates to `/sessions/{id}`.
- Empty state: "No sessions yet. Start your first session." with a
  CTA Button linking to `/sessions/new`.
- Show `Spinner` while loading; show a toast on error.

### `features/sessions/pages/session-detail.page.ts`

Session detail page:

- On init: call `sessionApi.getSession(id)`.
- **Layout** (per `ui-context.md`): two-column on md+, stacked on mobile.
  - **Main column**: transcript text in `--font-sans`; empty state
    "Transcript is being generated…" + `Spinner` when
    `status === 'processing'`; "Transcript unavailable" when
    `status === 'failed'`.
  - **Sticky side column**: `<audio controls [src]="session()?.audio_url">`
    when `audio_url` is present; "Audio not yet available" when null.
- Header: formatted `started_at`, `duration_seconds` as `mm:ss` in
  `--font-mono`, status `Badge`.
- Back button → `/sessions`.

### Routes

Add to `app.routes.ts`:

```ts
{
  path: 'sessions',
  canActivate: [authGuard, subscriptionGuard],
  children: [
    {
      path: '',
      loadComponent: () =>
        import('./features/sessions/pages/session-history.page')
          .then(m => m.SessionHistoryPage),
    },
    {
      path: 'new',
      loadComponent: () =>
        import('./features/sessions/pages/session.page')
          .then(m => m.SessionPage),
    },
    {
      path: ':id',
      loadComponent: () =>
        import('./features/sessions/pages/session-detail.page')
          .then(m => m.SessionDetailPage),
    },
  ],
}
```

Both the `/sessions` list and `/sessions/new` require `authGuard`
+ `subscriptionGuard`. Add a "Start Session" CTA to
`features/home/pages/home.page.ts` that navigates to `/sessions/new`.

---

## Invariants to Honor

- A session can only be started for a user with an active subscription
  and remaining weekly quota; verified server-side by
  `require_active_subscription` — never enforced client-side
  (invariants 2 & 3).
- `user_id` on every session row is set from the verified JWT, never
  from the request body or WebSocket message payload.
- Raw audio never lives in the database; only the storage path and a
  signed URL (invariant 4).
- All STT, TTS, and LLM calls go through `app/ai/` — domain service
  and router code never imports model libraries directly (invariant 7).
- The therapy system prompt must include a topic guard that declines
  off-topic requests (invariant 6).
- The transcription background task opens its own DB session and never
  shares the HTTP request's session (invariant 1 extension: background
  work executes in a separate context with no shared DB state).
- Session ownership is enforced in `service.py` on every fetch —
  `GET /sessions/{id}` returns `404` (not `403`) for sessions owned
  by a different user (information leakage prevention).

---

## Check When Done

- `POST /api/v1/sessions` with a valid subscription creates a session
  row (`status = "recording"`) and returns `{ id, ws_token }`.
- A WebSocket client connecting to `.../ws/{session_id}?token=<jwt>`
  receives `{"type":"ready"}` within one round-trip; a connection with
  an invalid token is rejected with code `4001`.
- Sending binary audio frames followed by `{"type":"end_utterance"}`
  results in a `{"type":"ai_text","text":"..."}` response (Ollama must
  be running locally with the configured model).
- After `{"type":"end_session"}` and disconnect, the session row has
  `status = "processing"`, `audio_path` is set, and `ended_at` is
  populated.
- After the transcription task completes, `GET /sessions/{id}` returns
  `status = "ready"` and a non-null `transcript`.
- `GET /sessions/{id}` returns a signed `audio_url` when
  `audio_path` is set; `audio_url` is null otherwise.
- A user without an active subscription receives `403` on
  `POST /sessions`.
- `GET /sessions/{id}` with another user's JWT returns `404`.
- The session history list is ordered newest-first.
- The audio player on the detail page plays the recorded session audio.
- `npm run build` passes (frontend).
- Alembic migration `0003` renders clean SQL
  (`alembic upgrade head --sql`) and applies against the database.
- `progress-tracker.md` updated to reflect the completed slice.
