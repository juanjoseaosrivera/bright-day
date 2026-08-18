Read `CLAUDE.md` before starting.

We're building the fifth domain slice: `insights`, `mood`, and the
`dashboard`. This slice adds:

1. **Behavioral pattern detection** — the `insights/` backend domain
   stores the top 3 repetitive patterns detected from a user's diary
   entries. A background worker (`workers/patterns.py`) runs an LLM
   over all diary entries when an entry is created or updated and
   persists the results.

2. **Session overview generation** — a background worker
   (`workers/overviews.py`) runs after transcription completes to
   generate a brief AI overview of the session, stored in
   `sessions.overview`.

3. **Mood tracking** — the `mood/` backend domain stores one mood log
   per user per day (integer 1–5); the frontend lets users log from
   the dashboard.

4. **Dashboard** — the `dashboard/` frontend feature aggregates
   behavioral patterns, today's mood, and the last session overview
   into the primary authenticated landing page.

Implement in this order — one verifiable increment at a time:

1. `insights/` backend domain + Alembic migration `0005`
2. `mood/` backend domain + Alembic migration `0006`
3. `workers/patterns.py` + `workers/overviews.py` + wiring
4. Frontend dashboard page + models + API clients

Do not bundle unrelated system boundaries in a single step
(per `ai-workflow-rules.md`). The request-handler domains and the
background workers are separate boundaries.

---

## Architecture Decisions to Confirm

Record each decision in `architecture.md` before implementing.

1. **Behavioral pattern detection trigger**: patterns are re-detected
   as a background task (`asyncio.create_task`) whenever a diary entry
   is created or updated. This follows the same light-weight background
   pattern as the transcription worker — heavy enough to defer, light
   enough to skip Celery for MVP. Detection results atomically replace
   the previous set for the user (delete + insert in a single
   transaction).

2. **Pattern storage model**: top 3 patterns per user, stored in a
   `behavioral_patterns` table. Each row holds one pattern text and
   its rank (1–3). On each detection run, all existing rows for the
   user are deleted and the new top 3 are inserted within the same
   transaction, preventing a race window where a concurrent dashboard
   read sees zero patterns.

3. **Session overview trigger**: `generate_overview_task` is queued
   via `asyncio.create_task` at the end of `transcription.py` after
   `complete_transcription` succeeds. It calls the LLM with the full
   transcript and updates `sessions.overview`. Both workers share the
   same module-level `_llm_client` reference set during lifespan
   startup.

4. **Mood scale**: integer 1–5. Five fixed states:
   `1 = 😢 Terrible`, `2 = 😕 Not great`, `3 = 😐 Okay`,
   `4 = 🙂 Good`, `5 = 😊 Great`. One log per user per calendar day;
   a second `POST /today` within the same day upserts (updates) the
   existing row.

5. **Dashboard as primary post-auth landing**: `/dashboard` becomes
   the destination after login. The public home page at `/` remains
   for unauthenticated visitors.

6. **`overview` added to `SessionListItem`**: to avoid a second round-
   trip from the dashboard, `overview: str | None` is added to the
   `SessionListItem` schema and the `GET /sessions` list response.
   The `Session` ORM model already has the `overview` column.

---

## Backend — `app/core/config.py` additions

No new config keys are required for this slice. LLM access reuses the
existing `ollama_base_url` and `ollama_model` settings from the
sessions slice.

---

## Backend — `app/domains/insights/`

### `models.py`

`BehavioralPattern` ORM model (one row per detected pattern):

| Column          | Type                   | Constraints                     |
| --------------- | ---------------------- | ------------------------------- |
| `id`            | UUID, PK               | `default=uuid4`                 |
| `user_id`       | UUID, FK → `profiles`  | not null, indexed               |
| `pattern_text`  | Text                   | not null                        |
| `rank`          | Integer                | not null; 1, 2, or 3           |
| `detected_at`   | DateTime(tz)           | not null; server default now()  |

Register in `db/migrations/env.py`.

### `schemas.py`

- `BehavioralPatternOut`:
  - `id: UUID`
  - `pattern_text: str`
  - `rank: int`
  - `detected_at: datetime`

### `service.py`

