# Quality and verification model

Intended model only. No scripts, configs, or tools exist yet, and the tool names below are assumptions to confirm by ADR. Until a check exists, a task report must say "not verifiable yet" rather than claim it passed.

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
| End-to-end | One flow per vertical slice, running the full stack | Playwright or Cypress (Open) | Cross-layer breakage |
| Migrations | See below | Alembic (Assumption) | Unsafe or irreversible schema changes |

## Backend test expectations

- Import validation has table-driven tests covering: malformed JSON, unsupported geometry, out-of-range coordinates, empty collection, mixed valid/invalid features, oversize input.
- Authorization: every endpoint has a test that a caller outside the owning organisation gets `404`.
- Tests must not depend on execution order or shared mutable state.
- Do not mock the database for behaviour that depends on PostGIS.

## Frontend test expectations

- Every async view has tests for loading, error, empty, and success states.
- Query by role/label/text, as a user would.
- Map rendering is tested at the boundary (data passed to the map component); pixel output is not asserted.

## Migration safety

- Every schema change is a migration file; the schema is never edited by hand.
- CI-equivalent check (intended): migrations apply cleanly to an empty database and to one at the previous revision.
- Destructive operations (drop column/table, type narrowing, data rewrites) need an explicit plan in the task and human approval: backup/rollback story, and a two-step expand/contract approach where data exists.
- A migration and the code that needs it ship together; the code must tolerate the schema both before and after where deploys are not atomic. (Open: relevant once anything deploys.)
- Migration files are not edited after being merged; add a new one.

## Definition of done

Acceptance criteria met and tested; applicable checks pass (or are stated as unavailable); docs/contract updated if behaviour changed; residual risks listed.
