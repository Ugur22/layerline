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

_No ADRs yet._