Plain `def` (blocking I/O in FastAPI threadpool).

- `get_patterns(user_id: str, db: Session) → list[BehavioralPattern]`
  — returns all patterns for `user_id`, ordered `rank ASC`. Returns
  `[]` if no patterns have been detected yet.

- `replace_patterns(user_id: str, patterns: list[str], db: Session) → None`
  — within a single transaction: delete all `BehavioralPattern` rows
  for `user_id`, then insert one row per pattern text using the list
  index + 1 as rank. No-ops (but still commits the delete) if
  `patterns` is empty.

### `dependencies.py`

No additional dependencies beyond `CurrentUser` and `get_db`.

### `router.py`

Register under `/api/v1/insights` in `main.py`.

- `GET /patterns` (protected) → `list[BehavioralPatternOut]`
  — calls `get_patterns`; returns patterns ordered by rank.
  Returns `[]` if no patterns detected yet (not `404`).

---

## Backend — `app/domains/mood/`

### `models.py`

`MoodLog` ORM model (one row per user per calendar day):

| Column        | Type                   | Constraints                               |
| ------------- | ---------------------- | ----------------------------------------- |
| `id`          | UUID, PK               | `default=uuid4`                           |
| `user_id`     | UUID, FK → `profiles`  | not null; unique with `logged_date`       |
| `mood`        | Integer                | not null; 1–5                             |
| `logged_date` | Date                   | not null; server default `CURRENT_DATE`   |
| `created_at`  | DateTime(tz)           | server default now()                      |
| `updated_at`  | DateTime(tz)           | server default now(), onupdate now()      |

Unique constraint: `UniqueConstraint("user_id", "logged_date")`.

Register in `db/migrations/env.py`.

### `schemas.py`

- `MoodIn`:
  - `mood: int` — `Field(ge=1, le=5)`

- `MoodOut`:
  - `id: UUID`
  - `mood: int`
  - `logged_date: date`
  - `created_at: datetime`
  - `updated_at: datetime`

### `service.py`

Plain `def` (blocking I/O in FastAPI threadpool).

- `log_mood(user_id: str, mood: int, db: Session) → MoodLog`
  — upserts today's mood log: if a `MoodLog` for `(user_id, today)`
  already exists, update `mood` and `updated_at`; otherwise create a
  new row. Returns the row.

- `get_today_mood(user_id: str, db: Session) → MoodLog | None`
  — returns the `MoodLog` for `(user_id, today)`, or `None`.

### `dependencies.py`

No additional dependencies beyond `CurrentUser` and `get_db`.

### `router.py`

Register under `/api/v1/mood` in `main.py`.

All routes are protected. No subscription guard — mood logging is
available to all authenticated users.

- `POST /today` → `MoodOut (200)`
  — body: `MoodIn`; calls `log_mood`; returns the mood log.
  Uses `200` (not `201`) because this is an upsert.

- `GET /today` → `MoodOut | None`
  — calls `get_today_mood`; returns the mood log or `null` if not
  logged today. Response model is `Optional[MoodOut]`; always `200`.
  Returns `null` (not `404`) to distinguish "not logged yet" from an
  API error.

---

## Backend — Alembic migrations

**`0005_create_insights_tables`** (down_revision = `0004`):

```sql
CREATE TABLE behavioral_patterns (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    pattern_text TEXT NOT NULL,
    rank         INTEGER NOT NULL,
    detected_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_behavioral_patterns_user_id ON behavioral_patterns (user_id);
```

**`0006_create_mood_logs_table`** (down_revision = `0005`):

```sql
CREATE TABLE mood_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    mood        INTEGER NOT NULL CHECK (mood >= 1 AND mood <= 5),
    logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, logged_date)
);
CREATE INDEX ix_mood_logs_user_id ON mood_logs (user_id);
```

Verify both with `alembic upgrade head --sql`. Do not edit applied
revisions `0001`–`0004`.

---

## Backend — `app/workers/patterns.py`

`async def detect_patterns_task(user_id: str) → None`:

- Opens its own DB session (`SessionLocal()`).
- Calls `diary_service.list_entries(user_id, db)`. If fewer than 3
  entries exist, return early — not enough data for meaningful patterns.
