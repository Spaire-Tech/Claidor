# Prism — the Watch (Track C)

Lane log. Charter: `docs/pierce/lanes.md`; plan: `docs/pierce/swens-plan.md`
Track C, as amended 24 August 2026. I own `server/polar/tieout/watch/`,
`server/tests/tieout/test_watch*`, `server/scripts/watch_*`, and this
file. The engine is a read-only library to me;
`polar.tieout.audit._shape(cell, anchoring=True)` is a frozen
interface I align on and never change.

## 25 August 2026 — lane opened

**The branch.** The session was created from
`claude/prism-watch-alignment-ftfjx3`, whose tip is a merge commit of
an older state of `claude/pierce-phase-6-writing-mjkaj6` and carries
nothing of its own. `lanes.md` says lane branches are based on
`claude/pierce-phase-6-writing-mjkaj6`'s tip, and everything this
lane's first task depends on — `scripts/corpus_au_uk.py`, `notes.md`,
`lanes.md`, the A7-normalized shape hash — exists only there. So
`swens/prism` is based on that tip (`265bfeb`), and the deviation
from the prompt's literal « this branch's tip » is named here rather
than made silently.

**The corpus.** `uv run python -m scripts.corpus_au_uk` fetched all
27 files (the eleven ED2 versions among them) into
`server/scripts/corpus_au_uk/`, git-ignored, matching the manifest's
expected count. Nothing committed, per the corpus rule.

## C1 registration — the raw version diff, hand-checked (REGISTERED BEFORE RESULTS)

Committed before the differ under test has produced any number on
the pair. The rules below are fixed; if they prove wrong the change
is recorded here with a reason, never made silently.

**The pair.** `ofgem_ed2/v2_2023-07-14.xlsx` (old) →
`ofgem_ed2/v2_2023-07-31.xlsx` (new). Chosen on the manifest's
metadata alone — the two closest-dated adjacent versions, seventeen
days apart, same major version — before reading either file. If the
diff turns out enormous the pair still stands; only the eyes-on
sample sizes below are per-cell, so the check stays feasible at any
diff size.

**What C1 diffs.** The raw stored grid, not the engine's labelled
cell universe: every cell either file stores, compared on two axes —
*content* (the formula text, or the typed literal where there is no
formula) and *cached value* (what Excel last computed, exactly as
stored; no tolerance — a tolerance is an opinion, and the raw diff
has none). Kinds: `added`, `removed`, `changed` (with
formula-changed / value-changed flags, both allowed at once), plus
sheets added/removed. The raw diff is deliberately blind to row
shifts — one inserted row will read as hundreds of changed cells.
That blindness is C1's honest contract; repairing it is C2's job.

**The instrument.** Two independent readers of the same files:

1. The differ under test — `polar.tieout.watch` reading through
   `openpyxl` (the watch package's own read path; the engine is not
   touched).
2. The hand-check instrument — `server/scripts/watch_handcheck.py`,
   committed with this registration: Python **stdlib only**
   (`zipfile`, `xml.etree`, `re`), reading sheet XML, shared
   strings, and the workbook part directly. It shares no parsing
   code with the differ or with `openpyxl`.

**The check, in order.**

1. Both instruments produce, for the pair, the full set of
   (ref → status) over the union of populated cells:
   added / removed / formula-changed / value-changed / unchanged.
2. The two sets are compared **completely** — every ref, both
   directions. Every disagreement is adjudicated by me reading the
   raw XML of that cell in both files and writing the verdict here.
   A differ defect is fixed and the *whole* comparison re-run from
   scratch; an instrument defect likewise.
3. Because two instruments can be wrong the same way only through
   the file itself, a seeded sample is then read eyes-on in raw
   XML: 20 cells the instruments agree are changed, 10 agreed
   added-or-removed (or as many as exist, if fewer), 10 agreed
   unchanged, drawn with `random.Random(20260825)` from the sorted
   ref lists. Any eyes-on disagreement is a full stop and a re-run.
4. C1 passes when steps 2 and 3 close with zero unresolved
   disagreements. The verdict, the counts, and every adjudication
   land in this log.

**Exclusions, stated now.** The instruments compare worksheet cell
storage: defined names, VBA, charts, formats/styles, comments, and
data-validation are out of C1's scope (the Watch's later steps and
other lanes own those). Cached-value comparison is on the stored
lexical value (numbers compared as decimal text, not as re-parsed
floats, so no round-trip opinion enters). A formula stored with a
cached error value is compared like any other stored text.

