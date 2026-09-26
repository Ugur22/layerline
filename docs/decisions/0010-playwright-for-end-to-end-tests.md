# 0010. Playwright for end-to-end tests

- Status: accepted
- Date: 2026-09-26

## Context
Unit tests cannot see failures that depend on a real browser: jsdom has no WebGL, web workers or bundling. The map's worker failed to load in Vite while every unit test passed (see `docs/quality.md`). The slice needs one automated test that drives the real stack. Runner choice was open decision #3 in `architecture.md`.

## Decision
- Use Playwright (`@playwright/test`) as a dev dependency of `frontend/`, with tests in `frontend/e2e/`.
- Tests drive the real UI against the real API, worker and PostGIS from `make up`. The frontend dev server is started by Playwright on a dedicated port, so a stale developer server can never be tested by mistake.
- Tests run serially against one dataset and use uniquely named uploads, so they do not depend on existing data.
- Vitest excludes `e2e/`; the two suites never run each other's files.
- The suite is hermetic: the dev server gets `VITE_BASEMAP_STYLE_URL` pointing at a blank style that the test serves itself, so a third-party basemap outage cannot fail it (ADR 0009 made the style URL configurable).
- "The map works" means the map reached `idle` with our layer loaded. That needs its worker, so `LayerMap` exposes `data-map-ready` and the test waits for it. Checking only that a worker was created, or that the canvas exists, was tried first and does not catch a worker that fails to load.
- Assertions cover behaviour visible to a user plus browser-level health (no console errors). Pixel or screenshot comparisons are not used.

## Alternatives considered
- Cypress — familiar and capable, but it runs inside the browser and has a weaker story for multiple pages, workers and downloads; Playwright also ships its own browsers and a test runner.
- Playwright driven from ad-hoc scripts — what was used to find the worker bug; not repeatable or reviewed.

## Consequences
- `make e2e` needs the Compose stack running and downloads a browser once (`npx playwright install chromium`).
- Tests write to the development database, so its imports list grows; an isolated e2e database is a later improvement.
- CI (a separate change) must install the browser and start the stack before running them.
