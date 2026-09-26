# Architecture (proposed)

Nothing here is implemented. This is the direction to challenge, not a specification. Status labels: **Decided** / **Assumption** / **Open**.

## Direction

| Area | Status | Choice |
|---|---|---|
| Frontend | Assumption | React + TypeScript SPA with a web map library |
| Backend | Assumption | Python, FastAPI, JSON over HTTP |
| Database | Assumption | PostgreSQL + PostGIS |
| Import processing | Assumption | Asynchronous: the upload request returns quickly; a worker processes the file |
| Local development | Assumption | Docker-based (Compose) so a fresh clone runs with one command |

No item is **Decided** yet. Each becomes so by an ADR in `docs/decisions/`.

## Shape

```
Browser (React) ──HTTP──▶ API (FastAPI) ──▶ PostgreSQL/PostGIS
                              │                     ▲
                              └── enqueue ──▶ Worker ┘
                                   │
                              File storage (raw uploads)
```

- The API owns validation of requests, authorization, and reads/writes of metadata.
- The worker owns file parsing, geometry validation, and feature writes, and updates import-job status.
- The frontend only talks to the API; it never reads the database or file storage directly.
- Raw uploads are kept until processing ends. (Open: retention afterwards.)

## Boundaries and constraints

- The API contract (`api-contracts.md`) is the only coupling between frontend and backend. Consider generating TypeScript types from the OpenAPI schema (Open).
- Import processing must be idempotent per job id: a retried job must not duplicate features.
- A failed import must not leave features visible in any layer.
- Spatial data is stored in PostGIS geometry columns with an explicit SRID. (Assumption: WGS84 / EPSG:4326 only at first.)
- Schema changes only through migrations (see `quality.md`).

## Open decisions

| # | Question | Notes |
|---|---|---|
| 1 | Job execution mechanism | Options: Postgres-backed queue, Celery/Redis, ARQ, FastAPI background tasks. Trade-off: infrastructure weight vs. retry and visibility. |
| 2 | Raw file storage | Local volume vs. S3-compatible (e.g. MinIO in dev). |
| 3 | Map rendering approach | GeoJSON per layer vs. vector tiles; depends on feature counts we have not measured. |
| 4 | Frontend map library | Not chosen. |
| 5 | Authentication and tenancy enforcement | Placeholder identity for the first slice? Where organisation scoping is enforced (API layer vs. row-level security). |
| 6 | Python tooling | Dependency manager, formatter/linter, migration tool (Alembic assumed). |
| 7 | Repository layout | Single repo with `frontend/` and `backend/` assumed; monorepo tooling not chosen. |
| 8 | Status updates to client | Polling assumed for the first slice; SSE/WebSocket deferred. |

## Explicitly out of scope for now

Deployment/hosting, observability stack, caching layers, multi-region concerns.
