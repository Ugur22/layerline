# Domain vocabulary

Shared terms for code, API, UI copy, and docs. Use these names exactly; do not introduce synonyms (e.g. "upload" for import job, "shape" for feature). Status: **Assumption** until an ADR or implementation confirms.

## Terms

| Term | Definition |
|---|---|
| **Organisation** | Top-level owner of projects and the boundary for access control. |
| **Project** | A named workspace within an organisation grouping related datasets. |
| **Dataset** | A named collection of source data within a project, fed by one or more uploads over time. |
| **Import job** | One attempt to process one uploaded file into a dataset. Has a status and, on failure, errors. Immutable record once finished. |
| **Map layer** | A renderable, read-oriented view of a dataset's spatial features (name, geometry type, style hints). |
| **Spatial feature** | One geometry plus properties (e.g. a GeoJSON Feature or a CSV row with coordinates). The unit of storage and display. |
| **Audit event** | An append-only record of who did what to which entity and when. |

## Relationships

```
Organisation 1 ── * Project 1 ── * Dataset
Dataset 1 ── * ImportJob        (each job processes one uploaded file)
Dataset 1 ── * MapLayer         (Open: 1:1 or 1:many in the first slice)
Dataset 1 ── * SpatialFeature   (created by import jobs; each feature records its source job)
AuditEvent * ── 1 Organisation  (references the affected entity by type + id)
```

## Import job statuses (Assumption)

`queued` → `processing` → `succeeded` | `failed`. Terminal states do not change. Whether `cancelled` or `partially_succeeded` exist is **Open**; the first slice treats import as all-or-nothing.

## Rules

- Every entity belongs to exactly one organisation, directly or through its parent.
- A spatial feature is only visible in a layer if its import job succeeded.
- Audit events are never updated or deleted by application code.
- Identifiers are opaque to clients. (Open: UUID vs. other; decide in an ADR.)

## Open questions

- Does re-uploading to a dataset replace, append, or version its features?
- Are map layers stored entities or derived on request?
- What feature properties schema, if any, does a dataset enforce?
