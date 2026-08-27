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

## C2 results — round 3 closed; the DONE line is met, with one named miss

All numbers below sit on the round-3 signature definition; the
harness ran from scratch on both registered sheets, and the real
pair was re-run so nothing reported here mixes signature versions.

**Planted-edit recovery, `ofgem_ed2/v5_2026-06.xlsx`:**

| class | InputSummary | SWEST |
|---|---|---|
| insert_blank_row | 3/3 | 3/3 |
| insert_copied_row | 3/3 | 3/3 |
| delete_row | 3/3 | 3/3 |
| insert_copied_column | 3/3 | 3/3 |
| delete_column | 3/3 | 3/3 |
| retype_literals | 3/3 | 3/3 |
| rewrite_formula | **0/3** | **0/3** |
| insert_row_and_retype | 3/3 | 3/3 |
| **total exact** | **21/24** | **21/24** |

Exact means: the structural report is exactly the planted change
and nothing else, and every surviving row and column maps to its
true counterpart. Every structural edit at every position on both
sheets recovers exactly: one planted row reads as one structural
change, one planted column likewise, deletes are named at their
line, and value-only edits report no structure at all.

**The named miss.** `rewrite_formula` — and two honest facts about
it. First, the harness wart: the class's target rule (« the first
formula in reading order ») ignores the position parameter, so its
three instances per sheet are one distinct edit run three times,
not three edits; the table's 0/3 is really 0/1 per sheet. Second,
the failure mode: the rule lands on row 1 — a label-less row whose
*only* formula is wholly rewritten — and the aligner reports
delete-row-1 + insert-row-1 instead of a change. A total rewrite
of a row's entire content arguably *is* a delete-and-insert; under
the registered judge it is a miss, and it stays recorded as one.
A future registered round may give this class positioned targets
and a labelled-row case; nothing is claimed for it today.

**The paper's number.** The zero-error claim behind the DP
alignment is its authors'; ours is this table: 42/48 exact
overall, 42/42 on structural and value-only edits, 0/6 (really
0/2) on whole-row single-formula rewrites.

**The real pair, under the final signatures** (v4_2026-01 →
v5_2026-06, 30 sheets, 2.6 s alignment after two ~20 s reads):
64 structural changes, among them a consistent, checkable story:
ten licensee sheets (EMID, ENWL, SPD, SPMW, SPN, SSEH, SSES,
SWALES, SWEST, WMID) gain **one inserted row at 157**; EPN and LPN,
which already carried 321 rows, show row 157 **changed in place**
(matched through its label at 0.5); NPgN and NPgY show no
structural change. A correction to this log's own round-2 entry,
which said « all fourteen licensee sheets » from memory of the
round-1 skim: the number is ten, as above — the record is the JSON,
not my recollection.

**Where C2 stands.** The plan's DONE line — « one inserted row
reads as one structural change; planted-edit recovery measured » —
is met on both registered sheets and visible on the real pair. The
O(n⁴) cost is measured and lives where predicted. Ready for C3's
delta report to consume `SheetAlignment` + `structural_changes`,
with the row-1 rewrite case and label-poor giant sheets carried
forward as named, registered limitations.

## C3 registration — the delta report in review language (REGISTERED BEFORE RESULTS)

Fixed before the report produces any number on any real pair. The
prior record it stands on: `revision-defect-protocol.md`
(pre-registered `a2159ca`) and `revision-defect-results.md` — the
PR24 draft→final study whose sixteen pairs produced **84 new
mechanical defects** under the key `rule + sheet + name`, with
`scripts/revision_diff.py` as its committed matcher.

**Inputs and machinery.** Two versions of one model. The engine
audits both sides through the same ingest path the study used
(identical configuration both sides — the engine stays a read-only
library); C2's alignment maps rows and columns; C1's raw diff
supplies content and cached-value changes. Cell-level changes are
mapped through the alignment, so a row insert does not turn one
edit into a hundred.

**The delta classes, fixed now.**

1. **New defects** — audit findings present at the new version
   under a key absent at the old, matched exactly as the study
   registered: `(rule, sheet, name)`, empty names to an UNMATCHED
   bucket, multisets matched by count. Never the address.
2. **Repaired defects** — the inverse.
3. **Class changes** — a matched position where the cell's class
   flipped (formula → typed constant, or typed constant →
   formula). When a repaired finding and a new finding land on the
   same aligned position, the report joins them into one
   class-change event — the « repaired cell, hardcoded tail » case
   the study called its most valuable technical result: the
   checklist scores it fixed; reading inside the formula does not.
4. **Moved assumptions** — a hardcoded input at a matched position
   whose typed value changed. No tolerance: a changed assumption
   is a changed assumption.
5. **Methodology changes** — a matched position holding formulas
   on both sides whose signatures differ, folded per row.
6. **Materially different outputs** — a matched position, formula
   both sides, same signature, whose cached value moved by ≥ 1%
   relative (scale = max(|old|,|new|); both values present).
   The 1% is registered here and moves only by written round.

**Fold and rank.** Per class and sheet, per-cell events fold to
rows (one row, its changed columns listed) and contiguous rows to
blocks — one authoring decision, one item, same as the engine's
findings discipline. Order: new defects (by engine weight), class
changes, methodology changes, moved assumptions, materially
different outputs, then C2's structural blocks; repaired defects
close the report (they are the good news, and they are still
churn).

**Verification, in order, each before the next is claimed.**

- **V1 — instrument parity.** On every pair it is run on, the
  report's defect-delta numbers (NEW / FIXED / PERSISTENT /
  UNMATCHED) must agree **exactly** with `scripts.revision_diff`
  run on the same files the same day. Any disagreement is
  adjudicated and the loser fixed, full re-run.
