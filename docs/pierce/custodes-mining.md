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

---

## Results (computed and read after the registration; sample = the
## first twelve per bucket in sort order, as fixed)

**Universe confirmed: 1,690 missed cells.** The classifier's buckets:

| bucket | cells | share |
|---|---|---|
| row-context-weak | 521 | 30.8% |
| no-formula-context | 404 | 23.9% |
| row-family-gap | 220 | 13.0% |
| column-family-gap | 205 | 12.1% |
| column-context-weak | 115 | 6.8% |
| formula-matches-context | 93 | 5.5% |
| differs-from-column-family | 52 | 3.1% |
| differs-from-row-family | 42 | 2.5% |
| unresolvable | 36 | 2.1% |
| formula-no-context | 2 | 0.1% |

## The hand reading, bucket by bucket

**row-family-gap (220) — two named shapes.** The sampled cells are
constants beside real same-shape runs, and they miss our detector in
two recurring ways. *Family-edge*: the run's head or tail typed —
`Table II.5!E17/F17` hold −0.556/−0.539 where B–D compute
`=AVERAGE(col 6:16)`; `Q3 FY04!B132` holds 0.09 where C–E compute
`=+{col}76`. *Beat families*: the family computes on a stride —
`=1-C30` at C and E with text between (`Table II.4!F31`),
`=MAX(B6:C8)` at B, E, H in column pairs (`01sumdat CO!C11`), the
constant sitting on a beat position.

**column-family-gap (205) — the same, turned 90°, plus a boundary.**
Constants inside computing column families (`Table II.5!C15/C16`
typed inside `=B·*D·`; `D13/D14` typed inside `=C·/B·`). But several
samples are the *typed-above-computed boundary*: years 1994, 1995
typed where `=A11+1` continues below — in a financial model that
shape is typed actuals meeting a computed forecast, which is correct
authoring, and their label against it is their philosophy, not a
defect.

**differs-from-row-family (42) — the richest defect bucket.**
Totals-row siblings that disagree with each other:
`=SUM(E10:E22)-1000` beside clean `=SUM(C10:C22)` — **a plug**, the
hardcoded-tail flagship, visible only by cross-column comparison
(`ANNEXURE 3!E23`, again at `NOTES TO FS!E60/G60`);
`=SUM(L8:L29)` beside `=SUM(I7:I29)` — **range start off-by-one**;
`=SUM(C6:D13)` beside `=SUM(E6:E13)` — **cross-column bleed**; a
stray `G34` inside the E column's addition (`C-5.6!E47`) — **the
mis-drag term**. Mixed with idiom noise the discipline must
normalize away, never flag: `=(D13+D14+D15)` vs `=SUM(B13:B15)`,
`=F26+F31` vs `=+C26+C31`.

**differs-from-column-family (52) — anchoring and the same totals
story.** `=D9/D18` in a family of `=D11/$D$18` — the missing-anchor
class; `=SUM(M4:M16)` whose row-mates start at row 3.

**formula-matches-context (93) — the split family.** Cells agreeing
with their nearest neighbours while the wider row disagrees with
itself (`FY 2002!I17–L17` sum from row 4, H/N/O from row 3): the
window matched locally, the defect is the row-level disagreement.
Plus ranges that fit their neighbours but not the data block
(`=AVERAGE(B6:B15)` spanning « All data void »).

**row-context-weak (521), no-formula-context (404),
column-context-weak (115) — mostly their philosophy.** Typed data
tables beside a lone product column; a template of zeros
(`Cashsamp` row 22, six zero cells in a zero grid); values-pasted
financial statements (`Consolidated_Restatem` — whole sheets of
typed statements, the occasional `=47+402+234` typed breakdown).
Their weak features mark these clusters wholesale; in our market
these are typed inputs, actuals and values-pasted copies, and
flagging them is the flood our 2.9% false-positive discipline
exists to refuse. One real shape hides in column-context-weak: the
typed row-total (`Q3 FY04!F121` typed where `F122` computes
`=SUM(B122:E122)`) — a family-with-holes seen from the orthogonal
direction.

## Verdicts

**Adopted as candidate checks** — each named for its
financial-model value, none justified by this corpus's score, every
one entering the loop (planted defects on our own corpora, the
false-positive price measured) before anything ships:

1. **Totals-row sibling disagreement.** In a row (or column) of
   same-function aggregations, compare the normalized ranges and
   terms across siblings: range off-by-ones, arithmetic plugs
   (`…-1000`), cross-column bleed and mis-dragged terms all surface
   as one witness. The strongest candidate of the round — totals
   rows are the spine of every financial model, and our
   within-column analysis structurally cannot see this
   disagreement.
2. **Family-edge typed cells.** A constant at the head or tail of a
   ≥N same-shape run, in line with it — the typed last period over
   a computed row is a classic late-adjustment defect. Needs the
   boundary guard: the structure layer's historical/forecast split,
   so typed actuals never flood.
3. **Beat families.** Family detection over strided runs (every
   2nd/3rd column), which financial models produce as value/%
   pairs and split-year layouts. The collapse layer already
   understands column beats; the detector should too.
4. **Column-direction typed-over.** Verify the current typed-over
   detector's orientation against these misses; if row-biased,
   extend to column families (per-entity column models are real).
5. **Aggregation range vs block extent.** Generalize the existing
   sum-range work: does the range match the data block the
   structure layer sees (including text/void cells inside ranges).
   An extension of gapped-test/ED2-sum, not a new philosophy.

**Rejected, with reasons:**

- *Loose-cluster missing-formula* (the 1,040 cells of the three
  weak/no-context buckets, mostly): flagging typed inputs, actuals
  and values-pasted statements is their philosophy and our flood;
  the quietness is the product.
- *Typed-above-computed boundaries* (the year-axis samples): typed
  actuals meeting computed forecast is correct authoring; already
  the time-axis mapper's food, not a defect class.
- *Value-magnitude outliers* (9.903 among 0.3–1.0): judging by
  values violates never-match-on-values; a wrong confident flag
  costs more than the miss.
- *Idiom dissimilarity* (`SUM(a:c)` vs `(a+b+c)`, unary `+`):
  normalize, never flag — feeds A7's normalization round as a
  guard, not a check.

**What this round does not do:** no check ships from this document;
no threshold of an existing check moved; the candidates' measured
adoption needs the corpus machine (planted defects on our own
models first), and is tracked as engine work.
