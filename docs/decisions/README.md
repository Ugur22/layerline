# Architecture decision records

An ADR records a meaningful decision so later work does not silently reverse or re-litigate it. Files: `NNNN-short-title.md` (zero-padded, sequential, never renumbered).

## Write an ADR when

- choosing or replacing a framework, database, queue, storage, or map approach;
- changing a public API contract in a breaking way, or a data-model rule from `domain.md`;
- promoting an **Assumption** or resolving an **Open** item in `architecture.md`;
- a choice is costly to reverse or has real alternatives.

Do not write one for routine implementation choices, naming, or anything easily changed in one small PR.

## Rules

- One decision per ADR; keep it to about one page.
- Status is one of: `proposed`, `accepted`, `superseded by NNNN`, `rejected`. Only the user/maintainer moves a decision to `accepted`.
- Accepted ADRs are not edited except for status. To change a decision, write a new ADR that supersedes it.
- List real alternatives and why they lost; do not invent alternatives to fill space.
- State consequences, including downsides and follow-up work.
- When an ADR is accepted, update the affected doc (e.g. change the label in `architecture.md` from Assumption to Decided and link the ADR).

## Template

```markdown
# NNNN. Title

- Status: proposed
- Date: YYYY-MM-DD

## Context
The problem and the constraints forcing a decision. Facts only.

## Decision
What we will do, in one or two sentences.

## Alternatives considered
- Option — why not.

## Consequences
What becomes easier, harder, or required. Follow-ups.
```

## Index

- [0001 Repo layout and tooling](0001-repo-layout-and-tooling.md) — accepted
- [0002 Import job execution (Procrastinate) and raw file storage](0002-import-jobs-and-file-storage.md) — accepted
- [0003 Identity and tenancy in the first slice](0003-first-slice-identity-and-tenancy.md) — accepted
- [0004 Frontend UI toolkit](0004-frontend-ui-toolkit.md) — accepted
- [0005 Client state, data fetching, and pattern matching](0005-client-state-and-data-fetching.md) — accepted
- [0006 Map stack](0006-map-stack.md) — accepted
- [0007 Backend framework, database, and local development](0007-backend-database-and-local-dev.md) — accepted
- [0008 npm as the frontend package manager](0008-npm-as-frontend-package-manager.md) — accepted
- [0009 Basemap tile source](0009-basemap-tile-source.md) — accepted
- [0010 Playwright for end-to-end tests](0010-playwright-for-end-to-end-tests.md) — accepted
- [0012 Layer story generated from layer statistics](0012-generated-layer-story.md) — proposed
- [0013 Recharts, through shadcn's chart component, for charts](0013-recharts-for-charts.md) — proposed