- **V2 — synthetic truth.** Unit tests where the right answer is
  by construction: a planted typed-over formula is a new defect
  and a class change; a retyped input is a moved assumption and
  nothing else; a rewritten formula is a methodology change; a
  recached value is a material output change only past the
  threshold.
- **V3 — the DONE test.** The sixteen PR24 pairs. The corpus is
  not on this container: finals return 403 to a plain client
  (tried through this container's proxy before giving a verdict),
  drafts live on the UK Government Web Archive mirror. If the
  network serves the files: the report runs on all sixteen, V1
  parity holds on each, and the study-key NEW totals stand next
  to the recorded 84 (Yorkshire 40) — with any difference
  attributed in writing: matcher disagreement must be zero, and
  engine drift since the study (the A7/A3/A1 rounds regenerated
  the baseline) is measured and named, not hidden. If the network
  refuses, the refusal is recorded and V3 is blocked — reported,
  not fought.

## C3 first pair results, and a written amendment: the relabelled line

**V1 parity: EXACT on both pairs run so far** (the C1 v2 pair and
the C2 v4→v5 pair) — with one container honesty note first. The
study's matcher `scripts.revision_diff` cannot even be *imported*
here: its read chain (`regulator_eval` → `polar.tieout.ingest`)
trips the known Python 3.14.0rc2 + pydantic breakage at import
time. So V1 splits in two, both recorded: read-path equivalence
established in the source (ingest's findings are exactly
`read_workbook` + `audit(book, period_axes(book))`;
`repair_outputs` builds new objects and never mutates the book),
and matcher parity by execution — the study's `keyed()` logic kept
verbatim in `watch_delta.py --parity`, run on an independently
re-read, re-audited pair. Numbers, both pairs, all five fields
equal: v2 pair 0 new / 0 fixed / 11 persistent / 0+0 unmatched;
v4→v5 0 new / 0 fixed / 8 persistent / 1+0 unmatched.

**The v2 pair in review language** (C1's story, retold by C3
without being asked): two moved-assumption blocks — `Annual
Inflation` rows 50 and 53 across columns AP–AV, exactly C1's
fourteen retyped literals — and 94 materially-moved output blocks
downstream. Zero defect churn, zero structure. **The v4→v5 pair:**
zero defect churn (8 persistent), the ten inserted-row structure
items, 292 materially-moved output blocks led by `SelectedInputs`
and `TIM` at 40–140% moves.

**What the pair exposed, and the amendment.** C2 matched EPN and
LPN's row 157 at similarity 0.5 — and the delta report said
nothing about it. Read in the cells: v4's row is `Spare`, five
typed zeros; v5's row is `Connections Reform Costs`, same zeros.
v5 added that line to every licensee sheet — by insertion where no
spare row existed (the ten structure items), by **renaming a spare
row** where one did (EPN, LPN). A pure relabel fits none of the
six registered classes, so the report dropped exactly the change a
reviewer should see. Amendment, in writing, before any re-run:
**class 7, `relabelled_line`** — a matched row or column whose
normalized label changed; ranked after class changes, before
methodology changes. One registered gap alongside it, named for a
future round rather than smuggled in now: cells added or removed
*within* matched structure (a new actual typed into an existing
row) appear in C1's raw diff but in no C3 class; deferred, in
writing. Both pairs re-run after the amendment lands.

## C3 results — the report stands on both pairs; V3 blocked on network, said plainly

**Class 7's first run paid for itself.** Re-run of both pairs under
the amendment, parity still EXACT on every field: the v2 pair is
unchanged (no relabels in seventeen days — correct), and the v4→v5
pair reports **four** relabelled lines: `EPN!157`, `LPN!157` — and
`SelectedInputs!157` and `InputSummary!95`, which no earlier view
had surfaced at all. The full v5 story, assembled by the report:
one new line, « Connections Reform Costs », arrives everywhere —
inserted on the ten licensee sheets that had no spare row,
commandeered from a « Spare » row on the two that did, and named
into the input sheets — with zero defect churn, ten structural
blocks, four renames, and 292 materially-moved output blocks.

**V2:** nine synthetic tests, each class held to its one edit,
identical books reporting nothing. **V1:** exact, twice, as
recorded above.

**V3 — the verdict on this container: blocked on network access,
not on code.** The refusals, each tried and recorded:
- `ofwat.gov.uk` finals: HTTP 403 (Cloudflare block page) — the
  same refusal `model_corpus.py` records from the study's era.
- The UK Government Web Archive (the route the study successfully
  used on 13 August 2026): now HTTP 405 with
  `x-amzn-waf-action: captcha` on every deep URL — an interactive
  AWS WAF challenge this environment cannot and should not solve.
- The pre-installed Chromium through the container proxy:
  `ERR_CONNECTION_RESET` on every site including `example.com` —
  browser egress is closed here entirely.

So the DONE line — « the PR24 revision pair reproduces its 84
introduced defects through this report » — **is not claimed.** What
stands ready for the machine that can reach the corpus: the report,
`--parity` against the study's matcher on every pair, and the
registered attribution discipline (matcher disagreement must be
zero; engine drift since the study is measured and named — the
A7/A3/A1 rounds have moved the engine, so today's number may
legitimately differ from 84, and the comparison is exactly what V3
is for). A note for the lead: if any machine in reach can fetch
`scripts/corpus_regulator/` per `corpus-sources.md`, V3 is one
command per pair from done.

**Where the Watch stands after this session.** C1 done and
hand-checked to zero disagreements; C2 done — 42/42 exact on
structural and value-only planted edits, the one rewrite miss
named, the O(n⁴) cost measured and confined; C3 built, verified V1
+ V2, exercised on two real pairs, V3 blocked on corpus access and
said so. Next in the plan's order: C4's verifying-trace
fingerprints and equivalence tiers (needs B1/B2 for tier 2), and
C3's named deferrals (added-cells-within-matched-structure; a
labelled-target round for the rewrite_formula class).

