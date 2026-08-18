# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Sessions nav redirect fix (2026-08-17):
  - **Bug: the first click on "Sessions" landed on `/subscription`.** `subscriptionGuard` read
    `hasActiveSubscription()` synchronously, but nothing ever loaded `SubscriptionStateService`
    except `SubscriptionPage`'s constructor — the only `load()` call in the app (no
    `APP_INITIALIZER`, no load after login). With the signal still `null`, the guard redirected;
    the subscription page then loaded the state, so the second click worked. Memory-only state
    meant every browser refresh re-armed it.
  - **Fix:** `SubscriptionStateService` gained `ensureLoaded()` — fetches once, shares the
    in-flight request (`shareReplay`), emits `null` on failure so a later call retries — plus a
    `loaded` signal that separates "not fetched yet" from "no active plan". `subscriptionGuard`
    is now async: it awaits `ensureLoaded()` before deciding. `MainLayout` warms the state on
    mount (deduped with the guard's fetch), which also fixes the dashboard "Start Session" FAB
    being hidden until `/subscription` had been visited.
  - Regression coverage: `core/guards/subscription.guard.spec.ts` (6 tests — first-activation
    allow, concurrent dedupe, no refetch once loaded, error → redirect + retry, inactive plan →
    redirect, `clear()` resets). `npm run build` clean; note the pre-existing unrelated failure
    in `app.spec.ts` (asserts a scaffold `.app-shell__placeholder` that no longer exists).

- Quota-on-failure fix + storage robustness + cleanup (2026-08-10):
  - **Bug: quota was charged before the audio was stored.** In `sessions/router.py` the WS
    post-loop incremented quota (old step 5) before `end_session` uploaded (step 6), so failed
    sessions still burned the weekly allowance — the user's 5/5 was consumed entirely by
    sessions that produced nothing, which then 403'd new sessions. Restructured the post-loop:
    empty session (no audio, e.g. extension blocked recording) → mark `failed`, no upload, no
    quota; otherwise upload first (`end_ok`) and only then `increment_sessions_used` **and**
    queue `transcribe_session_task`. Quota now increments exactly once per stored session.
  - **Storage bucket auto-ensured at startup** (`lifespan.py`): after creating the Supabase
    client it lists buckets and creates `supabase_storage_bucket` (private) if missing,
    best-effort with clear logging. Prevents the silent `Bucket not found` failure recurring on
    fresh projects.
  - **Data remediation (one-time):** reset the user's `sessions_used_this_week` 5 → 0 (the 5
    were consumed by broken sessions), and deleted the 21 dead `recording` sessions (user's
    choice — they held no audio/transcript). Verified: quota 0/5 active, 0 sessions remain,
    server healthy after reload.
  - **Ready to test:** a fresh Incognito session should now go `recording → processing → ready`
    with audio in `sessions-audio`, a populated transcript, and a working detail page.

- Session storage + detail-page fix (2026-08-10):
  - **Root cause of empty session-detail (no transcript/audio/overview):** the Supabase Storage
    bucket `sessions-audio` did not exist (the project had **zero** buckets). Every
    `end_session` → `audio_storage.upload_audio` threw `Bucket not found`; the router caught it
    and left the row stuck in status `recording` with no `audio_path`, so
    `transcribe_session_task` bailed ("no audio_path") → no transcript/overview. All prior
    sessions are stuck `recording` for this reason.
  - **Fix:** created the private `sessions-audio` bucket via the storage API. Verified the full
    round-trip (upload → signed URL → GET 200) and the **entire post-session pipeline**
    end-to-end (temp session → `end_session` upload → `transcribe_session_task` → status
    `ready`, transcript accurately populated → temp row cleaned up).
  - **Hardened** `sessions/router.py` step 6: on `end_session` failure it now calls
    `fail_transcription` (status → `failed`) instead of leaving the row stuck in `recording`,
    and only queues `transcribe_session_task` when the audio actually uploaded (`end_ok`).
  - **Setup note:** creating the `sessions-audio` bucket is required for any fresh Supabase
    project (previously a manual spec-09 step that had not been done). Consider auto-ensuring
    the bucket at startup as a follow-up.
  - **Still open:** the 5 pre-existing sessions stuck in `recording` are junk from the failed
    uploads — offer to mark them `failed`/delete. MediaRecorder only works with browser
    extensions disabled (extension hooks `MediaRecorder.start`) — environment, not code.

