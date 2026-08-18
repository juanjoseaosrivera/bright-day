Read `CLAUDE.md` before starting.

We're building the fourth domain slice: `diary`, as a thin
front-to-back vertical slice. The written diary lets authenticated
users create, maintain, list, and read personal diary entries. Diary
entry content feeds the behavioral-pattern detection worker (next
slice, `07-insights-mood`) — but that worker is not wired here.
This slice is CRUD only.

Work back-to-front, one increment at a time. Do not wire insights or
pattern detection logic here.

---

## Architecture Decisions to Confirm

Record each decision in `architecture.md` before implementing.

1. **Diary entries are plain text for MVP.** No rich text, markdown
   rendering, or attachments. `content` is a plain `Text` column.
   If formatting is needed in a future slice, it can be added as a
   migration without breaking this contract.

2. **Title is optional.** Entries may be untitled; the list view
   falls back to a truncated content preview when no title is set.
   A `content_preview` computed field (first 120 chars of `content`)
   is included in the list schema for this purpose.

3. **Edit and delete are in scope.** "Maintain a personal diary"
   (project-overview) implies the ability to revise and remove
   entries. `PUT /{entry_id}` and `DELETE /{entry_id}` are
   implemented in this slice.

4. **No pagination for MVP.** All entries are fetched in a single
   `GET /` call, newest first. If the dataset grows large, a cursor
   or offset pagination can be added as a later migration without
   breaking the existing contract.

5. **Pattern detection is out of scope here.** The `insights/` domain
   will read `diary_entries` rows (via its own service, not by
   importing from the `diary/` package internals) in the next slice.
   No `analyzed_at` or embedding columns are added now.

---

## Backend — `app/core/config.py`

No new config keys are required for this slice. The existing
`DATABASE_URL` and Supabase settings are sufficient.

---

## Backend — `app/domains/diary/`

### `models.py`

`DiaryEntry` ORM model (one row per entry):

| Column            | Type              | Constraints                            |
| ----------------- | ----------------- | -------------------------------------- |
| `id`              | UUID, PK          | `default=uuid4`                        |
| `user_id`         | UUID, FK → `profiles` | not null, indexed                  |
| `title`           | String(255)       | nullable                               |
| `content`         | Text              | not null                               |
| `created_at`      | DateTime(tz)      | server default now()                   |
| `updated_at`      | DateTime(tz)      | server default now(), onupdate now()   |

Register this model in `db/migrations/env.py` alongside existing
domain models.

### `schemas.py`

- `DiaryEntryIn` — request body for create and update:
  - `title: str | None = None`
  - `content: str` (required; min length 1)

- `DiaryEntryListItem` — list projection (no full content):
  - `id: UUID`
  - `title: str | None`
  - `content_preview: str` — `@computed_field`: first 120 chars of
    `content`, stripped of leading/trailing whitespace. Appends `"…"`
    if `content` was truncated.
  - `created_at: datetime`
  - `updated_at: datetime`

- `DiaryEntryOut` — full entry (detail view):
  - `id: UUID`
  - `title: str | None`
  - `content: str`
  - `created_at: datetime`
  - `updated_at: datetime`

### `service.py`

Plain `def` (blocking I/O in FastAPI threadpool per
`code-standards.md`). Ownership is enforced in every fetch — a
mismatched `user_id` returns `AppError(404)` (no information leakage
via 403).

- `create_entry(user_id: str, title: str | None, content: str, db: Session) → DiaryEntry`
  — creates and commits a new `DiaryEntry` row; returns it.

- `list_entries(user_id: str, db: Session) → list[DiaryEntry]`
  — all entries for `user_id`, ordered `created_at DESC`.

- `get_entry(entry_id: UUID, user_id: str, db: Session) → DiaryEntry`
  — fetches by `(id, user_id)`; raises `AppError(404)` if not found
  or owned by a different user.

- `update_entry(entry_id: UUID, user_id: str, title: str | None, content: str, db: Session) → DiaryEntry`
  — calls `get_entry` (ownership check); updates `title`, `content`,
  and commits; returns the updated row.

- `delete_entry(entry_id: UUID, user_id: str, db: Session) → None`
  — calls `get_entry` (ownership check); deletes the row; commits.

### `dependencies.py`

No additional dependencies beyond `CurrentUser` and `get_db` imported
from `auth` and `db` modules. Entry ownership is enforced inside
`service.py` on every fetch.

### `router.py`