- Builds the prompt using `PATTERN_DETECTION_PROMPT_V1` from
  `ai/prompts/therapy.py`, formatting all entry content (joined with
  `"\n\n---\n\n"` separators) and `count=3`.
- Calls `_llm_client.chat.completions.create` (sync-wrapped with
  `asyncio.to_thread`); attempts to parse the response as JSON array
  of strings. Logs and returns early on parse failure — never raises.
- Validates the parsed list: filters to non-empty strings; truncates to
  3 items. Skips replace if validation leaves zero patterns.
- Calls `insights_service.replace_patterns(user_id, patterns, db)`.
- Logs errors; never propagates exceptions.

Module-level LLM client reference (same pattern as `transcription.py`
Whisper reference):

```python
_llm_client = None

def set_llm_client(client):
    global _llm_client
    _llm_client = client
```

Call `workers.patterns.set_llm_client(app.state.llm_client)` in
`lifespan.py` startup.

Add `PATTERN_DETECTION_PROMPT_V1` to `ai/prompts/therapy.py`:

```python
PATTERN_DETECTION_PROMPT_V1 = (
    "You are analyzing a user's personal diary entries to identify "
    "repetitive behavioral patterns.\n\n"
    "Diary entries:\n{entries}\n\n"
    "Identify the top {count} most significant repetitive behavioral "
    "patterns you observe. Return ONLY a JSON array of strings — no "
    "explanation, no markdown fences.\n"
    'Example: ["Pattern one", "Pattern two", "Pattern three"]'
)
```

**Trigger wiring** — in `diary/router.py`, after `create_entry` and
after `update_entry` succeed, add:

```python
import asyncio
from app.workers import patterns as patterns_worker

asyncio.create_task(patterns_worker.detect_patterns_task(current_user.user_id))
```

---

## Backend — `app/workers/overviews.py`

`async def generate_overview_task(session_id: UUID, user_id: str) → None`:

- Opens its own DB session (`SessionLocal()`).
- Calls `session_service.get_session(session_id, user_id, db)`. If
  `session.transcript` is null, return early.
- Calls `_llm_client.chat.completions.create` (sync-wrapped with
  `asyncio.to_thread`) using `SESSION_OVERVIEW_PROMPT_V1` formatted
  with the transcript. Trims the response text.
- Updates `session.overview` with the result; commits.
- Logs errors; never propagates exceptions.

Shares the same module-level `_llm_client` reference with
`patterns.py`. Both workers call `set_llm_client` in `lifespan.py`;
define the function in each worker independently (no cross-worker
import).

Add `SESSION_OVERVIEW_PROMPT_V1` to `ai/prompts/therapy.py`:

```python
SESSION_OVERVIEW_PROMPT_V1 = (
    "You are summarizing a therapy session transcript. Write a 2-3 "
    "sentence overview of what was discussed and any key takeaways. "
    "Be compassionate and constructive.\n\n"
    "Transcript:\n{transcript}\n\nOverview:"
)
```

**Trigger wiring** — at the end of `transcription.py`'s
`transcribe_session_task`, after `complete_transcription` succeeds,
add:

```python
asyncio.create_task(overviews.generate_overview_task(session_id, user_id))
```

Import `user_id` from the session row (already fetched earlier in the
task). Pass both `session_id` and `user_id` so the overview worker can
use the ownership-safe `get_session` service call.

---

## Backend — `sessions/schemas.py` update

Add `overview: str | None` to `SessionListItem` so the dashboard can
display the last session's overview without an extra detail request:

```python
class SessionListItem(BaseModel):
    id: UUID
    status: SessionStatus
    duration_seconds: int | None
    started_at: datetime
    ended_at: datetime | None
    created_at: datetime
    has_transcript: bool = computed_field(...)
    overview: str | None        # ← add this field
```

The `Session` ORM model already has the `overview` column. Update
`list_sessions` in `sessions/service.py` to ensure the column is
loaded (it is by default with SQLAlchemy column mapping; no change
needed unless deferred loading was used).

---

## Frontend — models and API clients

### `app/models/insights.model.ts`

```ts
export interface BehavioralPatternOut {
  id: string;
  pattern_text: string;
  rank: number;
  detected_at: string;
}
```

