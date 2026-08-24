# A3 — mining the CUSTODES labels for missed patterns

swens-plan Track A, step A3. The registered head-to-head (see
`custodes-benchmark.md`) left 1,690 of their 1,973 truth cells
outside every finding of ours. This document mines those misses for
defect **patterns** we genuinely lack and genuinely care about on
financial models. The plan's own boundary travels with every line:
their *thresholds* are not adopted to score better on their corpus —
we do not sell into messy general spreadsheets, and the quietness is
the product. Any pattern adopted here is justified by
financial-model value, never by the benchmark score, and becomes a
check only through the normal loop — harness first, registered
measurement on **our** corpora — none of which happens in this
document.

## Registration (committed before any classification is computed)

**Universe:** the truth cells (per the committed scorer
`scripts/custodes_score.py`) not covered by any finding's cell set —
expected 1,690 = 1,973 − 283. Computed by the same scorer's
machinery, no re-derivation.

**Per cell, from the converted subject workbook** (the same
`custodes_work/xlsx` conversions the scorer uses):

- **content type**: formula (openpyxl value is a string starting
  `=`), value (any other non-None), or empty/unresolvable (cell
  empty, sheet not found, workbook unreadable).
- **context windows**: up to 3 cells each side in the same row, and
  3 each side in the same column.
- **formula shape**, classifier-local: the formula string with every
  A1-style reference rewritten to its offset from the holding cell
  (`R[dr]C[dc]`; absolute parts kept literal) and every number
  replaced by `#`. This mirrors the engine's normalization in
  spirit; it is *not* the engine's `_shape` and decides nothing
  outside this document.

**Buckets, with this precedence (first match wins):**

For **value** cells (their dominant « missing formula » class):

1. `row-family-gap` — ≥ 2 row-window formula neighbours sharing one
   shape. A constant inside a row that computes.
2. `column-family-gap` — same, in the column window.
3. `row-context-weak` — ≥ 1 row-window formula neighbour, no shared
   shape.
4. `column-context-weak` — same, column.
5. `no-formula-context` — no formula within either window: the
   cluster-by-labels/format/layout class their weak features flag
   and structural evidence cannot.

For **formula** cells (their dissimilar-formula/reference classes):

6. `differs-from-row-family` — ≥ 2 same-shape row neighbours whose
   shared shape this cell does not match.
7. `differs-from-column-family` — same, column.
8. `formula-matches-context` — a formula agreeing with its
   neighbours that they marked anyway.
9. `formula-no-context` — no formula neighbours to compare against.

10. `unresolvable` — empty cells, missing sheets, unreadable books.

**Hand reading:** the first **12** cells per bucket in
(workbook, sheet, cell) sort order — fixed here so the sample cannot
be cherry-picked — each read in its sheet with its neighbourhood,
and judged on two questions: what is this, actually; and does a
financial-model analogue exist that our engine misses today.

**Verdicts allowed per pattern:** *adopt as a candidate check*
(named, sent to the loop: planted defects on our corpora first,
false-positive price measured before anything ships), or *reject*
(with the reason written). No existing check's threshold changes in
this round.

The classifier is `server/scripts/custodes_mine.py`, committed with
this registration; results are appended below it, never edited into
it.