## C1 results — the hand-check closed, zero disagreements

Run after the registration commit (`75e97d3`), rules unchanged.

**The verdict: PASS.** Both instruments, on the registered pair:

| | count |
|---|---|
| populated cells, old / new | 60,585 / 60,609 |
| added | 24 |
| removed | 0 |
| changed | 1,255 |
| — of which formula/content changed | 14 |
| — of which cached value changed | 1,255 |
| unchanged | 59,330 |
| sheets added / removed | 0 / 0 |

- **Step 2, complete comparison:** every status list identical, both
  directions, and the full populated-ref universes are set-equal —
  not just equal in count. Zero disagreements, so zero
  adjudications.
- **Step 3, seeded eyes-on sample** (`random.Random(20260825)`; 20
  changed, 10 added, 10 unchanged — no removed cells exist): all 40
  read in the raw XML of both files, all 40 confirm both
  instruments. Two things the sample showed worth recording: the
  « added » cells are `<c r=".." s="503"/>` in the old file — a
  style-only stub, correctly not populated under the registered
  definition — and nearly every cell's style index shifted between
  versions (`s="444"` → `s="441"`), which the registered scope
  rightly excludes; a diff that counted styles would have drowned
  the 1,279 real differences in sixty thousand false ones.

**What the pair actually says**, in review language ahead of C3: the
31 July file is the 14 July file with twelve months of monthly
inflation actuals typed into two columns (all 24 added cells are
`Monthly Inflation!H284:I295`), the annual assumption rows retyped
(all 14 content changes are literals on `Annual Inflation` rows
50/53 — no formula in the model was rewritten between these
versions), and 1,255 cached values downstream re-computed by Excel.
The raw diff cannot and does not say the retyped inputs *caused* the
recached values — that claim needs Track B's recalculation.

**Honesty notes.**
- Two post-registration edits to the committed instrument, both
  cosmetic (an ElementTree deprecation fix; `ruff format`
  whitespace). The instrument was re-run after each; output
  byte-identical both times.
- The differ takes ~40 s on the pair (openpyxl reads each file
  twice); the stdlib instrument takes ~2 s. Not a problem at C1's
  cadence; noted for when the Watch runs at product speed.
- `uv run mypy` on the watch package and both scripts is clean
  except two pre-existing errors inside the engine's `audit.py`,
  which is not mine to touch; recorded here for the lead.
- Nine unit tests pin the semantics on synthetic files (every kind
  in its bucket; TRUE ≠ 1 ≠ « 1 »; the two instruments agree on a
  synthetic pair where truth is known by construction; the
  shared-formula translator's anchors, strings and off-grid #REF!).
  They run conftest-free: `uv run pytest tests/tieout/test_watch_diff.py
  --noconftest` (the repo-level conftest needs the app stack, which
  this container's Python 3.14.0rc2 + pydantic cannot import — same
  workaround the tieout suite already uses).

**C1 stands: an adjacent ED2 pair diffs completely against
hand-check.** The plan's DONE line is met on this pair. Next: C2.

## C2 registration, part 1 — signatures, algorithm, and the cost measurement (REGISTERED BEFORE RESULTS)

Fixed before the aligner produces any number on any corpus file.
The planted-edit harness gets its own registration (part 2) before
its results; this part fixes what the harness will be testing.

**Cell signature.** For a formula cell,
`polar.tieout.audit._shape(cell, anchoring=True)` — the frozen
interface, used, never reimplemented and never changed. For a
hardcoded literal, the fixed marker `•`. Cached values appear
nowhere in any signature, so matches survive a full re-forecast —
that is the amendment's point.

**Row signature** for row *r* of a sheet: the row's label (the
engine's `row_words` text for *r*, else the first non-empty
`row_label` among its cells, lowercased and whitespace-collapsed)
plus the sequence, in column order, of the row's cell signatures.
Column signature is the mirror: the most common non-empty
`column_label`, plus the column's cell signatures in row order.
Rows and columns with no populated cells are invisible to the
aligner (nothing to align); their effect is the index gap they
leave, which the alignment reports as a shift.

**Similarity** between two rows (or two columns), fixed now:
`shape_sim` = 2·LCS(a, b)/(|a|+|b|) over the two signature
sequences (position-blind, order-aware — an inserted column must
not destroy every row match). If both labels are non-empty:
`sim = 0.5·label_eq + 0.5·shape_sim` (label_eq ∈ {0,1}, exact match
on the normalized text). Otherwise `sim = shape_sim`. Two identical
signature tuples short-circuit to 1 without the LCS.

