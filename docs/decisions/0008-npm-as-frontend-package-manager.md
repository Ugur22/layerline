# 0008. npm as the frontend package manager

- Status: accepted
- Date: 2026-09-26

## Context
ADR 0001 chose pnpm for `frontend/`. There is one JS package and one developer, so workspace features and disk savings do not apply. npm ships with Node, which is already installed; pnpm would be an extra setup step.

## Decision
Use npm for `frontend/`. Commit `package-lock.json`. Everything else in ADR 0001 stands.

## Alternatives considered
- pnpm — stricter resolution and faster installs, but needs installing and gives little benefit for a single package.
- Yarn / Bun — no advantage here.

## Consequences
- Frontend commands are `npm ci`, `npm run <script>`; the root Makefile wraps them.
- Revisit if a second JS package appears (see ADR 0001).