- Voice-session multi-turn + teardown fixes (2026-08-10):
  - **Multi-turn transcription fixed (the "I'm sorry, I couldn't process that" bug).** The
    browser records one continuous WebM stream, so the EBML/WebM container header only arrives
    in the first utterance's chunks; every later utterance was a header-less fragment that
    PyAV/Whisper could not decode → exception → canned fallback. `sessions/router.py` now
    remembers the first binary chunk as `header_bytes` and prepends it to utterances after the
    first (`header_bytes + b"".join(utterance_chunks)`), making each an independently decodable
    WebM. `audio_chunks` (full-session recording used for storage + post-session
    `transcribe_session_task`) is left untouched. Verified offline: a header-less later slice
    fails with `InvalidDataError`; header + non-contiguous later slice decodes OK.
  - **AudioContext teardown fixed** ("The AudioContext encountered an error from the audio
    device" on end). `session.page.ts` now has an idempotent `cleanupAudio()` (cancels the
    silence-detection rAF loop, disconnects analyser/source nodes, closes the AudioContext)
    called from `endSession`, `session_ended`, `handleWsError`, and `ngOnDestroy` **before** the
    mic tracks are stopped. Stored `rafId` + `sourceNode` as fields; removed the unused
    `silenceTimer`.
  - **MediaRecorder resilience/messaging.** Confirmed via Incognito that `MediaRecorder.start()`
    throwing `NotSupportedError` in the normal Chrome profile is caused by a **browser extension**
    hooking MediaRecorder (works with extensions disabled). Codec selection already falls back
    across webm/ogg/mp4; added audio-track diagnostics logging and a clearer failure toast
    ("a browser extension may be blocking it — try a window with extensions disabled"). User
    action: identify/disable the offending extension (the one whose content script logs
    "Attempting handshake with backend").
  - **Confirmed working:** TTS end-to-end — the user heard Bright Day speak the reply in-browser
    (turn 1). Remaining verification: a 3+ turn Incognito conversation with the header fix.

- Voice-session TTS fix + diagnostic logging (2026-07-21):
  - **Root cause of "voice session not working, no console error":** TTS was silently
    disabled. `kokoro-onnx` was never a dependency (import raised `ModuleNotFoundError`,
    swallowed by a broad `except` → text-only), the model files were absent, and
    `kokoro.py` called the pipeline as `pipeline(text, …)` — but the `Kokoro` instance is
    not callable (the API is `.create(...)`), so synthesis would have thrown even with the
    model present. Ollama/LLM side was fine (`llama3.1` reachable).
  - **Fix (backend):** added `kokoro-onnx` to `pyproject.toml` (`uv add`, lockfile updated);
    fixed `ai/tts/kokoro.py` to call `pipeline.create(text, voice="af_heart", speed=1.0)`;
    added `KOKORO_MODEL_PATH`/`KOKORO_VOICES_PATH` + `ESPEAK_LIBRARY_PATH`/`ESPEAK_DATA_PATH`
    settings; `lifespan.py` now checks the model files exist and resolves a **system
    espeak-ng** (auto-detect Homebrew/apt, `_resolve_espeak`) before building `Kokoro` with
    an explicit `EspeakConfig` — logs an `error` (not a warning) and degrades to text-only
    if either is missing. Model files downloaded to `backend/models/` (gitignored, ~340 MB).
  - **espeak-ng note:** the `espeakng-loader` wheel bundled with kokoro-onnx ships a broken
    compiled-in data path (points at a CI build dir), so phonemization crashes. Requires a
    real `espeak-ng` (`brew install espeak-ng` on this machine; auto-detected at startup).
  - **Diagnostic logging (the silent-swallow points):** frontend `session.page.ts` now logs
    (`[session]` prefix) mic-denied, POST /sessions failure, ws open/error/close (incl. code),
    malformed frames, TTS decode failure, MediaRecorder error, chunk-send failure, and
    connection-lost; also resumes a suspended `AudioContext` before playback. Backend logs
    WS auth/ownership/status rejects (`router.py`), empty Whisper transcription
    (`stt/whisper.py`), and text-only turns (`tts/kokoro.py`).
  - **Verified:** `_resolve_espeak` → brew paths; `Kokoro.create` → valid 24 kHz mono WAV
    (~90 KB, `RIFF` header) that the frontend `decodeAudioData` can play; live server
    `GET /api/v1/health` → `{"status":"ok"}` after reload; frontend `tsc` clean.

