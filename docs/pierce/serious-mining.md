# The serious-error mining round — registration, before any classification

27 August 2026, ordered by the lead after the Tasi round. That round
produced one result it did not predict: **our coverage of Tasi's
« serious » cells is 7.8%, against 13.2% overall** — the cells a
second expert labeller singled out as the serious ones are the cells
our engine is *less* likely to reach. This document mines that gap.
Registered before any classification is computed; results are
appended below, never edited in.

The mining boundary travels from `custodes-mining.md` unchanged and
is the whole discipline of this round: **any pattern adopted here is
justified by financial-model value, never by a benchmark score.**
We do not sell into messy general spreadsheets, the quietness is the
product, and no threshold of any existing check moves in this
document. Nothing ships from here — an adopted pattern becomes a
*candidate*, and candidates enter the normal loop (planted defects
on our own corpora, false-positive price measured, gate) before any
of it reaches a report.

## Universe (fixed now)

The Tasi **serious-error** cells not covered by any finding's cell
set, computed by the committed scorer `scripts/custodes_tasi.py`
using its own machinery — no re-derivation. Expected **1,206 =
1,308 − 102**; the actual count is reported, and any difference is
explained rather than absorbed.

Subject workbooks are read **directly as legacy `.xls`**, per the
Tasi round's 27 August amendment (this container cannot convert
them, and the direct read is artefact-free).

## Per cell, the same features as the first mining round

Deliberately identical, so the two rounds' bucket distributions can
be set side by side — that comparison is the point of this round:

- **content type**: formula, value, or empty/unresolvable.
- **context windows**: up to 3 cells each side in the same row, and
  3 each side in the same column.
- **formula shape**, classifier-local: references rewritten to
  offsets from the holding cell, numbers replaced by `#`. Mirrors
  the engine's normalization in spirit; it is *not* the engine's
  `_shape` and decides nothing outside this document.

## Buckets — the first mining round's, verbatim and in the same precedence

For **value** cells: `row-family-gap`, `column-family-gap`,
`row-context-weak`, `column-context-weak`, `no-formula-context`.
For **formula** cells: `differs-from-row-family`,
`differs-from-column-family`, `formula-matches-context`,
`formula-no-context`. Then `unresolvable`.

Their definitions are those of `custodes-mining.md` §Buckets and are
not restated here so they cannot drift between the two rounds.

**The comparison that motivates the round, fixed now:** the serious
misses' bucket shares are reported against the general misses'
shares (row-context-weak 30.8%, no-formula-context 23.9%,
row-family-gap 13.0%, column-family-gap 12.1%, column-context-weak
6.8%, formula-matches-context 5.5%, differs-from-column-family
3.1%, differs-from-row-family 2.5%, unresolvable 2.1%,
formula-no-context 0.1%). A bucket **over-represented** among the
serious misses is where seriousness concentrates and our witnesses
do not.

## The tool cross-tab (fixed now)

For every serious miss, which of the other seven tools caught it —
straight from the label file's own columns, scored by the same
scorer. This is the round's second instrument and it is cheap: a
cell **no tool caught** is hard for the whole field and says little
about us; a cell **most tools caught and we did not** is a witness
we lack, and is where a candidate is worth proposing. Reported as
a distribution over « how many of the seven caught it », and per
bucket.

No tool's number here is a verdict on that tool — the Tasi round's
convention caveat (ExceLint reports regions) carries forward intact.

## Hand reading (fixed now)

The first **12** cells per bucket in `(workbook, sheet, cell)` sort
order — fixed here so the sample cannot be cherry-picked — each read
in its sheet with its neighbourhood, and judged on the two questions
the first round used: what is this, actually; and does a
financial-model analogue exist that our engine misses today. Each
sampled cell's tool cross-tab is read with it.

## Verdicts allowed (fixed now)

Per pattern: **adopt as a candidate check** (named, its
financial-model value argued, sent to the normal loop) or **reject**
(with the reason written). No existing check's threshold changes in
this round, and no check ships from this document.

## Prediction (written before running)

