# Code Standards

## General

- Keep modules small and single-purpose]
- Fix root causes, do not layer workarounds]
- Do not mix unrelated concerns in one
  component or route]

## TypeScript

- Strict mode is required throughout the project]
- Avoid any — use explicit interfaces or narrowly
  scoped types]
- Validate unknown external input at system
  boundaries before trusting it]

## Frontend - Angular v22

- Component-Driven Isolation: Break complex user interfaces down into small, single-responsibility components (e.g., <profile-photo /> inside <user-profile />).

- Standalone Architecture: Avoid legacy NgModules. Declare all components, directives, and pipes as standalone entities.

- Metadata Dependency Declaration: Explicitly pass all child components or directives used in a template into the @Component metadata imports array.

- Optimized OnPush Change Detection: Set changeDetection: ChangeDetectionStrategy.OnPush inside the @Component decorator. This instructs Angular to skip checking the component subtree unless an input changes or an event fires, maximizing rendering efficiency.

- Component File Separation: For clean scalability, separate complex logic, markup, and styling by utilizing templateUrl and styleUrl paths.

- Inline Definitions for Small Scopes: Use inline template and styles properties inside the @Component decorator only when building simple, lightweight components.

- Signals as the Source of Truth: Wrap all local components' mutable state inside native signal() wrappers to achieve granular, zone-free reactivity.

- Functional Value Reading: Always read signal data inside templates or TypeScript logic by executing it as a function call: mySignal().

- Explicit State Mutation: Use the .set() method for absolute value overwrites and the .update() method for computing a new value from the previous state.

- Read-Only Derived State: Use computed() signals to declare downstream reactive values that automatically re-evaluate whenever their source signals change.

- Dynamic Template Interpolation: Bind your signal variables or properties into the HTML view using double curly braces: {{ dynamicData() }}.

- Native @if Structural Blocks: Control element visibility natively inside your HTML templates using the built-in @if and @else conditional syntax.

- Strict @for Performance Tracking: Always use the native template @for block when looping over arrays, making sure a unique track property is explicitly defined.

- Signal-Driven Data Input: Capture properties passed down from parent views by defining them with the modern input() or bi-directional model() primitives.

- Modular Dependency Injection: Encapsulate business logic into external classes marked with @Injectable(), providing them cleanly to your components via dependency injection.

## Backend - FastAPI latest

- Domain-Based Project Structure (Organize code by functional modules or domains instead of file types).

- Exclusive Use of Annotated for Dependency Injection (Leverage Annotated to define cleaner, more readable, and type-safe dependencies).

- Strict Separation of Models (Keep Pydantic schemas for data validation separated from DB/ORM models).

- Efficient Handling of Async and Sync Operations (Use async def only with native async libraries, and standard def for blocking I/O).

- Centralized Configuration via Pydantic Settings (Manage and validate environment variables using BaseSettings and caching).

- RESTful Design and Semantic HTTP Status Codes (Utilize proper HTTP methods and explicit status codes from fastapi.status).

- Global Exception Handlers (Centralize error handling using custom exception handlers instead of widespread try-except blocks).

- Disable Interactive Documentation in Production (Turn off /docs and /redoc endpoints in production environments for security).

- Proper Background Task Delegation (Use BackgroundTasks for light operations and dedicated workers like Celery for heavy processing).

- Strict CORS Configuration (Explicitly define allowed origins using CORSMiddleware instead of using wildcards in production).

- Use Lifespan Events for Heavy Clients: Initialize OpenAI/Anthropic clients, vector DB connections, or local models once during startup using lifespan to save memory and avoid recreating connections on every request.

- Stream Responses for AI Chat: Always use StreamingResponse to send text chunks to the frontend as they are generated, matching the ChatGPT style and eliminating perceived latency.

- Keep AI Schemas Separate: Create distinct Pydantic schemas specifically for chat history, prompt variables, and vector database metadata to keep your validation clean.

- Offload Heavy AI Math: Never run heavy CPU tasks—like local model tokenization, text embeddings, or image generation—directly inside your API routes. Move them to a background worker to keep the app responsive.

- Manage API Keys and Models Securely: Use Pydantic BaseSettings to centralize and validate your third-party API keys, default model names, and safety thresholds.

- Add Retry Logic for External APIs: Wrap LLM calls in retry mechanisms with exponential backoff using tools like tenacity so that temporary network glitches or API rate limits don't crash your user session.

- Write Async Code for LLM Calls: Since waiting for an LLM response or vector database query is highly network-dependent, use async def and asynchronous SDK clients to allow the server to handle other users in parallel.

- Track Tokens and Prompts: Set up tracking (like OpenTelemetry or structured logging) in your routes to log input/output token counts, prompt template versions, and model latency for cost and quality auditing.

- Enforce Token Limits: Implement middleware or checks to reject requests with overly large prompts before they are sent to external providers, preventing unexpected bills and context window errors.

- Use Pydantic for Structured AI Outputs: Pass Pydantic schemas directly into LLM tool-calling or structured output features so that the AI returns valid JSON that FastAPI can immediately verify.

## Styling

- Consistent Naming Convention: Use a unified pattern like BEM (Block-Element-Modifier) for CSS, or camelCase for CSS Modules and CSS-in-JS to keep class names predictable.

