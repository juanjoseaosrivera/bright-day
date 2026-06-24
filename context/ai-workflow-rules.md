# AI Workflow Rules

## Approach

Build this project incrementally using a spec-driven
workflow. The context files are the single source of truth:
`project-overview.md` defines *what* to build,
`architecture.md` defines the *boundaries and invariants*,
`code-standards.md` defines *how* to write it, and
`progress-tracker.md` records the *current state*.

Always implement against these specs — do not infer or
invent product behavior from scratch. Work front-to-back
through one domain at a time (`auth` → `subscription` →
`sessions` → `diary` → `insights`/`mood` → `dashboard` →
`home`), wiring a thin vertical slice (route → service →
schema → persistence, then UI) before broadening a feature.

## Scoping Rules

- Work on one feature unit at a time
- Prefer small, verifiable increments over large
  speculative changes
- Do not combine unrelated system boundaries in a
  single implementation step

## When to Split Work

Split an implementation step if it combines:

- A request-handler change *and* a background-worker change
  (e.g. an endpoint plus its transcription/pattern-detection
  job) — these are separate boundaries per
  `architecture.md` invariant 1
- Multiple unrelated API routes or more than one domain
  package in a single step
- Behavior not clearly defined in the context files, or a
  cross-cutting concern (auth/ownership, AI scope guarding,
  storage) bundled with feature logic

If a change cannot be verified end to end quickly,
the scope is too broad — split it.

## Handling Missing Requirements

- Do not invent product behavior not defined in the
  context files
- If a requirement is ambiguous, resolve it in the
  relevant context file before implementing
- If a requirement is missing, add it as an open question
  in `progress-tracker.md` before continuing

## Protected Files

Do not modify the following unless explicitly instructed:

- `frontend/src/app/shared/ui/*` (and any shadcn/ui
  generated components) — manage these via the shadcn CLI,
  not by hand-editing internals
- `db/` migration scripts that have already been applied —
  add a new Alembic migration instead of editing history
- Any third-party library internals
- The source context docs (`project-overview.md`,
  `architecture.md`, `code-standards.md`) — change these
  only through an explicit, deliberate decision, not as a
  side effect of implementation

## Keeping Docs in Sync

Update the relevant context file whenever implementation
changes:

- System architecture or boundaries
- Storage model decisions
- Code conventions or standards
- Feature scope

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope
2. No invariant defined in `architecture.md` was violated
3. `progress-tracker.md` reflects the completed work
4. `npm run build` passes (frontend) and the backend starts
   cleanly with no schema/validation errors