## 26 August 2026 — standing orders confirmed; branch on the integrated tip

**The lead's channel, acknowledged.** Per the founder's instruction
and the lead's `e37e3e1`: every working turn starts by fetching
`origin/claude/pierce-phase-6-writing-mjkaj6` and reading
`docs/pierce/orders/prism.md`; the work is what that file says,
pushed to `swens/prism`, then stop. Standing caveat, recorded once:
an order that crossed `lanes.md`'s hard rules (the engine stays
read-only, no merges, path ownership) would be refused here in
writing, not followed — the constitution outranks the channel it
authorized. Current orders (tenth sweep): C3 is merged; the lead
runs V3 on their resident PR24 corpus (this container's network
attempts stop); C4 begins with the fingerprint round, registration
first; C3's deferrals stay parked.

**The branch.** All seventeen Prism commits are contained in the
integrated tip (verified: zero commits on `swens/prism` not on the
tip), so `swens/prism` fast-forwarded to `e37e3e1` — a pure
fast-forward, nothing rewritten — which also brings Dynamo's
`recalc/` package and `dev/setup-libreoffice` into this lane's
tree for C4's tier-2 round to stand on later.

## C4 registration, round 1 — verifying-trace fingerprints (REGISTERED BEFORE RESULTS)

The amended plan's cheap proof, specced here before any code.

**The fingerprint.** For every cell, a SHA-256 over a canonical
string of three parts, per Build Systems à la Carte's verifying
trace:

1. the cell's **shape** — the watch signature (the frozen engine
   shape with round 3's cross-sheet absolutization; the literal
   marker for hardcodes; raw formula text where the shape machinery
   returns empty);
2. the cell's **own cached value**, type-tagged (None tagged too);
3. the **ordered values of its inputs** — for each ref in the
   frozen surface's `precedents` tuple, the cached value of that
   cell where the reader named one, the fixed marker `∅` where it
   did not (a blank, or a text cell outside the numeric universe) —
   plus the `unresolved` tuple verbatim.

