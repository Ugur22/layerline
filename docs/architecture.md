# Architecture

Nothing here is implemented yet. Status labels: **Decided** (accepted ADR) / **Assumption** / **Open**.

## Direction

| Area | Status | Choice |
|---|---|---|
| Repo layout and tooling | Decided ([0001](decisions/0001-repo-layout-and-tooling.md)) | One repo, independent `frontend/` and `backend/` packages; no monorepo tool. Frontend: Vite, React, strict TypeScript, npm ([0008](decisions/0008-npm-as-frontend-package-manager.md)), Vitest, ESLint + Prettier. Backend: Python 3.12+, uv, Ruff, mypy, pytest, Alembic |
| UI toolkit | Decided ([0004](decisions/0004-frontend-ui-toolkit.md)) | Tailwind CSS + shadcn/ui (Radix), TanStack Table for tables |
| Client state and data | Decided ([0005](decisions/0005-client-state-and-data-fetching.md)) | TanStack Query (server state), Zustand (UI state), ts-pattern for exhaustive matching |
| Map | Decided ([0006](decisions/0006-map-stack.md)) | MapLibre GL via `react-map-gl`; deck.gl deferred until measured need |
| Backend | Decided ([0007](decisions/0007-backend-database-and-local-dev.md)) | Python, FastAPI, JSON over HTTP |
| Database | Decided ([0007](decisions/0007-backend-database-and-local-dev.md)) | PostgreSQL + PostGIS |
| Import processing | Decided ([0002](decisions/0002-import-jobs-and-file-storage.md)), pending spike | Procrastinate (Postgres-backed) with a separate worker; retries with backoff; periodic maintenance tasks. Falls back to Celery + Redis if the spike fails |
| Raw file storage | Decided ([0002](decisions/0002-import-jobs-and-file-storage.md)) | Local volume behind a storage interface; S3-compatible later |
| Identity and tenancy (first slice) | Decided ([0003](decisions/0003-first-slice-identity-and-tenancy.md)) | Dev-only placeholder identity; organisation scoping in the data-access layer; cross-organisation access returns `404` |
| Local development | Decided ([0007](decisions/0007-backend-database-and-local-dev.md)) | Docker Compose runs database, API and worker; a fresh clone starts with one command |

## Shape

```
Browser (React) ──HTTP──▶ API (FastAPI) ──▶ PostgreSQL/PostGIS
                              │                     ▲
                              └── enqueue ──▶ Worker ┘
                                   │
                              File storage (raw uploads)
```

- The API owns request validation, authorization, and reads/writes of metadata.
- The worker runs independently of the API and browser; it owns file parsing, geometry validation, and feature writes, and updates import-job status.
- The frontend only talks to the API; it never reads the database or file storage directly.
- Raw uploads are kept until processing ends. (Open: retention afterwards.)

## Boundaries and constraints

- The API contract (`api-contracts.md`) is the only coupling between frontend and backend. Generating TypeScript types from the OpenAPI schema is Open.
- Import processing is idempotent per job id: a retried job must not duplicate features. Only transient errors retry; invalid input fails immediately.
- A failed import must not leave features visible in any layer; feature writes and the terminal status share one transaction.
- Spatial data is stored in PostGIS geometry columns with an explicit SRID. (Assumption: WGS84 / EPSG:4326 only at first.)
- The placeholder identity is never enabled outside development.
- Schema changes only through migrations (see `quality.md`).
- Group frontend code by feature, not by a flat `components/` directory.
- Split a package out of `frontend/` or `backend/` only when it has a second consumer, conflicting dependencies, or an independent release/test cadence.

## Open decisions

| # | Question | Notes |
|---|---|---|
| 1 | Large-layer data delivery | Inline GeoJSON, bbox queries, or vector tiles; needs measurement first. deck.gl adoption depends on this |
| 2 | Basemap tile source | Provider, terms, cost, key handling |
| 3 | End-to-end test runner | Playwright or Cypress |
| 4 | Real authentication and roles | Replaces the placeholder identity via a later ADR |
| 5 | Row-level security | Deferred (ADR 0003) |
| 6 | Root task runner | Makefile or `just` |
| 7 | Status updates to client | Polling assumed for the first slice; SSE/WebSocket deferred |
| 8 | Raw file retention and stuck-job policy | Specified at implementation time |
| 9 | Type generation from OpenAPI | Not chosen |
| 10 | Identifier format | UUID assumed; not decided |

## Explicitly out of scope for now

Deployment/hosting, observability stack, caching layers, multi-region concerns, scheduled or recurring imports (see `product.md`).