- Integration & setup (feature-spec `09-integration-and-setup`) in progress (2026-06-28):
  - All six Alembic migrations (0001–0006) are authored and render clean SQL offline.
  - `lifespan.py` startup log messages aligned to spec: `Whisper model loaded.` /
    `Kokoro TTS initialized.` / `LLM client initialized.` / `Supabase Storage initialized.`
  - **Pending — infrastructure steps the developer must complete manually:**
    1. Set `DATABASE_URL` in `backend/.env` to the Supabase **Session pooler** connection
       string (IPv4, `postgresql+psycopg://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres`).
       Encode `#` → `%23` in the password.
    2. Run `cd backend && uv run alembic upgrade head`; verify `alembic current` → `0006`.
    3. Supabase dashboard: Auth → Email → enable **Confirm email**; Auth → URL
       Configuration → add `http://localhost:4200/auth/verify-email` to Redirect URLs.
    4. Supabase dashboard: Storage → New bucket → name `sessions-audio`, non-public,
       ≥ 500 MB file size limit.
    5. Install Ollama (`ollama serve`); pull model matching `OLLAMA_MODEL` env var
       (default `llama3.1`). Set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in `.env`.
    6. Stripe dashboard (test mode): create Basic/Standard/Premium recurring prices
       (1/3/5 sessions/week); paste `STRIPE_SECRET_KEY` + `STRIPE_PRICE_ID_WEEKLY_*`
       into `.env`; run `stripe listen --forward-to localhost:8000/api/v1/subscriptions/webhook`
       and paste the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`.
    7. Start backend (`uv run uvicorn app.main:app --reload`) and frontend
       (`nvm use && npm start`); run the full E2E flow from spec section 8.

- Home page (feature-spec `08-home-page`) implemented (2026-06-28):
  - `features/home/pages/home.page.ts` — replaced incremental stub with a lean
    standalone `OnPush` component; injects `AuthStateService`; exposes
    `buttonVariants` as `bv` for template link styling; registers
    `NgIconComponent` + four Lucide icons (lucideMic, lucideBookOpen, lucideBrain,
    lucideSmile); uses separate `templateUrl`.
  - `features/home/pages/home.page.html` — full four-section marketing page:
    Hero (eyebrow, headline, sub-headline, auth-aware CTA pair, scope disclaimer);
    Features (2×4 card grid with icon pill + title + body);
    Pricing (4-card grid, Standard highlighted with `ring-2 ring-accent-primary`
    and "Most popular" Badge, auth-aware CTAs → `/register` or `/subscription`);
    Footer (copyright + medical disclaimer).
  - All colors via CSS token utilities only; no hardcoded hex; dark mode works
    via token remapping. No new backend routes or services introduced.
  - `npm run build` passes (zero warnings, home-page lazy chunk emitted: 7.34 kB).

- `insights`, `mood`, and `dashboard` slice (feature-spec `07-insights-mood`) implemented
  front-to-back (2026-06-28):
  - Backend `domains/insights/` — `BehavioralPattern` ORM model (UUID PK,
    user_id FK→profiles CASCADE, pattern_text Text, rank Integer, detected_at
    TIMESTAMPTZ server default now()), `schemas.py` (BehavioralPatternOut),
    `service.py` (get_patterns ordered rank ASC, replace_patterns atomic
    delete+insert in single transaction), `router.py` (GET /patterns → list,
    returns [] for no patterns). Registered under `/api/v1/insights` in `main.py`.
  - Backend `domains/mood/` — `MoodLog` ORM model (UUID PK, user_id
    FK→profiles CASCADE, mood Integer, logged_date Date, created_at/updated_at,
    UniqueConstraint user_id+logged_date), `schemas.py` (MoodIn with
    Field(ge=1,le=5), MoodOut), `service.py` (log_mood upsert, get_today_mood),
    `router.py` (POST /today upsert 200, GET /today → MoodOut|null, always 200).
    Registered under `/api/v1/mood` in `main.py`.
  - Alembic migration `0005_create_insights_tables` (down_revision = 0004;
    behavioral_patterns table + ix_behavioral_patterns_user_id index; renders
    clean SQL offline).
  - Alembic migration `0006_create_mood_logs_table` (down_revision = 0005;
    mood_logs table with CHECK constraint mood 1-5, UNIQUE user_id+logged_date,
    ix_mood_logs_user_id index; renders clean SQL offline).
  - `db/migrations/env.py` — insights and mood models registered.
  - `app/ai/prompts/therapy.py` — PATTERN_DETECTION_PROMPT_V1 and
    SESSION_OVERVIEW_PROMPT_V1 added.
  - `app/workers/patterns.py` — async detect_patterns_task: opens own DB
    session, requires ≥3 diary entries, calls LLM via asyncio.to_thread, parses
    JSON array, validates + truncates to 3, calls replace_patterns. Logs and
    returns early on any error. set_llm_client wired in lifespan.py.
  - `app/workers/overviews.py` — async generate_overview_task(session_id,
    user_id): opens own DB session, requires non-null transcript, calls LLM,
    trims result, updates session.overview. Logs and returns early on any error.
    set_llm_client wired in lifespan.py.
  - `domains/diary/router.py` — asyncio.create_task(detect_patterns_task)
    fired after create_entry and update_entry succeed.
  - `app/workers/transcription.py` — asyncio.create_task(generate_overview_task)
    fired after complete_transcription succeeds.
  - `domains/sessions/schemas.py` — overview: str | None added to
    SessionListItemOut.
  - `domains/sessions/service.py` — build_list_item includes overview.
  - Frontend: `models/insights.model.ts` (BehavioralPatternOut),
    `models/mood.model.ts` (MoodIn, MoodOut), `models/session.model.ts` updated
    with overview field.
  - Frontend: `core/api/insights.api.ts` (InsightsApi.getPatterns),
    `core/api/mood.api.ts` (MoodApi.getTodayMood, logMood).
  - Frontend: `features/dashboard/pages/dashboard.page.ts` — signal-based
    dashboard: forkJoin on init loads patterns + mood + sessions in parallel;
    three cards (Behavioral Patterns with rank badges + empty state; Daily Mood
    with emoji button row or logged state + re-logging; Last Session with
    date/time/duration/status/overview/link); floating FAB (mic icon) visible
    only when hasActiveSubscription && sessionsRemaining > 0.
  - Routes: `/dashboard` lazy-loaded with authGuard in `app.routes.ts`.
  - Post-login redirect: login.page, onboarding.page, and email-verification.page
    all redirect to `/dashboard` on success (was `/`).
  - `home.page.ts` — "Go to Dashboard" primary button visible when authenticated.
  - `npm run build` passes (zero warnings, dashboard-page lazy chunk emitted).

- `diary` domain slice (feature-spec `06-diary`) implemented
  front-to-back (2026-06-28):
  - Backend `domains/diary/` — `DiaryEntry` ORM model (UUID PK,
    user_id FK→profiles CASCADE, title nullable, content Text,
    created_at/updated_at with server default now()), `schemas.py`
    (DiaryEntryIn with content validator, DiaryEntryListItem with
    @computed_field content_preview 120-char truncation,
    DiaryEntryOut), `service.py` (create/list/get/update/delete,
    ownership-enforced via 404 on mismatch), `router.py`
    (POST / → 201, GET /, GET /{id}, PUT /{id}, DELETE /{id} → 204).
    Registered under `/api/v1/diary` in `main.py`.
  - Alembic migration `0004_create_diary_entries_table`
    (down_revision = 0003; renders clean SQL offline).
  - `db/migrations/env.py` — diary models registered.
  - Frontend: `models/diary.model.ts` (DiaryEntryIn, DiaryEntryListItem,
    DiaryEntryOut), `core/api/diary.api.ts` (DiaryApi with list/get/
    create/update/delete), `features/diary/pages/` (diary-list.page.ts
    — card list newest-first + empty state + "New Entry" CTA;
    diary-editor.page.ts — create + edit mode from `:id` param,
    signal-based dirty/saving state, `confirm()` guard; diary-detail.page.ts
    — header with edit/delete icon buttons, AlertDialog confirmation,
    whitespace-pre-wrap content body).
  - Routes: `/diary`, `/diary/new`, `/diary/:id`, `/diary/:id/edit`
    with `authGuard` only (no subscriptionGuard) in `app.routes.ts`.
  - `home.page.ts` updated with "My Diary" CTA (outline button).
  - `npm run build` passes (zero warnings).
  - Architecture decisions recorded: diary access quota-free; no AI
    or worker calls in this slice; insights domain will read
    `diary_entries` via its own service (invariant 7 honored).

- `sessions` domain slice (feature-spec `05-sessions`) implemented
  front-to-back (2026-06-27):
  - Backend `domains/sessions/` — `Session` ORM model, `schemas.py`
    (SessionOut, SessionListItemOut, StartSessionOut), `service.py`
    (start/end/list/get/transcription helpers), `router.py` (POST /,
    GET /, GET /{id} HTTP routes + WS /ws/{session_id} voice loop).
    Registered under `/api/v1/sessions` in `main.py`.
  - Alembic migration `0003_create_sessions_table` (renders clean SQL
    offline; down_revision = 0002).
  - `app/storage/audio.py` — upload_audio + get_signed_url adapter
    (Supabase Storage, no module-level singleton).
  - `app/ai/` layer — `stt/whisper.py` (transcribe_full + transcribe_chunk),
    `tts/kokoro.py` (synthesize, graceful None when unavailable),
    `prompts/therapy.py` (THERAPY_SYSTEM_PROMPT_V1, topic-guarded),
    `graph.py` (LangGraph StateGraph: transcribe→generate_response→
    synthesize_speech, tenacity retry on LLM call).
  - `app/core/lifespan.py` — initializes Whisper, Kokoro (conditional),
    AsyncOpenAI (Ollama), Supabase Storage, wires whisper into worker.
  - `app/workers/transcription.py` — async background task with its own
    DB session; downloads audio via signed URL + httpx, transcribes,
    calls complete_transcription or fail_transcription.
  - Config: `ollama_base_url`, `ollama_model`, `whisper_model_size`,
    `supabase_storage_bucket` added to `config.py` and `.env.example`.
  - New deps: `faster-whisper`, `openai`, `tenacity`, `langgraph`,
    `langchain-core`, `httpx`, `soundfile`, `numpy` — `uv sync` done.
  - Frontend: `models/session.model.ts`, `core/api/session.api.ts`,
    `features/sessions/pages/` (session.page.ts — live voice + orb +
    silence detection; session-history.page.ts — list with status badges;
    session-detail.page.ts — transcript + audio player).
  - Routes: `/sessions`, `/sessions/new`, `/sessions/:id` with
    `authGuard + subscriptionGuard` in `app.routes.ts`.
  - `home.page.ts` updated with "Start Session" and "Session History" CTAs.
  - `npm run build` passes (zero warnings).
  - Sessions routes return 401 without auth (smoke-tested via TestClient).
  - Offline migration SQL for `0003` is correct.
  - Architecture carve-out recorded in `architecture.md`: JWT as query
    param for the WebSocket endpoint.

## Current Goal

- Complete the manual infrastructure steps in spec 09 (IPv4 DB migrations,
  Supabase auth config, storage bucket, Ollama, Stripe) and validate the full
  end-to-end flow (sections 8.1–8.10 of the spec).

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
      in `main.py` under `/api/v1/auth`. `/me` also calls
      `subscription_service.get_or_create_free_subscription` so
      every verified user has a subscription row.
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
    - [x] `core/interceptors/auth.interceptor.ts` (Bearer + 401→login
      + clears auth + subscription state) and
      `core/guards/auth.guard.ts`; registered in `app.config.ts`.
    - [x] `features/auth/services/auth.service.ts` + `state/`
      (pending email); pages: `register`, `login`,
      `email-verification` (dual-mode magic-link callback),
      `onboarding` (concrete set). Routes lazy-loaded; onboarding
      guarded. Minimal guarded `features/home` landing as the
      post-auth destination (placeholder for later slices).
    - [x] `src/environments/` + `angular.json` `fileReplacements`.
    - [x] `npm run build` passes.

- Feature-spec `02-reusable-components` — reviewed 2026-06-13.
  All 16 requested components already delivered as Step 01
  `shared/ui/` primitives. Treated as fulfilled.

- Feature-spec `04-subscription` — subscription vertical slice:
  - Backend `app/domains/subscription/`:
    - [x] `models.py` — `Subscription` (PK `user_id` FK→profiles,
      `tier` String(16), `status` String(16),
      `stripe_customer_id`/`stripe_subscription_id` nullable,
      `sessions_used_this_week`, `sessions_allowed_per_week`,
      `week_reset_at`, timestamps).
    - [x] `schemas.py` — `SubscriptionTier` + `SubscriptionStatus`
      enums; `SubscriptionOut` with `@computed_field sessions_remaining`;
      `CheckoutIn` (rejects free tier); `CheckoutOut`.
    - [x] `service.py` — `get_or_create_free_subscription` (idempotent),
      `create_checkout_session` (Stripe Customer upsert + Checkout
      Session), `handle_webhook` (signature verify + dispatch
      `checkout.session.completed` / `subscription.updated` /
      `subscription.deleted`), `check_and_reset_quota` (lazy 7-day
      reset), `increment_sessions_used` (for sessions slice).
    - [x] `dependencies.py` — `require_active_subscription` (raises
      403 if quota exhausted); `RequireActiveSubscription` alias.
    - [x] `router.py` — `GET /me`, `POST /checkout`, `POST /webhook`
      (async, run_in_threadpool); registered in `main.py` under
      `/api/v1/subscriptions`.
  - Backend integration:
    - [x] `core/config.py` — `stripe_secret_key`,
      `stripe_webhook_secret`, `stripe_price_id_weekly_1/3/5`
      (default `""`, same pattern as Supabase keys).
    - [x] `pyproject.toml` + `uv sync` — `stripe>=10.0` added
      (installed `stripe==15.3.0`).
    - [x] `.env.example` — Stripe section added.
    - [x] `db/migrations/env.py` — subscription models registered.
    - [x] `0002_create_subscriptions_table` migration — renders
      correct SQL offline (`alembic upgrade head --sql`).
    - [x] `auth/router.py` `GET /me` — calls
      `subscription_service.get_or_create_free_subscription` so every
      user has a subscription row after first login.
    - [ ] Migrations `0001` + `0002` applied to the live DB —
      pending an IPv4 connection.
  - Frontend `features/subscription/` + `core/`:
    - [x] `models/subscription.model.ts` — `SubscriptionTier`,
      `SubscriptionStatus`, `SubscriptionOut`, `CheckoutOut`.
    - [x] `core/api/subscription.api.ts` — `SubscriptionApi`
      (`getMySubscription`, `createCheckoutSession`).
    - [x] `core/services/subscription-state.service.ts` —
      `SubscriptionStateService` (`subscription` signal,
      `hasActiveSubscription`, `sessionsRemaining`, `load()`,
      `checkout()`, `clear()`).
    - [x] `core/guards/subscription.guard.ts` —
      `subscriptionGuard` (redirects to `/subscription`; exported
      for sessions slice).
    - [x] `features/subscription/pages/subscription.page.ts` —
      four plan cards (Free/Basic/Standard/Premium) using Card +
      Badge primitives; active plan marked with ring + badge +
      sessions-remaining; paid-plan click → `checkout()` →
      `window.location.href`; `?success=true` / `?cancelled=true`
      query-param handling.
    - [x] `app.routes.ts` — `/subscription` lazy-loaded, guarded
      by `authGuard`.
    - [x] `features/home/pages/home.page.ts` — `signOut()` now
      also calls `subState.clear()`.
    - [x] `core/interceptors/auth.interceptor.ts` — 401 branch
      also calls `subState.clear()`.
    - [x] `npm run build` passes.
    - [ ] Live Stripe test-mode checkout round-trip — pending
      Stripe test keys and Price IDs in `.env`.

## In Progress

- Manual infrastructure wiring per spec 09: Supabase Session pooler DATABASE_URL,
  `alembic upgrade head`, Supabase dashboard auth/storage config, Ollama install,
  Stripe test-mode keys and CLI webhook listener.

## Next Up

- Run the spec 09 E2E flow (sections 8.1–8.10): register → verify email →
  onboard → dashboard empty state → diary + pattern detection → mood log →
  subscription upgrade → voice session → transcription → session detail →
  dashboard populated state → quota enforcement.

## Open Questions

- The local machine has no IPv6 route to Supabase, so the
  direct DB host `db.<ref>.supabase.co:5432` (IPv6-only without
  the IPv4 add-on) is unreachable here (`alembic upgrade` →
  "No route to host"). Resolution: set `DATABASE_URL` to the
  **Session pooler** (IPv4) connection string from the Supabase
  dashboard (Connect → Session pooler), keeping the
  `+psycopg` driver and `%23`-encoded password. App code and
  both migrations are otherwise ready.
- Supabase dashboard config required before the email-verification
  flow works: enable Auth → Email "Confirm email", and add
  `http://localhost:4200/auth/verify-email` to Auth → URL
  Configuration → Redirect URLs.