### `core/api/insights.api.ts`

```ts
@Injectable({ providedIn: 'root' })
export class InsightsApi {
  getPatterns(): Observable<BehavioralPatternOut[]>
}
```

Endpoint: `GET /api/v1/insights/patterns`.

### `app/models/mood.model.ts`

```ts
export interface MoodIn {
  mood: number;
}

export interface MoodOut {
  id: string;
  mood: number;
  logged_date: string;
  created_at: string;
  updated_at: string;
}
```

### `core/api/mood.api.ts`

```ts
@Injectable({ providedIn: 'root' })
export class MoodApi {
  getTodayMood(): Observable<MoodOut | null>
  logMood(body: MoodIn): Observable<MoodOut>
}
```

`getTodayMood` should return `null` when the response body is `null`
(not throw). Use `HttpClient.get<MoodOut | null>`.

Update `app/models/session.model.ts` — add `overview: string | null`
to `SessionListItem` to match the updated backend schema.

---

## Frontend — `features/dashboard/pages/dashboard.page.ts`

The dashboard is the primary authenticated landing page at `/dashboard`.

**Signal state**:

| Signal        | Type                       | Description                                  |
| ------------- | -------------------------- | -------------------------------------------- |
| `patterns`    | `BehavioralPatternOut[]`   | Top behavioral patterns                      |
| `todayMood`   | `MoodOut \| null`          | Today's mood log; null if not logged yet     |
| `lastSession` | `SessionListItem \| null`  | Most recent session (index 0 of list)        |
| `isLoading`   | `boolean`                  | True while any API call is in flight         |

On init: call `insightsApi.getPatterns()`, `moodApi.getTodayMood()`, and
`sessionApi.listSessions()` in parallel via `forkJoin`; set signals on
completion. Show an error toast on failure; set `isLoading = false`
regardless.

**Layout** (per `ui-context.md` Dashboard pattern):

Page header:
- Greeting: "Good [morning / afternoon / evening], {displayName}."
  Time-of-day is derived from `new Date().getHours()`:
  morning = 5–11, afternoon = 12–17, evening = 18–4.
- `displayName` from `AuthStateService`.

Responsive card grid (`md:grid-cols-2` on desktop, single column on
mobile). Three surface cards:

**1 — Behavioral Patterns Card**

`Card` with header "Your Patterns".

- Empty state (`patterns.length === 0`): muted text "Write more diary
  entries to reveal your behavioral patterns." with a link to `/diary/new`.
- Populated: ordered list of patterns, each row showing a filled circle
  Badge with rank (1, 2, 3) in `--accent-primary` color, followed by the
  `pattern_text`. Newest `detected_at` shown in muted `--font-mono` at
  the card footer.

**2 — Daily Mood Card**

`Card` with header "How are you feeling today?".

Mood map (fixed constant):

```ts
const MOODS = [
  { value: 1, emoji: '😢', label: 'Terrible' },
  { value: 2, emoji: '😕', label: 'Not great' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😊', label: 'Great' },
];
```

- Not logged (`todayMood === null`): show 5 emoji buttons in a row.
  Each button is a round pill (`rounded-full`), outlined style; on
  hover it scales slightly. On click: call `moodApi.logMood({ mood: n })`
  and update the `todayMood` signal on success.
- Logged: show the selected emoji at `text-4xl` centered with the label
  below ("You're feeling 😊 Great today."). Allow changing by showing
  the 5 small emoji buttons below in muted style; clicking one re-logs.
- While the log request is in flight, disable the mood buttons and show
  a `Spinner` inside the card.

**3 — Last Session Card**

`Card` with header "Last Session".

- No sessions (`lastSession === null`): muted text "No sessions yet."
  with a primary Button "Start Your First Session" linking to
  `/sessions/new`.
- Session exists:
  - `started_at` formatted as `"MMM d, yyyy"` and time in `--font-mono`.
  - Duration as `mm:ss` in `--font-mono`.
  - Status `Badge`.
  - Overview block: if `overview` is non-null, render the text in
    `--font-sans` at `text-sm`. If `overview` is null and
    `status === 'ready'`, show "Overview is being generated…" with an
    inline `Spinner`. If `status !== 'ready'`, omit the overview block.
  - "View session" link → `/sessions/{id}` with a chevron icon.

