Read `CLAUDE.md` before starting.

All product features are implemented (specs 00–08). This spec covers
the environment setup and end-to-end integration steps required to run
the full application against real services — database, object storage,
payments, and local AI models.

No new features or domains are introduced. This is a runbook for wiring
the already-built code to live infrastructure.

Work through each section in order — each one is a prerequisite for the
next. Verify each before moving on.

---

## 1 — Database: Apply migrations via IPv4 Session Pooler

The local machine has no IPv6 route to the direct Supabase DB host
(`db.<ref>.supabase.co:5432`). Use the **Session pooler** connection
string instead.

**Steps**:

1. In the Supabase dashboard → **Connect** → **Session pooler**, copy
   the connection string. It looks like:
   ```
   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
2. In `backend/.env`, set:
   ```
   DATABASE_URL=postgresql+psycopg://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
   Encode any `#` characters in the password as `%23`. The `+psycopg`
   driver suffix is required.
3. From `backend/`, run:
   ```bash
   uv run alembic upgrade head
   ```
4. Verify all six revisions applied:
   ```bash
   uv run alembic current
   # → HEAD at 0006_create_mood_logs_table
   ```

**Tables expected after migration**:
- `profiles`
- `onboarding_responses`
- `subscriptions`
- `sessions`
- `diary_entries`
- `behavioral_patterns`
- `mood_logs`

---

## 2 — Supabase: Auth and email configuration

### Email confirmation

In the Supabase dashboard → **Authentication** → **Providers** → **Email**:
- Enable **Confirm email** (toggle on).

### Redirect URL

In **Authentication** → **URL Configuration** → **Redirect URLs**, add:
```
http://localhost:4200/auth/verify-email
```

This is the URL Supabase uses after the user clicks the confirmation
link in the registration email.

### SMTP (optional for local dev)

Supabase's shared email service (no custom SMTP) sends confirmation
emails but does not allow editing templates. This is sufficient for
development. For production, configure a custom SMTP provider under
**Authentication** → **SMTP Settings**.

---

## 3 — Supabase Storage: Create the sessions-audio bucket

In the Supabase dashboard → **Storage** → **New bucket**:
- **Name**: `sessions-audio`
- **Public**: off (private)
- **File size limit**: at least `500 MB` (recorded sessions can be large)
- **Allowed MIME types**: leave empty (the backend controls upload type)

In `backend/.env`, confirm:
```
SUPABASE_STORAGE_BUCKET=sessions-audio
```

The `audio.py` storage adapter uses the bucket name from settings.
No policy changes needed — the backend accesses storage using the
secret key (service role), not user JWTs.

---

## 4 — Ollama: Install and configure the local LLM

The backend calls Ollama's OpenAI-compatible HTTP server for the therapy
agent, pattern detection, and session overviews.

### Install Ollama

