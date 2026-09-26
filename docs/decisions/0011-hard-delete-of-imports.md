# 0011. Hard delete of a dataset's finished imports

- Status: proposed
- Date: 2026-09-26

## Context
Every upload adds an import and a map layer, and nothing could ever be removed, so the imports list grows without bound (`e2e` runs write to the development dataset too). Retention of stored data is **Open** in `architecture.md` (decision #8), and `domain.md` says audit events are never deleted.

## Decision
- `DELETE /api/v1/datasets/{dataset_id}/imports` permanently deletes all finished (`succeeded` or `failed`) imports of the dataset with their map layers, features and stored raw files, in one transaction. Raw files are removed after the commit, best effort: an orphan file is harmless, a row pointing at a missing file is not.
- Imports that are `queued` or `processing` are kept, because a worker may still be writing features for them.
- No schema change: rows are deleted explicitly in dependency order (features, layers, jobs), so no `ON DELETE CASCADE` is added to the schema.
- Procrastinate's own job rows are left alone.
- The first UI is one "clear all" action with an in-page confirmation; per-import removal is not built.

## Alternatives considered
- Soft delete (an archived flag) — keeps data recoverable, but needs a migration and every query to filter it, and the data would still occupy space; rejected by the maintainer in favour of real removal.
- Refuse with `409` while anything is running — simpler to reason about, but leaves the user unable to clear when one import is stuck.
- Hide older imports in the UI only — removes no data.

## Consequences
- Deletion is irreversible.
- **Gap:** `domain.md` wants every change to data attributable, but the audit-event table does not exist yet, so this deletion is unaudited. Once audit events exist, this action must write one; until then it is a known deviation.
- Still **Open**: retention of raw files and imports beyond this manual action.
- Deleting rows while a worker holds them is avoided only by skipping unfinished imports; a job that finishes right after the check is simply kept for the next clear.