- Stripe configuration required before the subscription checkout
  flow works: create test-mode products + recurring prices (1/3/5
  sessions per week) in the Stripe Dashboard; paste the Price IDs
  and secret key into `backend/.env` (see `.env.example`); set
  up a Stripe CLI webhook listener (`stripe listen --forward-to
  localhost:8000/api/v1/subscriptions/webhook`) to get the
  webhook secret for local testing.

## Architecture Decisions

- 2026-06-27 — Sessions slice: **WebSocket JWT as query param**.
  `WS /api/v1/sessions/ws/{session_id}?token=<jwt>` passes the JWT
  as a query parameter because browser `WebSocket()` constructors do
  not support custom headers. This is a justified carve-out from the
  invariant "credentials never in URL path", scoped to this one endpoint.
  Recorded in `architecture.md`.
- 2026-06-27 — Sessions slice: **LLM via Ollama** (OpenAI-compatible
  local API). The backend calls Ollama's HTTP server via the `openai`
  Python client pointed at `OLLAMA_BASE_URL`. GPU/model management stays
  outside the FastAPI process.
- 2026-06-27 — Sessions slice: **real-time voice transport via WebSocket**
  (not WebRTC). No ICE negotiation; suitable for a server-side AI pipeline.
  Client sends binary WebM/Opus frames (250 ms slices). Server returns TTS
  audio as PCM/WAV binary frames.
