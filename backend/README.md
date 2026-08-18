# Bright Day — Backend

FastAPI backend for Bright Day, a voice-driven AI wellbeing companion. Handles authentication, subscriptions, real-time voice sessions via WebSocket, diary journaling, mood tracking, and AI-powered insights.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | FastAPI 0.115+ with Uvicorn |
| Database | PostgreSQL via SQLAlchemy 2.0 + psycopg (v3) |
| Migrations | Alembic |
| Auth | Supabase Auth (JWT / JWKS verification) |
| Payments | Stripe |
| LLM | Ollama (llama3.1, OpenAI-compatible API) |
| STT | Faster-Whisper |
| TTS | Kokoro ONNX (optional — degrades to text-only) |
| AI Orchestration | LangGraph |
| Storage | Supabase Storage |

---

## Project Structure

```
backend/
├── app/
│   ├── main.py                  # App factory, router registration
│   ├── core/
│   │   ├── config.py            # Pydantic settings (env vars)
│   │   ├── lifespan.py          # Startup/shutdown (models, clients)
│   │   ├── security.py          # JWT verification via Supabase JWKS
│   │   └── exceptions.py        # Global error handling
│   ├── db/
│   │   ├── session.py           # SQLAlchemy engine + session factory
│   │   └── migrations/          # Alembic migration scripts
│   ├── domains/
│   │   ├── auth/                # Register, login, onboarding, /me
│   │   ├── subscription/        # Tiers, Stripe checkout, webhook
│   │   ├── sessions/            # Voice sessions + WebSocket loop
│   │   ├── diary/               # Diary entries CRUD
│   │   ├── mood/                # Daily mood logging
│   │   └── insights/            # Behavioral patterns (AI-detected)
│   ├── ai/
│   │   ├── graph.py             # LangGraph turn: STT → LLM → TTS
│   │   ├── prompts/therapy.py   # System prompts
│   │   ├── stt/whisper.py       # Faster-Whisper transcription
│   │   └── tts/kokoro.py        # Kokoro TTS synthesis
│   ├── workers/
│   │   ├── transcription.py     # Post-session Whisper background task
│   │   ├── overviews.py         # Session overview generation (LLM)
│   │   └── patterns.py          # Diary pattern detection (LLM)
│   └── storage/
│       └── audio.py             # Supabase Storage adapter
├── tests/
├── .env.example
├── alembic.ini
└── pyproject.toml
```

---

## Prerequisites

- **Python 3.12+**
- **PostgreSQL** — Supabase managed instance or local
- **Supabase project** — for auth and file storage
- **Stripe account** — test-mode keys for local development
- **Ollama** — local LLM inference server

---

## Getting Started

### 1. Install dependencies

