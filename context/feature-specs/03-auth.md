Read `CLAUDE.md` before starting.

We're building the first domain slice: `auth`, as a thin
front-to-back vertical slice (router → service → schema →
persistence, then UI). Authentication runs through Supabase
Auth, but the frontend authenticates via the **backend**, not
directly against Supabase. The backend issues/validates
stateless JWTs and enforces auth server-side.

Work back-to-front, one slice at a time. Do not bundle the
onboarding worker logic or other domains into this step.

## Backend — `app/domains/auth/`

Build the domain package per `architecture.md` (router,
schemas, models, service, dependencies):

- `schemas.py` — Pydantic request/response contracts for
  register, login, email verification, and onboarding answers.
- `models.py` — SQLAlchemy models for the user profile and
  onboarding answers (every row owned by one `user_id`).
- `service.py` — domain logic; the only cross-domain entry.
  Wraps Supabase Auth (register, verify email, login) and
  persists profile + onboarding data.
- `router.py` — HTTP endpoints under `/api/v1/auth`:
  - register + trigger email verification
  - login → returns JWT
  - submit onboarding questions (protected)
  - current user (`/me`, protected)
- `dependencies.py` — domain-scoped FastAPI dependencies
  (current-user resolution from the verified JWT).
- JWT verification lives in `core/security.py` and runs at the
  boundary before any handler logic.
- Add an Alembic migration for the new tables (new revision —
  do not edit applied history).

## Frontend — `features/auth/`

Compose the existing `shared/ui` primitives (do not modify
`shared/ui/*`):

- `core/api/` — typed auth API calls (the only backend caller).
- `core/interceptors/` — attach `Authorization: Bearer <token>`
  and handle auth errors.
- `core/guards/` — auth guard for protected routes.
- `core/services/` — signal-based auth state (current user,
  token).
- `features/auth/pages/` — register, login, email-verification,
  and onboarding routed components.
- `features/auth/services/` + `state/` — feature API calls (via
  `core/api`) and feature-scoped signal state.

## Invariants to honor

- Auth and ownership enforced server-side on every protected
  request; the client never asserts identity (`architecture.md`
  invariant 2).
- Credentials never passed in the URL path; token only via the
  `Authorization` header.
- External input validated against Pydantic schemas at the
  boundary before it is trusted or persisted (invariant 5).
- Frontend reaches the backend exclusively through `core/`
  (invariant 8).

## Check when done

- A new user can register, receive email verification, complete
  onboarding questions, and log in (success criterion 1).
- Protected endpoints reject requests without a valid JWT.
- Backend starts cleanly with no schema/validation errors and
  the migration applies.
- `npm run build` passes (frontend).
- `progress-tracker.md` updated to reflect the completed slice.