Download and install from [https://ollama.com](https://ollama.com).
After installation:
```bash
ollama serve
# → Listening on http://localhost:11434
```

### Pull the model

The `.env` key `OLLAMA_MODEL` controls which model is used. A capable
but lightweight default:
```bash
ollama pull llama3.1:8b
```

For better quality (if the machine has enough VRAM/RAM):
```bash
ollama pull llama3.1:70b
```

Set in `backend/.env`:
```
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1:8b
```

### Verify

```bash
curl http://localhost:11434/api/tags
# → JSON list including "llama3.1:8b"
```

---

## 5 — Faster-Whisper: STT model

Faster-Whisper downloads its model on first use. The model size is
controlled by `WHISPER_MODEL_SIZE` in `.env`.

```
WHISPER_MODEL_SIZE=base
```

Available sizes (smallest → largest): `tiny`, `base`, `small`,
`medium`, `large-v3`. `base` is sufficient for English dev testing.
The model is cached to `~/.cache/huggingface/` on first boot.

No additional steps — the backend's lifespan event initializes
Faster-Whisper automatically using the setting.

---

## 6 — Stripe: Test-mode configuration

### Create products and prices

In the Stripe Dashboard (test mode):

1. **Products** → **Add product**. Create three paid plans:
   - **Basic** — `$X/month`, recurring; set metadata or note `sessions_per_week: 1`.
   - **Standard** — `$X/month`, recurring; `sessions_per_week: 3`.
   - **Premium** — `$X/month`, recurring; `sessions_per_week: 5`.

2. Copy each plan's **Price ID** (`price_XXXXXXXXXXXXXXXXX`).

### Configure `.env`

In `backend/.env`:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # fill in after step below
STRIPE_PRICE_ID_WEEKLY_1=price_...
STRIPE_PRICE_ID_WEEKLY_3=price_...
STRIPE_PRICE_ID_WEEKLY_5=price_...
```

### Local webhook forwarding

Install the Stripe CLI ([https://stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli)), then:

```bash
stripe login
stripe listen --forward-to http://localhost:8000/api/v1/subscriptions/webhook
```

The CLI prints the webhook signing secret (`whsec_...`). Copy it into
`STRIPE_WEBHOOK_SECRET` in `.env`.

Leave the `stripe listen` process running during checkout testing.

---

## 7 — Start the application

### Backend

```bash
cd backend
nvm use   # not required for Python, but for parity
uv run uvicorn app.main:app --reload
```

Verify startup logs:
- `Whisper model loaded.`
- `Kokoro TTS initialized.` (or `Kokoro TTS not available — text-only mode.`)
- `LLM client initialized.`
- `Supabase Storage initialized.`

`GET http://localhost:8000/api/v1/health` → `200 {"status": "ok"}`.

### Frontend

```bash
cd frontend
nvm use   # Node 24.15.0 (pinned in .nvmrc)
npm start
```

Opens at `http://localhost:4200`.

---

## 8 — End-to-end verification flow

Work through each step in sequence. Verify before moving to the next.

### 8.1 — Registration and email verification

1. Navigate to `http://localhost:4200`.
2. Click **Get Started Free** → `/auth/register`.
3. Fill in email and password; submit.
4. Check the email inbox for the Supabase confirmation email; click
   the link.
5. The browser lands at `/auth/verify-email` → backend calls `/me` →
   profile and free subscription rows created in DB.
6. Redirected to `/dashboard`.

**Verify**: `profiles` and `subscriptions` tables each have one row
for the new user.

### 8.2 — Onboarding

1. After email verification, if onboarding is not complete, the app
   redirects to `/auth/onboarding`.
2. Complete all fields (display name, primary focus, etc.) and submit.
3. Redirected to `/dashboard`.

**Verify**: `onboarding_responses` table has a row for the user.

### 8.3 — Dashboard (empty state)

1. `/dashboard` loads.
2. Behavioral Patterns card: "Write more diary entries to reveal your
   behavioral patterns."
3. Daily Mood card: five emoji buttons (no mood logged yet).
4. Last Session card: "No sessions yet."
5. Floating "Start Session" FAB is visible (free subscription is active,
   1 session remaining).

### 8.4 — Diary and pattern detection

1. Navigate to `/diary/new`; write a diary entry; save.
2. Repeat until at least 3 entries exist.
3. After the third save, `detect_patterns_task` fires in the background.
4. Wait a few seconds, then refresh `/dashboard`.
5. Behavioral Patterns card shows up to 3 detected patterns.

**Verify**: `behavioral_patterns` table has 1–3 rows for the user.

### 8.5 — Mood logging

1. On `/dashboard`, click any of the five mood emoji buttons.
2. The card updates to show the selected mood ("You're feeling 😊 Great
   today.").
3. Reload the page — the logged mood persists.

**Verify**: `mood_logs` table has one row for today's date.

### 8.6 — Subscription upgrade

1. Navigate to `/subscription`.
2. Click **Start Standard** (3/week) → Stripe Checkout opens.
3. Use Stripe test card `4242 4242 4242 4242` (any future expiry, any
   CVC).
4. Complete checkout → redirected back to `/subscription?success=true`.
5. The subscription card updates to reflect the new tier and 3 remaining
   sessions.

**Verify**: `subscriptions` table row shows `tier = "weekly_3"`,
`status = "active"`, and `stripe_subscription_id` is populated.

### 8.7 — Voice session (requires microphone)

1. Click the floating **Start Session** FAB on `/dashboard`
   (or `/sessions/new`).
2. Grant microphone access when prompted.
3. The UI transitions to "Connected & Recording" (warm orange/recording
   state).
4. Speak a brief therapy-related message; wait for the AI response
   (TTS audio plays back).
5. Click **End Session** — the UI shows a processing state.
6. Backend uploads audio to Supabase Storage, creates a `sessions` row,
   then starts `transcribe_session_task` in the background.
7. Redirected to `/sessions` (session history).

**Verify**: `sessions` table has a new row with `status = "processing"`.

### 8.8 — Transcription and overview generation

1. Wait 30–90 seconds for Faster-Whisper to transcribe the session
   audio.
2. Refresh `/sessions`.
3. The new session's status badge changes from "Processing" to "Ready".
4. Open the session detail (`/sessions/{id}`):
   - Transcript is populated.
   - Audio player loads and plays the recorded session.
   - Overview field shows the AI-generated summary (or "being
     generated…" if still in progress).

**Verify**: `sessions` table row has `status = "done"`, non-null
`transcript`, and non-null `overview` (after `generate_overview_task`
completes).

### 8.9 — Dashboard (populated state)

1. Return to `/dashboard`.
2. Last Session card: shows date, duration, status badge, overview text,
   and "View session" link.
3. Behavioral Patterns card: patterns visible (updated after any diary
   write earlier).
4. Daily Mood card: today's mood displayed.

### 8.10 — Session quota enforcement

1. With the Standard subscription (3/week) and 1 session already used,
   `sessions_remaining = 2` — the FAB is still visible.
2. Use all remaining sessions.
3. When quota reaches 0, the FAB disappears from `/dashboard`.
4. Attempting `POST /api/v1/sessions` directly returns `403 Forbidden`.

---

## Open Questions to resolve before declaring integration complete

- If the machine has no GPU, Kokoro TTS may be unavailable and the
  WebSocket handler degrades to text-only (audio response is skipped).
  This is acceptable for development but must be documented in the
  progress tracker.

- The Stripe webhook secret changes every time `stripe listen` restarts.
  Update `STRIPE_WEBHOOK_SECRET` in `.env` each session, or use a fixed
  secret by signing in to the Stripe Dashboard and creating a permanent
  endpoint for `http://localhost:8000/api/v1/subscriptions/webhook`.

- If pattern detection or overview generation fail silently (LLM not
  running, malformed response), add a log inspection step:
  ```bash
  # backend terminal — look for worker log lines
  grep "detect_patterns_task\|generate_overview_task" backend/uvicorn.log
  ```

---

## Check When Done

- All seven Alembic migrations apply cleanly (`alembic upgrade head`
  exits 0; `alembic current` shows `0006`).
- Backend starts with no import errors; all lifespan clients initialize
  (or degrade gracefully).
- A new user can register, verify email, and land on `/dashboard` with
  an empty-state view.
- A free-tier user can complete one voice session; the session appears
  in `/sessions` with status "ready" and a transcript.
- Dashboard shows behavioral patterns, today's mood, and the last
  session overview for a user who has diary entries, a logged mood, and
  at least one completed session.
- After a Stripe checkout round-trip, the subscription upgrades and the
  FAB reflects the new session quota.
- `progress-tracker.md` updated to reflect integration complete and any
  open environment notes.
