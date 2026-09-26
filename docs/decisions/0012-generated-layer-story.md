# 0012. Layer story generated from layer statistics

- Status: accepted
- Date: 2026-09-26

## Context
The approved map design has a story panel: a few chapters that explain what the layer shows ("Depth climbs from 8.6 m at S-001 to 47.2 m at S-040", "Campaign A never goes below 28.3 m; B never comes back above 29.3 m"). The design's text was written by hand for one sample file. Layerline accepts any GeoJSON or CSV, so property names, types and values are not known in advance.

Constraints: `AGENTS.md` forbids inventing requirements or claims, `product.md` lists editing and third-party integrations as non-goals for now, and features now keep their file order (`position`), so "along the track" statements are computable. The client already holds every feature of the layer (`styleFeatures`), which it uses for colour scales.

## Decision
Generate the story on the client from statistics of the layer's own features. No story is stored, and no endpoint or contract changes. Chapters are pure functions of the features, built from fixed text templates that only state facts the data supports; a statement that cannot be computed is left out.

Planned chapter kinds, each with the map style it applies (colour and size by that property):
- **Overview:** feature count, extent, straight-line span from first to last point.
- **Numeric property:** min, max, where they occur, range, and how steady the change is along the file order (e.g. how many steps increase).
- **Categorical property:** value counts, and how the values sit along the file order (contiguous runs, or a repeating cycle).
- **Between properties:** a categorical property that a numeric one separates cleanly (value ranges do not overlap), as with campaigns A and B and depth.

## Alternatives considered
- Story authored by users and stored per layer: richest text, but needs a data model, endpoints, contract and an editing UI, and editing is a non-goal for now.
- Story written by an AI model: reads best, but adds an external integration and secrets, and risks statements the data does not support.
- Hand-written for the sample only: matches the design exactly, but says nothing true about any other file.

## Consequences
- Prose is more generic than the design's; wording quality depends on the templates.
- The statistics and templates are pure functions and can be unit-tested without a map.
- It only sees features already sent to the browser, so it inherits the **Open** large-layer decision (`architecture.md` #1).
- No localisation: templates are English only.
- A stored or AI-written story can supersede this later without undoing it; the generated chapters can remain as the default.