- 2026-06-27 — Sessions slice: **post-session transcription via
  `asyncio.create_task`** (FastAPI BackgroundTasks equivalent). The
  background task opens its own DB session; never shares the WS handler's
  session. Heavy enough to background; light enough to skip Celery.
- 2026-06-27 — Sessions slice: **Kokoro TTS conditional import**. If
  `kokoro-onnx` wheels are unavailable on the dev machine, the import
  in `lifespan.py` fails silently; `tts_pipeline` is set to `None` and
  the WebSocket handler degrades to text-only mode.
  - **Superseded 2026-07-21:** this "fail silently" behavior was the bug behind
    "voice session not working, no console error." `kokoro-onnx` is now a hard
    dependency; `lifespan.py` gates on model-file existence + a resolved system
    espeak-ng and logs an **error** (not a silent warning) when degrading to
    text-only. Graceful degradation is kept, but it is now loud. Voice output
    additionally requires a system `espeak-ng` (the bundled `espeakng-loader`
    data path is broken) — see the 2026-07-21 Current Phase entry.

- 2026-06-24 — Subscription slice: **payment processor = Stripe
  Checkout** (hosted page). Subscriptions are created through
  Stripe Checkout and managed via webhooks. The backend stores
  subscription state locally (`subscriptions` table) and updates
  it on `checkout.session.completed`, `subscription.updated`,
  and `subscription.deleted` events. Stripe signature is verified
  before any webhook payload is processed.
