# Product

Status labels: **Decided** / **Assumption** / **Open**.

## Problem (Assumption)

Survey-style spatial data usually arrives as files (GeoJSON, CSV with coordinates). Turning a raw file into something a team can trust and look at requires validation, consistent processing, and a map view. Doing this by hand, per file, is slow and error-prone, and failures are hard to trace.

## Intended users (Assumption)

Roles, not personas; no real users exist yet.

- **Data contributor** — uploads a file and needs to know quickly whether it was accepted, and why not if rejected.
- **Data reviewer / analyst** — inspects processed layers on a map and filters features.
- **Organisation admin** — controls who can access an organisation's projects. (Open: whether this role exists in the first release.)

## Product promise (Decided, as an intent)

1. Upload a spatial file and get an explicit outcome: accepted, or rejected with row/feature-level reasons.
2. See accepted data as a map layer.
3. Every change to data is attributable (audit events).

## Non-goals (Decided for the first slice)

- No editing of features in the UI (planned later, out of scope now).
- No formats beyond GeoJSON and CSV with point coordinates (Open: whether Shapefile/GeoPackage ever join).
- No scheduled or recurring imports. Imports are triggered by a user upload only. Backlog (not planned): revisit only if a pull-based data source is ever added, which also requires deciding what re-import does to existing features (see `domain.md`). Background retries and maintenance tasks are separate and in scope (ADR 0002).
- No real-time collaboration, no offline mode.
- No third-party integrations, billing, or public API for external consumers.
- No claims about scale or performance until measured.
- Not a general GIS; no spatial analysis tooling (buffering, routing, etc.).

## First vertical slice

Smallest path that touches every layer of the stack:

1. A user uploads a small GeoJSON `FeatureCollection` of points into a dataset.
2. The backend stores the file, creates an import job, and returns its id.
3. A worker validates the file (parseable, supported geometry, valid coordinates) and writes features.
4. The client polls import status until `succeeded` or `failed`; failures show error details.
5. On success, the map UI fetches the resulting map layer and renders its features.

Acceptance for the slice:
- an invalid file yields a `failed` job with human-readable errors and no partial features visible;
- a valid file renders the same number of features it contained;
- the flow is covered by one end-to-end test.

Deliberately excluded from the first slice: authentication beyond a placeholder (Open: see `architecture.md`) and editing. CSV import, property filtering, and one layer per import (several per dataset) were added afterwards; see `api-contracts.md`.

## Open questions

- Is multi-tenancy (organisations) enforced in the first slice, or only modelled?
- Maximum accepted file size and feature count?
- Coordinate reference system handling: require WGS84 only, or reproject?