The serious misses will be **more formula-cell-heavy** than the
general misses — Tasi's serious class should lean on formula errors
(the smaller, sharper half of their truth) rather than the
missing-formula flood, and formula cells are where our
family-witness detectors already concentrate, so the gap will be
about *witness strength*, not about a class we refuse on principle.
I expect `differs-from-row-family` and `differs-from-column-family`
— 2.5% and 3.1% of the general misses — to be materially larger
here, and I expect a substantial share of serious misses to be
cells **most other tools also missed**, because seriousness and
detectability are not the same axis.

If instead the serious misses look like the general ones — dominated
by loose-witness missing-formula buckets — then the 7.8%-vs-13.2%
gap is a *severity* judgement we simply do not share, and the honest
conclusion is that no candidate is warranted. That outcome is
registered here as an allowed one, so it cannot later look like a
failure to find something.

The classifier is `server/scripts/custodes_serious.py`, committed
with this registration; results are appended below it.

---

## Results (computed and read after the registration)

**Universe confirmed: 1,206 missed serious cells** — exactly the
expected 1,308 − 102, computed by the committed scorer's own
machinery.

## The classification is VOID — the instrument cannot see the formulas

The first run put **100.0% of 1,206 cells into one bucket**
(`no-formula-context`, +76.1 points against the general misses'
23.9%). A single-bucket result is not a finding; it is an
instrument failing, and it was treated as one before anything was
concluded.

Run to ground at the cells. The sample's first entries are
`Table II.5!E17/F17` — the very cells `custodes-mining.md` cites as
`row-family-gap`, « where B–D compute `=AVERAGE(col 6:16)` ». My
classifier saw no formula anywhere in their row. So either the
first round was wrong or this instrument is blind.

It is the instrument, and the proof is arithmetic: `B17`'s cached
value is **1742354.0909090908**, which is exactly the mean of
`B6:B16` computed from the file's own cached values. `B17` is
`=AVERAGE(B6:B16)` beyond reasonable doubt — and
`read_workbook(...)` returns `formula=None` for it.

**The defect is in the engine's legacy `.xls` reader, and it is
partial rather than total.** Counting `FORMULA` (0x0006) records
straight from the BIFF stream against what the reader surfaces:

| subject | FORMULA records | engine sees | missed |
|---|---|---|---|
| `01-38-PK_tables-figures.xls` | 144 | 125 | 19 (13%) |
| `act3_lab23_posey.xls` | 40 | 30 | 10 (25%) |
| `01sumdat.xls` | 349 | 349 | 0 |

One file is read whole; two are not. Whatever the mechanism —
shared-formula stubs, `CONTINUE`-split records or a swallowed
decompile failure are the candidates named in `legacy.py`'s own
docstring — the consequence is that on some `.xls` files the engine
reads a computed cell as a typed value.

## Verdict (27 Aug): BLOCKED, not refused — and the block is outside my lane

No bucket distribution is reported and no candidate is proposed:
the numbers this round would produce describe the reader's blind
spots, not the detectors' witnesses, and publishing them as a
mining result would mislead. Blocked, not refused — the difference
being that nothing was measured, so nothing is concluded.

`polar/tieout/legacy.py` is **not among Sentinel's paths** in
`lanes.md`. The case is therefore written here and routed to the
lead rather than fixed:

- Fixing it changes what the engine reports on **every `.xls`
  file** — a findings change on a file class the golden-master gate
  does not cover (the corpus is `.xlsx`/`.xlsm`), so it needs its
  own registered round with its own evidence, and a decision about
  which corpus certifies it.
- Until then, every measurement taken through the `.xls` route
  understates the engine — including the Tasi round's fresh sweep,
  whose record is amended accordingly.

**What this round did establish**, and it is worth more than the
bucket table would have been: **a first-order cause of the
serious-coverage gap is that the engine cannot read some of these
formulas at all.** That is a better answer to « why 7.8%? » than
any witness-design hypothesis, and it was found because a 100%
bucket was treated as a broken instrument instead of a result.