Register under `/api/v1/diary` in `main.py`.

All routes are protected (`CurrentUser` dependency). No subscription
guard — diary access does not require an active subscription.

- `POST /` → `DiaryEntryOut (201)`
  — body: `DiaryEntryIn`; calls `create_entry`; returns full entry.

- `GET /` → `list[DiaryEntryListItem]`
  — calls `list_entries`; returns newest-first.

- `GET /{entry_id}` → `DiaryEntryOut`
  — calls `get_entry`; returns full entry.

- `PUT /{entry_id}` → `DiaryEntryOut`
  — body: `DiaryEntryIn`; calls `update_entry`; returns updated entry.

- `DELETE /{entry_id}` → `204 No Content`
  — calls `delete_entry`; returns empty response.

---

## Backend — Alembic migration

Add revision `0004_create_diary_entries_table` (down_revision = `0003`).
Do not edit applied revisions `0001`, `0002`, or `0003`.

The migration creates:

```sql
CREATE TABLE diary_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    title       VARCHAR(255),
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_diary_entries_user_id ON diary_entries (user_id);
```

Verify with `alembic upgrade head --sql` before applying.

---

## Frontend — `features/diary/`

Compose the existing `shared/ui` primitives (do not modify
`shared/ui/*`).

### `app/models/diary.model.ts`

TypeScript interfaces matching the backend Pydantic schemas:

```ts
export interface DiaryEntryIn {
  title?: string;
  content: string;
}

export interface DiaryEntryListItem {
  id: string;
  title: string | null;
  content_preview: string;
  created_at: string;
  updated_at: string;
}

export interface DiaryEntryOut {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}
```

### `core/api/diary.api.ts`

Typed HTTP calls following the pattern of `core/api/session.api.ts`:

```ts
@Injectable({ providedIn: 'root' })
export class DiaryApi {
  listEntries(): Observable<DiaryEntryListItem[]>
  getEntry(id: string): Observable<DiaryEntryOut>
  createEntry(body: DiaryEntryIn): Observable<DiaryEntryOut>
  updateEntry(id: string, body: DiaryEntryIn): Observable<DiaryEntryOut>
  deleteEntry(id: string): Observable<void>
}
```

All calls go through the existing `HttpClient` — no direct backend
URL construction outside `core/api/`.

### `features/diary/pages/diary-list.page.ts`

Diary entry list (newest first):

- On init: call `diaryApi.listEntries()`; store in a `entries` signal.
- Display a chronological list of tappable Card primitives (newest
  first). Each card shows:
  - `title` (bold) if set; else `content_preview` styled as title.
  - `content_preview` as secondary text (two-line clamp via
    `line-clamp-2` Tailwind utility) when a title is present.
  - `created_at` date formatted as `"MMM d, yyyy"` with
    `--font-mono` for the date portion.
  - A right-chevron icon (`lucideChevronRight`).
- Clicking a card navigates to `/diary/:id`.
- "New Entry" Button (primary) in the top-right of the page header,
  navigating to `/diary/new`.
- Empty state: "No entries yet. Start writing your first entry." with
  a CTA Button linking to `/diary/new`.
- Show `Spinner` while loading; show an error toast on failure.

### `features/diary/pages/diary-editor.page.ts`

Single page that handles both **create** (`/diary/new`) and **edit**
(`/diary/:id/edit`) modes, determined by the presence of an `:id`
route param.

**Signal-based state**:

| Signal        | Description                                     |
| ------------- | ----------------------------------------------- |
| `mode`        | `'create'` or `'edit'`                          |
| `entry`       | `DiaryEntryOut | null` (null in create mode)    |
| `isSaving`    | `boolean` — request in flight                   |
| `isDirty`     | `boolean` — any unsaved change                  |

**UI**:

- Full-page form with comfortable vertical padding.
- `Input` primitive for the optional title (`placeholder="Title (optional)"`).
- `Textarea` primitive for the content (`placeholder="Write your thoughts…"`,
  auto-grow or fixed tall; min 8 rows). Required — disable the save
  button when empty.
- "Save" Button (primary, large) at the bottom. Disabled when
  `!isDirty` or `isSaving`; shows `Spinner` inside the button while
  `isSaving`.
- "Cancel" Button (ghost) that navigates back: to `/diary` in create
  mode, to `/diary/:id` in edit mode. Pops a browser `confirm()` only
  if `isDirty` to guard unsaved changes.