**Alignment** (the RowColAlign shape; SheetDiff's greedy hypothesis
algorithm is what the amendment removed): order-preserving DP —
`score(i,j) = max(skip-old, skip-new, score(i-1,j-1) + sim(i,j)
if sim(i,j) ≥ 0.5)` — maximizing summed similarity; traceback gives
matched pairs, unmatched-old (deleted), unmatched-new (inserted).
Rows and columns aligned by the same code with roles swapped. The
threshold 0.5 and the 0.5/0.5 label/shape weights are registered
here; if the harness shows them wrong they change in a written
round, never by quiet tuning. Known limitations, stated now:
order-preserving DP reads a *reordered* row as delete + insert, and
a row whose formulas reference across an insertion point changes
shape under Excel's own reference updating, so such rows lean on
their labels and remaining sequence to stay matched — both are
facts the harness will measure, not surprises.

**Complexity and the cost measurement.** Row alignment computes up
to R² pair similarities, each an O(C²) LCS in the worst case —
O(R²C²) = O(n⁴) — and column alignment the mirror. Before anything
depends on the aligner, it runs on every sheet of the biggest
corpus file, `ofgem_riio3/final_gd3_bpfm.xlsm` (17.5 MB, the
largest of the 27 by bytes), self-aligned (the worst honest case
for the identity shortcut is a *changed* pair, so the measurement
also runs the biggest ED2 adjacent pair, v4_2026-01 → v5_2026-06).
Recorded: wall time for `read_workbook`, signature build, row and
column alignment per sheet, and peak RSS. The verdict criterion is
honesty, not a pass mark: the numbers decide how the harness may
afford to run (whole-file planting vs single-sheet extracts) and
are written here before the harness is registered. Heavy jobs run
alone in the container, sequentially, per the lanes discipline.

## C2 cost results — the O(n⁴) term, measured before anything depends on it

Run under the part-1 registration, rules unchanged. Both jobs ran
alone in the container.

**The worst case — `final_gd3_bpfm.xlsm` (17.5 MB, 48 sheets),
self-aligned:** read 179 s, signatures 173 s, alignment 265 s, peak
RSS **8.1 GB**, and — correctly — zero structural changes on the
identical pair. The alignment time lives exactly where the theory
says: the debt sheets whose rows carry few usable labels, where the
similarity falls back to sequence LCS —
`F5 - Inflation Linked Debt` (454×343) 93 s,
`F3 - Fixed Rate Debt` (455×347) 70 s,
`F6 - Debt Dataset` (1,978×61) 40 s. Well-labelled sheets of the
same size cost well under a second, because a differing label pair
is decided without any LCS at all.

**The honest case — the biggest adjacent ED2 pair, v4_2026-01 →
v5_2026-06:** read 21 s per file, signatures 2.1 s, **full-model
alignment 2.6 s**, peak RSS 460 MB, 64 structural changes across 30
sheets. And the first real result before any planting: v5 inserts
one row at 157 on every licensee sheet (SPN, SSES, SSEH, ENWL,
SPD, SWEST, …) and the aligner reads each as **one inserted row**
with every other row matched — on a real revision, unprompted.

**What the numbers decide.** (1) The O(n⁴) term is real but
confined to label-poor sheets; on the well-labelled regulator
models the Watch's target runs at seconds per pair. Fine for C2;
if a label-poor giant ever needs to be fast, that is a registered
round of its own (candidate: band the DP as SheetDiff's successors
do), not a quiet tweak. (2) The 8.1 GB peak on the BPFM
self-align re-teaches the paid-for lesson: heavy workbook jobs run
alone, always. (3) Planting can afford whole real files: an ED2
read is ~21 s, so the harness plants into the full v5 model rather
than single-sheet extracts.

## C2 registration, part 2 — the planted-edit harness (REGISTERED BEFORE RESULTS)

Committed, with the harness itself (`scripts/watch_plant.py`,
commit `74b250a`), before any recovery number was looked at.

**Base file and sheets, chosen mechanically:** the newest ED2
version, `ofgem_ed2/v5_2026-06.xlsx`; the sheet with the most
populated content rows (`InputSummary`, 353) and the median sheet
by that count (`SWEST`, 308). No other selection.