**The claim a match earns, and why it is sound by construction.**
Two versions matched by C2's alignment: where both cells'
fingerprints are equal, the cell's **value did not change between
the versions** — at hash cost, no evaluation. Soundness needs no
volatile-function denylist and no perfect precedent resolution,
because the own cached value is *inside* the trace: any change that
altered the output changes part 2 and breaks the match; any change
that altered nothing observable is exactly what the claim permits.
(What the trace does **not** claim: that the stored value is
*correct* — a value stale the same way on both sides matches. That
is single-version staleness, tier 2's territory, never this
round's.) Cells with no counterpart under the alignment are
suspects by definition. The **suspect set** = every new-version
cell not proved; its size against the proved fraction is the
number the tiers inherit.

**The store.** `watch/trace.py`: `fingerprints(book) -> {ref: hex}`
(pure, computable at ingestion) and
`proved_unchanged(old_book, new_book) -> (proved, suspects,
per-sheet counts)` running on the alignment. Product-side
persistence at ingestion is the lead's integration concern, not
this lane's; the function is the contract.

**The planted-stealth-edit harness** (`scripts/watch_stealth.py`,
code after this spec, results after the code): on the same
mechanically-chosen sheets as C2 (`InputSummary`, `SWEST` of ED2
v5), instances per sheet:
- *stealth only*: one literal retyped at each quartile position —
  no declared structural edit;
- *declared + stealth*: each C2 structural class at its median
  position, plus one literal retyped at the farthest quartile from
  it — the change hidden outside the declared cells.

Judged, fixed now: **(a) soundness, the hard gate — zero cells
whose stored cached value differs between the files (C1's raw
diff, mapped through the alignment) may appear in the proved set;
one violation fails the round.** (b) the stealth cell and every
value-changed dependent are reported suspect — implied by (a),
printed explicitly. (c) efficiency, reported never gated: the
proved fraction on each harness pair and on the two real pairs
(v2 14→31 July; v4→v5). Failures named one by one, as always.

## C4 round 1 — two instrument aborts before any result, and a C2 correction

**No result has been looked at**: both first runs aborted planting.
`InputSummary` holds effectively no typed numeric literal (the
engine names 4 cells literal; openpyxl's numeric scan finds none —
the sheet is pull-through formulas), so there is nothing there for
a stealth retype to retype.

**The correction this forces on C2's record, stated plainly:** C2's
`retype_literals` scan stops silently when it finds nothing, so on
`InputSummary` its three « exact » instances (and the retype half
of `insert_row_and_retype`) were **null edits** — they tested that
an unedited file reports no change (a valid null test, and it
passed) — not that retyped literals stay invisible to alignment.
On `SWEST` (1,547 typed literals) the retypes were real and the
claim stands. The C2 table's InputSummary `retype_literals` row
should be read as « null edit: no false positives », nothing more.

**Round-1 instrument amendments, registered now, before results:**
1. Value re-injection extends to **every** sheet of the planted
   file — the edited sheet through the pre-image map as before,
   all other sheets by identity — so the planted file is what
   Excel would have saved everywhere, the soundness gate is
   meaningful on every sheet, and the whole-file proved fraction
   stops being an artifact number.
2. The stealth rule, amended mechanically: a stealth retype lands
   on the registered sheet's first numeric literal at-or-below the
   position; a sheet with no typed numeric literal **cannot host a
   stealth edit** — its stealth-only instances are recorded as
   refusals, and its declared+stealth instances put the stealth on
   the *other* registered sheet (declared edit on `InputSummary`,
   stealth on `SWEST`) — a change hidden outside the declared
   sheet entirely, which is truer to « stealth » than the original
   rule. `SWEST` runs all eight instances as registered. A planter
   that finds nothing to retype now aborts loudly rather than
   passing silently — the defect C2's scan carried.

## C4 round 1 results — the gate caught a real hole; round 1 FAILS, round 2 registered

**The planted instances: 15/15 sound.** Six on `InputSummary`
(stealth on `SWEST` per the amendment; the three stealth-only
instances refused and recorded), nine on `SWEST`. Every stealth
cell reported suspect, zero gate violations, declared-sheet proved
fractions 86.3–97.2% — one hidden retype among ~12,000 cells never
slips through, and the tiers inherit a suspect set an order of
magnitude smaller than the sheet.

**The real pairs: one clean, one failing the gate.** v2 pair:
38,872 of 41,049 cells proved (94.7%), zero violations, 121 s
whole-model. v4→v5: 79.7% proved and **28 violations — round 1
fails its registered gate.** All 28 are one phenomenon: `B2` on
every sheet is the company-selector pull-through whose cached
result is **text** (v4 saved with ENWL selected, v5 with SSES).
A text formula result is `value=None` in the engine's numeric
universe, so the trace's « own cached value » read None on both
sides and matched — while the stored output moved. The soundness
argument (« the output is inside the hash ») silently assumed the
output is *observable*; for non-numeric results it is not.

**Round 2, registered now, before its results:** a formula cell
whose own cached value is unobservable through the reader
(`value is None`, on either side) can carry no verifying trace and
is **never proved** — suspects by refusal, the same honesty the
tiers will owe. Nothing else changes. All fifteen planted
instances and both real pairs re-run from scratch; the efficiency
cost of the exclusion is reported with them.

## C4 round 2 results — the gate passes everywhere; the cheap proof stands

Full re-run under round 2's registered fix, nothing else changed.

**Soundness: clean across the board.** All fifteen planted
instances sound (every stealth cell suspect, zero violations), and
**zero violations on both real pairs** — the 28 selector cells that
failed round 1 are now suspects by refusal, exactly as an
unobservable output should be.

**The price of honesty, reported as registered:** the observability
exclusion costs 1.5 points on the v2 pair (94.7% → **93.2%**
proved, 38,255 of 41,049 cells) and 2.3 points on v4→v5 (79.7% →
**77.4%**, 33,418 of 43,178). Planted-instance declared-sheet
fractions: 85.7–91.4%.

**What the tiers inherit.** On a real adjacent revision, the cheap
proof discharges ~93% of the model at hash cost (~2 minutes
whole-model including both reads) and hands tier 2 a suspect set
of ~2,800 cells instead of 41,000 — with a receipt for every
refusal: unobservable outputs, unmatched lines, changed traces.
The plan's sequencing holds: the solver stays the crown, not the
foundation. Next per the orders' item 2: tier 2's registration
(randomized differential evaluation over the suspects' cone of
influence, standing on Dynamo's `recalc/`), a new round, its own
registration first.

## Aligner memory round — registration (REGISTERED BEFORE RESULTS)

Ordered by the lead after V3's first real run: all sixteen PR24
pairs OOM-killed, localized to `scripts.watch_align` at 13.6 GB on
the AFW pair (~1.0M populated cells, 51 sheets — a shape neither
registered cost host produced). This container lacks the corpus;
per the orders, the failure shape is synthesized.

**Suspect, to be confirmed by profile, not guessed:** the DP in
`align_lines` allocates full `(R+1)×(N+1)` score and move
matrices. The score matrix is lists of Python floats — every cell
is assigned during the recurrence, so every cell materializes a
float object (~32 bytes with its pointer): a 30,000-row data sheet
alone costs ~29 GB, while the recurrence only ever reads the
previous row. Secondary suspect: `Line.signatures` is a property
that builds a fresh tuple on every similarity call — R×N tuple
churn.

**The instrument** (`scripts/watch_membench.py`, committed with
this registration): synthetic grids in the failure's shape — R
rows × 60 columns, half labelled / half not, 5% edited so the
identity shortcut cannot flatter the number — aligned in a child
process whose peak RSS is read from `resource`; R sweeps
{2,000, 5,000, 10,000}. The profile stands on the sweep's growth
curve, before and after.

**The fix, designed now, applied only if the profile confirms:**
two-row `array('d')` score storage (the recurrence unchanged,
byte-compact), the move matrix already-compact bytearrays kept
whole for traceback (exactly R×N bytes), and `Line` storing its
signature tuple once at construction instead of rebuilding it per
call. Identical recurrence, identical tie-breaks — the results
cannot move by construction, and the gate checks it anyway.

**The gate, fixed:** (a) all watch unit tests green; (b) the C2
planted-edit harness re-run on both registered sheets must
reproduce **exactly 21/24 and 21/24** with the same per-instance
verdicts; (c) the v4→v5 full-model alignment output must be
identical to the current committed behaviour, timings aside. Any
deviation fails the round. **Reported:** peak RSS per sweep point
before and after, the growth term named, and the projected peak on
the lead's worst FM02 sheet once its dimensions are known (or the
measured one, once the lead re-runs V3).

Tier 2's registration follows this round, per the orders.

## Aligner memory round — results: the term removed, every gate green

**The profile confirmed the registered suspect exactly.** Synthetic
failure-shaped grids (R × 60, half labelled, 5% edited), child
peak RSS:

| rows | before | after | before s | after s |
|---|---|---|---|---|
| 2,000 | 128 MB | **87 MB** | 33 | 18 |
| 5,000 | 425 MB | **160 MB** | 219 | 114 |
| 10,000 | 1,389 MB | **318 MB** | 900 | 477 |

Before: ~8 bytes per DP cell of score-matrix pointer storage (the
float objects themselves mostly shared as the running max
propagates — the pointers were the weight). After: scores live in
two `array('d')` rows, and the residual growth is the move
matrix's one byte per cell (100 MB at 10k rows), kept whole
because the traceback needs it. `Line` now materializes its
signature tuple once at construction. The ~1.9× speedup is churn
removed, reported as a side-effect, not a goal.

**The gates, all green:** (a) 49/49 unit tests; (b) the C2 harness
re-run on both sheets — 21/24 and 21/24 with **per-instance
verdicts identical** to the committed rounds, field by field;
(c) the v4→v5 full-model alignment identical to the committed
output — after one honest correction *to the comparator itself*:
`watch_align` sorts its sheet list by per-sheet timing, so the
first comparison flagged a timing-induced ordering as a
difference; with sheets compared by name, every field of every
sheet is equal. The aligner's results did not move.

**Projection for the lead, stated with its limits:** on this
container the 10k-row point peaked at 318 MB against 1,389 MB
before — a ~4.4× reduction that grows with R (the removed term
was 8 bytes/cell, the remaining one 1 byte/cell). A 30,000-row
FM02-class sheet projects to ~0.9 GB of move matrix plus the
books; the 13.6 GB peak should land in the low single GB. The
real number is the lead's V3 re-run to measure, not mine to
claim — per the orders, that happens the sweep after this merges.
If FM02 sheets prove taller still, the named next step is a
Hirschberg traceback (linear space), a registered round of its
own. Tier 2's registration follows once V3 is through.

## C4 tier 2 — randomized differential evaluation (REGISTERED BEFORE RESULTS)

Per the eleventh-sweep orders. Environment, verified before
registering anything as fact: `dev/setup-libreoffice` provisioned
LibreOffice 25.8.7 into `/opt` on this container (the preinstalled
24.2 misses Dynamo's floor), the UNO bridge imports in the bundled
interpreter, and **Dynamo's four UNO tests pass here** — the real
calculator, not the fake.

**The question tier 2 answers.** The cheap proof's suspects
include textual changes that may or may not change behaviour — and
the stealth case: an edit whose stored values betray nothing
because nobody recalculated. Tier 2 decides *behaviourally*: draw
a random assignment to the model's typed inputs, write the same
assignment into copies of both versions, recalculate both with the
same engine, compare on matched positions. **Divergence on any
trial demonstrates a behavioural change** (the diverging cells
named); equality across all trials is « probably equivalent » — a
probabilistic verdict, said as one, never a proof.

**Registered parameters.**
- k = 5 trials, `random.Random(20260826)`. Per trial, every typed
  numeric literal on the edited sheet is scaled by U(0.5, 1.5)
  (a zero literal instead becomes U(−1, 1) — a scaled zero is a
  dead input).
- Engine: `recalc.UnoCalculator` on the provisioned 25.8.7; the
  file's own calc settings, per Dynamo's driver. B2 discipline
  first: `prescan` runs on the base file and a denylist hit is a
  recorded refusal, not a workaround.
- Comparison: matched positions (C2 alignment), both recalculated
  values numeric, relative divergence > 1e-9 on
  scale = max(|a|,|b|) — the same float-noise line as C1; the
  volatile cone (`recalc.volatile_cone`) is excluded, since it
  diverges for the engine's reasons.
- Cost shape: the old-side file under trial t is identical across
  instances, so it is recalculated once per trial and shared.

**Instances** (planted on `SWEST`, extending `watch_stealth.py` —
the orders' « extends rather than forks »), two positions per
class (first eligible cell at/after the q1 and q3 row marks),
edits planted with the cached value **left as it was** — the
author who did not recalculate:
1. `tail_hardcode` — a formula gains a typed tail
   `-0.490096707821704` (the study's Severn Trent shape).
   Expected: caught 5/5 trials.
2. `conditional_divergence` — `F` → `IF(input > 1.4·current,
   F·1.01, F)` on a sampled input: diverges only when a trial
   pushes that input past 1.4×, so the analytic catch rate is
   1 − 0.9^5 ≈ 41%. The measured rate stands next to that number.
3. `equivalent_rewrite` — `=X*c` → `=X*2c/2`-shape rewrites:
   behaviourally identical; **must not** be caught — the
   false-positive control.
4. `stealth_literal` — the retyped literal, for continuity.
   Expected: caught 5/5.

**Reported, whatever it says:** the per-class catch table (the
DONE number), every diverging instance's trial count and top
refs, the equivalent-rewrite false-positive count (must be 0 for
the round to stand), recalc wall-time per file, and every refusal.
A baseline recalc of the unedited pair under trial-free settings
is timed first; if the machine cannot afford the full 8×5 grid,
the cut (positions to one per class) is recorded before results
are looked at.

**Tier-2 instrument amendment, before any result** (the run aborted
at target selection; no number was produced): SWEST's tail rows
hold no numeric-valued formula, so both target scans
(`formula_target`, `literal_target`) wrap to the sheet's top when
the tail holds nothing — the same mechanical fallback the round-1
stealth retype registered. The chosen coordinate remains the
recorded ground truth.

## Aligner timing round — registration (REGISTERED BEFORE RESULTS)

Ordered at the twelfth sweep: post-memory-fix, a PR24 FM02 pair
costs ~90 minutes wall on the lead's container — the fat is gone
and the minutes remain. This round measures where they live and
fixes only what is avoidable without moving a single result.

**Baseline already on record** (the memory round's sweep, same
instrument): the fix made the synthetic shape ~1.9× *faster*
(900 s → 477 s at 10k rows), so the 90 minutes is the O(R×N)
recurrence's own price on ~1M-cell models, not a regression.

**The instrument:** `cProfile` over `align_lines` on the
registered synthetic shape (5k rows × 60), attributing time among
(a) the per-pair `similarity` calls on the common miss path —
label-differing pairs that today pay two string compares plus an
element-wise tuple equality; (b) real LCS work on eligible pairs;
(c) the DP loop's own bookkeeping. The profile decides; nothing is
fixed on a hunch.

**Candidate fix, designed now, applied only where the profile
points:** per-call interning — each `align_lines` call maps every
signature tuple to one canonical object so equality is `is`-fast,
and precomputes per-line (label, signature-id) so the common miss
path answers without entering `similarity` at all. Exact same
verdicts by construction: the values compared do not change, only
how fast the equal ones are recognized.

**The gate, identical to the memory round's:** all watch unit
tests; the C2 harness reproducing 21/24 twice with per-instance
verdicts identical; the v4→v5 alignment equal in every sheet
(name-ordered). **Reported:** the profile's split, the sweep
before/after, and the projected FM02 pair time — or, if the
profile says the minutes are the recurrence's honest price, that
sentence and a stop, per the orders.

Sequencing note: the tier-2 grid is running on this container as
this registration is written; heavy jobs run alone, so the timing
measurement starts only after the grid returns.

## Tier 2 round 1 — the control failed for the instrument's reasons; round 2 registered

The grid ran: 45 recalculations, 63 minutes, LibreOffice 25.8
under UNO, 1,547 literals perturbed per trial. Recorded, not
claimed: **every class reported 5/5 trials divergent — including
`equivalent_rewrite`, so the round fails its own false-positive
control.** Decomposed, the picture is two instrument defects and
one clean result:

1. **`Cover!G4` diverges in every comparison of every class.** Read
   in the cells: `=MID(CELL("filename"),…)` — the model prints its
   own filename on the cover, and the harness's scratch files all
   have different names. An environment-reading formula is neither
   volatile (Dynamo's set is time/randomness) nor behaviour, and
   both false positives are exactly this one cell.
2. **`stealth_literal` erased itself.** The trial assignment
   rewrites every literal on the sheet — including the stealth
   cell, whose +7 it overwrites. Those instances tested nothing;
   their « catches » were `Cover!G4` again.
3. **The clean result underneath:** `tail_hardcode` caught 5/5 at
   the edited cell itself, both positions — the study's
   Severn-Trent shape demonstrated behaviourally. And
   `conditional_divergence` scored **zero real catches in ten
   trials** against an analytic ~41% per instance: with k=5 and
   the seed fixed, the drawn factors for that input simply never
   crossed 1.4 — deterministic, not unlucky, and reported as such.

**Round 2, registered before its results:**
- An **environment cone** joins the exclusions: roots are formula
  cells calling `CELL` or `INFO` (tokenized, the same discipline
  as Dynamo's volatile scan), closed over the reader's precedent
  lists; excluded from divergence comparison and counted in the
  report. Implemented in the harness — `recalc/` stays Dynamo's.
- **Build order flips**: the trial assignment lands first, the
  edit second, so a stealth retype adds its 7 to the perturbed
  value and survives.
- k stays 5 and the seed stays — changing them after seeing
  results would be tuning; the conditional class's drawn factors
  are printed so its rate explains itself. The full grid re-runs
  from scratch.

## Tier 2 round 2 — the cone looked in the wrong universe; round 3 registered

Round 2 recorded honestly: the control failed again with the same
single cell, and `environment_cone: 0` is the tell — `Cover!G4`
is **not in the engine's cell universe** (the Cover sheet
contributes zero labelled numeric cells), so a cone computed over
`book.cells` could never see it. Second finding: both
`stealth_literal` targets were dead inputs (spare-row zeros
feeding no formula), so their +7 moved nothing the driver reads —
`tail_hardcode` remains the one cleanly-demonstrated class (5/5
at both positions, real), and `conditional_divergence` repeats
its seeded zero.

**Round 3, registered before its results:**
- The environment cone's **roots come from the raw grid** (the C1
  reader holds every stored formula), closed over the engine's
  precedent edges; root and cone counts land in the report, and a
  run whose raw grid contains a `CELL(`/`INFO(` formula but whose
  cone is empty aborts as an instrument error rather than
  producing a polluted table.
- The **stealth literal must feed something**: eligible targets
  are literals whose ref appears in at least one engine cell's
  precedents — first such at/after the mark, wrapping, same
  fallback family as before.
- `conditional_divergence` keeps its threshold, k and seed —
  changing them now, knowing the draws, would be tuning. The drawn
  factors for its input are printed per trial so the measured rate
  explains itself against the analytic ~41%.

## Tier 2 round 3 — the control passes; the first measured round, with its mechanics

58 minutes, 45 recalculations, the environment cone rooted in the
raw grid found exactly `Cover!G4`, and **the false-positive
control passes: `equivalent_rewrite` 0/10 trials divergent.**

**The catch table (the DONE number, first measurement):**

| class | caught (per instance) | mechanics, read in the cells |
|---|---|---|
| tail_hardcode | **5/5, 5/5** | the edited cell's own recalculated output carries the −0.49 tail every trial |
| conditional_divergence | 0/5, 0/5 | the printed factors (max 1.276, 1.238) never crossed the registered 1.4× threshold — the seed's arithmetic, now visible per trial |
| equivalent_rewrite | 0/5, 0/5 | **correct silence** — the control |
| stealth_literal | 0/5, 0/5 | see below — the model's own semantics |

**Two findings about the model, not the method, both read in the
cells and both material for tier 2's future:**

1. **ED2 is a selector model.** Every licensee sheet feeds the live
   calculation only through
   `SelectedInputs!X = CHOOSE($B$3, ENWL!X, …)` — and v5 is saved
   with SSES selected, so **SWEST is a dead branch**: an edit there
   genuinely does not change current outputs, and will the moment
   the selector moves. Differential evaluation under the saved
   selector state cannot see dead-branch edits; a
   selector-sweeping round (evaluate under each licensee) is the
   named follow-up, for the lead to sequence.
2. **Perturbing flag literals deadens flag paths symmetrically.**
   `SWEST!AM102` is a categorical flag read as `=1` in
   SUMPRODUCTs; scaling it by U(0.5,1.5) breaks the comparison in
   *both* files, so the stealth's +7 had no remaining live path.
   Input randomization needs to distinguish magnitude inputs from
   categorical ones — a registered refinement for the same
   follow-up round.

**Where tier 2 stands.** The machinery is real end to end —
LibreOffice 25.8 under UNO through Dynamo's calculator, prescan,
volatile and environment cones, seeded trials, and a control that
now stays silent. The measured sentence the round earns: *a
behaviourally-demonstrable edit in the live cone is caught every
trial; an edit the model's own selector makes dead, or the seed's
draws never activate, is not — and the table says which is which,
mechanically.* The dead-branch and categorical-input rounds are
what stands between this and a catch-rate on arbitrary stealth
edits.

## Aligner timing round — results: the avoidable third removed, gates green

**The profile pointed precisely:** of ~790 s on the 5k profile run,
real LCS work was 172 s — and 1.94 billion `dict.get` calls
(253 s, plus the churn around them) came from rebuilding a
counting dict from scratch for every unlabelled pair at every DP
cell, when the multiset bound only needs each line's Counter,
buildable once per alignment.

**The fix** (`_pair_similarity`): per-line Counters precomputed in
`align_lines`, the bound served from their intersection. Same
formula, same threshold, same verdicts; the public `similarity`
stays untouched for the traceback and the tests.

**The sweep, before → after** (memory-round baseline → this round):

| rows | seconds | peak RSS |
|---|---|---|
| 2,000 | 18.1 → **8.7** | 87 → 88 MB |
| 5,000 | 114.2 → **62.9** | 160 → 162 MB |
| 10,000 | 476.7 → **265.4** | 318 → 323 MB |

From the original pre-memory-round state, 10k rows has gone
900 s / 1,389 MB → **265 s / 323 MB**. **Gates all green:** 49/49
unit tests; the C2 harness 21/24 twice with per-instance verdicts
identical; the v4→v5 alignment identical in every sheet.

**The projection, and the honest remainder.** The lead's
~90-minute FM02 pair should land near half that; sixteen pairs
near half a day. What remains is the recurrence itself — the
O(R×N) loop and the real LCS on eligible pairs — which is the
price of the registered algorithm. If the lead needs the day back
rather than half of it, the named next rounds are banding or a
Hirschberg traceback, each a registered round of its own; nothing
further is claimed here.

## C4 tier 1 — the Z3 fragment (REGISTERED BEFORE RESULTS)

Ordered at the fourteenth sweep, with SQLSolver as required
reading first. **No code may import z3 until the lead approves the
dependency** (proposal at the end of this section); this is the
registration only.

### Required reading: SQLSolver (SIGMOD 2024), read first-hand

Read from the paper itself (Ding, Wang, Yang, Zhang, Xu, Chen,
Piskac, Li — *Proving Query Equivalence Using Linear Integer
Arithmetic*, Proc. ACM Manag. Data 1(4), Article 227; repo
Apache-2.0). What it does: a LIA\* formula has the form
`∃u,v. F₁(u,v) ∧ v ∈ {x | F₂(x)}*`, where `*` is the **additive
closure** `S* = {v : v = Σᵢ λᵢ x⃗ᵢ, x⃗ᵢ ∈ S, λᵢ ≥ 0}` — the set of
all sums of elements of `S`, with the number of terms arbitrary,
which is exactly how a sum over an unbounded domain is expressed
without bounding it. Each unbounded summation becomes one integer
variable, the vector of those variables is constrained to lie in
the additive closure of the per-element constraint set, and the
whole thing reduces to plain LIA through a finite generator basis
(their worked example collapses to `(v₁,v₂,v₃) = λ₁(1,0,1) +
λ₂(0,1,1)`, whose unsatisfiability *is* the proof of the
distributive law over unbounded sums).

**What transfers to us.** Three things, and they are real:

1. The **encoding shape** for the one case where our ranges are not
   concrete — a whole-column or version-dependent-extent `SUM`.
   Their Equation (3), `Σf₁(y) + Σf₂(y) = Σ(f₁(y)+f₂(y))`, is
   literally a spreadsheet rewrite: two column totals replaced by
   one total of a helper column.
2. The **equisatisfiability discipline** — prove by asserting the
   negation and getting `unsat`, never by sampling.
3. Their **answer vocabulary**: EQ / NEQ / UNKNOWN / TIMEOUT, with
   « the problem is undecidable in general » said out loud. Ours
   will say the same.

**What does not transfer, and this is the load-bearing half.**

1. **LIA\* is integer arithmetic; our summands are money.** The
   paper names its own boundary — U-expressions cannot be
   translated when the formula « contains terms not supported by
   the LIA\* theory, such as strings or **real numbers** ». Their
   unbounded sums add *tuple multiplicities*, integers by
   construction of bag semantics; ours add rates and currency. The
   theory does not reach our summands, so LIA\* is **not** the tool
   for our SUM-over-symbolic-range wall — the addendum's
   anticipation was right that the wall exists, and the honest
   finding is that their ladder does not climb it.
2. **LIA\* forbids variable × variable** (their third listed
   challenge, arising from joins). That product is the single
   commonest shape in a financial model — `rate * base`. Over the
   **reals**, though, nonlinear arithmetic is decidable (Tarski;
   Z3's `nlsat`), so our setting gets for free the case they had to
   extend around. This is the one place our problem is *easier*
   than theirs, and it decides the fragment below.
3. **Their unboundedness is intrinsic; ours is rare.** A relation
   has unknown size by nature; a spreadsheet range is concrete at
   read time (`A1:A1000` is a thousand cells). So the wall is
   narrow — whole-column and differing-extent ranges only — and
   round 1 **refuses** those rather than mis-modelling them.

### The fragment, named precisely

A matched-cell pair is *eligible* when both formulas parse whole
into this grammar, over `Real` variables (one per referenced cell):

- numeric literals; unary `-`, `+`;
- `+  -  *  /  ^` with a **literal** integer exponent;
- comparisons `= <> < <= > >=` and `AND OR NOT`, boolean-valued;
- `IF(cond, a, b)` → `ite`; `MIN MAX ABS`;
- `SUM(range)` / `SUMPRODUCT` over ranges whose extent is
  **concretely known and identical on both sides** — unrolled to a
  finite sum, no LIA\* required;
- cell and cross-sheet references, resolved through the frozen
  reader surface; **the same cell is the same variable on both
  sides**, which is what makes the question « same function of the
  same inputs? » rather than « same number? ».

**Arithmetic semantics, declared, not assumed.** The fragment is
interpreted over **exact reals**, and Excel computes in IEEE-754
binary floats. So tier 1's positive verdict reads exactly: *these
two formulas are the same function of the same inputs under exact
real arithmetic.* It is **not** a claim that both round identically
at every input. That gap is not swept anywhere: tier 2 is the
behavioural check on the actual engine, and a pair that tier 1
proves equivalent while tier 2 shows diverging is **its own
finding** — a rounding-sensitive rewrite, which is worth a
reviewer's attention rather than a silent tie-break.

**Division** is partial: every `/` contributes a side condition
`denominator ≠ 0`. A proof discharged under such conditions is
reported *with them*, never as unconditional.

### The refusal boundary (tier 3 — named, never blurred)

Refused in words, per cell, with the construct named: lookups and
data-dependent selection (`INDEX MATCH VLOOKUP XLOOKUP CHOOSE
OFFSET INDIRECT`), text and date functions, aggregates over
whole-column or differing-extent ranges (the LIA\* wall above),
volatile and environment functions (`TODAY NOW RAND CELL INFO`),
array/dynamic-array formulas, anything the reader could not parse,
and every construct not listed in the fragment. **Tiers are never
blurred**: a refusal is a refusal, not a weak pass, and the
coverage denominator — how many suspects tier 1 was even eligible
to judge — is reported beside every catch number.

### Where tier 1 sits between the tiers

It answers the question tier 2 can only sample: C3's
`methodology_change` class — the reviewer's « did this rewrite
change anything? ». Tier 0 discharges what did not move at hash
cost; tier 1 *proves* eligible rewrites equivalent or produces a
counterexample assignment; tier 2 remains the behavioural check on
the real engine and the only tier that speaks about floats.

### The harness and the gate (fixed now)

Planted rewrite pairs on the registered corpus sheets, each with
its truth known by construction: **equivalent** (`x*2/2`,
`(a+b)+c` → `a+(b+c)`, `IF(c,a,a)` → `a`, `SUM(A1:A3)` →
`A1+A2+A3`) and **inequivalent** (the study's hardcoded tail
`−0.490096707821704`, an off-by-one range, a flipped comparison,
a swapped operand of `−`). Reported per class: proved / refuted /
unknown / refused, with counterexamples printed for refutations.

**The hard gate — one violation fails the round: zero false
proofs.** No pair the harness plants as inequivalent may come back
`proved equivalent`. Unknown and refused are honest outcomes and
are never counted as proofs; a timeout (registered: 10 s per pair)
is UNKNOWN, never EQ.

**Cross-tier agreement, also reported:** every planted pair also
goes through tier 2. Agreement is expected; disagreement in the
`tier 1 proves = / tier 2 diverges` direction is the
rounding-sensitivity finding named above, and the opposite
direction (`tier 1 refutes / tier 2 silent`) is expected whenever
the seeded trials never activate the difference — exactly what the
conditional class showed at tier 2.

### Dependency proposal — for the lead's approval

**`z3-solver`** (Microsoft Research, **MIT licence**), the Python
distribution of Z3, needed for tier 1 and nothing else. Imported
only inside the watch package's tier-1 module and its script, so a
machine without it loses tier 1 and keeps every other tier. Per
`lanes.md` § frozen interfaces rule 5, the lead owns `pyproject`;
**nothing here imports z3 until that approval lands**, and this
registration is deliberately code-free until then.

## Tier 2, wider round — REGISTERED BEFORE RESULTS

The next round per the orders and per round 1's own findings. Three
changes, each answering something round 1 measured, and nothing
else moves: k = 5 and the seed stay as registered.

**1. A liveness probe replaces guesswork about dead branches.**
Round 1's zero-catch on stealth literals was the model's own
selector semantics — SWEST is an unselected branch, so an edit
there changes no current output. Rather than special-casing
`CHOOSE`, a planting position is now **eligible only if it is
demonstrably live**: one probe recalculation with that cell
perturbed must move at least one cell the driver reads. Positions
that fail the probe are **recorded as refusals** naming the reason
(« dead under the file's saved state »), never silently swapped.
This generalizes to any model, and it makes the catch table's
denominator honest: tier 2 can only speak about live cells.

**2. Categorical literals are left alone.** Round 1 scaled a `=1`
flag read by SUMPRODUCT and deadened the flag path in *both*
files. Registered rule, declared crude on purpose: a literal is
**categorical** when it is integer-valued with |v| ≤ 12 (flags,
switches, month and licensee indices) and is **excluded from the
trial assignment**; every other literal is scaled as before. The
counts under each class are reported, so the rule's crudeness is
visible rather than hidden — a number-format-aware rule is a later
round if these counts say it matters.

**3. A second host.** `caa_h7/h7_new_debt_indexation_fds.xlsx` —
a different publisher (CAA, not Ofgem), a different structure, and
small enough to recalculate in seconds. Same classes, same
judgement, same gate. Widening to a *second* file is what tests
whether round 1's clean `tail_hardcode` result was the model or
the method.

**Reported:** the per-class catch table per host with its
eligibility denominator, the refusals with reasons, the
categorical/scaled literal counts, and — unchanged — the
false-positive control, which must stay at zero for the round to
stand.