**Floating action button**:

A round primary Button (`rounded-full`, `fixed bottom-6 right-6`) with
a microphone icon (`lucideMic`) and label "Start Session", navigating to
`/sessions/new`. Visible only when
`subscriptionStateService.hasActiveSubscription()` is true and
`subscriptionStateService.sessionsRemaining() > 0`. Hidden otherwise —
do not disable; do not show when quota is exhausted.

---

## Routes and navigation updates

Add to `app.routes.ts`:

```ts
{
  path: 'dashboard',
  canActivate: [authGuard],
  loadComponent: () =>
    import('./features/dashboard/pages/dashboard.page')
      .then(m => m.DashboardPage),
}
```

**Post-login redirect**: update the successful login handler in
`features/auth/services/auth.service.ts` (or wherever `router.navigate`
is called after login) to redirect to `/dashboard` instead of `/home`.
Do the same for the onboarding completion redirect.

**Home page update**: add a "Go to Dashboard" CTA button to
`home.page.ts` alongside the existing CTAs, visible when the user is
authenticated (`authState.isAuthenticated()`). Clicking it navigates
to `/dashboard`.

---

## Invariants to Honor

- `user_id` on every `BehavioralPattern` and `MoodLog` row is set from
  the verified JWT — never from the request body (invariant 2).
- `GET /insights/patterns` returns `[]` and `GET /mood/today` returns
  `null` when no data exists — the dashboard must handle empty states
  (not error states) for both (invariant: no 404 for absence of
  optional data).
- Pattern detection and overview generation run as background tasks —
  never inline in a request handler (invariant 1).
- The `insights/` worker reads diary entries through `diary_service`
  (a public collaboration surface) — never imports `diary/` internals
  directly (invariant 7).
- The `behavioral_patterns` delete + insert happens in a single
  transaction to prevent a race window where the dashboard sees zero
  patterns between the delete and the inserts.
- Mood validation (1–5) is enforced server-side via Pydantic
  `Field(ge=1, le=5)`; the frontend constrains the UI to these values
  but the server is the authority.
- `GET /mood/today` always returns `200` — `null` body means "not
  logged today", not an error. The Angular service must map this
  correctly and not treat `null` as an HTTP failure.
- Each background worker opens its own DB session; no session is shared
  with the triggering request handler or with another worker.

---

## Check When Done

- `GET /api/v1/insights/patterns` returns `[]` for a new user and the
  top 3 patterns (ordered rank 1–3) after `detect_patterns_task` has
  run following a diary entry creation.
- `GET /api/v1/insights/patterns` returns only patterns owned by the
  requesting user; another user's JWT sees their own patterns (or `[]`).
- `POST /api/v1/mood/today` with `{"mood": 4}` returns `200 MoodOut`.
  A second `POST` with `{"mood": 2}` returns `200 MoodOut` with
  `mood = 2` — the row was updated, not duplicated.
- `POST /api/v1/mood/today` with `{"mood": 0}` or `{"mood": 6}`
  returns `422 Unprocessable Entity`.
- `GET /api/v1/mood/today` returns `null` before any mood is logged
  today; returns the current mood log after logging.
- `GET /api/v1/sessions` response includes `overview: null | str` on
  each list item.
- After a session is transcribed (`status = "ready"`), the
  `generate_overview_task` background task runs; subsequently
  `GET /sessions/{id}` returns a non-null `overview`.
- After a diary entry is created or updated, `detect_patterns_task`
  runs in the background; subsequently `GET /insights/patterns`
  returns the refreshed pattern set.
- Dashboard loads all three data sources in parallel; empty states
  render correctly when no patterns, mood, or sessions exist.
- The mood logger updates the `todayMood` signal on click success
  without a full page reload.
- The floating "Start Session" button is hidden when sessions remaining
  is 0 or subscription is inactive.
- Alembic migrations `0005` and `0006` render clean SQL
  (`alembic upgrade head --sql`) and apply against the database.
- `npm run build` passes (frontend, zero warnings).
- `progress-tracker.md` updated to reflect the completed slice.
