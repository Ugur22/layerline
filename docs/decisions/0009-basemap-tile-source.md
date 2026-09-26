# 0009. Basemap tile source

- Status: accepted
- Date: 2026-09-26

## Context
The map view (ADR 0006) needs a basemap. The choice affects secrets handling, third-party terms, and offline use. The project is local-development only at this stage; nothing is deployed and there is no public traffic.

## Decision
- The basemap is a MapLibre style URL read from `VITE_BASEMAP_STYLE_URL`, so the source can change without code changes.
- Default for local development: OpenFreeMap's `liberty` style (`https://tiles.openfreemap.org/styles/liberty`), a hosted OpenStreetMap-based vector style. It needs no API key, so nothing secret enters the repo.
- The style's attribution is displayed on the map.
- Before any deployment or public use, the provider's terms are re-checked and this ADR is superseded or confirmed. Its availability and terms were not verified beyond a successful request during drafting.

## Alternatives considered
- OpenStreetMap raster tiles (`tile.openstreetmap.org`) — no key, but the OSM tile usage policy is aimed at light use and raster tiles style poorly with vector overlays.
- Keyed providers (e.g. MapTiler, Mapbox) — good quality, but require API key handling and account terms.
- Self-hosted vector tiles (e.g. PMTiles) — independent of third parties and works offline, but adds data preparation and hosting work not justified yet.

## Consequences
- The map depends on a third-party service being reachable; tests never call it (`docs/quality.md`: map tests assert data passed to the map component).
- Swapping the provider is a config change.
- Uploaded survey data is never sent to the basemap provider; only tile requests for viewed areas are.