- 2026-06-24 — Subscription slice: **lazy weekly quota reset**.
  `sessions_used_this_week` is reset to 0 in
  `check_and_reset_quota` when `now - week_reset_at > 7 days`,
  eliminating the need for a scheduled background job for this
  counter. `sessions_allowed_per_week` is denormalized from tier
  for O(1) quota reads.
- 2026-06-24 — Subscription slice: **cross-domain service reuse**.
  `auth/router.py` calls `subscription_service.get_or_create_free_subscription`
  so every user has a subscription row after their first `GET /me`.
  `subscription/dependencies.py` imports `CurrentUser` from
  `auth/dependencies.py`. Both are public collaboration surfaces
  (services + dependencies), not internal domain details — compliant
  with architecture invariant 7.
- 2026-06-24 — Subscription slice: **functional guard, no provider
  registration**. Angular `CanActivateFn` guards do not require
  registration in `app.config.ts`; `subscriptionGuard` is exported
  from `core/guards/` and will be applied in the sessions route
  config.
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
- Backend subscription slice verified so far: app imports/boots
  cleanly, all three `/api/v1/subscriptions` routes are
  registered, `GET /me` → 401 without bearer, `POST /webhook`
  (no signature) → 400, `POST /checkout` → 401. Offline
  migration SQL for `0002` is correct. Remaining: live DB
  apply + Stripe test-mode round-trip.
- Sessions slice (2026-06-27): all backend + frontend complete.
  Backend: routes 401 without auth, migration SQL clean, all modules
  import. Frontend: `npm run build` passes (zero warnings).
