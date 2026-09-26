# 0004. Frontend UI toolkit

- Status: accepted
- Date: 2026-09-26

## Context
The UI is data-oriented: an upload flow, import status, tables, filters, and a map with overlaid controls. One developer, who works daily in Tailwind. Accessible primitives (dialogs, selects, popovers) are needed; building them by hand is wasted effort.

## Decision
- Styling: Tailwind CSS.
- Components: shadcn/ui, i.e. Radix UI primitives styled with Tailwind, copied into the repo (e.g. `frontend/src/components/ui/`) and owned as project code.
- Tables: TanStack Table when a table is needed. Not chosen here: map library, upload dropzone implementation.

## Alternatives considered
- Mantine — ships Dropzone, notifications, date pickers, forms and a table out of the box, so the fastest route to working screens. Loses on its separate styling system and harder theming of custom map overlays.
- Tailwind with hand-built components — rebuilds accessibility for interactive widgets.
- MUI / Chakra — heavier, with no advantage for this project.

## Consequences
- Every UI component is readable and editable in the repo; upstream fixes must be pulled in manually.
- No built-in file dropzone; a small component or library is needed for the upload screen.
- Component code under `components/ui/` counts as project code for lint, type checks and review.
- Changes to this decision require a new ADR.
