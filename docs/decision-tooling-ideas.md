# From visualization to decision tooling — working brief

Not a project doc in the `product.md` / `domain.md` sense (nothing here is Decided). This is a
handoff brief: read it cold in a new session, pick one direction, run it through the normal
`feature-delivery` loop (plan → implement → verify → assess), starting with a proper Plan step
that re-validates the scope call below against `product.md` and `domain.md` as they stand then.

## Where this came from

Built a water-quality transect sample (`samples/river-water-quality.csv`, real IJssel river
coordinates, synthetic readings) to demo the existing map/story features. It's good at
**visualization**: color-by-property, a track line, a chart linked to file order, and an
auto-generated story (overview, category grouping, extremes) that surfaces "worst DO and worst
E. coli both land in the urban stretch" without the user reading a spreadsheet.

It stops short of **decision tooling** — telling someone what to do about it. Four gaps, in
rough order of how bounded they are to close:

## Candidate directions

### 1. Threshold/range filtering (smallest, most bounded)
Right now the property filter (`api-contracts.md` §3) is exact-match only: `property=value`.
An analyst's real question is "show me sites over 500 CFU," not "show me sites that are exactly
610." Needs: a comparator alongside the existing filter (`>`, `<`, `>=`, `<=`, keep `=` as
default), on both the API query params and `FilterBar`. No domain/schema change — this is a
query-parsing and UI change only. **This is the natural next-step candidate**: single endpoint,
single component, testable in isolation, doesn't touch the data model.

### 2. Reference thresholds per property (moderate)
The story currently only says "the highest is X" — never whether X is *bad*. Real domain
thresholds (e.g. a bathing-water E. coli limit) would let the map/legend/story render a verdict
(pass/warn/fail) instead of a bare statistic. Smallest version is frontend-only: a small
per-property threshold config the uploader (or a fixed convention) supplies, driving a
pass/fail color mode alongside the existing continuous color-by-property mode. Bigger version
makes thresholds a stored, per-dataset thing — that edges into `domain.md`'s open question
("what feature properties schema, if any, does a dataset enforce?") and would want that answered
first, probably via an ADR, before touching schema.

### 3. Comparison across repeat visits (large, needs an ADR first)
The real workflow is monthly/repeat transects, and the real question is "worse than last time?"
Today every upload is an independent import → independent map layer; nothing relates successive
surveys of "the same" route. `domain.md` already flags this as open ("Does re-uploading to a
dataset replace, append, or version its features?") — this direction *is* that open question,
made concrete. Don't start implementing before that's resolved in an ADR: it changes the
Dataset/ImportJob/MapLayer relationship, which is contract- and schema-adjacent.

### 4. Actionability — flag/annotate/export findings (large, new entity)
Letting a user mark "these 3 sites need a follow-up sample" needs a new persisted concept (a
flag or note per feature, or an extension of the still-unimplemented Audit event in
`domain.md`). Real scope, real schema addition, real ADR territory — not a first move.

## Scope check before starting any of these

`product.md`'s non-goals say "not a general GIS; no spatial analysis tooling (buffering,
routing, etc.)." None of the four directions above are spatial analysis — they're business
logic over properties Layerline already stores (thresholds, comparisons, filters, flags), not
geometric operations. Worth restating explicitly in whichever ADR/plan picks this up, since it's
the boundary someone will reasonably ask about.

## Suggested entry point

Start with **#1 (threshold/range filtering)**. It's the smallest bounded slice, it's a real gap
(confirmed against the actual water-quality scenario), and it doesn't force a decision on the
harder open questions (#2's schema question, #3's re-upload semantics) before you've shipped
anything. Treat #2–#4 as follow-ups, each gated on its own open question being resolved first.