This project uses [`uv`](https://github.com/astral-sh/uv) as the package manager.

```bash
# Install uv if you don't have it
curl -Ls https://astral.sh/uv/install.sh | sh

# Install all dependencies from the lockfile
uv sync
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in every value. See the [Environment Variables](#environment-variables) section for details.

### 3. Run database migrations

```bash
uv run alembic upgrade head
```

### 4. Start Ollama (LLM)

```bash
# Install Ollama from https://ollama.com, then:
ollama serve
ollama pull llama3.1
```

### 5. Start the backend server

```bash
# Development — auto-reload on file changes
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

```bash
# Production — multiple workers, no reload
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

Once running:

- **Health check:** `GET http://localhost:8000/api/v1/health`
- **Swagger UI:** `http://localhost:8000/docs` *(development only)*
- **ReDoc:** `http://localhost:8000/redoc` *(development only)*

---

## Environment Variables

| Variable | Description |
|---|---|
| `ENVIRONMENT` | `development` \| `staging` \| `production` |
| `APP_NAME` | Display name for the API |
| `API_V1_PREFIX` | Route prefix, default `/api/v1` |
| `CORS_ORIGINS` | JSON array of allowed origins, e.g. `["http://localhost:4200"]` |
| `FRONTEND_URL` | Base URL used for email-verification redirect links |
| `DATABASE_URL` | PostgreSQL connection string (`postgresql+psycopg://...`) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key |
| `SUPABASE_SECRET_KEY` | Supabase service role key (server-side only) |
| `SUPABASE_JWT_SIGNIN_ID` | Supabase JWT signing ID |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...` for local) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `STRIPE_PRICE_ID_WEEKLY_1` | Stripe Price ID for 1 session/week tier |
| `STRIPE_PRICE_ID_WEEKLY_3` | Stripe Price ID for 3 sessions/week tier |
| `STRIPE_PRICE_ID_WEEKLY_5` | Stripe Price ID for 5 sessions/week tier |
| `OLLAMA_BASE_URL` | Ollama API base URL, default `http://localhost:11434/v1` |
| `OLLAMA_MODEL` | Model name to use, default `llama3.1` |
| `WHISPER_MODEL_SIZE` | `base` (dev) \| `small` \| `medium` (prod) |
| `SUPABASE_STORAGE_BUCKET` | Supabase Storage bucket name for session audio |
| `KOKORO_MODEL_PATH` | Path to the Kokoro ONNX model, default `models/kokoro-v1.0.onnx` |
| `KOKORO_VOICES_PATH` | Path to the Kokoro voices file, default `models/voices-v1.0.bin` |
| `ESPEAK_LIBRARY_PATH` | espeak-ng shared library; empty = auto-detect (Homebrew/apt) |
| `ESPEAK_DATA_PATH` | espeak-ng data dir; empty = derive from the library location |

---

## API Overview

All routes are prefixed with `/api/v1`.

| Domain | Prefix | Key Endpoints |
|---|---|---|
| Auth | `/auth` | `POST /register`, `POST /login`, `POST /onboarding`, `GET /me` |
| Subscriptions | `/subscriptions` | `GET /me`, `POST /checkout`, `POST /webhook` |
| Sessions | `/sessions` | `POST /`, `GET /`, `GET /{id}`, `WS /ws/{id}` |
| Diary | `/diary` | `POST /`, `GET /`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}` |
| Mood | `/mood` | `POST /today`, `GET /today` |
| Insights | `/insights` | `GET /patterns` |

### Subscription tiers

| Tier | Sessions per week |
|---|---|
| Free | 1 (lifetime, not recurring) |
| `weekly_1` | 1 |
| `weekly_3` | 3 |
| `weekly_5` | 5 |

### Voice session WebSocket

```
WS /api/v1/sessions/ws/{session_id}?token={jwt}
```

The client streams raw audio bytes per utterance. Text messages `"end_utterance"` and `"end_session"` control the session lifecycle. The server replies with AI text and optional synthesized audio (WAV bytes).

---

## Database Migrations

```bash
# Apply all pending migrations
uv run alembic upgrade head

# Create a new migration after model changes
uv run alembic revision --autogenerate -m "describe_change"

# Rollback one step
uv run alembic downgrade -1
```

---

## Running Tests

```bash
uv run pytest
```

---

## Stripe Webhook (Local Development)

Use the Stripe CLI to forward events to your local server:

```bash
stripe listen --forward-to http://localhost:8000/api/v1/subscriptions/webhook
```

Copy the printed webhook signing secret into `STRIPE_WEBHOOK_SECRET` in your `.env`.

---

## Voice / TTS setup

The AI's spoken replies are synthesized with [Kokoro ONNX](https://github.com/thewh1teagle/kokoro-onnx). Two one-time setup steps are required.

**1. Install `espeak-ng` (phonemizer backend).** The `espeakng-loader` wheel bundled with `kokoro-onnx` ships a broken compiled-in data path, so a real system `espeak-ng` is required:

```bash
# macOS
brew install espeak-ng
# Debian / Ubuntu
sudo apt-get install espeak-ng
```

It is auto-detected at startup (Homebrew `/opt/homebrew` or `/usr/local`, apt `/usr/lib`). Override with `ESPEAK_LIBRARY_PATH` / `ESPEAK_DATA_PATH` if installed elsewhere.

**2. Download the Kokoro model files.** The `kokoro-onnx` package is installed by `uv sync`, but the model **files are not committed** (~340 MB) — download them once into `backend/models/`:

```bash
mkdir -p models
curl -fL -o models/voices-v1.0.bin \
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
curl -fL -o models/kokoro-v1.0.onnx \
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
```

Paths are configurable via `KOKORO_MODEL_PATH` / `KOKORO_VOICES_PATH` (relative to the `backend/` working directory).

If the model files are missing, or no `espeak-ng` is found, the server logs an **error** and continues in **text-only mode** — the AI responds with text but no synthesized audio is sent over the WebSocket. On success the startup log shows `Kokoro TTS initialized (espeak-ng: …).`
