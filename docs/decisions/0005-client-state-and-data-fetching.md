# 0005. Client state, data fetching, and pattern matching

- Status: accepted
- Date: 2026-09-26

## Context
The frontend has two kinds of state: data owned by the server (import status, map layers) and UI state owned by the client (selected layer, filters, viewport, panels). Import status must be polled until a terminal state. API enums (import status, error codes) will grow, and clients must handle every value (`api-contract-review`).

## Decision
- **Server state:** TanStack Query. Polling uses `refetchInterval`, stopping on a terminal import status.
- **Client UI state:** Zustand, in small feature-scoped stores. Server data is never copied into a Zustand store.
- **Discriminated unions and enums:** ts-pattern with `.exhaustive()` where a new API value must force a compile error. Plain `if`/`switch` stays fine elsewhere.

## Alternatives considered
- Redux Toolkit (+ RTK Query) — capable, but more boilerplate than a solo project with mostly local UI state needs.
- Zustand for everything, including fetched data — loses caching, request deduplication and polling helpers, and invites stale-data bugs.
- React context + `useReducer` — fine for small state, but re-render and organisation costs grow with map and filter state.
- Plain `switch` with `never` checks — gives exhaustiveness without a dependency, but is more verbose for nested shapes.

## Consequences
- Two libraries to learn and keep straight; the rule "server state in Query, UI state in Zustand" is reviewed in `quality-review`.
- Tests can seed a Query client and reset stores per test; stores must expose a reset for that.
- Revisit if UI state grows complex enough to need explicit state machines.
