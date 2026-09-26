# 0007. Backend framework, database, and local development

- Status: accepted
- Date: 2026-09-26

## Context
The initial brief named a Python backend, PostgreSQL + PostGIS, and Docker-based local development as the likely direction. ADRs 0001–0003 already build on them. The maintainer confirmed Docker Compose for local development.

## Decision
- **API framework:** FastAPI, JSON over HTTP, with the OpenAPI schema as the contract's machine-readable form.
- **Database:** PostgreSQL with PostGIS. Geometry columns carry an explicit SRID.
- **Local development:** Docker Compose runs the database, API and worker. A fresh clone must start the stack with one command. Frontend dev server may run on the host or in Compose; not decided here.

## Alternatives considered
- Django/DRF — batteries included, but heavier than needed and less natural for an async, typed API.
- SQLite/SpatiaLite — simpler setup, but weaker spatial features and not what a production-minded system would use.
- Host-installed services without Docker — fragile setup and no parity between machines.

## Consequences
- Integration tests run against a real PostGIS container, not a mock.
- Compose files are project code and are reviewed like any other change.
- Coordinate system stays WGS84 (EPSG:4326) for the first slice; widening is a later decision.
- The official `postgis/postgis` image has no arm64 build, so Compose uses the community multi-arch image `imresamu/postgis`. It is a third-party image for local development only; revisit if an official arm64 build appears or before any deployment.
