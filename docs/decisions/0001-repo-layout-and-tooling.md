# 0001. Repo layout and tooling

- Status: accepted (package manager superseded by 0008)
- Date: 2026-09-26

## Context
Layerline has a React + TypeScript frontend and a Python backend that share only the API contract. `docs/quality.md` needs one concrete command per check layer, so tooling must be named before scaffolding. Nothing is built yet.

## Decision
One repository with two independent packages, `frontend/` and `backend/`, each with its own tooling and lockfile. No monorepo build tool (Nx, Turborepo) for now; a thin root task runner (Makefile or `just`, chosen at scaffold time) wraps each package's commands.

- Frontend: Vite, React, strict TypeScript, pnpm, Vitest + Testing Library, ESLint + Prettier.
- Backend: Python 3.12+, uv for dependencies, Ruff (lint + format), mypy (strict on application code), pytest, Alembic for migrations.
- End-to-end runner: not decided here.

## Alternatives considered
- Nx monorepo — strong for multiple JS packages, but adds config weight and little value for one JS package plus one Python package.
- Separate repositories — splits the contract and docs, and makes one-change-across-both-sides reviews harder.
- Poetry / pip-tools instead of uv — workable; uv is faster and covers venv, lockfile and running in one tool.

## Consequences
- Each package must be runnable and checkable on its own; the root runner is convenience only.
- No shared generated types unless a later ADR adds a generation step from the OpenAPI schema.
- Revisit if a second JS package appears.
