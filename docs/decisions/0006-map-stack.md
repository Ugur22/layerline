# 0006. Map stack

- Status: accepted
- Date: 2026-09-26

## Context
The UI must display, and later filter, map layers built from uploaded spatial features. Layer size is unknown and unmeasured; `architecture.md` open decision #1 (large-layer data delivery: GeoJSON vs. tiles) is unresolved. deck.gl renders large datasets on the GPU but does not solve transferring and parsing them. A basemap tile source is also needed.

## Decision
- **Basemap and first-slice rendering:** MapLibre GL JS through `react-map-gl` (MapLibre binding), rendering the layer's GeoJSON.
- **deck.gl is deferred, not rejected:** adopt it as an overlay (via `@deck.gl/mapbox` or `react-map-gl` integration) once a real dataset makes MapLibre rendering or filtering inadequate. That is a new, measured decision, not a default.
- **Data delivery** (inline GeoJSON, bbox queries, or vector tiles) stays open, decided in a separate ADR when large layers are in scope.
- **Map tests** assert the data passed to the map component, not pixels (`docs/quality.md`).

## Alternatives considered
- deck.gl from the start — best fit for very large point sets and GPU filtering, but adds complexity before any need is shown.
- Leaflet — simple, but DOM/canvas-based and weaker for large or vector data.
- OpenLayers — powerful GIS-oriented API, heavier and less aligned with React tooling.

## Open
- Basemap tile source: provider, terms, cost, API key handling (no secrets in the repo).
- Style hints: which layer style properties the API carries versus what the frontend decides.

## Consequences
- The first slice stays small; swapping in deck.gl later means adding an overlay, not rewriting the map component, if layer data goes through one adapter.
- Large-layer performance is unverified. No feature-count limits or figures are stated until measured.