**Classes** (planted with Excel's reference semantics — the
harness's rewriter shifts references on insert and delete and is
pinned by its own thirteen tests): `insert_blank_row`,
`insert_copied_row`, `delete_row`, `insert_copied_column`,
`delete_column`, `retype_literals` (five literals +7; must report
no structure), `rewrite_formula` (one formula wrapped in SUM(…,0);
must report no structure), `insert_row_and_retype`. Positions: the
quartile indices of the sheet's populated lines, deterministic.

**Judgement per instance, fixed:** the structural report must be
exactly the planted change and nothing else; the row and column
mappings must be right for every surviving line; **exact recovery**
is both at once. A *copied* insert accepts either twin as the new
line — the one genuinely undecidable ambiguity. The registered
approximations (same-sheet references only; whole-row ranges not
shifted; delete's range-endpoint convention) are in the harness
docstring.

**What will be reported, whatever it is:** instances and exact
recoveries per class, the misses named one by one with their
failure mode, and the comparison the amendment demands: the
paper's zero-error claim is its authors' number; ours is whatever
this table says.

## C2 harness round 1 — instrument defect found; results recorded, not claimed

The round-1 numbers, recorded honestly: 3/24 exact on
`InputSummary` (the three `retype_literals` instances; every
structural class missed). **These are not the aligner's numbers.**
Diagnosis, in order:

1. Every miss, whatever the planted edit, reported the same two
   phantom blocks — rows 331–378 and 384–431 deleted *and*
   re-inserted — even for column-only edits. The planted change
   itself was reported correctly beside them (e.g.
   `delete_column @ 18` found exactly `deleted_columns 18`).
2. A null plant (load + save with **no edit**) showed openpyxl's
   save drops every cached value: 27,488 refs differ on re-save.
3. The phantom rows are pull-through rows (`=SelectedInputs!H24` …)
   whose labels are **formula-produced**: with the cached text
   gone, the engine's labeller finds no label. Their every
   reference is cross-sheet, so a row shift genuinely changes
   every shape (Excel-real, registered as a known limitation) —
   and the label that would have rescued the match, and does
   rescue it on real Excel-saved files (see the v4→v5 result:
   row 157 clean on all fourteen licensee sheets), was destroyed
   by the instrument, not by the edit.

**Round 2, registered now, before any round-2 result:** the
planter re-injects the original cached values into the edited
sheet of the planted file (pre-image mapped through the edit; the
copied row takes its source's values) — reconstructing what Excel
itself would have saved, which is the file the harness claims to
simulate. Nothing else changes: same base, same sheets, same
classes, same positions, same judge. Round 1's
`rewrite_formula` misses may be genuine (the first-formula rule
landed on a label-less row 1, wholly rewritten → delete+insert);
round 2 will say. All 24 instances re-run from scratch.

## C2 harness round 2 — the instrument fixed; the misses now the aligner's

Round 2 (values re-injected): 3/24 exact, but the picture changed —
**the planted change itself is now reported correctly in every
instance** (e.g. `insert_copied_row @ 131` reports exactly
`inserted_rows 131`), and every remaining miss is one phenomenon
beside it: rows 371–378 and 424–431, and column 8, report as
deleted + re-inserted on every structural edit.

Diagnosed at signature level, these are the aligner's, with one
root cause: **a cross-sheet reference is encoded relative to the
referencing cell** (`SelectedInputs!R[-307]C[+0]`), so a row shift
changes every pull-through cell's shape — while in Excel's own
semantics `=SelectedInputs!E64` does not move when its cell does.
Rows whose labels exist survive this (the label carries the match);
these particular rows are spare allowance rows whose label
formulas *compute zero*, so they are genuinely label-less, lean on
shapes alone, and fall below threshold. Column 8 is the same story
on the other axis. The `rewrite_formula` misses are separate and
small: the first-formula rule lands on label-less row 1, whose
only formula is wholly rewritten — delete + insert is arguably the
truth there; under the registered judge it is a miss and stays
recorded as one.

**Round 3, registered now, before its results — a signature
amendment in writing:** in the Watch's signature layer (the engine
untouched), a shape piece qualified with a *different* sheet's
name has its relative offsets rewritten to the absolute target
(`SelectedInputs!R[-307]C[+0]` from row 371 → `SelectedInputs!R64C[E]`),
range tails included; same-sheet and unqualified pieces stay
relative, because those do shift with their cells under Excel's
reference updating. This encodes exactly Excel's own movement
semantics, no more. Threshold, weights, judge, classes, positions:
unchanged. All 24 InputSummary instances re-run from scratch, then
SWEST, then the v4→v5 real pair re-run so every reported number
sits on the same signature definition.