- In edit mode: load the existing entry on init (`diaryApi.getEntry(id)`),
  populate the form signals, set `isDirty = false`.
- On save (create): call `diaryApi.createEntry()`; on success,
  navigate to the new entry's detail page (`/diary/:id`) and show a
  success toast.
- On save (edit): call `diaryApi.updateEntry(id, ...)`; on success,
  navigate to `/diary/:id` and show a success toast.
- Show an error toast on API failure; remain on the page.

### `features/diary/pages/diary-detail.page.ts`

Diary entry detail page:

- On init: call `diaryApi.getEntry(id)`.
- **Layout** (per `ui-context.md`): single-column, comfortable max-width.
  - Header row: `title` (or `"Untitled Entry"` in muted style if null);
    `created_at` as `"MMMM d, yyyy 'at' h:mm a"` in `--font-mono`
    muted style; `updated_at` shown only if different from
    `created_at` (`"Edited MMM d, yyyy"`).
  - Content body: plain text rendered in `--font-sans` with `whitespace-pre-wrap`
    to preserve line breaks.
  - Action row (top-right, icon buttons):
    - Edit: `lucidePencil` icon → navigates to `/diary/:id/edit`.
    - Delete: `lucideTrash2` icon (error color) → opens an `AlertDialog`
      confirmation ("Delete this entry? This cannot be undone.") before
      calling `diaryApi.deleteEntry(id)`; on success, navigate to
      `/diary` and show a success toast.
- Back button → `/diary`.
- Show `Spinner` while loading; show an error toast on failure.

### Routes

Add to `app.routes.ts`:

```ts
{
  path: 'diary',
  canActivate: [authGuard],
  children: [
    {
      path: '',
      loadComponent: () =>
        import('./features/diary/pages/diary-list.page')
          .then(m => m.DiaryListPage),
    },
    {
      path: 'new',
      loadComponent: () =>
        import('./features/diary/pages/diary-editor.page')
          .then(m => m.DiaryEditorPage),
    },
    {
      path: ':id',
      loadComponent: () =>
        import('./features/diary/pages/diary-detail.page')
          .then(m => m.DiaryDetailPage),
    },
    {
      path: ':id/edit',
      loadComponent: () =>
        import('./features/diary/pages/diary-editor.page')
          .then(m => m.DiaryEditorPage),
    },
  ],
}
```

All diary routes require `authGuard`. No `subscriptionGuard` — diary
access is available to all authenticated users regardless of
subscription tier.

Add "My Diary" navigation link to the app navbar (if one exists in
the home/shell component) and to the home page CTAs alongside "Start
Session" and "Session History".

---

## Invariants to Honor

- `user_id` on every diary entry row is set from the verified JWT,
  never from the request body (invariant 2).
- `GET /{entry_id}`, `PUT /{entry_id}`, and `DELETE /{entry_id}`
  return `404` (not `403`) for entries owned by a different user —
  no information leakage (same pattern as sessions).
- Diary routes require only `authGuard`, not `subscriptionGuard`;
  writing is not quota-gated.
- The `insights/` domain (next slice) reads `diary_entries` through
  its own service — it never imports `diary/` internals directly
  (architecture invariant 7).
- No AI or background-worker calls in this slice. Heavy processing
  (pattern detection) is deferred to the `insights` domain.

---

## Check When Done

- `POST /api/v1/diary` with a valid JWT creates a diary entry and
  returns `201` with the full `DiaryEntryOut` body.
- `GET /api/v1/diary` returns entries newest-first; `content_preview`
  is truncated to 120 chars with `"…"` appended when the content is
  longer.
- `GET /api/v1/diary/{id}` with another user's JWT returns `404`.
- `PUT /api/v1/diary/{id}` updates `title` and `content`; `updated_at`
  changes; `created_at` does not.
- `DELETE /api/v1/diary/{id}` returns `204`; subsequent `GET` of the
  same `id` returns `404`.
- The diary list page shows entries newest-first; clicking a card opens
  the detail page.
- The editor page creates a new entry and navigates to the detail page
  on success.
- The editor page in edit mode pre-populates the form with existing
  values; saving updates the entry.
- The detail page delete action shows the `AlertDialog` confirmation
  before calling the API; on confirm, deletes and navigates to `/diary`.
- Alembic migration `0004` renders clean SQL
  (`alembic upgrade head --sql`) and applies against the database.
- `npm run build` passes (frontend, zero warnings).
- `progress-tracker.md` updated to reflect the completed slice.
