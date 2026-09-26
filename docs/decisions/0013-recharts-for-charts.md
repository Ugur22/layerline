# 0013. Recharts, through shadcn's chart component, for charts

- Status: proposed
- Date: 2026-09-26

## Context
The value profile under the map was first drawn as hand-written SVG (about 300 lines of component plus helpers for ticks, domains and paths). More charts are likely (for example a histogram or a scatter of two properties), and each would repeat that work, including the edge cases a library already covers (review of the first version found a crash on very large layers, tick rounding errors and a rounded readout).

Facts from desk research, September 2026 (sources are secondary articles plus the projects' own pages):
- shadcn/ui, the toolkit of ADR 0004, ships a chart component built on Recharts v3 (`ChartContainer`, `ChartConfig`, themed tooltips and legends).
- Recharts 3.x is actively maintained; v2 and older no longer get updates. v3 turns its keyboard and ARIA layer on by default.
- Recharts draws SVG, one DOM node per point; sources agree it slows down past roughly 1,000 to 5,000 points, especially with dots or animation on.
- Alternatives: visx v4 (low-level D3 primitives, most control, most code), Nivo (heavier), Observable Plot (not React-first), ECharts and uPlot (canvas, for very large series; ECharts about 100 KB gzipped when tree-shaken, uPlot about 50 KB).

Measured here by rebuilding the profile on Recharts: the lazily loaded map chunk grows from 1,094 KB to 1,395 KB (296 KB to 387 KB gzipped); the main chunk is unchanged. All frontend tests and the end-to-end suite pass on the Recharts version.

## Decision
Use Recharts 3, through shadcn's `chart` component, for charts. The profile is rebuilt on it. What stays ours:
- the data model behind a chart (`profileModel.ts`, `profile.ts`) as pure, tested functions;
- mapping the pointer to a point: it is computed from the mouse event, because the chart reports its pointer a frame late and as a string, so a click straight after a move (or a tap) landed on the previous point.

## Alternatives considered
- Keep the hand-written SVG: no dependency and lighter, but every new chart repeats axes, ticks, domains, responsiveness and accessibility work.
- visx: leaner bundle for a few primitives, but it is the same amount of custom code as we already had.
- Nivo: good accessibility, but a heavier bundle and no fit with shadcn.
- ECharts or uPlot: right for very large series, more setup, and a different look; kept as the escape hatch below.

## Consequences
- One new runtime dependency (`recharts`) and a generated `src/components/ui/chart.tsx` (lint-ignored like the other shadcn files).
- Tests need a `ResizeObserver` stub in the jsdom setup, and pointer tests mock element rectangles.
- The chart's own keyboard layer is switched off, because it does not feed our shared hover and pinned point. The keyboard route is still the inspector's Previous and Next buttons. **Open:** wire Recharts' keyboard index into the shared store.
- **Open:** layers with thousands of points. Dots are already left out above 120 points, but the line still carries every point. Downsample the series to about one value per pixel column, and if charts ever need to show tens of thousands of points, switch that chart to ECharts or uPlot.
- Follow-ups written into this decision, not yet built: a second chart type, and the downsampling.