- Enforce a Formatting Tool: Use Prettier or Stylelint to automatically handle indentation, spacing, quotes, and semicolons on every save.

- Strict Color & Typography Variables: defined in ui-context.md (CSS Variables or design tokens) for colors, fonts, border radius and spacing. Never hardcode hex codes or pixel values inline.

- Logical Property Ordering: Group properties logically (e.g., Positioning, Box Model, Typography, Visuals) to make large style blocks highly readable.

- Mobile-First Media Queries: Standardize responsive design by starting with mobile styles and using min-width media queries for larger breakpoints.

- Limit Nesting Depth: Restrict nesting in Sass or CSS-in-JS to a maximum of 3 levels to avoid overly specific, unoverrideable selectors.

- Prefer Shorthand Properties: Use shorthand declarations (like margin: 10px 5px; instead of individual top/right/bottom/left lines) to keep files compact.

- Component-Driven Isolation: Keep styles scoped to their respective components (via CSS Modules, Scoped CSS, or Styled Components) to prevent global style bleeding.

- Avoid CSS Hacks and !important: Ban the use of !important for routine styling; rely on proper specificity and clean DOM structure instead.

- Document Utility Classes & Mixins: Establish clear guidelines on when to use global utility classes versus writing custom component styles to eliminate redundancy.

## API Routes

- Use nouns, not verbs: Use /users or /orders instead of /getUsers or /createOrder.

- Pluralize resources: Keep collection names consistent by using plurals (e.g., /products instead of /product).

- Use HTTP methods explicitly: Rely on standard verbs for actions: GET (read), POST (create), PUT/PATCH (update), and DELETE (remove).

- Use kebab-case for URIs: Keep URLs lowercase and separate words with hyphens for readability (e.g., /api/v1/user-profiles).

- Indicate hierarchy with nesting: Structure sub-resources logically under their parents (e.g., /users/{id}/orders to get a specific user's orders).

- Implement API versioning: Prefixed routes with the version number to prevent breaking changes (e.g., /api/v1/resources).

- Use query parameters for filtering/sorting: Keep the base path clean and use queries for modifications (e.g., /books?author=orwell&sort=asc).

- Standardize error responses: Return consistent JSON error payloads with proper HTTP status codes (e.g., 400 Bad Request, 404 Not Found).

- Keep trailing slashes consistent: Avoid using trailing slashes at the end of URIs (e.g., prefer /customers over /customers/) to prevent duplicate routing issues.

- Secure routes with proper auth placement: Ensure protected endpoints explicitly leverage standardized headers (like Authorization: Bearer <token>) rather than passing credentials in the URL path.

## Data and Storage

- ACID Compliance: Ensures transaction reliability and data integrity.
- Schema Normalization: Structuring tables to eliminate data redundancy.
- Parameterized Queries: Standard for preventing SQL injection vulnerabilities.
- Indexing Standards: Optimizing read paths without crippling write performance.
- ORM Best Practices: Preventing bottlenecks like the $N+1$ query problem.
- Data Validation: Enforcing strict schema checks before persisting data.
- Idempotency: Guaranteeing repeated mutation requests yield the same state.
- Schema Migration: Programmatic, version-controlled database evolution scripts.
- Encryption Standards: Implementing AES-256 (at rest) and TLS 1.3 (in transit).
- Connection Pooling: Reusing active database connections to save resources.

## File Organization

Monorepo with two top-level applications. Code is grouped
by domain (feature), not by file type.

### Repository Root

- `frontend/` — Angular v22 standalone application (client).
- `backend/` — FastAPI application (API + AI services).
- `context/` — Project governance and context documents.
- `docs/` — Supplementary design notes and references.

### Frontend (`frontend/src/`)

- `app/core/` — App-wide singletons: auth guards, HTTP
  interceptors, base API client, global error handling.
- `app/shared/` — Reusable standalone components, directives,
  pipes, and UI primitives used across features.
- `app/features/<domain>/` — One folder per domain
  (`auth/`, `subscription/`, `sessions/`, `diary/`,
  `dashboard/`, `home/`). Each holds its components,
  feature-scoped services (signals/state), and routes.
- `app/models/` — Shared TypeScript interfaces and types
  for API request/response payloads.
- `assets/` — Static images, icons, and fonts.
- `styles/` — Global styles and design tokens (colors,
  typography, spacing) referenced from `ui-context.md`.

### Backend (`backend/app/`)

- `domains/<domain>/` — One package per domain
  (`auth/`, `subscription/`, `sessions/`, `diary/`,
  `insights/`, `mood/`). Each contains its `router.py`,
  `schemas.py` (Pydantic), `models.py` (ORM),
  `service.py` (business logic), and `dependencies.py`.
- `core/` — Cross-cutting infrastructure: `config.py`
  (Pydantic `BaseSettings`), security/JWT, lifespan
  startup, global exception handlers, logging.
- `ai/` — LLM clients, prompt templates/versions, structured
  output schemas, and retry wrappers for external providers.
- `db/` — Engine/session setup, connection pooling, and
  Alembic migration scripts.
- `storage/` — Object-storage adapters for session audio
  (e.g. S3/GCS) and signed-URL helpers.
- `workers/` — Background/Celery tasks for heavy AI
  processing (transcription, pattern detection, overviews).
- `main.py` — App entrypoint wiring routers and middleware.
- `tests/` — Tests mirroring the `domains/` structure.
