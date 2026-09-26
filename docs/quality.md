# Quality and verification model

Backend, frontend and end-to-end checks exist. `make check` runs the first two (backend tests need `make up` for the database); `make e2e` runs the browser suite against the running stack. CI does not exist yet, so nothing runs these automatically.

## Commands that exist

| Command | Runs |
|---|---|
| `make up` / `make down` | Compose stack: PostGIS, migrate step, API, worker |
| `make backend-check` | `ruff check`, `ruff format --check`, `mypy` (strict), `pytest` |
| `make backend-fix` | `ruff check --fix`, `ruff format` |
| `make frontend-check` | `tsc -b` (strict), `eslint` (typescript-eslint strict-type-checked), `prettier --check`, `vitest run` |
| `make frontend-fix` | `eslint --fix`, `prettier --write` |
| `make check` | Backend and frontend check suites |
| `make e2e` | Playwright against the real UI, API, worker and PostGIS (needs `make up`; starts its own frontend dev server on port 5199) |

The API reloads on code changes; the Compose worker does not. After changing import or job code, run `docker compose restart worker` before exercising the stack (e2e or by hand), or you are testing old code.

Backend tests run against a real PostGIS database (`layerline_test`, recreated each session) and the real Procrastinate worker; they never touch the development database.

## Principles

- Each check has one command, documented here once it exists, that runs identically locally and (later) in CI.
- Verification is proportional: run the checks the change can affect, and all of them before declaring a task done.
- A bug fix starts with a test that fails for the right reason.
- A passing check is evidence only if it could have failed. Do not weaken, skip, or delete tests to get green.

## Checks

| Layer | Intended check | Tooling (Assumption) | Must catch |
|---|---|---|---|
| Frontend types | Strict TypeScript, no implicit `any` | `tsc --noEmit` | Contract drift, null handling |
| Frontend lint/format | Lint + format check | ESLint + Prettier (or Biome) | Style, hook misuse, unused code |
| Backend types | Static type check on all backend code | mypy or pyright | Type errors at API/DB boundaries |
| Backend lint/format | Lint + format check | Ruff | Style, common bugs |
| Backend tests | Unit tests for parsing/validation logic; integration tests against a real PostGIS instance for persistence and API | pytest | Logic errors, invalid-input handling, SQL/geometry behaviour |
| Frontend tests | Component/unit tests for behaviour, not implementation details | Vitest + Testing Library | UI states: loading, error, empty, success |
| End-to-end | One flow per vertical slice, running the full stack | Playwright ([ADR 0010](decisions/0010-playwright-for-end-to-end-tests.md)) | Cross-layer breakage, browser-only failures |
| Migrations | See below | Alembic (Assumption) | Unsafe or irreversible schema changes |

## Backend test expectations

- Import validation has table-driven tests covering: malformed JSON, unsupported geometry, out-of-range coordinates, empty collection, mixed valid/invalid features, oversize input.
- Authorization: every endpoint has a test that a caller outside the owning organisation gets `404`.
- Tests must not depend on execution order or shared mutable state.
- Do not mock the database for behaviour that depends on PostGIS.
- Every way the database can reject upload content (constraints, jsonb limits such as NUL characters) must end the job `failed` with an error code, never leave it `processing`. Test with a real hostile input, not a mocked exception.
- Queue behaviour is tested with the real worker (`run_worker_async(wait=False)`): retry then success, retries exhausted ending in a `failed` job, and idempotent reprocessing. Note that the worker also defers the periodic task, so assertions on `procrastinate_jobs` filter by `task_name`.

## Frontend test expectations

- Every async view has tests for loading, error, empty, and success states.
- Query by role/label/text, as a user would.
- Map rendering is tested at the boundary (data passed to the map component); pixel output is not asserted.
- Zustand stores are module-level singletons, so state leaks between tests. Reset every store a test touches in `beforeEach`.
- Every user-facing input has a test for the failing-request path, and the user must be able to recover from it (e.g. clear a filter that makes the request fail).
- A guard whose only job is to prevent a wrong-but-plausible result (e.g. showing another layer's data while loading) needs a test that fails when the guard is removed. Check by breaking it once.
- A test written for a specific past bug is trusted only after it fails with that bug reintroduced. The first e2e map check (canvas visible, worker created) passed with the worker bug present; waiting for the map's `idle` state is what caught it.
- jsdom has no WebGL, workers, or real bundling. Behaviour that depends on them (the map, its worker) is only verified in a real browser: run `make e2e`, which covers the map and its worker, and do not report it as verified from unit tests.

## Migration safety

- Every schema change is a migration file; the schema is never edited by hand.
- CI-equivalent check (intended): migrations apply cleanly to an empty database and to one at the previous revision.
- Destructive operations (drop column/table, type narrowing, data rewrites) need an explicit plan in the task and human approval: backup/rollback story, and a two-step expand/contract approach where data exists.
- A migration and the code that needs it ship together; the code must tolerate the schema both before and after where deploys are not atomic. (Open: relevant once anything deploys.)
- Migration files are not edited after being merged; add a new one.
- Review every autogenerated migration before applying. The database also contains PostGIS extension tables and Procrastinate's tables; `alembic/env.py` restricts autogenerate to tables our models define, and a migration containing `drop_table` for anything else is a defect.

## Definition of done

Acceptance criteria met and tested; applicable checks pass (or are stated as unavailable); docs/contract updated if behaviour changed; residual risks listed.
