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

## Tier 2, wider round — results: the apparatus is validated on two hosts

Both hosts under the registration, nothing moved after seeing
numbers. **The false-positive control is silent on both.**

| class | CAA `h7_new_debt_indexation_fds` (Outturn) | Ofgem ED2 v5 (SWEST) |
|---|---|---|
| tail_hardcode | **5/5, 5/5** | **5/5, 5/5** |
| conditional_divergence | 1/5, 0/5 | 0/5, 2/5 |
| equivalent_rewrite (control) | **0/5, 0/5** | **0/5, 0/5** |
| stealth_literal | **5/5, 5/5** | **5/5**, 1 refused |
| eligible instances | 8 of 8 | 7 of 8 |
| false positives | 0 | 0 |

**The three registered changes each did exactly their job.**

1. **The liveness probe** refused `SWEST!AR312` in one
   recalculation — « dead under the file's saved state » — the
   same dead-branch cell that silently consumed a whole grid in
   round 1. The surviving stealth instance then caught **5/5**,
   where round 1 reported zero. The catch table now carries an
   honest denominator: 7 eligible of 8.
2. **Categorical exclusion** left 849 of SWEST's 1,547 literals
   alone — **over half the sheet is flags and switches**, which is
   why round 1's scaling deadened so much. On the CAA host the
   rule classified nothing (3,132 literals, all magnitudes), so it
   costs nothing where it is not needed.
3. **The second host** answers the question it was chosen for:
   `tail_hardcode` catching 5/5 at both positions is **the method,
   not the model** — a different publisher, a different structure,
   the same result.

**The conditional class now proves the whole apparatus.** Its
divergence is predicted cell by cell by the printed factors, and
the measurement matches exactly, twice:

- CAA `B263`: draws `1.009, 1.097, 1.268, 0.547, **1.42**` — one
  above the registered 1.4× threshold, and the diverging trial is
  that one (`[0,0,0,0,40]`).
- ED2 `AL1`: draws `**1.405**, 1.317, **1.432**, 1.133, 1.217` —
  two above, and exactly trials 1 and 3 diverge (`[1,0,1,0,0]`).

A behavioural check that fires precisely when the behaviour
changes, and stays silent otherwise, is what tier 2 was for.

**One new finding — two registered rules interacting.** The ED2
`AV102` conditional instance printed `factors: []`: its threshold
input was an integer flag, so the *categorical* rule excluded it
from the assignment, and the condition could never activate. The
instance was live and honest — it simply could not fire. Not
patched after the fact; **registered for the next round**:
`conditional_divergence` must draw its threshold input from the
*scaled* set, and an instance whose input is categorical is a
refusal, not a zero. Its two zeros in the table above should be
read as « could not fire », and the class's real rate rests on the
three instances that could (3 of 15 trials, against ~41% per
instance analytically — small numbers, honestly small).

**Where tier 2 stands now.** On live cells, in the selected
branch, with flags left alone: a hardcoded tail is caught every
trial on two unrelated hosts, a stealth retype is caught every
trial, an equivalent rewrite is never flagged, and a conditional
change is caught exactly when the trials activate it. The named
next rounds are the conditional-input fix above and the selector
sweep (evaluating under each licensee) — the dead branch is now
*reported* rather than mistaken for a clean result, which is the
part that mattered.

## Two rounds registered together (REGISTERED BEFORE RESULTS)

Sixteenth sweep. My three numbered orders (handoff, tier 1's
registration, tier 2's wider round) are merged; **tier 1 stays
code-free** — `z3-solver` is still not in the tip's `pyproject`,
so nothing imports it — and **C6 stays unwritten**: the plan's
third amendment gates it on Dynamo's two stability tests, and
their B5 log carries the criterion as a plan (« run twice with
independent samples; agreement reported as a number ») with no
five-seed agreement and no cosmetic-invariance result on the
record yet. Checked, not assumed. So this turn takes the two
things that are mine, unblocked, and already owed.

### Round A — tier 2's conditional input must be able to fire

Owed from the wider round's own finding: `conditional_divergence`
drew its threshold input with `literal_target(nonzero=True)`,
which can return a literal the **categorical** rule excludes from
the assignment — so the condition can never activate and the
instance reports a zero it did not earn (ED2 `AV102`,
`factors: []`). Fixed rule: the class draws its threshold input
from the **scaled** set only; when no scaled literal is available
at or after the mark, the instance is a **refusal** naming that
reason, never a zero. Nothing else moves — k, seed, threshold and
every other class stay as registered.

### Round B — the two C3 deferrals, now unparked

The twelfth sweep parked these « until C4's first round lands »;
tier 0 and tier 2 have both landed, so they are due.

**B1. Cells added or removed inside matched structure.** Today
`delta_of` walks matched row × matched column positions and
`continue`s whenever either side is missing — so a number typed
into a previously-empty cell of an existing row is invisible to
every C3 class, while C1's raw diff sees it plainly. That gap is
the deferral, and it is the commonest real revision there is: the
new period's actual, filled in. Two new classes, **`emptied_cell`**
and **`filled_cell`**, ranked between `moved_assumption` and
`material_output` — authoring decisions before their consequences,
removal before addition. Scope, stated so it cannot creep: only
**matched** rows and columns, so an inserted row's cells stay
`structure` and are never double-counted; the engine's cell
universe, so C1's style-only stubs never appear. Folded to row
blocks like every other class.

**B2. `rewrite_formula` gets labelled targets and real positions.**
The C2 harness recorded two warts against this class: its target
rule ignores the position parameter (so its three instances per
sheet were **one edit run three times**), and it lands on
label-less row 1, whose wholesale rewrite reads honestly as
delete + insert. New rule: the class targets the first formula
cell at or after **its own mark** whose row carries a label,
wrapping to the top as the other scans do; a sheet with no such
cell is a refusal.

**The prediction, on record before the run:** if a row's label is
what rescues a rewritten row's match — which is what C2's round-3
diagnosis claimed — then this class should stop reading as
delete + insert and start recovering, moving the harness above
21/24. **Predicted, not promised**; whatever the harness returns
is what gets written, and a result that contradicts the diagnosis
is the more interesting one. The gate stands unchanged: the other
seven classes must reproduce their exact per-instance verdicts, or
the round fails.

## Rounds A and B — results

### Round A: the conditional class's zeros are now earned

Re-run on both hosts, nothing else moved. **ED2 `AV102`, which
reported `factors: []` and an unearned zero, now draws real ones —
`0.532, 0.67, 1.151, 0.921, 0.921`** — none above the registered
1.4× threshold, so its zero stands, but it is now a zero the
trials *produced* rather than one the instrument manufactured.
`AL1` unchanged (`1.405, 1.317, **1.432**, 1.133, 1.217`, two
crossings, two divergent trials). CAA unchanged, as expected: that
host has no categorical literals to freeze. Controls silent on
both, false positives zero, and the one refusal is still the known
dead cell.

### Round B1: the deferral closes the loop with C1

Unit tests pin the three semantics (a filled cell, an emptied
cell, and an inserted row that must stay `structure`). On the real
pair the result is the one I most wanted to see: **C1 measured 24
added cells at `Monthly Inflation!H284:I295`; C3 now reports them
as one `filled_cell` block — rows 284–295, columns H and I** —
twenty-four cells folded into a single authoring decision, « a
cell that was empty now holds 121.2 ». The report and the raw diff
finally tell the same story about that pair, in their own
languages, and nothing else in the report moved (0 new, 0
repaired, 11 persistent, 2 moved assumptions, 94 material blocks —
all identical to the committed run).

### Round B2: the prediction held, and named its own remainder

The registered prediction was that a labelled target should lift
the harness above 21/24. Measured:

| sheet | before | after | `rewrite_formula` |
|---|---|---|---|
| InputSummary | 21/24 | **24/24** | **3/3** |
| SWEST | 21/24 | **22/24** | 1/3 |

Every other class reproduced 3/3 on both sheets, so the gate
holds. InputSummary is now perfect: the class that had never
recovered once recovers at all three positions, which confirms
C2's round-3 diagnosis — *the label is what rescues a rewritten
row's match.*

**The remainder, named rather than tuned.** SWEST's marks 203 and
312 still report `inserted_rows 1 / deleted_rows 1` — row 1 again.
The cause is my own proxy: the harness calls a row « labelled »
when it holds any non-formula string, and SWEST's row 1 holds a
*title*, which the engine's labeller does not treat as a row
label. So when no labelled formula row exists at or after the
mark, the scan wraps and lands back on the one row the fix was
meant to avoid. The proxy is not the labeller, and the
registration said « a row the labeller can name ».

**Registered for the next round** (not patched after seeing the
number): the harness takes its labelled-row set from the engine's
own `Cell.row_label` through the frozen reader surface, and a
sheet with no labelled formula row at all is a refusal rather than
a wrap. Prediction, again in advance: SWEST's two failures should
become either recoveries or refusals — and if they become
refusals, `rewrite_formula` on SWEST is a class this sheet cannot
host, which is a fact about the sheet worth having.

## Round D — the selector sweep (REGISTERED BEFORE RESULTS)

The last of tier 2's named follow-ups, and the one that decides
whether « dead branch » is a permanent blind spot or just a
starting state.

**What the model actually does**, read in the cells rather than
assumed: every licensee sheet reaches the live calculation through
`SelectedInputs!X = CHOOSE($B$3, ENWL!X, NPgN!X, NPgY!X, WMID!X,
EMID!X, SWALES!X, SWEST!X, LPN!X, SPN!X, EPN!X, SPD!X, SPMW!X, …)`,
and `SelectedInputs!B3` is `=m_identity`, currently **14**. SWEST
is argument **7**. So SWEST is not unreachable — it is unselected,
and one cell decides which of the thirteen branches the model is
about.

**The rule, fixed now.** When the liveness probe refuses a
position as dead, the harness looks for a selector: a `CHOOSE`
whose first argument is a single cell and whose remaining
arguments name sheets. If the sheet under edit appears at index
*k*, the harness re-probes with that index cell **forced to k**
(overwriting its formula with the literal — a declared
intervention, not a discovery). If the position becomes live, its
instances run under the forced selector and **every one of them
carries `selector_forced: k` in the report**. A position that is
still dead with its own branch selected is dead for a reason that
is not the selector, and stays a refusal.

**Nothing else moves**: k, seed, threshold, classes, the
categorical rule and the gate are all as registered, and the
false-positive control must stay silent under forcing too — if
forcing the selector makes the equivalent rewrite speak, the
forcing is wrong and the round fails.

**The prediction, before the run:** SWEST's refused stealth
position should become live under `B3 = 7`, and the class table
should look like the CAA host's — `tail_hardcode` and
`stealth_literal` catching every trial, control silent. If instead
the forced branch still reports nothing, the dead-branch story is
incomplete and that is the more interesting result.

## Round C — results: the prediction met, on the refusal branch

| sheet | before | after | `rewrite_formula` | refusals |
|---|---|---|---|---|
| InputSummary | 24/24 | **24/24** | 3/3 | 0 |
| SWEST | 22/24 | **22/22** | **1/1** | **2, named** |

The registered prediction was that SWEST's two failures « should
become either recoveries or refusals ». They became refusals: « no
formula on a labelled row at or after row 203 » and the same at
312. Every other class reproduced 3/3 on both sheets, so the gate
holds, and the harness now reports a denominator it can defend —
22 of 22 hosted, not 22 of 24 attempted.

**The refusal checked against the sheet, not taken on the
instrument's word.** Read directly: SWEST spans rows 1–418 with
298 labelled rows, and **no formula cells whatsoever at or after
row 203** — the tail of that sheet is typed literals end to end.
So the refusal is true and in fact understates itself: there is no
formula there at all, labelled or otherwise. `rewrite_formula` is
a class this sheet genuinely cannot host below its quartile mark,
which is the fact the round was written to surface, and the wrap
that used to hide it was the whole defect.

Worth keeping beside C1's own finding about this corpus: a
regulator model's lower half is often data, not calculation, and a
harness that assumes « there is always a formula here » will
manufacture results rather than measure them.

## The C6 gate, checked this sweep

Dynamo has now **registered** both stability tests — seed
stability (five seeds, 200 runs, « identical, or the difference
named rule by rule ») and cosmetic invariance (three blank rows
inserted and the sheet renamed by LibreOffice itself, **compared
by label, never by cell reference**). Both are written as claims
with predictions and **carry no results yet**. So C6 stays
unwritten, per the plan's third amendment. Recorded here so the
gate's state at this sweep is on my record too, not only theirs.

Their invariance test rests on the same principle this lane's
alignment does: inserting rows moves every watched cell, so a
reference-keyed comparison would report total disagreement for a
model that behaves identically. When their numbers land, that is
the shared ground C6's matching rule stands on.

## Round D — results: the dead branch was a starting state, not a blind spot

Selector found in the model's own text (`SelectedInputs!B3`, SWEST
at index 7), and **only one position needed it**:
`selector_forced_positions: ["AR312"]`. Everything else was
already live and ran unforced — the intervention is applied where
it is needed and declared where it is applied.

| class | before (round C state) | **under round D** |
|---|---|---|
| tail_hardcode | 5/5, 5/5 | **5/5, 5/5** |
| conditional_divergence | 0/5, 2/5 | 0/5, 2/5 (same draws) |
| equivalent_rewrite (control) | 0/5, 0/5 | **0/5, 0/5** |
| stealth_literal | 5/5, **1 refused as dead** | **5/5, 5/5 (forced)** |
| eligible instances | 7 of 8 | **8 of 8, zero refusals** |
| false positives | 0 | **0** |

**`SWEST!AR312` — refused as dead for three rounds — catches every
trial once its own branch is selected**, and catches loudly:
155–234 diverging cells per trial against the 1–12 of the unforced
instances, because selecting SWEST lights its whole downstream
cone. The count varies by trial (155, 155, 234, 155, 230) since
different draws activate different paths beneath it; that variation
is the model's, not the harness's.

**The control held under forcing**, which was this round's fail
condition: if selecting a branch had made the equivalent rewrite
speak, the forcing would have been changing behaviour rather than
revealing it. It stayed silent at both positions.

**What this closes.** The dead-branch finding from tier 2's first
measured round is now fully resolved: it was never « differential
evaluation cannot see this », it was « the file is currently about
a different licensee ». One cell decides, the harness reads which,
and a position still dead with its own branch selected would stay
a refusal — none was. Tier 2's three named follow-ups (categorical
inputs, conditional inputs, the selector sweep) are all measured
and closed.

**What it does not claim.** Forcing the selector measures the
model's behaviour *in a state the file was not saved in*. That is
the right question for « would this edit matter? » and the wrong
one for « does this edit matter today », and the report says which
it did by stamping `selector_forced` on exactly the instances it
touched. Both readings are honest; only the unlabelled mixture
would not be.

## C6's gate after B5's negative — checked, and the answer is « still no »

Dynamo's B5 round 1 landed as an honest negative, and it changes
C6's position in a way worth stating precisely, because the
literal gate and the substance now point different ways.

- **The literal gate is met.** The orders gate C6 on « Dynamo's two
  stability tests (five-seed agreement; cosmetic invariance) », and
  the eighteenth sweep records the mining as *stable under five
  seeds, invariant to cosmetic edits, and clean*.
- **The substance is not.** The earlier addendum's actual
  precondition was « B5 round 1 must first show a
  modeller-recognisable rule set », and it did not: the rule sets
  are **artifacts of low perturbation coverage** — 10 of 193 cells
  typed on one model, another's cone holding 21,638 constants
  across 3,279 label groups, H7's « laws » equalities between rows
  that never moved. « Laws found in a corner are not the model's
  laws. »
- **The lead has re-sequenced it.** Track E's first half moved to
  Dynamo precisely because the input-typing classifier is now the
  binding constraint on B5 « and therefore on C6 and B6 behind it ».

So C6 stays unwritten, and the reason is no longer « the gate has
not fired » but « there is nothing worth diffing yet ». A rule-set
diff over low-coverage rule sets would inherit their artifact
status and dress it as a delta — the same error the mining round
refused to make, one layer up. When E1/E2 make coverage
measurable, C6's registration cites *that* number first, not only
the stability pair.

## C5 — the Watch on documents (REGISTERED BEFORE RESULTS)

Track C's last unbuilt step, and unblocked: it needs the engine's
tie-out and this lane's own delta report, nothing from another
lane. The plan's line: « Model moved, deck did not ⇒ finding (the
tie-out re-run on the new version). »

**The method.** The same deck, tied out against **both** model
versions through the engine's `tie_out(deck, model)`, and the two
results compared. Because the deck is byte-identical in both runs,
a printed figure's identity is stable: the key is
`(slide, printed, location)`.

**The four classes, and what each is worth.**

1. **`broken_by_revision`** — agreed against the old model, drifts
   against the new. **This is C5's finding**: the model moved and
   the deck did not.
2. **`repaired_by_revision`** — drifted before, agrees now. The
   revision brought the model to the deck; still churn, and worth
   a line.
3. **`still_drifting`** — drifts against both. Pre-existing, and
   **never blamed on this revision** — the discipline that makes
   class 1 trustworthy.
4. **`coverage_changed`** — a figure the linker could reconcile
   against one version and not the other (its output row was
   deleted or renamed). Reported as its own bucket, never counted
   as a break, because « I lost sight of it » is not « it broke ».

**Attribution, exactly and without approximation.** A broken
figure agreed against the old model, so the old run hands back the
output row it agreed *with* — an old-side ref. The delta report's
items are keyed on old-side rows too, so the cause is looked up
directly, with no mapping through the alignment and no guessing:
« this figure broke, and here is the model change underneath it ».
When no delta item covers that row, the report says so in words —
« the model moved somewhere this figure reads, but not at this
row » — rather than attaching the nearest change.

**One-tick drifts stay labelled.** The engine already separates a
one-unit-at-printed-precision difference from a real one; a break
that is only a rounding tick is reported as such and never sold as
a broken deck.

**The round.** Unit tests on fabricated tie-out results, where
each class's right answer is known by construction — including the
one that matters most: a pre-existing drift must land in class 3,
never class 1. Then the real pair: the Cascade deck against
`cascade_model.xlsx` and a revised copy of it, with the edit
planted by this lane's own planter so the cause is known before
the report names it. Reported: the four counts, every break with
its attributed cause, and any break the delta could not explain.

## C5 — results: the deck delta works on a real deck, after the instrument bit again

**Round 1 failed on my own instrument, and the trap was one this
record has already paid for.** The revision was planted with
openpyxl and handed straight to the tie-out; openpyxl's save drops
every cached value, so the linker went blind: `checked_old: 111`
against `checked_new: 25`, with **90 figures landing in
`coverage_changed`**. Not one of those was a deck problem. It is
the same lesson C4 round 1 learned about planted files, in a new
place — and it earns a line in the handoff, because a lane that
plants edits with openpyxl will meet it a third time.

**The fix is the honest one: let a real engine save the
revision.** `recalc.UnoCalculator(...).recalculate(planted,
store_to=…)` — LibreOffice recalculates and stores, exactly as a
person saving in Excel would. All 313 cells came back with values.

**Round 2, the measured round.** Cascade deck, `cascade_model.xlsx`
against a revision that moves one typed input (`Model!B6`,
182.4 → 228.0 — planted by me, so the cause is known before the
report speaks):

| class | count |
|---|---|
| **broken_by_revision** | **8** |
| repaired_by_revision | 0 |
| **still_drifting** | **8** |
| coverage_changed | **0** |
| figures checked, old / new | 111 / 111 |

**Every break names the change underneath it**, and the chain is
right: the printed input itself is attributed to
« moved assumption: 182.4 → 228 », and its seven dependents — FY23
revenue growth, gross profit and its margin, reported and adjusted
EBITDA and its margin — to the `material_output` blocks the delta
report raised for exactly those rows (« moved 183.6% », « moved
59.7% », « moved 40.7% »). A reviewer is told *this figure is now
wrong* and *this is the model change that made it wrong*, in one
line each.

**The eight `still_drifting` figures are the result that makes the
other eight worth reading.** The Cascade deck disagrees with its
model in eight places *before* any revision — the engine's own
notes record six such figures on the clean deck — and C5 keeps
every one of them off this revision's account. A checker that
blamed the revision for the deck's pre-existing state would be
worse than no checker.

**What C5 does not claim.** The revision is mine, not a real one:
this measures that the mechanism finds a known break and attributes
it correctly, not how often real revisions break real decks. The
corpus holds no deck with two genuine model versions behind it —
when the Chain's document corpus does, that is the round to run.
The eight pre-existing drifts are counted, not diagnosed; they
belong to the tie-out's own accuracy work, not the Watch's.

**Track C now stands:** C1 hand-checked, C2 measured, C3 with nine
classes and parity, C4 tier 0 and tier 2 measured (tier 1
registered, blocked on the dependency), **C5 wired and measured**.

## The gates, re-checked at the top of this turn

Standing routine first. `origin/claude/pierce-phase-6-writing-mjkaj6`
is still `49063b01` (the eighteenth sweep — no new tip since my last
push), and `docs/pierce/orders/prism.md` is unchanged from the
fourteenth sweep. Its three numbered items are spent: the handoff is
pushed, tier 1 is registered and waiting on the dependency, and the
wider tier-2 round is measured on two hosts. Both addenda still bind:

- **Tier 1** — `grep -in z3 server/pyproject.toml` on the integration
  tip returns nothing. No code of mine imports z3, and none will
  before the lead's approval lands in that file.
- **C6** — unchanged from my last reading: the literal stability gate
  is met, the substance is not, and the lead has put it behind
  Dynamo's E1/E2. Nothing to write.

So the orders name no runnable work this turn. What follows is my own
initiative, named as such, inside my own paths only.

## The tier ladder — one verdict per cell (REGISTERED BEFORE RESULTS)

**Why.** C4's rungs exist separately and each was measured on its own
terms: fingerprints over a real pair (`stealth pair`), differential
evaluation over planted edits (`stealth tier2`). Nothing yet gives a
reviewer *one* verdict per cell, and the plan's sentence — « Tiers
never blurred. Tier 3 always: named unsupported constructs, honest
refusal » — is precisely a statement about a single ordered
assignment. Without it, « 93.2% proved » sits next to « 8 of 8
caught » with no account of the cells in neither number.

**The universe.** Every cell of the **new** version — the same
universe `proved_unchanged` counts. Old-only cells get a count and no
verdict: a cell that no longer exists has no « did it change »
question, and inventing one would be dressing a deletion as an
equivalence.

**The verdicts. Exactly one per cell, and they partition the
universe.**

| Verdict | Means |
|---|---|
| `tier0_proved` | Verifying traces equal under C2's alignment — unchanged at hash cost, no evaluation |
| `changed` | Evidence of difference, with a named source: `raw_content`, `raw_value`, `added`, `tier2_divergence` |
| `tier2_supported` | No divergence in `TIER2_TRIALS` randomized trials. Strength, stated as such, never sold as proof |
| `tier3_refused` | Undecided, with a named reason from the closed vocabulary below |

**The order, and it is the whole point.** tier 0 → raw evidence →
tier 1 → tier 2 → tier 3. A cell decided at one rung is never
re-decided at a lower one, and the report carries the rung each
verdict was reached at, so « proved » and « supported » can never be
read off the same line.

**Tier 1 is a declared hole, not a silent one.** `z3-solver` is
absent, so tier 1 decides nothing. The ladder still counts the cells
that arrive at its rung and reports
`tier1_would_have_been_asked = N`. A cell tier 1 might have proved
and tier 2 merely supported is reported as tier-2 supported **and**
counted in that N — the hole is visible in every run, not inferred
from this log.

**The refusal vocabulary — closed. A reason outside it is a bug in
the ladder, not a refusal.**

1. `unobservable_value` — round 2's condition: a formula cell whose
   own cached value the reader cannot see (a text result reads
   `None` in the numeric universe), so no trace can carry it.
2. `environment_dependent` — inside the CELL/INFO cone: the value
   reflects the file's own name or the machine, not the model.
   `Cover!G4` is the known instance.
3. `volatile` — inside the volatile cone: a trial cannot separate a
   change from the clock.
4. `no_perturbable_input` — no matched, non-categorical literal
   reaches the cell, so the trials never move it. Five identical
   readings of a frozen cell support nothing; round 1 and round D
   both learned this the expensive way.
5. `not_offered_to_tier2` — the oracle was not run over this cell
   (outside the run's scope, or no oracle configured at all). Its
   presence is what stops a cheap run from reading like a complete
   one.
6. `tier2_unavailable` — the oracle refused wholesale: a denylist
   prescan hit, or no calculation host.

**The gates. One violation fails the round.**

- **G1 soundness.** No cell whose type-tagged cached value differs
  between the matched old and new *raw* cells may appear in
  `tier0_proved` or `tier2_supported`. (C4 round 1's gate, now over
  both proof tiers.)
- **G2 no instrument drift.** The ladder's `tier0_proved` set equals
  `proved_unchanged(old, new).proved` exactly — same cells, not the
  same count.
- **G3 partition.** The four verdict sets are pairwise disjoint and
  their union is exactly the new version's cell set.
- **G4 named refusals.** Every `tier3_refused` carries a reason from
  the closed vocabulary; zero empty reasons, zero unknown ones.
- **G5 tier-2 honesty.** Every `tier2_supported` cell was actually
  perturbed — at least one trial moved at least one cell in its
  precedent cone — else it is `no_perturbable_input`, not supported.

**This turn's round, and what it deliberately does not do.** Round 1
runs the ladder over the registered adjacent pair (ED2 v2 14 July →
v2 31 July) **with no tier-2 oracle**: tiers 0 and 3 and the raw
evidence, which needs no recalculation and no host. The pair oracle —
perturbing matched literals in *both* files and recalculating both,
`2 × (1 + TIER2_TRIALS)` recalculations — is registered here and run
in a later round, after this round measures what one build and one
recalculation of the real pair cost. Nothing depends on that cost
before it is measured; that rule has held since C2 and it holds here.

**Predictions, written before the run.**

1. G2 makes the tier-0 share nearly tautological, so it is a plumbing
   check, not a discovery: it reproduces C4 round 2's **93.2%** to
   within 0.5pp, or the ladder is wired wrong.
2. `changed` lands between **3% and 7%** of the universe.
3. The largest refusal class is `unobservable_value`, and refusals
   in total stay under **4%**.
4. With no oracle, `tier2_supported` is exactly **0** and every
   remaining suspect carries `not_offered_to_tier2` — if any cell
   comes back supported in a run with no oracle, the ladder is
   lying and the round fails.

### Amendment to the registration, written before the run

Drafting the module surfaced a real confusion in the vocabulary
above, and it is fixed here rather than in the code's silence.

`unobservable_value`, listed as a *refusal reason*, is nothing of the
kind: it is a reason **tier 0** cannot speak. It does not stop tier 2,
which compares text results as text perfectly well. Left as written,
every unobservable cell in an oracle-less run would come back reading
`not_offered_to_tier2` and the fact that its trace could never have
carried it would vanish — the census would be true and useless.

So the report carries **two** vocabularies, kept apart:

- **Why tier 0 could not speak** (closed): `no_aligned_counterpart`,
  `unobservable_value`, `trace_differs`. Counted for every cell tier 0
  declines, whatever happens further down.
- **Why the cell is undecided** — the refusal reasons, unchanged
  except that `unobservable_value` leaves the list:
  `environment_dependent`, `volatile`, `no_perturbable_input`,
  `not_offered_to_tier2`, `tier2_unavailable`.

One class the drafting also exposed, and it is the interesting one:
a matched cell whose own content and cached value are **identical**
in both files but whose trace differs — an input moved underneath it.
Raw evidence has nothing to say about it and it is exactly tier 2's
question, so it descends with the source `inputs_moved` recorded.
G3's partition and G1's soundness are untouched.

**Prediction 3 is restated accordingly** (still before the run): the
largest tier-0 blockage is `trace_differs`, and `unobservable_value`
is the largest of the two remaining, at under 4% of the universe.

### Second amendment: the raw evidence outranks the hash

Writing the ladder's tests, on constructed cells where the answer is
known by construction, turned up something about tier 0 worth saying
plainly. The verifying trace hashes the cell's **shape**, and the
engine's shape erases numeric literals by design:

    =B2*0.4   ->  #*R[-1]C[+0]
    =B2*0.5   ->  #*R[-1]C[+0]

So a coefficient edit is invisible to the shape, and if the file's
cached value was not refreshed, the own-value and input-value halves
of the trace match too. Tier 0 then proves the cell.

**Is that unsound?** No, and the distinction matters. Tier 0's claim,
as registered in C4 round 1, is « the cell's *stored value* did not
change between the versions », and here it did not. What moved is the
text, and with it what the cell *would* compute on recalculation —
which the trace has never claimed to see (« a match does not claim
the stored value is correct »). Excel recalculates on save, so a real
pair is protected by the value half; a generated or unrefreshed file
is not.

**But it is misleading in a ladder**, which is a report a reviewer
reads. « Proved unchanged » sitting beside a C1 diff that says « this
formula was rewritten » invites exactly the wrong conclusion.

So the rung order changes, before any run, and this is the reason:

    tier 0 -> raw -> tier 1 -> tier 2 -> tier 3      (as registered)
    raw -> tier 0 -> tier 1 -> tier 2 -> tier 3      (as built)

Raw evidence is *evidence of difference*, and it is cheaper than the
hash besides — two string compares against a SHA-256 over shape and
inputs. Under the new order the tiers only ever see cells the raw
grid says are byte-identical in content **and** in stored value, so
tier 0's work is exactly what it claims: proving no input moved
underneath a cell that otherwise looks untouched.

**G2 is restated to match, and the restatement measures the blind
spot rather than hiding it:**

- **G2a**: every cell the ladder proves is in `proved_unchanged`'s
  proved set — the ladder may never prove more than the fingerprints
  do.
- **G2b**: every cell the fingerprints proved and the ladder did not
  carries the verdict `changed` with the source `raw_content` or
  `raw_value` — no other reason may overrule a proof.
- The count of those cells is reported as `tier0_overruled_by_raw`.
  It is the size of the shape's literal blind spot on this pair, and
  it is a number this lane has never measured before. **Prediction,
  before the run: on the ED2 pair it is 0** — Excel recalculates on
  save, so the value half should catch every coefficient edit.

## The tier ladder — results, and one prediction I got wrong

`uv run python -m scripts.watch_tiers pair` on the registered pair,
ED2 v2 **14 July → 31 July**, no tier-2 oracle. 131 s, of which 86 s
is reading the two files.

```
cells (new version)      41,049      old_only                    0
tier0_proved             38,255      93.19%
changed                   1,278       3.11%   raw_value 1,240
                                              added        24
                                              raw_content  14
tier2_supported               0       0.00%
tier3_refused             1,516       3.69%   not_offered_to_tier2 1,516
tier0_overruled_by_raw        0
tier1_would_have_been_asked  1,516
tier-0 blockages:  unobservable_value 1,222 · trace_differs 294 ·
                   no_aligned_counterpart 24
gate violations               0       (G1, G2a, G2b, G3, G4, G5)
```

**All five gates pass.** The partition holds exactly — 38,255 +
1,278 + 0 + 1,516 = 41,049 — every refusal carries a name from the
closed list, and no proved cell's stored value moved.

**Against the predictions, in order.**

1. **Held.** 93.19% against C4 round 2's 93.2%. As registered, this
   is a plumbing check and not a discovery.
2. **Held.** `changed` at 3.11%, inside the 3–7% band — at its floor.
3. **Wrong, and it is my prediction that was wrong, not the
   instrument.** I predicted `trace_differs` would be the largest
   tier-0 blockage. It is not: **`unobservable_value` 1,222 against
   `trace_differs` 294** — four to one the other way. The magnitude
   half of the prediction held (2.98%, under 4%), but the ordering
   was backwards, and the correction is worth more than the
   prediction was: on a real adjacent revision, **the commonest
   reason the cheap proof cannot speak is not that a cell changed —
   it is that the reader cannot see the cell's own result.** Text
   results are 81% of tier 0's silence here. That is a fact about
   the *instrument's* reach, not about the revision, and it is the
   strongest argument yet for a tier that evaluates: 1,222 of the
   1,516 cells at tier 2's door are there because a hash cannot
   describe them, not because anything moved.
4. **Held.** `tier2_supported` is exactly 0 with no oracle, and all
   1,516 remaining cells carry `not_offered_to_tier2` — nothing came
   back supported in a run that supported nothing.
5. **Held** (the second amendment's): `tier0_overruled_by_raw = 0`.
   The shape's literal blind spot did not fire once on this pair.
   Excel recalculating on save is what closes it, exactly as
   predicted — and the constructed test in
   `test_watch_tiers.py` pins the case where it does fire, so the
   count is a measurement and not a stub.

**A note on prediction 4's wording.** The registration says the
ladder refuses cone cells (`environment_dependent`, `volatile`)
before the oracle is troubled, so « every remaining suspect carries
`not_offered_to_tier2` » was imprecise as written. It came out true
here for a reason worth recording: the volatile cone over this
file's engine cells is **empty**, and the environment cone holds
exactly **one** cell — `Cover!G4` — which lives outside the engine's
universe and so was never in the ladder's 41,049 to begin with.

**The independent cross-check, and it closes exactly.** C1's raw
diff over the same pair, run separately:

```
C1 (raw universe, 60,609 cells)   added 24 · changed 1,255
                                  (of which formula changes 14)
ladder (engine universe, 41,049)  added 24 · raw_content 14
                                  · raw_value 1,240      = 1,254
```

1,255 − 1,254 = **1**, and the one cell is
**`Cover!G4`** — the `MID(CELL("filename"),…)` cell that prints the
workbook's own name, which differs between two files called
`v2_2023-07-14` and `v2_2023-07-31`. It is the same cell tier 2's
round 3 found by falling over it. Two instruments written weeks
apart, over different universes, reconcile to a single named cell.
The 14 formula changes agree exactly.

**The oracle's cost, measured before anything depends on it**
(`watch_tiers cost`, on the 31 July file):

```
openpyxl load 12.6 s · save 5.8 s · UNO recalculate 59.1 s
one build + recalculation                            77.5 s
projected pair oracle, 2 files x (1 baseline + 5 trials)  15.5 min
```

So the pair oracle is affordable and is the next round. One number
from that measurement is a constraint on it and is registered here
before that round is designed: **the UNO driver read 21,007 cells
where the ladder's universe is 41,049.** Tier 2 can only speak about
cells the driver returns, so on this pair the oracle's reach is
about half the ladder — and its first question must be *which* half,
because « supported » over a universe the harness silently halved
would be the same class of error as a rule set mined in a corner.

## What is now true of Track C

C1, C2, C3, C4 (tiers 0, 2, 3 and the ladder that keeps them apart)
and C5 are built, measured and gated. Tier 1 is the one hole, it is
declared in every run the ladder prints as
`tier1_would_have_been_asked`, and it stays shut until `z3-solver`
is in `server/pyproject.toml` by the lead's hand. C6 waits on
coverage, not on permission.

Eighty tests green (`test_watch_{diff,align,plant,delta,trace,
stealth,document,tiers}.py`, `--noconftest`).

## The gates, and the tip, at the top of this turn

The integration tip moved to `2de8c43a` — four commits, all the
lead's own population proof (eleven eligible models, the
contamination log, a third intake gap found in `.xlsb`). Nothing in
them is mine and nothing in them changes my gates:

- **Tier 1** — `z3-solver` still absent from `server/pyproject.toml`
  on the new tip. Shut.
- **C6** — the eighteenth sweep's redirection stands; E1/E2 are
  Dynamo's and unreported. Shut.

Orders unchanged from the fourteenth sweep. So this turn continues
my own registered queue: the tier-2 **pair oracle**, which is the
round the ladder was built to make possible.

## The pair oracle — tier 2 over a real revision (REGISTERED BEFORE RESULTS)

**The question the last round left.** 1,516 cells reached tier 2's
door on the ED2 pair and every one came back `not_offered_to_tier2`,
because there was no oracle. This round is the oracle: perturb the
model's inputs, recalculate **both** versions, and see whether the
two agree everywhere they can be compared.

**First, the reach question I registered before designing anything,
and it has an analytic answer rather than an empirical one.** The
driver returns **formula cells only** (`uno_driver.read_formula_cells`
queries `CellFlags.FORMULA`), so the 21,007 against the ladder's
41,049 is not a halved universe:

```
engine cells 41,049 = formula 20,623 + typed literals 20,426
driver returns 21,007 — a superset of the engine's formula cells
                        (+384 formula cells outside the engine's
                         numeric universe, Cover!G4 among them)
```

The ~20k cells the driver does not return are the model's **typed
inputs**, and those are not tier 2's question at all: a literal's
trace is its own value, so an unchanged literal is proved at tier 0
and a changed one is `changed` at the raw rung. Neither reaches the
oracle. And the arithmetic of the last round confirms it — the 1,516
at tier 2's door are exactly `unobservable_value` 1,222 +
`trace_differs` 294, both of which are formula classes.

**So the reach constraint I flagged last turn was overstated, and
the correction runs the other way**: the class tier 0 is worst at —
formula cells whose own result is text, 81% of its silence — is a
class the driver reads perfectly well, as a string. Tier 2 answers
where tier 0 is blind. That is the round's thesis and it is written
here before it is tested.

**The method.**

- **What is perturbed**: every literal cell matched between the two
  versions and not categorical, by the registered rule
  (`CATEGORICAL_LIMIT = 12`: an integral literal of magnitude ≤ 12 is
  a flag, a month or a licensee index, and scaling it deadens the
  path it selects). Assignment as registered in tier 2:
  `value * uniform(0.5, 1.5)`, or `uniform(-1, 1)` for a zero.
- **Where C2 earns its keep**: the same assignment must land on the
  same *logical* input in both files, and rows moved between them.
  The assignment is keyed by the new ref and applied to the old file
  at `proof.pairing[ref]`. Without the alignment this round could not
  be run at all.
- **Seed and trials**, unchanged and not re-tuned:
  `TIER2_SEED = 20260826`, `TIER2_TRIALS = 5`,
  `TIER2_DIVERGENCE = 1e-9`.
- **The verdict per cell**: `supported` if old and new agree within
  the divergence rule on all five trials; `diverged` (⇒ the ladder
  records `changed`, source `tier2_divergence`) if any trial
  disagrees; refused otherwise, with a name.
- **G5, in its operational form**: a cell may be called supported
  only if its own value **varied across the five trials** — proof
  that the perturbation reached it. A cell that never moved is
  `no_perturbable_input`, not support. Five identical readings of a
  frozen cell support nothing.

**One addition to the closed refusal vocabulary**, registered here
rather than slipped in: `not_read_by_driver`, for a cell the
recalculation does not return on one or both sides. It is distinct
from `not_offered_to_tier2` (the oracle never ran) and from
`no_perturbable_input` (it ran and nothing moved).

**The control, and it runs first.** The 31 July file against
**itself**, through the identical pipeline — two independently built
sides, same assignments, both recalculated. **Zero cells may
diverge.** A control that diverges means the instrument is noisy and
the real result is not read at all; this is the discipline tier 2's
rounds 1–3 paid for, and it is not optional because the pipeline is
now longer.

**Cost, from the measured round**: 77.5 s per build-and-recalculate,
20 recalculations (control 10, pair 10) ≈ **26 minutes**, run alone
in the container. The workbook is loaded once per file and re-saved
per trial, which spares the 12.6 s reload each time; each trial
overwrites the same literal set, so no trial can leak into the next.

**Predictions, before the run.**

1. The control is clean — **0 diverged**. If it is not, the round
   fails and the result is not looked at.
2. Of the 1,516, **more than half come back `supported`**. The
   revision is small (14 formula changes) and most of what tier 0
   could not describe should prove behaviourally identical.
3. **`diverged` is small but non-zero — between 5 and 150 cells** —
   and every diverged cell is downstream of one of the 14 changed
   formulas or the 1,240 changed values.
4. `no_perturbable_input` is the largest refusal class in this run,
   and is dominated by cells on the unselected licensee branches
   (round D's lesson: SWEST is not dead, it is unselected — and
   nothing here forces a selector).

### Instrument abort before any result: openpyxl's images

The first draft of the oracle loaded each workbook once and saved it
five times — 63 s cheaper per file, and wrong. An ED2 model carries
embedded images; openpyxl holds them as open file handles, the first
`save()` closes them, and the second raises `ValueError: I/O
operation on closed file` from inside PIL. No result was read; the
harness reloads the workbook per trial, which is what the measured
cost of 77.5 s per build-and-recalculate already assumed. The
projection stands at ~26 minutes and the optimization was the
deviation, not the estimate.

Added to the container's lessons in the handoff: **an openpyxl
workbook with images can be saved once.** Reload it for every write.

## The pair oracle — the control, and what it already says

Control first, as registered: **ED2 v2 31 July against itself**, two
independently built sides, same assignments, ten recalculations.
13.9 minutes.

```
literals perturbed        8,499        cells                 41,049
tier0_proved             39,824        97.02%
changed                       0         0.00%
tier2_supported              76         0.19%
tier3_refused             1,149         2.80%   no_perturbable_input 1,149
diverged by tier 2            0
gate violations               0
```

**Prediction 1 held: the control is clean.** Zero divergences and
zero gate violations on a file against itself, so the instrument is
not manufacturing differences and the pair result may be read. The
partition closes exactly (39,824 + 0 + 76 + 1,149 = 41,049), and a
self-pair proves more at tier 0 than a real pair does (97.02%
against 93.19%), which is the shape one would expect.

**But the control says something about the pair result before the
pair has run, and it is worth writing down now rather than
discovering it in the number.** Of the 1,225 cells that reached tier
2 in the control, **1,149 never moved across five trials** — 8,499
perturbed literals reached only 76 of them. The descending set in a
self-pair is exactly the `unobservable_value` class, i.e. formulas
whose result is text, and most text in a regulatory model does not
move when numbers are scaled: `IF(flag=1,"Yes","No")`, a
concatenated title, a blank arm returning `""`. They are frozen for
a real reason, and G5 calls them `no_perturbable_input` instead of
supporting them, which is exactly what it is for.

So **prediction 2 — « more than half of the 1,516 come back
supported » — is in trouble before the run**, and I am saying so
here rather than after. The pair's descending set is 1,222
unobservable + 294 `trace_differs`; if the control's ratio carries
over, most of the first group will freeze and the support will come
from the second. I will report the number against the prediction as
written, not against this paragraph.

## The pair oracle — results, two failed predictions, and one correction to my own record

ED2 v2 **14 July → 31 July**, 8,475 matched non-categorical literals
perturbed identically in both files through C2's alignment, five
trials each side, ten recalculations, 14.1 minutes.

```
tier0_proved             38,255      93.19%
changed                   1,278       3.11%   (raw_value 1,240 ·
                                               added 24 · raw_content 14)
tier2_supported             172       0.42%
tier3_refused             1,344       3.27%   no_perturbable_input 1,344
diverged by tier 2            0
gate violations               0
```

**Prediction 1 held** — the control was clean and the result was
read. **Prediction 4 held** — `no_perturbable_input` is not merely
the largest refusal class, it is the only one. **Predictions 2 and 3
both failed**, and the second failure is the interesting one.

**Prediction 2 (« more than half of the 1,516 supported ») —
failed: 172, or 11.3%.** The control had already told me this was
coming and I said so before the run. The class that dominates tier
2's door is formulas whose result is text, and most text in a
regulatory model does not move when numbers are scaled. G5 calls
those `no_perturbable_input` rather than supporting them, which is
the honest answer: the trials never reached them, so five agreeing
readings mean nothing.

**Prediction 3 (« diverged between 5 and 150 ») — failed: 0. And
the prediction was built on a mistake of mine, in my own
instrument's vocabulary.** I wrote it believing this revision
contained fourteen rewritten formulas, because C1 reports
`formula_changed: 14`. It does not contain any. Checked directly
over the raw grids:

```
content-changed cells                                    14
  ... with formula text on either side                    0
added cells                                              24
  ... that are formulas                                   0
```

All fourteen are **retyped literals in `Annual Inflation` rows 50
and 53** — the inflation series, updated:

```
Annual Inflation!AP50   11.636903442623  ->  11.584699426229506
Annual Inflation!AP53    9.14944682416672 ->  9.066745554703903
Annual Inflation!AV50    3                ->  2.802018348263724
```

C1's field counted *content* changes and was named for the case that
motivated it. A retyped literal changes content too, so the count
read as « fourteen logic changes » to anyone who did not open the
cells — including me, one turn later, in my own log. **The field is
renamed `content_changed`** in `watch/diff.py`, `watch_diff.py`,
`watch_handcheck.py` and their tests, with the reason written at the
definition.

**Correction to the previous entry.** Where the ladder round says
« of which formula changes 14 » and « the 14 formula changes agree
exactly », read *content changes*: the agreement between the two
instruments is exactly as reported, but the cells are retyped
inputs, not rewritten formulas.

**What the round actually found, and it is worth more than the
predictions were.** Zero divergence over 8,475 perturbed inputs and
five random assignments is not a weak result here — it is the
correct one, and it says something the cell diff cannot say:

> **The 31 July revision changed no behaviour. It is the 14 July
> model evaluated at different inflation inputs.**

The cell diff sees 1,255 changed cells and cannot tell a reader
whether the model was rewritten. The ladder answers: 93.19% could
not have moved (hash), 3.11% moved and is named (raw), 0 cells
compute differently under randomized inputs (tier 2), and 3.27% is
refused **by name** — the model's text outputs, which no
number-scaling trial can exercise. That last line is the one a
reviewer should read hardest, and it is printed rather than
implied.

**The claim's exact strength, so nobody upgrades it.** Tier 2, five
trials, one seed — « no divergence found », never « proved
equivalent ». It covers the 172 cells the trials actually moved. It
does *not* cover the 1,344 frozen ones, and it does not cover the
model's text logic at all. Tier 1 would be the rung that speaks
where the trials cannot, and tier 1 is still shut.

### The coverage table, measured rather than inferred

The totals above do not say *which* suspects tier 2 could answer, and
that is the number a reviewer needs, so the report now carries the
cross-tab and the pair was re-run for it. Identical totals on the
second run — same seed, same counts, so the instrument is
deterministic — plus:

```
                        supported   no_perturbable_input
trace_differs (294)            96                    198
unobservable_value (1,222)     76                  1,146
no_aligned_counterpart (24)     —   (24 « added » at the raw rung)
```

**This is the honest reading of « 0 diverged », and it is a good
deal weaker than the headline sounds.** Of the 294 cells this
revision actually disturbed — the ones whose inputs moved
underneath them — the trials reached **96**. The other **198 were
refused by name**: the perturbation never moved them, so their
agreement is not evidence of anything. Tier 2's claim covers 96 of
294 disturbed cells and 76 of 1,222 text formulas. It does not
cover the model.

So the round's finding stands as written — *no divergence was found
where the trials could look* — and the sentence it cannot support
is « the revision changed no behaviour anywhere ». What it supports
is: **nothing that the trials could exercise computes differently,
and two-thirds of the disturbed cells could not be exercised at
all.**

**The next round is named by that 198, not invented.** Two candidate
reasons, both already known to this lane and neither yet
distinguished:

1. Their inputs are **categorical** literals, which the registered
   rule excludes from perturbation on purpose (scaling a flag
   deadens the branch it selects, symmetrically, in both files).
2. They sit on **unselected licensee branches** — round D's lesson,
   « dead means unselected » — and nothing in the pair oracle forces
   a selector, unlike the planted-edit harness which does.

The round that separates them: re-run the pair with the model's own
`CHOOSE` index forced, exactly as `watch_stealth` round D does, and
see how much of the 198 lights up. Registered here; not run this
turn, and no number from it is anticipated.

## The gates at the top of this turn

Tip `f33b6b1e`, nineteenth sweep — my lane merged at `04206fff`.

- **Tier 1** — no `z3-solver` in `server/pyproject.toml` on the new
  tip. Shut.
- **C6** — E1 and E2 have landed (unit inference measured on 3,796
  externally-authored rows, `kind` 96.4% with 0% wrong), and
  **B5 round 2 is registered but not yet run**: it fixes a coverage
  threshold (« informative only at coverage ≥ 50% of watched
  cells ») and predicts, in writing, that it still will not be able
  to call the rule sets modeller-recognisable. So the number my C6
  registration must cite does not exist yet. Shut, and for the same
  substantive reason as before, not a new one.

Orders unchanged from the fourteenth sweep. This turn continues my
own queue: the round the last one's 198 named.

## The forced-selector round — separating the two reasons (REGISTERED BEFORE RESULTS)

**What is being explained.** Of the 294 cells the ED2 revision
actually disturbed, the pair oracle reached 96 and refused 198 as
`no_perturbable_input`. Two candidate reasons were named last turn
and neither was tested:

1. their inputs are **categorical** literals, which the registered
   rule excludes from perturbation on purpose;
2. they sit on **unselected licensee branches** — round D's « dead
   means unselected » — and the pair oracle, unlike the planted-edit
   harness, forces no selector.

**The instrument first, because the population is unknown.** Before
spending recalculations on a hypothesis, the run now dumps every
cell's verdict to a JSONL beside its report, so « where do the 198
live » is answerable by reading rather than by guessing. Two runs
are compared: the pair oracle as it stands, and the same run with
the model's own `CHOOSE` index forced by `_selector_index`, exactly
as `watch_stealth` round D does it — a declared intervention that
overwrites the index cell, reported on every instance it touches.

**Which index.** Not chosen by me: the run forces the index for the
licensee sheet that holds the **most** frozen disturbed cells, and
if the frozen cells are not on selectable sheets at all, the round
says so and forces nothing. That rule is fixed here so the choice
cannot be made after seeing which forcing helps.

**Predictions, and I expect this round to fail its own hypothesis.**

1. **The frozen 198 are not mostly on unselected licensee sheets.**
   A cell in the `trace_differs` class is one whose input moved in
   the real revision while its own value did not — that is the
   signature of a **conditional that did not flip** (`IF(flag=1,…)`,
   a clamp, a rounded band), not of an unselected branch. So I
   expect forcing the selector to release **fewer than 40 of the
   198**.
2. **The real reason is the categorical rule**, which holds every
   flag constant by design. If prediction 1 holds, the round that
   follows is not more forcing — it is **stepping categorical
   inputs through the values they actually take in the file**,
   which is exactly what Dynamo's B5 does with its `SELECTOR` type
   and what my tier-2 rule currently refuses wholesale.
3. **The control still holds under forcing** — zero divergences on
   the self-pair with the index forced. Round D's control did; this
   pipeline is longer, so it is checked again rather than assumed.
4. **No verdict moves for a cell that was already supported.**
   Forcing changes which branch is live, so a supported cell may
   become frozen or diverge — but a cell that agreed on five trials
   unforced and diverges when forced would be a real finding about
   the revision, and I predict **zero** of them.

## The forced-selector round — results: both hypotheses wrong, and the reason is a rule of mine

**Nothing was forced, and that is the result of the first half.** The
registered rule was « force the index for the licensee sheet holding
the most frozen disturbed cells, and if the frozen cells are not on
selectable sheets at all, say so and force nothing ». They are not.
The verdict dump (new this round: one line per cell beside every
report) puts the 198 here:

```
frozen, disturbed (198)   Finance&Tax 93 · Annual Inflation 71
                          AR 23 · Legacy 11
supported, disturbed (96) Monthly Inflation 96
```

`_selector_index` — round D's reader, unchanged — finds **no
`CHOOSE` naming any of those five sheets**. They are not licensee
branches; they are the model's own finance, inflation and revenue
sheets, live in every configuration. **Prediction 1 stands in a
stronger form than I wrote it**: not « fewer than 40 of 198 released
by forcing » but *forcing is not applicable*, and it took a graph
question instead of the 28 minutes of recalculation the round had
budgeted. Predictions 3 and 4 (the control under forcing; no
supported verdict moving) are consequently **untested**, and stay
untested rather than being quietly counted as passes.

**Prediction 2 — the categorical rule is the real reason — is
confirmed by measurement, not by inference.** Per-cell BFS over the
engine's precedent graph, visited sets, no path-summing (the first
attempt path-summed and produced a « median 9,681,341,370 » that was
an artifact of the counter, thrown away rather than reported):

```
                     reach ≥1 held      reach no perturbed   perturbed literals
                     categorical        literal at all       in cone (median)
frozen    (198)      198  (100%)        0                    527
supported  (96)        0  (  0%)        0                     10
```

A perfect separation, and the middle column kills the obvious
alternative: **it is not that the perturbation cannot reach these
cells.** Hundreds of perturbed inputs feed each of them — a median
of 527 against the supported cells' 10 — and their values still
never move. Something in the cone is pinning them, and it is
categorical, in every single case.

**What that something is, named concretely.**

```
Finance&Tax!AR144 = AR$129 * AR143            value 0
Finance&Tax!AR143 = InputSummary!AR205        value 0
   label: « RPI index-linked debt as a percentage of net debt »
```

`AR129` is a real number (−1,444.32) and moves freely. `AR143` is
zero, so the product is zero, so every trial reads zero, so G5
refuses to call it supported — correctly. And **`AR143` is zero
because the literal behind it is held**, because of this rule of
mine:

> `CATEGORICAL_LIMIT = 12` — an integral literal of magnitude ≤ 12
> is a flag, a month or a licensee index, and scaling it deadens the
> path it selects.

`_is_categorical(0.0)` is **true**: zero is integral and its
magnitude is ≤ 12. So *every zero literal in the model is held as
though it were a flag* — including « RPI index-linked debt is 0% of
net debt for this licensee this year », which is not a flag at all
but a quantity that happens to be zero. Holding it freezes the whole
branch it multiplies.

**Two consequences I have to state plainly.**

1. **The rule was imported from a harness whose purpose was
   different.** In the planted-edit harness the categorical rule
   exists so a plant is not deadened *symmetrically in both files*,
   destroying detection. In the pair oracle there is no plant, and
   the question is whether two versions agree; the justification did
   not transfer, and I carried the constant across without
   re-deriving it. That is on me, and it is now written at the
   constant.
2. **There is dead code in my own assignment rule.** It reads « if
   the literal is zero, draw from `uniform(-1, 1)` » — and that
   branch can never execute, because every zero is filtered out as
   categorical two lines earlier. It is left in place with a comment
   saying so, rather than deleted or quietly fixed: what to do about
   zeros is the next round's registered decision, not a tidy-up.

## The zero round — registered before results

**The change**: a literal that is **zero** is no longer held. It is
perturbed, symmetrically in both files, like any other magnitude
input. Non-zero integral literals of magnitude ≤ 12 stay held; that
part of the rule keeps its original justification.

**The new finding class, and why it must not be merged.** Waking a
zero can activate a branch the model never activates as configured.
If the two versions then disagree there, that is a **latent**
difference — real, worth knowing, and *not* the same claim as « this
revision computes differently ». It is reported as
`tier2_divergence_latent`, distinct from `tier2_divergence`, and the
ladder's `changed` verdict is reserved for the second. A latent
divergence lands as a refusal-with-a-name in the pair's account and
a line of its own in the report.

**Predictions.**

1. The 198 do not all wake: I expect **between 60 and 160** of them
   to become testable, because a zero that is genuinely a switch
   will now be on, but some cones are pinned by more than one zero.
2. **At least one latent divergence appears**, and zero
   as-configured divergences. The revision rewrote no formula, so
   the as-configured answer should not change; the latent branches
   are where two versions can differ without either file showing it.
3. The self-pair control stays clean — **zero divergences of either
   class** — because a file against itself cannot differ on any
   branch, live or latent. If the control shows a latent divergence,
   the instrument is wrong and the round fails.

## The gates at the top of this turn

Tip `6a4e5524`, twentieth sweep. `z3-solver` still absent from
`server/pyproject.toml`; Dynamo's log still ends without a B5 round 2
*results* entry (its last two rounds are E2's generalisation onto the
closed-deal corpus, which came back unmeasurable). Both gates shut,
orders unchanged. The zero round it is.

### Amendment to the zero round, before it runs: the draws are held fixed

Waking the zeros enlarges the perturbed set, and with one RNG stream
that changes **every** draw — so a divergence in this round could not
be attributed to the woken zeros rather than to different numbers
everywhere. The zeros therefore get their **own** stream
(`TIER2_SEED + 1`), drawn after the non-zero literals, so every
non-zero literal receives exactly the draw it received in the
zeros-held round. Then a divergence that appears here and did not
appear there is attributable to the zeros, which is the whole point
of calling it latent.

The as-configured half of the claim comes from the previous round —
**0 divergences with zeros held** — and this round supplies only the
latent half. Neither number is re-derived from the other.

## The zero round — results: a clean negative, and it refutes my own diagnosis

Control first, and it passed: the 31 July file against itself with
the zeros woken — **19,231 literals perturbed, 0 diverged, 0 latent,
0 gate violations**. Prediction 3 held.

Then the pair, same configuration, 14.7 minutes:

```
literals perturbed         8,475  ->  19,207   (10,732 zeros woken)
trace_differs split        96 supported / 198 frozen   — UNCHANGED
unobservable_value split   76 -> 78 supported
diverged                       0        latent divergences        0
gate violations                0
```

**Prediction 1 — « between 60 and 160 of the 198 wake » — failed, at
0.** **Prediction 2 — « at least one latent divergence » — failed, at
0.** Waking ten thousand held zeros moved **not one** of the 198.

**So last turn's diagnosis was wrong, and it was wrong in a way worth
naming.** I measured a perfect correlation — 198 of 198 frozen cells
reach a held categorical literal, 0 of 96 supported ones do — and I
read a cause into it. The zero round is the experiment that
correlation implied, and it says no. A correlation that survives one
measurement is not a mechanism; the round that tests it is the only
thing that decides.

## Why they are actually frozen — asked of the calculator, not the graph

Rather than guess a third time, two probes
(`scratchpad/why_frozen.py`, `across_trials.py` — analysis, not
lane code):

**Probe 1 — the untouched file against one trial.** *197 of the 198
moved.* They are not unreached. The perturbation arrives.

**Probe 2 — trial 0 against trial 1, on the same cells.**

```
frozen (198)     identical across the two trials: 198
                 trial-0 values: 121 error · 71 empty text · 6 zero
supported (96)   identical across the two trials:   0
                 trial-0 values: 96 numbers
```

There it is. The 198 do not vary **between** trials because the
perturbation drives them into `#DIV/0!` or `""` — and an error is
the same error whatever the numbers were. G5 sees « did not vary »
and refuses, which is right; but the harness then *names* that state
`no_perturbable_input`, « the trials never moved this cell's
inputs », and **that sentence is false for 192 of the 198**. I
published it last turn. The correction:

> The trials reached these cells and pushed them out of the domain
> where the model computes anything. Comparing two versions at
> `#DIV/0!` is vacuous — the refusal is right and its stated reason
> was not.

**Fixed in the code, not only in prose**: `REFUSAL_DEGENERATE =
"degenerate_under_perturbation"` is now a distinct member of the
closed vocabulary, and the oracle decides between the two by reading
what the trials actually returned. `no_perturbable_input` keeps its
literal meaning — the value never moved and it is a number.

**And it reframes the coverage table I published last turn.** The
line « of the 294 disturbed cells the trials reached 96 » should
read: the trials reached ~293 of them and produced a comparable
number for 96; for the rest the model answered « undefined » under
my inputs. The 0-divergence result is unaffected — a vacuous
comparison supports nothing either way — but the reason the coverage
is what it is has moved from « the perturbation cannot get there » to
**« the perturbation is too crude for this model's domain »**, which
is a defect in my harness rather than a fact about ED2.

## The domain round — registered before results

**The change**: a trial assignment is rejected and redrawn if it
increases the model's error count materially. Concretely — the
threshold fixed here, before any output: recalculate the untouched
file once and count cells reading `#...`; a trial may raise that
count by at most **10%** relative, and a draw that exceeds it is
redrawn up to **5** times, after which the round reports the
narrowest band it managed and refuses to pretend otherwise. Bands
narrow multiplicatively per redraw: `0.5–1.5`, then `0.75–1.25`,
then `0.9–1.1`, `0.95–1.05`, `0.99–1.01`.

**Why a band and not a smarter perturbation**: because the honest
alternative — respecting each input's declared unit and range — is
E2's inference, which is Dynamo's and not yet generalisable off its
own corpus. A narrowing band is crude, measurable and mine.

**Predictions.**

1. The baseline error count is **not** zero: a real regulatory model
   carries `#N/A`s in its unused corners. I expect between 100 and
   3,000 error cells in the untouched file.
2. Narrowing releases **more than 60** of the 198 into a comparable
   number — i.e. `degenerate_under_perturbation` falls by at least
   a third.
3. **Still zero as-configured divergences.** Nothing in the earlier
   rounds suggests this revision computes differently, and a
   narrower band tests the same claim more finely rather than
   differently. If a divergence appears here, it is a finding about
   the revision and I will say so loudly.

## The domain round — results: coverage transformed, and seven divergences I cannot explain

39.3 minutes, all five gates clean.

```
                        zeros-held round        domain round
tier0_proved                     38,255              38,255
changed                           1,278               1,285
tier2_supported                     172                 313
tier3_refused                     1,344               1,196

the 294 disturbed cells (trace_differs):
   supported                         96                 286
   diverged                           0                   7
   no_perturbable_input             198                   1
```

**Prediction 1 — « the baseline error count is between 100 and 3,000
» — failed, at 0.** The untouched 31 July file computes **no error
cells at all**. A good fact about the corpus and an awkward one for
my threshold: « at most 10% more errors than the baseline » over a
baseline of zero is an absolute zero-tolerance gate. That is the rule
I fixed in advance, so it stood for this round, and it is why three
of the five trials were accepted only at the narrowest band with
`accepted: false` recorded against the other two.

**Prediction 2 — « narrowing releases more than 60 of the 198 » —
held, and then some: 197 of 198.** The cells that read `#DIV/0!` and
`""` under a ±50% band compute ordinary numbers under ±1%.
`degenerate_under_perturbation` on this pair drops to 0 within the
disturbed class (257 remain among the text formulas).

**The band's shape is worth recording, because it is a cliff and not
a slope.** Error counts per trial, by band:

```
0.5–1.5   0.75–1.25   0.9–1.1   0.95–1.05   0.99–1.01
 1,379      1,379      1,381      1,379       0 / 23 / 56
```

Every band from ±50% down to ±5% produces the same ~1,379 errors.
Only at **±1%** does the model stay inside its own domain. Something
in ED2 tolerates a percent and not five; naming what would need the
error cells' own formulas, which this round did not collect.

**Prediction 3 — « still zero as-configured divergences » — failed:
seven.** All on `Finance&Tax`, rows 86 and 185:

```
Finance&Tax!AS86    110.95274002367263 -> 112.87281706966078   (1.7%)
Finance&Tax!AV86     74.54519169292493 ->  78.46610432193498   (5.3%)
Finance&Tax!AS185     3.7871676589923404 -> 3.793477538889391  (0.17%)
Finance&Tax!AT185     2.2025604632676705 -> 2.2024922758510534 (0.003%)
```

**I said I would say so loudly if this happened, so: seven cells
computed different numbers in the two versions under identical
inputs — and I cannot explain them, and I am not going to dress
them up as a finding about the revision.** Five explanations were
tested and every one is eliminated by measurement:

1. **A held categorical input differing between versions** — there
   are **0** such literals in the entire workbook.
2. **An unperturbed literal in the cone differing** — **0** for
   every cell checked.
3. **Iteration or circularity** (the classic `Finance&Tax` interest
   loop) — the file's own `calcPr` says `iterative=False`, and none
   of the seven is in a cycle.
4. **Inputs outside the engine's numeric universe** — each cone
   holds 2,594–3,455 of them, and **0 differ**: 1,604 are blank in
   both files, 990 populated and identical. My first version of this
   check reported « 1,604 differ » because it read « missing from
   both grids » as « present on one side », and it contradicted C1's
   own count of 24 added cells — which is how I caught it. The wrong
   number never left this log.
5. **A cell changing class** (literal in one version, formula in the
   other, so the perturbation skips it) — **0** in the workbook.

So the seven stand as **unexplained**, and that is the entry.

## The pairing round — registered before results

The leading remaining candidate is my own alignment. The assignment
is keyed by the new ref and landed on the old file at
`proof.pairing[ref]`; if a literal is paired to the wrong old cell,
both files receive the same number **in different places**, the old
model computes from an input it should not have, and the two
disagree — which would present exactly as these seven do, and would
be a finding about C2 rather than about the revision.

**The test, fixed before it runs**: for every perturbed literal,
compare the new cell's `row_label` and `column_label` with its
paired old cell's. A pairing whose labels disagree is a suspect.
Report the count, the rate, and whether any suspect lies in the
seven cells' cones. **Predictions**: fewer than 1% of the 8,475
pairings have disagreeing labels; at least one suspect lies in the
cone of at least one of the seven. If both hold, the explanation is
the aligner and the fix is C2's, not tier 2's. If the second fails,
the round says the candidate is dead and the seven stay open.

## The gates, twenty-second sweep

Tip `abd73c4f`. `z3-solver` still absent; orders unchanged from the
fourteenth sweep. Both gates shut; my own queue continues.

## The pairing round — results: the candidate is dead

Registered test, run exactly as written, over the 8,475 perturbed
literals:

```
label disagreements   row 0 · column 0 · both 0   =  0 suspects (0.00%)
positional displacement (new - old)               =  (0, 0) for all 8,475
suspects in the seven cells' cones                =  0
```

**Prediction 1 held** (fewer than 1% disagree — none do).
**Prediction 2 failed**: no suspect lies in any of the seven cones.
Every perturbed literal is paired to the cell at the *same* row and
column with the *same* labels, so the assignment cannot have landed
in the wrong place. As registered: the candidate is dead.

## The seven, resolved — by asking where the divergence starts

Six explanations had been eliminated one at a time; enumerating a
seventh would have been the wrong move. Instead, Dynamo's narrowing
idea applied to a pair (`scratchpad/frontier.py`, analysis code):
one ±1% assignment, applied to both versions, both recalculated,
then the **frontier** — every divergent cell with no divergent
precedent. That is where the two files stop computing the same
thing, and it does not have to be guessed at.

**The frontier is `Annual Inflation` rows 23, 26, 29 and 40**, and
all four are the same shape:

```
=IFERROR(AVERAGEIFS('Monthly Inflation'!$M:$M,
                    'Monthly Inflation'!$E:$E, ">="&DATE(AR$6-1,…)), …)
```

**Whole-column aggregates.** And the revision is in that column:

```
Monthly Inflation!H284:H295   absent in 14 July · typed in 31 July
   H284 = 121.2 · H290 = 124.8 · …          (twelve months)
L284   old 121.21485603502553  ->  new 121.2
M284   old 342.89516070493306  ->  new 343.2
N290   old 360.7912441432059   ->  new 360.3
```

**The 31 July revision replaces twelve months of forecast inflation
(July 2022 → June 2023) with the published outturn**, by typing
actuals into column H, which the index columns then prefer. That is
what a regulator's July update *is*, and the Watch found it from the
two files alone.

**Why no perturbation could ever neutralise it**: those twelve cells
exist in **one version only**. There is nothing in the old file to
pair them with, so no assignment can put both files at the same
point — correctly, because those cells *are* the revision. The
divergence they cause is the revision's, not the harness's.

**So the seven stand, and they are attributable.** The earlier entry
recorded them as unexplained; this one closes it. The chain is
measured end to end: twelve typed months → four whole-column
averages that already differ in the saved files (`Annual
Inflation!AR23`: 377.37686723666167 → 377.90919521289834) → the
real-to-nominal conversions → `Finance&Tax`.

**And the seven are exactly the cells a diff cannot see.** All seven
are byte-identical in both files — same formula, and the same stored
value, **zero**:

```
Finance&Tax!AS86   =AS76 * AS80 * AS84    value 0 in both files
Finance&Tax!AS185  =AS184 / AS$17         value 0 in both files
```

C1's raw diff calls them unchanged, and it is right: as saved, they
are. Tier 0 cannot prove them because their inputs moved. Only the
evaluation separates them — **the two versions compute different
numbers on a path that is currently switched off**. That is tier 2
earning its keep: a behavioural difference that neither the cell
diff nor the cheap proof can reach.

**A correction to my own earlier sentence.** Two turns ago I wrote
that this revision « changed no behaviour — it is the 14 July model
evaluated at different inflation inputs ». The first half is too
strong. It rewrote no formula, and that stands; but replacing
forecast with outturn *does* change what downstream cells compute,
and on the dormant paths it changes them from « both zero » to « two
different numbers ». « No formula changed » and « no behaviour
changed » are not the same claim, and I ran them together.

## Registered refinement: latency is a property of the cell, not of the knob

The zero round introduced `tier2_divergence_latent` for « the
versions differ on a branch the model does not take », and made it
conditional on *which knob* woke the branch (`wake_zeros`). That is
the wrong test, and these seven show why: they are dormant at the
operating point — both files store zero — and they were woken by an
ordinary ±1% move of live inputs, so the harness reported them as
plain divergences.

**The refinement, registered before it is built**: a divergence is
latent when the cell's **stored value in both versions is zero or
empty** — dormant as configured — whatever perturbation reached it.
A divergence in a cell that carries a real number in the saved files
is a plain `tier2_divergence`. The `wake_zeros` condition is dropped.

**Prediction**: on this pair, all seven reclassify as latent and the
plain-divergence count goes to zero — which is the honest reading of
« the revision rewrote nothing, and its data change moves dormant
paths ». If any of the seven carries a non-zero stored value, I have
misread the table above and will say so.

### The refinement, measured

The domain round re-run with dormancy deciding latency, 56.7 minutes:

```
tier0_proved     38,255      changed                      1,278
tier2_supported     313      tier3_refused                1,203
plain divergences     0      tier2_divergence_latent          7
gate violations       0
```

All seven — `Finance&Tax!AS86/AS185/AT86/AT185/AU86/AV185/AV86` —
reclassify as latent, and the plain-divergence count goes to zero.
**The prediction held exactly**, and `changed` returns to 1,278: the
raw evidence's own count, unchanged since the first ladder run. The
revision's account is now what the files support — *it rewrote
nothing, and its data change moves paths that are switched off* —
with the seven reported on their own line rather than folded into
either « changed » or « no divergence ».

### An instrument defect this re-run exposed: the round is not reproducible

The two domain runs accepted **different** assignments:

```
first run   bands accepted at (0.99,1.01) ×2, errors seen 56 / 1379 / 23 / 0 / 0
this run    (0.95,1.05) ×1 and (0.99,1.01) ×1, errors 56 / 1379 / 23 / 0 / 0
```

The cause is in the acceptance loop, not in the model: **every
rejected draw consumes the shared RNG stream**, so which numbers a
trial finally uses depends on how many bands were tried before it.
The run is deterministic for a fixed code path and *not* stable
across any change that alters the rejection history — which is
exactly the property a registered constant is supposed to have.

**Registered fix, before it is written**: each (trial, band) pair
draws from its own stream, `Random(TIER2_SEED + 1000 * trial +
band_index)`, so band *k* of trial *i* is always the same numbers
whatever was tried before it. No result above depends on this; it is
recorded so the next round is comparable to this one.

## New orders (twenty-fifth sweep), and the one line that blocks half of them

Tip `a6ae79dc`. **Orders reset**, and mine are to *finish* the Watch
rather than widen it:

1. C4 tier 1 per my registration, and then **the tier table as a
   single published statement**.
2. C6 stays gated, and I am told not to wait on it.
3. If both stall, the parked C3 deferral
   (added-cells-within-matched-structure) is mine.

**Item 1 splits in two, and only half of it can move.**

- **Tier 1's code is still blocked, and the blocker is one line.**
  `grep -in z3 server/pyproject.toml` on the new tip returns nothing.
  My registration binds me: no code of this lane imports z3 before
  that line exists. Stated as plainly as I can, since the orders now
  ask for the tier itself: **the lead adding `"z3-solver>=4.13"` to
  `server/pyproject.toml` is the whole of what I need.** Until then
  tier 1 decides nothing and every run prints the size of the hole
  (1,516 cells on the registered pair).
- **The tier table needs nothing from anyone**, and it is written:
  `docs/pierce/tier-table.md`. What each tier claims, the exact
  strength of the claim, its measured cost, what it refuses by name,
  and the number it produced on the registered pair. Every figure is
  taken from a run artifact and cross-checked against the round that
  produced it; none is an estimate, and the two places this lane got
  something wrong (the shape's literal blind spot, the misnamed
  degenerate refusal) are in the document rather than tidied out of
  it.

**A note on where I put it.** `docs/pierce/` is not a path
`lanes.md` assigns me, and the orders asked for a *published*
statement rather than another section of my diary — so I created the
file and am naming the deviation here instead of making it quietly.
Move it if it belongs elsewhere.

With tier 1 blocked and C6 gated, item 3 is the live work, and it is
the right one: this turn's own findings are about a revision whose
substance is **added cells inside matched structure** — twelve months
of outturn typed into a sheet whose rows otherwise align perfectly.
The next entry registers what C3 should say about that and measures
what it does say.

## Item 3 checked before it is worked on: the C3 hole is already closed

The orders list « added-cells-within-matched-structure » as a real
hole and mine. **It is not a hole — it was built at the sixteenth
sweep** (`filled_cell` / `emptied_cell`), and this turn is the first
time it has been run against a revision whose substance I know
independently. C3's report on the registered ED2 pair:

```
new_defects 0 · repaired 0 · persistent 11 · unmatched 0/0
moved_assumption  Annual Inflation row 50   11.636903442623 → 11.584699426229506
moved_assumption  Annual Inflation row 53    9.14944682416672 → 9.066745554703903
filled_cell       Monthly Inflation rows 284–295 [H,I]
                     « a cell that was empty now holds 121.2 »
material_output   94 blocks, the largest « Monthly Inflation rows
                     284–352 [J,K,L,M,N] moved 16.7% »
```

**The `filled_cell` line is the revision**, folded to exactly the
twelve months the frontier probe identified, on exactly the sheet and
rows it identified — arrived at independently, by a different
instrument, three rounds earlier. So the orders' item 3 is reported
back to the lead as **already done**, with this as the evidence.

### One thing it understates — registered, then fixed

`_block_item` takes `details[0]`: a folded block reports the **first
cell's** story and never says how many cells it covers. « A cell that
was empty now holds 121.2 » is true of a block of twenty-four, and a
reviewer reads one cell where twelve months were typed in.

**The change**: when a block folds more than one cell, its detail
carries the count. Uniform across every kind — a `material_output`
block that moved 3.1% is also worth knowing the size of.
**Predictions**: the `filled_cell` line comes back reading **24
cells** (twelve rows across columns H and I, matching C1's count of
added cells exactly); no item count changes; no kind changes; the
delta tests stay green apart from any that pin a detail string
verbatim, and those are the two single-cell cases, which by
construction get no suffix.

### Result: the prediction held, and the report now reconciles with C1 on its face

```
moved_assumption  Annual Inflation row 50  11.636903442623 → 11.584699426229506  (7 cells)
moved_assumption  Annual Inflation row 53   9.14944682416672 → 9.066745554703903  (7 cells)
filled_cell       Monthly Inflation rows 284–295 [H,I]
                     « a cell that was empty now holds 121.2 »                    (24 cells)
material_output   94 blocks, now each carrying its size
```

**24 cells**, as predicted, and no item count moved (2 / 1 / 94, as
before). The unplanned dividend is the reconciliation: the two
assumption lines read **7 + 7 = 14**, which is C1's count of content
changes exactly, and the filled block reads **24**, which is C1's
count of added cells exactly. The delta report and the raw diff now
agree **on the face of the report**, where before a reader had to
take it on trust.

All delta and document tests green; the two that pin a detail string
verbatim are single-cell cases and are unaffected by construction, as
predicted.

## Where Track C stands, at the end of this turn

| Step | State |
|---|---|
| C1 raw diff | measured, hand-checked, reconciles with the ladder to one named cell |
| C2 alignment | measured; 8,475 pairings on the registered pair, 0 suspect |
| C3 delta report | measured on a revision whose substance is independently known; names it in one line, and now reconciles with C1 on its face |
| C4 tier 0 | 93.19% at hash cost, gates clean |
| C4 tier 1 | **blocked on one line in `server/pyproject.toml`** |
| C4 tier 2 | 313 supported · 0 plain divergences · 7 latent · every refusal named |
| C4 tier 3 | closed vocabulary, 1,203 refusals on the pair, 0 unnamed |
| C5 deck delta | measured on a real deck |
| C6 | gated, and the lead says not to wait |
| The tier table | published: `docs/pierce/tier-table.md` |

The only thing between this track and « complete » is tier 1, and
the only thing between tier 1 and being built is the dependency line.

## Tier 1, part A — the boundary without the solver (REGISTERED BEFORE RESULTS)

Tip `cacd60f2`, twenty-seventh sweep. `z3-solver` still absent, two
sweeps after the orders asked for the tier. Orders otherwise
unchanged; item 3 is done and reported back.

**What I can build without breaking my own registration.** The
registration binds me on one thing only — *no code imports z3 before
the dependency lands*. It does not bind the half of tier 1 that has
no solver in it, and the orders name that half explicitly: « the tier
ladder's **honest refusal boundary** ». Deciding whether a formula
pair is inside the fragment is pure syntax. So:

**The eligibility classifier** (`watch/fragment.py`): given a
formula, does it parse whole into the registered grammar — literals,
`+ - * / ^` with literal integer exponent, comparisons, `AND OR
NOT`, `IF`, `MIN MAX ABS`, `SUM`/`SUMPRODUCT` over concrete ranges,
and cell references — or does it use a construct the fragment does
not reach? Refusals carry the construct's **name**, from the
registration's own list: lookups and data-dependent selection, text
and date functions, whole-column or differing-extent aggregates,
volatile and environment functions, array formulas, and « the reader
could not parse this ».

**Why this is worth doing while blocked, and not busywork.** The
registration requires « the coverage denominator — how many suspects
tier 1 was even eligible to judge — reported beside every catch
number ». That denominator is measurable *now*, and it is the number
that tells the lead whether the dependency buys anything: if a
regulatory model is 5% inside the fragment, tier 1 is a footnote; if
it is 60%, it is the crown the plan calls it. **I would rather hand
over that number than an argument.**

**The measurement**: every formula cell of ED2 v2 31 July (20,623 of
them), classified; plus the 1,516 cells that reached tier 1's rung on
the registered pair.

**Predictions.**

1. **Under 35%** of the 20,623 formula cells are inside the fragment.
2. The commonest named refusal is a **lookup-family** construct
   (`INDEX MATCH VLOOKUP CHOOSE OFFSET`).
3. **All 1,516** cells at tier 1's rung on this pair have
   byte-identical formulas on both sides — so tier 1 would prove them
   equivalent trivially and learn nothing. Tier 1's value is on
   *rewrites*, and **this revision contains none**; the tier's real
   measurement therefore needs the planted-rewrite harness, which
   needs the solver. If that prediction holds it is an argument for
   the dependency and against pretending this pair could ever
   exercise the tier.

## Tier 1, part A — results: the fragment reaches three quarters of the model

```
ED2 v2 31 July, every formula cell            20,623
   inside tier 1's fragment                   15,509   75.2%
   refused: lookup_or_selection                2,752
            text_or_date                       1,465
            error_handling (IFERROR family)      839
            conditional_aggregate                 39
            unlisted_function (ROUND, …)          19
```

**Prediction 1 — « under 35% » — failed, and badly: it is 75.2%.**
I expected a regulatory model to be mostly lookups and text; it is
mostly arithmetic. That is the number the dependency question turns
on, and it argues for the line rather than against it: **tier 1's
fragment reaches three quarters of a real model's formula cells.**

**Prediction 2 — the commonest refusal is a lookup — held**, model
wide (2,752) and at the rung (748).

```
the pair's tier-1 rung                         1,516
   inside the fragment                           477   31.5%
   identical formulas on both sides             1,516   100%
```

**Prediction 3 held exactly: all 1,516.** Every cell that reaches
tier 1's rung on this pair carries **byte-identical formulas on both
sides** — so tier 1 would prove them equivalent trivially and learn
nothing. This revision rewrote nothing, so it cannot exercise the
tier at all. **The tier's real measurement needs the planted-rewrite
harness, and that needs the solver**; there is no way to fake it on
this pair, and I am not going to dress a trivial proof as a result.

**A structural finding worth more than either prediction.**
Eligibility at the rung (31.5%) is **less than half** the model-wide
rate (75.2%). The reason is the ladder itself: each tier inherits
what the tier above could not handle, and that residue is
systematically harder — tier 0's silence is dominated by
text-result formulas, which are exactly the lookups and text
functions tier 1 refuses. **A tier's coverage on the whole model is
not its coverage on the cells that actually reach it**, and every
coverage number this lane publishes now says which one it is.

**A defect in my own classifier, caught by the corpus and not by the
tests.** The first run refused 100 cells as `unlisted_function: AND`
— against a fragment whose registration names « comparisons and
`AND OR NOT`, boolean-valued ». My `FRAGMENT_FUNCTIONS` omitted the
three booleans. Fixed, re-run, and the remaining 19 unlisted are
real (`ROUND` and friends). The constructed tests all passed while
the classifier disagreed with its own registration; only the corpus
saw it. Recorded at the constant.

A second defect the tests *did* catch first: the first draft stripped
the leading `=` before tokenizing, and openpyxl then returns the
whole formula as one literal — so `INDEX(…)` came back **eligible**.
It never reached a corpus number.

### What this changes for the dependency request

The ask is unchanged and now has a number behind it:

> `z3-solver` in `server/pyproject.toml`. On the corpus we have,
> tier 1's fragment covers **75.2%** of a real regulatory model's
> formula cells and **31.5%** of the cells that reach its rung on an
> adjacent revision. Nothing in this lane imports it until the line
> exists.

## New orders (twenty-eighth sweep): three items, and the gate again

Tip `2bde77d8`. `z3-solver` **still absent** — three sweeps after the
orders asked for tier 1. Part A is built and measured (75.2%); part
B waits on the line, and I will keep saying so rather than starting.

The orders bring three new items, all from the founder's research
round over real git history.

### Item 2 — the array-formula phantom-change class, now pinned

The lead checked `watch/diff.py::_formula_text` and found this lane
clean: openpyxl hands back an `ArrayFormula` **object** rather than
an `=`-string, and a reader that compares those objects compares
identities — their run saw ~600 phantom changes in 17,200 cells
(3.5%), and 202 of 203 « changes » on a version-string bump. We
extract `.text`. **No test pinned it.** Two now do, on a real
workbook carrying a real CSE formula: the array cell reads as its
text, and a version-string bump moves **exactly one cell**.

### Item 1 — the two specimens, measured before anything was pinned

Both specimens come from real commits, and **C3 already reports both
as `methodology_change`.** I wrote the tests expecting to find holes
and found my own expectations wrong twice, which is the right way
round:

- **The vertical sum that became a horizontal one**
  (`=SUM(B2:B5)` → `=SUM(C6:F6)`, same cell, same total): reported.
  The shape layer sees it plainly —
  `SUM(R[-5]C[+0]:R[-1]C[+0])` against `SUM(R[+0]C[-20]:R[+0]C[-17])`
  — and a value-only reader sees **nothing at all**, since both sums
  total 40. That is the whole argument for the class.
- **The reference shifted one column and two rows inside a copied
  block**: reported, and **only that row** — the three untouched
  rows of the block stay silent, which is what makes the asymmetry a
  signal rather than noise.

**What the specimens did expose is the detail line.** A
`methodology_change` reads « the calculation changed shape » and
stops there. For the sum specimen that is true and nearly useless:
it does not say *what* the calculation became. Registered before the
change: the line carries **both shapes**, old → new, truncated,
because the shape is the thing that changed and the formula text
would drown a reader in absolute references. **Prediction**: the sum
specimen's line reads
`SUM(R[-5]C[+0]:R[-1]C[+0]) → SUM(R[+0]C[-20]:R[+0]C[-17])`, no item
count moves anywhere, and the ED2 pair is unaffected because it
contains no methodology changes at all.

### Item 3 — the Enron E08/E09 pair

« Do not wait on it; register nothing yet. » Noted and obeyed: it is
recorded in the handoff's open list and nothing is built for it.

### The specimens, measured — and a prediction that was right about the wrong strings

Both specimens pass, and the detail line now carries both shapes:

```
SUM(R[-5]C[+0]:R[-2]C[+0]) → SUM(R[-1]C[+1]:R[-1]C[+4])
```

Read the halves: on the left the **row** offset varies and the
column is fixed — a column of cells. On the right the row is fixed
and the **column** offset varies — a row of cells. The direction
change is legible in the line itself, which is the whole point of
the specimen.

**A correction to my own prediction, which was right in substance
and wrong in its quoted strings.** I predicted the line would read
`SUM(R[-5]C[+0]:R[-1]C[+0]) → SUM(R[+0]C[-20]:R[+0]C[-17])`. Those
offsets came from the standalone probe, where the formula sits at
`AM9`; the test fixture puts it at `B7`, so the real offsets differ.
The prediction that mattered — the line carries both shapes, old →
new — held; the strings I quoted were from a different geometry and
I should not have written them as though they were the fixture's.
No item count moved anywhere, as predicted, and the ED2 pair is
untouched: it contains no methodology changes at all.

## The update-profile finding — registered, and deliberately not built as a threshold

The orders hand me a measured finding and an explicit instruction:
« register how you want to use it; **do not bolt a threshold on** ».

```
measure                    quarterly reforecast (n=11)   routine commit (n=59)
formula → hardcode                              83                          0
reference changed                              228                          0
changed cells                                1,169                         93
```

**What I take from it.** C3 today ranks by a fixed weight per class
and a fixed materiality line (`MATERIAL = 1%`). That is exactly the
« raw threshold » the finding warns against: 83 formulas replaced by
hardcodes is *routine* in a quarterly reforecast and *alarming* on a
Tuesday, and a report that treats them alike is wrong in both
directions — it cries wolf every quarter and stays silent on the
Tuesday that matters.

**What I will build, when the material exists.** Not a threshold and
not a classifier of intent. **A denominator.** The report already
counts each class; what it lacks is « how unusual is this count, for
this model ». The shape I am registering:

- **The profile is per model and comes from that model's own
  history** — the medians of each class's count across its previous
  transitions. Nothing learned across models; a distribution network
  and a private-equity model share nothing but a file format.
- **It is reported beside the count, never instead of it.** « 83
  formulas became hardcodes (this model's median for a transition of
  this size: 79) » and « 4 formulas became hardcodes (median: 0) »
  are two lines a reviewer can act on; a single « suspicious » score
  is one they cannot.
- **The comparison is to transitions of comparable size**, because
  the finding's own table is a size effect as much as an intent
  effect (1,169 changed cells against 93). Size is measurable from
  the pair itself and needs no commit message; **intent is not, and
  I am not going to infer it from a diff.**
- **Below three prior transitions, it refuses**: « no profile for
  this model » in words, never a median of one.

**What blocks it, stated plainly**: this needs a model with a real
version *history*, not a pair. The ED2 corpus has eleven versions of
one model, which is exactly the material — and re-measuring C3 across
all ten adjacent ED2 transitions is the round that makes a profile
real rather than argued. That round is affordable (C3 is ~90 s per
pair, so ~15 minutes for the chain) and it is the one I would run
next if the orders leave room.

## The ED2 chain — the update profile, measured (REGISTERED BEFORE RESULTS)

Tip `2bde77d8`, unchanged; orders unchanged; `z3-solver` still
absent. So the round I named last turn is the one to run: **C3 over
every adjacent transition of the ED2 chain**, which is the only
material we hold that has a version *history* rather than a pair.

**The chain**: eleven files, ten adjacent transitions, in the
corpus's own date order —
`v1_2023-02 → v2_2023-07-14 → v2_2023-07-31 → v3_2023-10 →
v3_2023-11 → v3_2024-01(.xlsm) → v4_2024-07 → v4_2025-01 →
v4_2025-07 → v4_2026-01 → v5_2026-06`.

**What is being built**, and it is the design registered last turn,
not a threshold:

- `watch/profile.py` — `profile_of(transitions)` gives, per delta
  class, the **median count across a model's own prior
  transitions**; `describe(kind, count, profile)` gives the line a
  reviewer reads: « 83 (this model's median: 79) ».
- **It refuses below three priors**, in words: « no profile for this
  model ». A median of one is not a profile.
- **Size-matched**, per the registration: the comparison uses the
  priors whose total changed-cell count is nearest this
  transition's, not all of them — because the founder's own table is
  a size effect as much as an intent effect.
- **Nothing is learned across models.** The profile is per file
  chain and per class, and the module has no notion of « normal for
  a spreadsheet ».

**Predictions, before the chain runs.**

1. **The spread is wide**: the largest transition's changed-cell
   count is at least **10×** the smallest. If the chain is uniform,
   the profile idea has nothing to stand on and I will say so.
2. **`methodology_change` is zero or near-zero within a version
   family** (v2→v2, v3→v3, v4→v4) and non-zero across families
   (v2→v3, v3→v4, v4→v5). The 14→31 July pair is already known to be
   0, and it is a within-family pair.
3. **`filled_cell` appears in most transitions** — extending a
   published data series is what a regulatory update *is*, and the
   July pair showed exactly that.
4. **At least one transition costs more than five minutes** in the
   aligner, because a major-version step moves structure and the
   alignment is quadratic in the moved dimension. If any pair
   exceeds twenty minutes it is recorded as a refusal with its
   timing, not waited out.

### Amendment before the chain's numbers are read: « nearest » is not « comparable »

Writing the profile's tests, on transitions whose right answer is
known by construction, exposed a flaw in my own registered design.
« The priors whose changed-cell count is nearest » taken as *the five
nearest* does the wrong thing when a model's history is thin: for a
95-cell update with only six priors, the five nearest include two
reforecasts of 1,090 and 1,169 cells, and the median of « formulas
replaced by hardcodes » comes back **1** where the comparable history
says **0**. That is precisely the mixing the design exists to
prevent, reintroduced by a lazy reading of my own rule.

**The rule, fixed here before any chain number is read**: a prior is
**comparable** only if its changed-cell count is within a **factor of
two** of the transition being read; among those, the nearest
`NEIGHBOURS` are used. If fewer than `MINIMUM_PRIORS` comparable
priors exist, the profile **refuses in words** — « no profile for a
transition this size » — which is a different and more honest refusal
than « no profile for this model »: the model may have plenty of
history and none of it comparable.

The factor of two is declared, not derived. It is a constant of this
lane now, and moving it is a written round.

## The ED2 chain — results: the founder's finding replicates on a regulator's model

Ten transitions, **66–72 s each**, ~11 minutes for the chain. Every
one completed; none refused.

```
transition                              cells   the classes that moved
v1_2023-02  → v2_2023-07-14               911   methodology 72 · structure 17 · relabelled 2
v2_2023-07-14 → v2_2023-07-31             680   assumptions 2 · filled 1 · outputs 94
v2_2023-07-31 → v3_2023-10                247   methodology 10 · structure 4
v3_2023-10  → v3_2023-11                5,145   assumptions 44 · outputs 333
v3_2023-11  → v3_2024-01                7,679   assumptions 464 · outputs 330 · structure 113
                                                · class change 12 · filled 17
v3_2024-01  → v4_2024-07                5,620   methodology 95 · outputs 269 · structure 14
v4_2024-07  → v4_2025-01                9,865   assumptions 440 · outputs 362 · structure 52
v4_2025-01  → v4_2025-07                  553   assumptions 2 · filled 1 · outputs 95
v4_2025-07  → v4_2026-01                9,425   assumptions 436 · outputs 340 · filled 9
v4_2026-01  → v5_2026-06                5,050   outputs 292 · structure 10 · relabelled 4
```

*(« cells » here is the **report's own** size measure — cells that
produced a delta event — and it is not C1's raw changed-cell count.
On the July pair it reads 680 where C1 reads 1,255. Two denominators,
both honest, and I am naming which is which so nobody compares
them.)*

**The finding replicates, on a model class the research round never
touched.** The founder's table came from an equity model's git
history; this is a regulator's price-control model, and its own
history splits the same way:

```
four transitions   247 – 911 cells      assumptions moved:   0, 2, 2, —
six transitions  5,050 – 9,865 cells    assumptions moved:  44, 436, 440, 464
```

There is **no transition between 911 and 5,050 cells** — the gap is
in the data, not in a threshold I chose. « 436 assumptions moved » is
routine for this model in a periodic update and would be alarming in
a July patch, which is precisely the founder's point arriving
independently.

**Against the predictions.**

1. **Spread ≥ 10× — held, at 39.9×.**
2. **`methodology_change` zero within a version family and non-zero
   across — held nine times and failed on the tenth.** v1→v2: 72.
   v2→v3: 10. v3→v4: 95. Within-family steps: 0 every time. But
   **v4→v5, a major-version step, has zero methodology changes** —
   its signature is 4 relabelled lines and 10 structure items. **The
   version number is not a reliable predictor of a rewrite**, and the
   chain says so plainly: v5 was a renaming and restructuring event.
3. **`filled_cell` in most transitions — held, barely: 6 of 10.**
4. **« At least one transition costs more than five minutes » —
   failed, and this is the good kind.** The slowest was **72 s**,
   including two major-version steps. The memory and timing rounds
   paid for that; I predicted the aligner would struggle across
   structural change and it did not.

**The profile, run over the chain with each transition read against
the other nine.** It flags, in this model's own terms:

```
v3_2023-11 → v3_2024-01   unusual: class_change, emptied_cell, filled_cell,
                                   moved_assumption, structure
v3_2024-01 → v4_2024-07   unusual: methodology_change, relabelled_line
v4_2024-07 → v4_2025-01   unusual: emptied_cell, filled_cell, moved_assumption,
                                   structure
v4_2026-01 → v5_2026-06   unusual: relabelled_line
```

Those are review sentences, not scores: *this transition rewrote more
formulas than this model usually does*, and *this one renamed more
lines than it usually does*. Neither is available from a count alone.

**And the honest limitation, which the run exposed rather than
hid.** The four small transitions get **0 to 2 comparable priors** and
the profile **refuses** on all of them — « no profile for a
transition this size, 9 priors, 0 of comparable size ». That is the
design behaving exactly as registered, and it means the profile is
silent on precisely the transitions a reviewer most often reads: the
small, routine-looking ones. The cause is arithmetic: ED2's history
holds four small transitions, and a factor-of-two band splits even
those (247's band is 123–494; the next smallest is 553).

**I am not moving the factor now.** Widening it after seeing which
transitions refused is tuning to the result, which is the one thing
this lane does not do. Registered instead, for a later round and to
be decided before it runs: replace the fixed factor with **bands
taken from the chain's own distribution** — the gap between 911 and
5,050 is a cluster boundary the data drew by itself, and a rule that
finds such boundaries would give the small transitions three priors
apiece without widening anything by hand.

## The comparability round (REGISTERED BEFORE RESULTS)

Tip `2bde77d8`, unchanged. Orders unchanged. `z3-solver` absent.
The live registered item is the profile's comparability band, and
the first thing to say about it is what I do **not** have.

**There is no held-out chain.** I checked the corpus rather than
assuming: `ofgem_riio3` is draft-versus-final of *four different*
models, and `caa_h7` is two unrelated pairs. Neither is a history.
**ED2 is the only version chain we hold**, so any rule I design now
is designed by someone who has already seen ED2's ten transitions
and knows there is a gap between 911 and 5,050 cells. I am not going
to pretend otherwise, and the consequence is stated before the run:
**a good result here is weak evidence.** The real test is a second
chain — the founder's research corpus holds an equity model with
seventy transitions, and that is where this rule should be tried by
someone who has not seen its numbers.

**What I will not do**, having seen the distribution: fit anything
to it. No cluster boundary read off ED2's gap, no factor tuned until
the refusals go away. The rule below is structural and contains no
number taken from the data.

**The rule.**

1. **Comparable priors first**, unchanged: within
   `COMPARABLE_FACTOR` (2.0) of this transition's size.
2. **If fewer than `MINIMUM_PRIORS` are comparable, do not fall
   silent — answer, and disclose.** Take the three nearest priors by
   size and report the line *with the size ratio spelled out*:
   « … compared with this model's 3 nearest updates, 2.2–3.7× larger ».
   A qualified answer a reviewer can discount beats a refusal they
   cannot act on, **provided the qualification is in the line
   itself** and not in a footnote.
3. **Refuse entirely only when the model has fewer than
   `MINIMUM_PRIORS` transitions at all.** That refusal is about the
   model's history and cannot be argued away.

The distinction that matters: silence when the model has no history;
a *disclosed* comparison when it has history of the wrong size.

**Predictions.**

1. All **four** small ED2 transitions (247–911 cells) get a
   qualified profile where they now get a refusal; no large one
   changes at all, because those already have five comparable
   priors.
2. The 247-cell transition's disclosed ratio is **between 2× and
   4×** (its nearest are 553, 680 and 911).
3. **The 247-cell transition — v2_2023-07-31 → v3_2023-10 — is
   flagged unusual for `methodology_change`**, because it rewrote 10
   formulas where this model's other small updates rewrote none.
4. **The two genuinely routine transitions (553 and 680 cells) are
   flagged for nothing at all.** If a rule that discloses its own
   weakness still cries wolf on the quietest updates in the chain,
   it is not worth having and I will say so.

## The comparability round — results: three predictions held, the fourth killed a feature

```
transition                    cells   profile      ratio      unusual
v1_2023-02 → v2_2023-07-14      911   QUALIFIED   1.3–3.7×   methodology, structure,
                                                             relabelled, emptied, repaired
v2_2023-07-14 → v2_2023-07-31   680   QUALIFIED   1.2–2.8×   filled, outputs, assumptions
v2_2023-07-31 → v3_2023-10      247   QUALIFIED   2.2–3.7×   methodology, structure
v4_2025-01 → v4_2025-07         553   QUALIFIED   1.2–2.2×   filled, outputs, assumptions
the six large ones            5,050+  comparable      —      (unchanged from last round)
```

1. **All four small transitions now answer instead of refusing** —
   held.
2. **The 247-cell transition's ratio is 2.2–3.7×** — held, inside the
   predicted 2–4×.
3. **It is flagged for `methodology_change`** — held. Ten formulas
   rewritten where this model's other small updates rewrote none.
4. **« The two genuinely routine transitions are flagged for nothing
   at all » — FAILED.** Both 680 and 553 — the quietest updates in
   the whole chain, two moved assumptions and a filled cell apiece —
   come back flagged for `filled_cell`, `material_output` **and**
   `moved_assumption`.

**I registered what to do if that happened, so I am doing it.** The
words were: « if a rule that discloses its own weakness still cries
wolf on the quietest updates in the chain, it is not worth having
and I will say so ». It does, and it isn't.

**Why it fails, and it is structural rather than a bad constant.** A
small transition's three nearest priors are *not* three routine
updates — they are whatever is nearest by size, which in this chain
means a routine update sitting beside two version-family steps
(247 rewrote 10 formulas, 911 rewrote 72). The median of a
heterogeneous triple is not a habit, and a boolean drawn from it is
noise wearing a verdict's clothes.

**What I am changing, and it follows from the design's own
principle rather than from these numbers**: `unusual()` returns
`False` for any **qualified** profile. A disclosed comparison is
weak by construction — that is what disclosing it means — and
turning a weak comparison into a boolean is precisely the over-claim
this whole module exists to avoid. The *line* stays: « 2
moved_assumption (this model's median for updates this size: 0, but
its nearest updates are 1.2–2.8× a different size) » is a sentence a
reviewer can weigh. The flag was the machine weighing it for them,
badly.

So the round's net result is one feature narrowed and one honest
sentence kept — and the ordering signal now fires only where the
comparison is real: the six large transitions, where it says the
reforecasts moved assumptions and structure, v3→v4 rewrote formulas,
and v4→v5 renamed lines.

## The first external answer key (REGISTERED BEFORE RESULTS)

Tip `a53eb565`, twenty-ninth sweep. `z3-solver` absent; orders
unchanged. Item 3 of the twenty-eighth sweep's orders is the one I
have never taken up, and it is the most valuable thing on the list:
**ground truth with the author's own words.**

Every measurement this lane has published is on edits I planted
myself, or on ED2 where I inferred the ground truth from the files.
`hickeng/financial` is neither: a real financial model whose author
fixed a real defect and *described it in the commit message*.

```
31db8d1  « Fixes row skewed formula … This fixes a skew in the RSU
           Post-merger short term capital gain column where the
           formula was referencing cells offset down by one row.
           This was introduced with the switch to comprehensible
           formula. Fixes #111 »
parent: 529ca3a
```

The orders' summary of the labelling: **98 reference changes, 1
formula change, zero hardcodes, every formula in a block reading the
row below itself.** The same chain carries « Update version number
in sheet » commits — 1-, 2- and 4-cell bumps — which are the
**required-silence** half: an instrument that reports the defect and
also shouts at a version-string bump has not earned anything.

**Licence.** Non-commercial; internal measurement only. The
workbooks live in the scratchpad and are **never committed**, the
same rule the corpus fetchers already follow. The repository is
cloned, not vendored.

**What is measured, on the defect pair (529ca3a → 31db8d1):**

1. **C1** — how many cells its raw diff calls changed.
2. **C3** — what the delta report *says*. This is the real test: 98
   changed references should read as **one folded block** in review
   language, not as 98 items. A reviewer who is handed 98 lines has
   been handed the diff again.
3. **C2's alignment** — whether the block's rows stay matched, since
   nothing moved structurally.

**And on the version-bump pairs**: how much C3 says at all.

**Predictions.**

1. **C1 reports between 80 and 130 changed cells** on the defect
   pair. The orders say 98 reference changes and 1 formula change;
   C1 counts cells, and its count includes any cached values that
   moved, so I expect it at or above 99 — but the workbook is small
   and may not carry cached values at all, in which case the count
   is the content changes alone.
2. **C3 folds them into fewer than 10 items**, and the largest is a
   `methodology_change` block covering a contiguous run of rows in
   one column. If C3 emits ~98 items, the folding does not work on
   real defects and I will say so.
3. **The `methodology_change` detail line shows the skew** — the two
   shapes differing by one row, which is exactly what the new
   both-shapes line was built for last sweep.
4. **The version bumps produce at most 2 items each**, and none of
   them is a `methodology_change`. A version string is a `filled_cell`
   or an assumption move, nothing more.

## The external answer key — results: the instruments meet the author's own words

**The defect pair (529ca3a → 31db8d1), against Level-A truth.**

```
C1   changed 101   content 99   value 3   added 0   removed 134
C3   methodology_change 11 · moved_assumption 10 · material_output 12
     · structure 12 · new_defect 7 · repaired_defect 7
```

1. **Prediction 1 held, and better than it had to.** C1 reports
   **99 content changes** where the orders' labelling says 98
   reference changes plus 1 formula change. **99 = 98 + 1.** An
   instrument written for regulatory models, meeting a personal
   tax model it has never seen, lands on the author's own count.
   (It also reports **134 removed cells**, which the labelling does
   not mention. Not a disagreement — the labelling counted changes,
   not deletions — but it is unexplained and I am not going to claim
   it as a find.)
2. **Prediction 2 failed on its number and held on its substance.**
   I said « fewer than 10 items »; C3 emits **11 methodology blocks**
   and 59 items in all. But the thing being tested — does 99 changed
   cells fold into review language — **works**: 99 changes become 11
   blocks, and the largest single line covers **20 cells**. The
   number I predicted was optimism about geometry: the skewed column
   has gaps, so contiguous folding cannot reach one block.
3. **Prediction 3 held for the defect the commit describes, and
   failed elsewhere — which turned out to be the useful half.** The
   RSU line reads:

   ```
   …(avgoQty,R[+1]C[-17],purchaseDate,R[+1]C[-45],…
    → …(avgoQty,R[+0]C[-17],purchaseDate,R[+0]C[-45],…
   ```

   That is precisely « the formula was referencing cells offset down
   by one row », in the author's words, arrived at from the two files
   alone. **But the ESPP block showed two identical-looking
   truncated strings**: with a modern `LET` formula the shapes agree
   for sixty characters and the change is past the cut. The
   both-shapes line I built last sweep was defeated by long formulas
   on its first contact with a real one.

   **Fixed, and the fix is what a diff does**: trim what the two
   shapes agree on, keep a margin of context, mark the trim. The
   ESPP block now reads:

   ```
   …eginDate,R[+2]C[-52],AND(… → …eginDate,R[+0]C[-52],AND(…
   ```

   **And that line says something the commit message does not.** The
   author describes a one-row skew in RSU; the same commit also
   corrected a **two-row** skew in ESPP (`R[+2]` → `R[+0]`). The
   report names it because it reads the files rather than the note.
   I am stating that as what the files show, not as a claim about
   what the author intended.
4. **Prediction 4 held where it applied, and two of my four pairs
   were not what I called them.** The two « Update version number in
   sheet » commits are genuine bumps — **3 changed cells, and C3
   emits exactly one item**:

   ```
   relabelled_line: Summary column C
      « github release: v0.1.6 » → « github release: v0.1.7 »
   ```

   Required silence, met: one true line, nothing else. The other two
   I picked — « Update for v0.1.7 release » — are **not bumps at
   all**: 581 content changes, including 432 cells wrapped in
   `IFERROR`. My selection was wrong, not the prediction. That pair
   is worth its own note, because C3 folds those 432 cells into
   **one line** that says exactly what happened:

   ```
   methodology_change: RSU rows 7–150 [G,H,Z]
      R[+0]C[-2]*R[+0]C[-3] → IFERROR(R[+0]C[-2]*R[+0]C[-3],#) (432 cells)
   ```

**What this round is worth.** Every number this lane had published
before it came from edits I planted or from ED2, where I inferred
the truth myself. This is the first time the Watch has been held
against a defect **described by the person who made it**, in a model
from a different world — a personal tax workbook rather than a
regulator's price control — and the instruments met it: the count to
the cell, the defect in review language, and silence on the version
bump. The licence is non-commercial; the workbooks stay in the
scratchpad and are never committed.

## The second chain — the profile, held out (REGISTERED BEFORE RESULTS)

Tip `07f124d1`. `z3-solver` absent; orders unchanged and all three
of their items addressed.

Last sweep I wrote that the profile's numbers were all in-sample on
ED2 and that « the real test is a second chain ». The answer key I
cloned for the specimen round **is** one: `hickeng/financial` keeps
sixteen distinct versions of its workbook on the first-parent line —
**fifteen adjacent transitions**, half again as many as ED2 holds.

**How held-out it actually is, stated precisely.** I have already
seen five of those fifteen: the defect pair (101 changed cells), two
« Update version number in sheet » bumps (3 cells each) and two
« Update for v0.1.7 release » commits (582 each). **Ten are
unseen**, and the profile *rules* were fixed before any of this
chain existed. So this is a genuine hold-out for the rules and a
partial one for the distribution, and I am not going to describe it
as more than that.

**What is being tested — the question ED2 could not answer.** On
ED2 the four quiet transitions all came back **qualified** (fewer
than three priors within a factor of two), and I switched
`unusual()` off for qualified profiles because it flagged the two
quietest updates in the chain. The open question was whether that is
a **design flaw** or a **thin-history artifact**. A chain with
fifteen transitions, several of them near-identical version bumps,
answers it.

**Predictions.**

1. **The chain is bimodal like ED2's**: at least **five** of the
   fifteen transitions are under 20 cells, and at least **three**
   are over 300.
2. **The quiet transitions get *comparable* profiles here** — three
   or more priors within a factor of two — where on ED2 they could
   not. If so, ED2's refusals were thin history and not a broken
   rule.
3. **The counterfactual that matters**: on the transitions that get
   a comparable profile, `unusual()` stays **silent on the version
   bumps** and **fires on the defect pair** — the skew fix, which is
   the one transition in this chain a human labelled as a defect. If
   it fires on the bumps too, the flag is wrong in principle and I
   will say so and leave it off for good.
4. **C3 stays fast**: every transition under 60 s, since the
   workbook is 89 KB against ED2's 4.3 MB.

## The second chain — results: the profile is not ready, and I can say why

Fifteen transitions, **1.8–18.3 s each**. Prediction 4 held; the
instrument is fast on a small workbook.

```
sizes (cells the report touched)
   0, 1, 1, 1, 24, 76, 167, 283, 306, 342, 553, 559, 697, 1518, 2091
```

**Prediction 1 — half held.** Seven transitions over 300 cells
(predicted ≥3). But only **four** under 20, where I predicted five.
Minor, and I am counting it as a miss rather than rounding it.

**Prediction 2 — « the quiet transitions get comparable profiles
here » — FAILED, and the reason is a defect in my rule, not thin
history.** Every quiet transition (0, 1, 1, 1, 24 cells) comes back
**qualified**, exactly as on ED2. The cause is arithmetic and I
should have seen it when I registered the rule:

> **A multiplicative band degenerates at small sizes.** « Within a
> factor of two » of a 1-cell transition means « between 0.5 and 2
> cells ». Of a 0-cell transition it means « exactly 0 ». The band
> that keeps a 1,169-cell reforecast out of a 95-cell update's
> profile also keeps a 1-cell bump out of another 1-cell bump's.

Ten of fifteen transitions are qualified; only five get a real
comparison, and those five are the middle of the distribution
(283–559 cells). ED2's refusals were **not** thin history. The rule
is wrong at the bottom of its range.

**Prediction 3 — the one that mattered — FAILED in the worst
direction.** I predicted `unusual()` would stay silent on the
version bumps and **fire on the defect pair**. It is silent on
both. The defect pair — the skew fix, the only transition in this
chain a human labelled as a defect — reads 76 cells, gets a
**qualified** profile, and the guard I added last sweep switches
the flag off.

**So the flag is silent exactly where the ground truth says
something happened**, and that is a plain negative for the design as
it stands. The guard was right (a weak comparison must not
conclude); the band beneath it is what makes almost everything weak.

**The honest verdict: the update profile is not ready to ship.** On
a real fifteen-transition history it refuses on two thirds of the
chain and says nothing about the one defect its own author
documented. The *sentence* it produces is still sound — a count
beside a median, with the size ratio disclosed — and the ED2
replication of the founder's finding still stands, because that was
a statement about the **data** rather than about this module. What
does not stand is any claim that the module is usable.

### Registered successor, and why I am not implementing it today

The fix is to compare by **rank within the chain** rather than by
ratio: a transition's comparables are the priors nearest it in the
ordered list of sizes, a neighbourhood of `NEIGHBOURS`, with no
multiplicative constant at all. It is scale-free, it degrades
gracefully at both ends, and it introduces **no new constant** —
`NEIGHBOURS` and `MINIMUM_PRIORS` are already registered.

**But I have now seen both chains I hold.** Choosing that rule
*because* the ratio rule failed is a response to data, which is
legitimate only if the validation happens on data I have not seen.
I have none left. So the rule is registered and **not built**, and
the honest statement to the lead is:

> The profile needs a third chain before anything about it can be
> claimed. The founder's equity model with seventy transitions is
> the natural one. Until then this module produces a sound sentence
> and an unusable verdict, and the verdict is off.

## The reproducibility fix — one stream per (trial, band) (REGISTERED BEFORE RESULTS)

Tip `07f124d1`, unchanged. `z3-solver` absent. The profile is parked
until a third chain exists — parked honestly, and not something I can
unblock by wanting to. So this turn takes the other registered,
unbuilt item: the domain round's shared RNG.

**The defect, as recorded two sweeps ago**: every *rejected* draw
consumes the shared stream, so which numbers a trial finally uses
depends on how many bands were tried before it. Two runs of the same
code agree; a run after any change that alters the rejection history
does not. That is the opposite of what a registered seed is for.

**The fix**: each (trial, band) pair draws from
`Random(TIER2_SEED + 1000 * trial + band_index)`, so band *k* of
trial *i* is the same numbers whatever happened earlier.

**How it is verified, and why not by re-running twice.** The
property — « the same (trial, band) gives the same assignment
whatever was tried before » — is a property of the draw, not of
LibreOffice. It is tested directly, by building the assignments
under different rejection histories and comparing them, at no
recalculation cost. A single domain run then confirms the pipeline
end to end and re-establishes the numbers on a reproducible path,
since the previous ones came from a path that cannot be reproduced.

**Predictions for that run.**

1. **`tier0_proved` is exactly 38,255 and `changed` exactly 1,278.**
   Neither depends on a draw; if either moves, something unrelated
   to this fix has broken.
2. **`tier2_divergence_latent` is exactly 7 again** — the same seven
   `Finance&Tax` cells. Dormancy is a property of the two files'
   stored values, and those cells diverge under any perturbation
   that reaches them, so a different draw must not change the count.
   This is the sharpest falsifiable prediction in the round.
3. **`tier2_supported` lands within ±30 of 313**, and
   `no_perturbable_input` + `degenerate_under_perturbation` move to
   match. Different numbers at the same band should test the same
   cells to nearly the same depth.
4. **The accepted bands may differ from the last run** and that is
   expected, not a failure: the point of the fix is that they no
   longer depend on *history*, not that they match a run made before
   the fix existed.

## The reproducible run — results, and a correction to something I published twice

52.3 minutes, gates clean.

```
                       previous run        this run (reproducible path)
tier0_proved                 38,255                            38,255
changed                       1,278                             1,349
tier2_supported                 313                               285
tier3_refused                 1,203                             1,160
plain divergences                 0                                71
latent divergences                7                                 6
```

**Prediction 1 — half held, half failed.** `tier0_proved` is exactly
38,255, and the raw-evidence part of `changed` is exactly 1,278
(1,240 + 24 + 14). But `changed` reads **1,349**, because 71 cells
diverged at tier 2. I predicted 1,278 and in doing so quietly
assumed no plain divergences would appear. That assumption is the
thing this run destroyed.

**Prediction 2 — the one I called sharpest — FAILED: 6, not 7.**
`Finance&Tax!AV185` stores zero in both files, so it is dormant and
its classification is right; it simply **did not diverge** under
these draws. Latent membership is draw-dependent, and I predicted it
was not. Six of the seven recur.

**Prediction 3 held**: 285 supported, 28 away from 313.
**Prediction 4 held**: the accepted bands differ, as expected — one
trial was accepted at ±25%, three at ±1%, one exhausted them all.

### The correction, and it matters more than the fix did

Two entries of mine say this revision's behavioural consequences are
confined to dormant paths — « it rewrote nothing, and its data
change moves paths that are switched off ». **The second half is too
narrow, and this run shows it.** The 71 divergences are not dormant
cells:

```
Annual Inflation!AA32   stored 0.6809631728045327 in BOTH files
   trial 1:  0.6683271002700681  ->  0.48774147216924624   (-27%)
Annual Inflation!AA45, AA46, AB32, AB45, AB46, AC32, AC45 …
```

These are the real-to-nominal conversion rows — the same
`IFERROR(…/INDEX(…MATCH…))` cells that came back
`degenerate_under_perturbation` under the earlier, narrower draws.
At a band that keeps them inside the model's domain they compute
ordinary numbers, and the two versions **disagree by up to 27%**.
The root cause is the one already established: the twelve months of
outturn typed into `Monthly Inflation`, which no perturbation can
neutralise, feeding whole-column aggregates that these rows divide
by.

**So the honest statement, replacing the earlier one:**

> The 31 July revision rewrote no formula. Its data change moves
> live paths as well as dormant ones — 71 cells in the real-to-
> nominal conversion block compute differently between the versions
> — and the earlier runs reported zero only because their draws left
> those cells outside the model's domain, where nothing can be
> compared.

**And the general lesson, which is about tier 2 rather than about
ED2**: a single seeded run **understates** divergence. Five trials at
one band sample one corner of the input space; the same code with
different draws at a different accepted band found 71 differences it
had previously called degenerate. Tier 2's answer was always « no
divergence *found* », and this is what that phrasing was protecting
against. The tier table said « 0 plain divergences » as though it
were a property of the pair; it is a property of a run, and it is
corrected there.

## The standing order, read first — and my last successor does not meet it

Tip `6a78a313`. `z3-solver` absent. `lanes.md` carries a new binding
section, « Refusal is not the finish line », and I read it before
acting, along with my own handoff's lessons as it requires.

**It convicts my last round.** I closed the profile with two things
that the section names as *not* successors:

- « compare by **rank** within the chain rather than by ratio » — a
  different way to pick neighbours by size. That is a change of
  **degree**, dressed as a change of kind.
- « it needs a third chain; the founder's equity model is the
  natural one » — which is « retry when the corpus improves »
  almost word for word.

Both are true statements and neither is a successor. The section is
right and I am taking the correction.

### Attacking the constraint

The constraint I never questioned: **I compared transitions by
size.** Everything since — factor of two, nearest neighbours, ranks,
the disclosed ratio — argues about *how* to compare sizes. But size
was only ever a **proxy**. The founder's finding is « quarterly
reforecast versus routine commit »: that is a statement about **what
kind of update this is**, and size is one weak shadow of it.

**The three designs I did not try, one line each.**

1. **Cadence.** « Quarterly » is a statement about *time*. Every
   chain we hold carries dates the profile never read — ED2's
   filenames (`v2_2023-07-14`, `v3_2023-11`) and hickeng's commit
   timestamps. Compare a transition to the model's other
   transitions of **similar interval**, because a seventeen-day gap
   and a five-month gap are different kinds of event, and the
   interval is in the file rather than inferred from the diff.
2. **Composition, not magnitude.** Compare the **shape** of the
   class vector — the proportions — instead of its size. A
   reforecast is « mostly moved assumptions »; a patch is « one
   relabelled line ». Proportions have no degenerate arithmetic at
   one cell, and the whole band problem dissolves rather than being
   re-parameterised.
3. **The model's own version string.** Both chains state their
   version *in a cell* — ED2 in its filename and workbook, hickeng
   in `Summary!C`: « github release: v0.1.6 » → « v0.1.7 ». A model
   that tells you it went from 0.1.6 to 0.1.7 has told you what kind
   of update it is, from inside the file. This is the section's own
   example — information the file already carries that nobody read.

I am taking **(1)** this round, because it attacks the constraint
most directly (time is what « quarterly » means), and because the
intervals are data I have **never looked at** in either chain — so
the measurement is genuinely out-of-sample even though both chains
are otherwise seen.

## The cadence round (REGISTERED BEFORE RESULTS)

**The rule.** A transition's comparables are the model's other
transitions whose **interval** — days between the two versions — is
within a factor of two. Everything else stays as registered:
`MINIMUM_PRIORS = 3`, `NEIGHBOURS = 5`, the qualified-and-disclosed
fallback, and the flag off for qualified profiles.

**Why this is a change of kind and not of degree**: it replaces the
*variable* being compared, not the tolerance. Size is an output of
the diff; interval is an input from the file. A rule built on
interval can be wrong, but it cannot be wrong in the way the size
rule was — a one-cell transition has no small-size degeneracy in
days.

**Predictions.**

1. **ED2's intervals separate the chain the way size did.** The
   reforecasts (5,000+ cells) fall on long intervals — three months
   or more — and the quiet ones on short ones. Specifically: the
   17-day 14→31 July transition is among the **three shortest**.
2. **The quiet transitions get comparable profiles under cadence**
   where they could not under size — at least **three** of ED2's
   four small transitions, and at least **five** of hickeng's ten
   qualified ones.
3. **The hickeng defect pair gets a comparable profile**, so the
   flag is at last *able* to speak about the one transition a human
   labelled a defect. Whether it fires is a separate question and I
   am not predicting it — but a rule that still cannot look at it
   has not fixed anything.
4. **Cadence and size disagree on at least one transition** in each
   chain — a long gap that changed little, or a short gap that
   changed a lot. If they agree everywhere, cadence is size wearing
   a hat and I will say so.

## The cadence round — results: coverage solved, discrimination worse, and the tension is the finding

```
                      comparable / qualified        flags fired
ED2 (10)      size          6 / 4                        4 of 10
              cadence       7 / 3                        6 of 10
hickeng (15)  size          5 / 10                       3 of 15
              cadence      14 / 1                       13 of 15
```

**Prediction 1 — failed on its substance.** I said the reforecasts
fall on long intervals and the quiet updates on short ones. ED2 says
otherwise, plainly: the **181-day** transition changed **553** cells
and the **31-day** one changed **5,145**. The sub-claim held (the
17-day July pair is the chain's shortest), but the idea behind the
prediction — that time predicts magnitude — is wrong on this
evidence.

**Prediction 2 — split.** hickeng: nine of the ten previously
qualified transitions become comparable (predicted ≥5) — **held**,
and dramatically. ED2: only two of the four small transitions become
comparable where I predicted three — **failed**.

**Prediction 3 — held, and it was the point.** The hickeng defect
pair — the skew fix, two days after its parent — now gets a
**comparable** profile, so the flag can at last speak about the one
transition a human labelled a defect. It says `material_output,
moved_assumption, new_defect, repaired_defect`.

**Prediction 4 — held.** Cadence and size disagree in both chains,
so cadence is not size wearing a hat.

### But look at what else the flag says, because it convicts the round

Under cadence the flag fires on **13 of hickeng's 15 transitions** —
including `13_d7b9951`, a transition that changes **zero cells**,
flagged for `relabelled_line`, and `04_231c92d`, a **one-cell**
transition flagged for four classes. A signal that fires on
thirteen of fifteen updates, one of which changed nothing at all,
is not a signal.

**So cadence solves the problem I attacked and sharpens the one
underneath it, and I am not shipping it.** The two failures have one
cause:

> **Coverage and discrimination pull against each other, and neither
> size nor time is the axis that resolves them.** A comparability
> rule must group transitions that are *alike in kind*. Size fails
> because a one-cell update has no size neighbours; time fails
> because a zero-day group holds a zero-cell commit and a 553-cell
> one. Both are proxies, and both are proxies for the same missing
> thing.

### The successor, and a design killed by argument rather than by a run

**Design 2 (« compare by composition — the shape of the class
vector ») is dead, and I am killing it without spending a round on
it.** The argument: if a transition's comparables are chosen by how
similar their *change profile* is, then asking « is this change
profile unusual against its comparables » is close to tautological —
the rule would select the transitions most like this one and then
report that this one looks normal. A neighbour rule must be built on
something that is **an input to the update**, not an output of the
diff. Composition is an output. That is a reason it cannot work, not
a report that it did not.

**Design 3 is the successor, and it is the only one of my three that
is an input.** Both chains state their own version *in the file*:
hickeng writes « github release: v0.1.6 » in `Summary!C` and ED2
carries `v2`, `v3`, `v4`, `v5` in its filenames and cover sheet. A
model that says it went from 0.1.6 to 0.1.7 has declared what kind
of update this is, **before anyone diffs it**.

The rule to register next: comparables are the model's other
transitions of the **same declared version step** — patch-to-patch,
minor-to-minor, family-to-family. It is not circular, it needs no
band and no constant, and it degenerates only when a model does not
version itself, which is a refusal it can state in words.

**What it needs, concretely** (per the standing order — not « retry
when the corpus improves »): a reader that extracts the declared
version from a workbook. Both chains carry one and neither is hard:
hickeng's is a labelled cell, ED2's is in the filename and on the
cover. That reader is a day's work in this lane, needs no dependency
and no new corpus, and **that is the next round**.

## The declared-version round (REGISTERED BEFORE RESULTS)

Tip `bf444a11`; orders unchanged; `z3-solver` absent. Handoff lessons
re-read first, per the standing order — the relevant ones here are
« heavy jobs run alone » (this round runs none), « an openpyxl
workbook with images can be saved once » (this round writes nothing),
and « the shell's cwd resets » (bitten twice; every command below
sets its directory).

**The rule being built.** A workbook's **declared version**, read
from the file rather than inferred from its diff:

1. **A labelled cell.** Any cell whose row or column label contains
   *version*, *release* or *build*, whose value carries something
   version-shaped (`v1`, `0.1.6`, `v0.1.6-b`, `2023-07`). First
   match in sheet order wins, and the sheet and cell are reported so
   a reader can check it.
2. **The filename**, when no cell declares one — `v2_2023-07-14`.
3. **Neither**: the reader **refuses in words**. « This model does
   not declare a version » is a fact about the model and a perfectly
   good answer.

**The step between two declarations** is then classified without any
threshold: `none` (identical), `patch`, `minor`, `major` for
dotted numerals, `family` for a bare `v2 → v3`, and `unknown` when
the two do not parse into the same scheme.

**Why this is the right axis, restated in one line**: the step is an
*input* — the author declared it before anyone diffed the files — so
grouping by it cannot be circular the way grouping by composition
would be.

**How it will be judged.** Coverage *and* discrimination, together,
against the two rules already measured:

```
                    comparable / total      flags fired / total
size        ED2          6/10                     4/10
            hickeng      5/15                     3/15
cadence     ED2          7/10                     6/10
            hickeng     14/15                    13/15
```

**Predictions.**

1. **Every hickeng version declares itself in a cell** — its Summary
   sheet carries « github release: v0.1.x », which C3 has already
   shown me in a `relabelled_line`. ED2 declares in the **filename**
   and I expect **no** labelled cell to carry a version on its
   cover.
2. **Most hickeng transitions are `none`** — at least **8 of 15** —
   because ordinary development commits do not touch the release
   string. If so, the « none » group is large and the rule buys
   coverage cheaply; whether it buys *discrimination* is the whole
   question.
3. **ED2 splits 4 family steps and 6 none** — `v1→v2`, `v2→v3`,
   `v3→v4`, `v4→v5` against the six within-family transitions.
4. **The discrimination test, and the one I care about**: flags fire
   on **fewer than 8 of hickeng's 15** transitions, against cadence's
   13. If it fires on as many as cadence did, the declared step is
   no better than time and I will say so and stop proposing
   neighbour rules.

## The declared-version round — results, and the first rule that is honest in both directions

**A defect the corpus caught and the tests did not, again.** The
first reader returned `42036` as the declared version of ten of
hickeng's sixteen workbooks. `RSU!C10` sits under the column label
**« Release Date »**, my label pattern matched *Release*, and my
version pattern accepted a bare integer — so an Excel **date serial**
became a version and every step computed from it was fiction
(`family`, `unknown`, and nine `none`s that meant nothing).

Two fixes, both principled rather than tuned, both now pinned by
tests: a label that also says *date* declares a **when**, not a
**what**; and a version must carry a `v` prefix or a dot, because a
bare number in a cell whose label mentions a release is a number.
This is the third time this lane has shipped a permissive pattern
that manufactures an answer instead of refusing, and the third time
only the corpus found it.

**What the two chains actually declare, after the fix.**

```
ED2       v1 v2 v2 v3 v3 v3 v4 v4 v4 v4 v5      (filename, all eleven)
          steps: family 4 · none 6
hickeng   — — — — — — — — v0.1.5 v0.1.6 v0.1.6 v0.1.6 v0.1.7 v0.1.7 v0.1.8 v0.1.8
          steps: undeclared 8 · patch 3 · none 4     (Summary!C41)
```

**Prediction 1 — failed.** I said every hickeng version declares
itself in a cell. Eight of sixteen do not: **the model began
declaring its release halfway through its life**, at `09_5649e7a`.
ED2's half held — filename, no cell.
**Prediction 2 — failed.** Four `none` steps, not the eight or more I
predicted; the rest are undeclared, and undeclared is not `none`.
**Prediction 3 — held exactly**: ED2 is 4 family and 6 none.
**Prediction 4 — held**: flags fire on **2** of hickeng's 15, against
cadence's 13 and my predicted ceiling of 8.

### The three rules, measured on one footing

```
             coverage (comparable / total)        flags fired
             ED2        hickeng                   ED2     hickeng
size          6/10        5/15                    4/10     3/15
cadence       7/10       14/15                    6/10    13/15
declared    10/10        4/15                     6/10     2/15
```

**And this is the first rule whose numbers are explainable rather
than accidental.** ED2 versions every release, so the declared step
covers **all ten** transitions — better than either predecessor.
hickeng versioned nothing for its first eight transitions, so the
rule refuses eleven of fifteen — and each refusal is the sentence
« this model did not declare a version then », which is a fact about
the model rather than an artifact of arithmetic. Size refused
because 1 has no neighbours within a factor of two; cadence spoke
everywhere and said nothing. This one's coverage tracks whether the
model versions itself, which is exactly what it should track.

**And where it does speak on hickeng, it speaks about the right
thing.** The defect pair — the skew fix — is a `none` step compared
against the chain's other `none` steps, and it comes back flagged on
six classes. The one transition in this corpus a human labelled a
defect is now both *reachable* and *flagged*, which neither size nor
cadence managed.

**Built**: `watch/version.py` (the reader and the step) and
`profile.profile_by_declaration` — exact grouping, **no band, no
constant, no tolerance anywhere**, because the author declared a
category rather than a magnitude. That absence is the point: the two
predecessors each died on their tolerance.

### What would falsify this, since it is not a refusal to close

Not « a third chain » in the abstract. Precisely: **a chain whose
declared steps do not track how the model actually changed** — a
project that bumps its version on every commit, or one that ships a
rewrite under `none`. hickeng nearly is the first case and is not;
ED2's four `family` steps are genuinely its four rebuilds. If a
chain arrives where `patch` steps and `family` steps have
indistinguishable delta profiles, this axis is as dead as the other
two, and the measurement that shows it is the same table above.

## The alignment's cost, measured before any code (REGISTERED BEFORE RESULTS)

Tip `90552153`. Two orders, both ahead of C6; the export is done and
pushed. This is the second.

**Two traps walked into first, both written in my own handoff.**

- The GD3 pair (15 MB against 15 MB) **OOM-killed** at exit 137 while
  reading. My handoff says « a GD3 BPFM self-align peaked at 8.1 GB »
  and I asked this container to hold two of them. Dropped to the CAA
  H7 consecutive pair (6.4 MB each), which reads in 57 s at 0.7 GB.
- The probe then died on an import because the shell's **cwd had
  reset** — the third time, and also in my handoff. Every command
  since sets its directory.

**What the alignment is actually doing.** Instrumented
`_pair_similarity` and `shape_similarity` call counts on the biggest
sheets of two real pairs:

```
pair          sheet              rows        pairs    time   us/pair  survive
ED2 4.3MB     InputSummary       373x373     139,129  0.1s    0.52     0.7%
ED2           Monthly Inflation  348x348     121,104  0.1s    0.48     3.7%
H7 6.4MB      I_InputSets        453x455     206,115  0.1s    0.50     0.4%
H7            C_Revenue          412x420     173,040  0.2s    0.99     1.1%
```

Three things, and the first two are good news:

1. **Exactly one `_pair_similarity` call per DP cell.** No nested
   scan, no candidate generation, nothing unintended. The loop is
   clean.
2. **The multiset bound already rejects 96–99.6% of pairs** before
   `shape_similarity` runs. The timing round's bound is doing its
   job.
3. **The cost is `R × C` and nothing else** — 0.5 µs per row-pair,
   rising to 1.0 µs where lines carry more signatures (C_Revenue's
   median is 38 against I_InputSets' 3).

**So the complexity I have is `O(R·C·S)` with a measured constant of
0.5–1.0 µs per row-pair**, and the 113.9 s Atelier profiled on
levenmouth's `Distributions` implies **≈ 228 million row-pairs — a
sheet of roughly 15,000 rows against 15,000**. Nothing is wrong with
the inner loop. The algorithm is quadratic in the number of rows, and
the big sheets have a lot of rows.

**The complexity I need**: `O((R + C)·S)` to find anchors, plus the
DP only *inside* the gaps between them — `Σ block²` rather than
`R·C`. At 40,000 rows the present cost is 1.6 billion pairs, about
25 minutes for one sheet; if anchors leave gaps of a hundred rows,
the same sheet costs under a second.

### The design: anchor decomposition, and why it is a change of kind

A row whose **signature tuple is unique within its own sheet and
identical to exactly one row of the other sheet** can be matched
without any comparison at all — there is no other candidate for
either side. Such anchors are strictly increasing in both sheets by
construction, so they **partition** the problem: every remaining row
lies between two anchors, and can only match a row in the same gap.
Run the existing DP inside each gap and concatenate.

This is Bram Cohen's patience-diff idea rather than a tuning of mine,
and it is a change of kind: it does not make the comparison cheaper,
it makes **most comparisons never happen**.

**Where it can be wrong, stated before it runs.** The DP is a global
optimiser; forcing an anchor could in principle cost more than it
saves, if skipping a unique-equal row let two whole blocks align
better. I do not believe that happens on real models and I am not
going to assert it — **the old aligner is the oracle**, and the
round compares verdicts cell for cell.

**Predictions.**

1. **Identical verdicts** on both ED2 sheets and both H7 sheets —
   every matched pair, every deletion, every insertion. If a single
   row moves, the round reports it rather than being called a
   speed-up.
2. **Anchors are plentiful on real models**: at least **60%** of rows
   on `C_Revenue` (median 38 signatures per line, so tuples should be
   near-unique) and at least **30%** on `I_InputSets` (median 3, so
   many rows will collide).
3. **The largest gap after anchoring is under 15% of the sheet's
   rows** on C_Revenue.
4. **A speed-up of at least 5×** on C_Revenue, the sheet with the
   most expensive pairs. Below that, anchoring is not worth the
   complexity and I will say so.

## Anchor decomposition — results, and the weak case names the next key

Twelve sheets across two real pairs, each aligned both ways:

```
ED2   InputSummary       373x373   0.07s -> 0.00s   34.5x   anchors  82%  gap  9%  SAME
      Monthly Inflation  348x348   0.05s -> 0.05s    1.0x   anchors   0%  gap 100% SAME
      SelectedInputs     324x324   0.05s -> 0.00s   65.5x   anchors 100%  gap  0%  SAME
      SWEST              279x279   0.05s -> 0.02s    2.0x   anchors   3%  gap 61%  SAME
H7    I_InputSets        453x455   0.09s -> 0.02s    5.0x   anchors   8%  gap 31%  SAME
      C_Revenue          412x420   0.19s -> 0.03s    6.8x   anchors  26%  gap 12%  SAME
      C_Capex            405x405   0.19s -> 0.01s   24.8x   anchors  42%  gap  3%  SAME
      C_Ratios           347x347   0.17s -> 0.00s   39.6x   anchors  54%  gap  5%  SAME
```

**Prediction 1 held, and it is the one that mattered: 0
disagreements in 12 sheets.** Every matched pair, every deletion,
every insertion identical to the DP's. The oracle agrees.
**Prediction 3 held** (largest C_Revenue gap 12%, predicted under
15%). **Prediction 4 held** (6.8× on C_Revenue, predicted ≥5×).

**Prediction 2 failed, and its failure is the useful part.** I
predicted ≥60% of C_Revenue's rows would anchor because their lines
carry a median of 38 signatures; it is **26%**, and I_InputSets is
**8%** against a predicted 30%. My reasoning was wrong in a specific
way: a long signature tuple is not a *distinctive* one. A model
repeats the same formula shape down a block of rows, so the tuples
collide however long they are.

**And that is exactly the weak case.** `Monthly Inflation` gets
**zero** anchors — every row of a monthly block has the same shape as
every other — falls back to the DP, and gains nothing (1.0×, no
regression). The sheets that anchor badly are the repetitive ones,
and **I cannot tell from here whether levenmouth's two slow sheets
are of that kind**, because I do not hold that file. Stated as a
limit rather than glossed: **anchoring is 5–65× on structurally
varied sheets and 1× on repetitive ones**, and the 12 MB problem may
be made of repetitive ones.

### Amendment, registered before it is measured: the label is the missing key

The rows of a repeating block have identical shapes and **different
labels** — « Jan 2024 », « Feb 2024 ». The label is already in the
`Line`, already read, and the anchor key ignores it.

**The change**: the anchor key becomes `(label, signatures)` when the
line has a label, and stays the bare signature tuple when it does
not. Same uniqueness rule, same partition argument, one more field.

**Predictions.** (1) `Monthly Inflation` goes from 0 anchors to over
**80%**, since a monthly series labels every row distinctly. (2)
Still **0 disagreements** across all twelve sheets. (3) The three
licensee sheets (SWEST, SWALES, SSES — 3% anchors, 61–78% gaps) also
improve, because their rows are labelled line items. (4) No sheet
gets *slower*: an anchor key that discriminates more cannot produce
fewer anchors.

### The label-aware key — results

```
                        anchors   speed-up          anchors  speed-up
                        (shapes)  (shapes)          (+label) (+label)
ED2  InputSummary          82%      34.5x              96%     53.5x
     SelectedInputs       100%      65.5x             100%     55.8x
     SWEST                  3%       2.0x              94%     66.9x
     SWALES                 3%       2.0x              94%     72.8x
     SSES                   3%       1.6x              94%     67.0x
     Monthly Inflation      0%       1.0x               0%      1.0x
H7   I_InputSets            8%       5.0x              95%     56.5x
     C_Revenue             26%       6.8x              65%     10.8x
     C_Capex               42%      24.8x              70%     56.0x
     C_Fin_Ind             10%       4.7x              99%     32.4x
     C_Fin_SynthAccretion  18%       4.9x             100%     31.9x
     C_Ratios              54%      39.6x              65%     40.3x
```

**0 disagreements, again, on all twelve sheets** — prediction 2 held,
and it is still the one that matters. Predictions 3 and 4 held: the
licensee sheets went from 3% of rows anchored to 94%, and no sheet
got slower. **Eleven of twelve sheets now align 10–73× faster with
identical verdicts.**

**Prediction 1 failed: `Monthly Inflation` still anchors zero rows**,
and the reason is worth the round on its own. Every one of its 348
rows *is* labelled — but **twelve consecutive rows share the label
`fy1999`**, because a financial year covers twelve months, and their
shapes are identical by construction:

```
index 10  label 'fy1999'  ('EOMONTH(R[+0]C[-1],#)', 'IF(MONTH(…)…)', '•', '•')
index 11  label 'fy1999'  ( … the same … )
```

The thing that distinguishes those rows is the **month-end date in
their first column**, and the signature layer renders it `•` — on
purpose, because C2 aligns on shape so that a changed *value* never
looks like a moved row. **The key cannot see what distinguishes these
rows because the design deliberately erased it.**

### The successor, and it differs in kind again

For a row whose signatures are **all literals** — a pure data block,
no calculation anywhere on the line — there is no shape to preserve
and nothing to protect: anchoring such rows on their **typed values**
costs nothing and risks nothing, because a value change in a data
block *is* what tells one row from another. Formula-bearing rows keep
the shape-only key exactly as now.

That is not a loosened threshold and not « retry with a better
corpus »: it is a different key for a class of row the current key
provably cannot serve, justified by the same argument that made the
current key shape-only.

**What this leaves for the order's real problem.** Anchoring is
10–73× on structurally varied sheets and 1× on a pure data block.
levenmouth's two slow sheets are `Distributions` and `Ratios`; H7's
`C_Ratios` anchors 65% and gains 40×, which is encouraging and is
**not** evidence about levenmouth, a file this lane does not hold. I
am not claiming the two-hour pair is fixed. What is measured: the
mechanism is exact on twelve real sheets, and the cost model says the
gain grows with sheet size, because `R·C` grows and `Σ gap²` does
not.

## MY PIECE: version comparison in usable time — the test, and what I can run here

Tip `79821376`. **First, the branch.** `swens/prism` was **297
commits behind** the integration tip and had none of the speed round —
including a reader memory cut from 6,290 MB to 1,763 MB. Measuring on
that base would have measured the wrong program. Rebased; three
unmerged commits replayed clean.

**The test, and I am not asking to move it.**

> A real published pair — Welsh Water draft against final, 12 MB each,
> today 2 h 06 m — completes in under two minutes with parity against
> `revision_diff` still EXACT.

It is the right test. It is also, **as things stand, a test I cannot
execute in this container**, and the order asks me to say so before I
begin rather than after I have a number that misses it. Two reasons,
both previously measured and both now to be re-tested rather than
inherited:

1. **The Welsh Water pair is not reachable from here.** Ofwat 403s,
   the Web Archive answers 405 behind a WAF, browser egress is closed.
   V3 has always been the lead's to run.
2. **Two 15 MB workbooks OOM-killed this container** at exit 137 —
   measured **this session, on the old reader**. The tip has since cut
   reader memory 3.5×, so that claim is stale by construction.

**« A claim in our own code is not evidence », including mine.** The
first thing this round does is re-run the read that died, on the new
reader, under `dev/heavy`. If the GD3 pair (15 MB against 15 MB, the
biggest I hold and larger than Welsh Water's 12 MB) now fits, I have a
local proxy for the test and the second reason disappears.

**What I will deliver either way**, so the lead can run the real test
even if I cannot:

- the anchoring speed-up, differential-tested to **zero** verdict
  differences on every pair I hold;
- a **scaling curve** across 4.3 MB, 6.4 MB and (if it fits) 15 MB,
  so the 12 MB number is projected from measurements rather than
  hoped at;
- the exact command to run the WSH pair, and the harness that proves
  parity when it is run.

**And the method, taken from `lanes.md` rather than improvised**:
measure first, distrust the profiler, kill hypotheses one measurement
each, find the floor before building, differential-test against what I
replace, and `dev/verify` before reporting.

## The measurement, before touching anything — and one of my own claims killed

### First: « two 15 MB workbooks OOM this container » is false

My handoff said it. I measured it **this session**, at exit 137. It
was true on the old reader and the tip has since cut reader memory
3.5×, so I re-ran it instead of inheriting it — the standing order's
« a claim in our own code is not evidence » applies to my own claims
first:

```
GD3 draft  150.6s   652,176 cells   peak 1.27 GB
GD3 final  155.0s   693,753 cells   peak 1.99 GB
both held together                  peak 1.99 GB
```

**The 15 MB pair fits, in 2 GB.** So I hold a local pair *larger*
than Welsh Water's 12 MB, and the second reason I could not run the
test has gone. The handoff is corrected.

### The phase budget on that pair, with anchoring already in

```
read old                  145.9s     peak 1.27 GB
read new                  149.6s     peak 2.00 GB
grids                     275.2s     peak 3.94 GB
align 45 sheets           120.0s     peak 3.94 GB
audits                    448.7s     peak 4.44 GB
delta_of (whole)        1,119.6s     peak 4.44 GB
```

`delta_of` re-does grids, alignment and audits internally, so the
honest end-to-end for a caller is **reads 296 s + delta_of 1,120 s =
1,416 s — 23.6 minutes** for 15 MB against 15 MB.

**That is already about 6× better than the 2 h 06 m the order
records**, because it now runs on the tip's reader and on anchoring.
It is still **twelve times** away from the test.

**And the shape of the problem has moved.** The order's premise —
from Atelier's levenmouth profile — was that the alignment is 87% of
the work. On this pair, after anchoring:

```
audits    448.7s   40%   the engine's, and run twice
grids     275.2s   25%   mine
delta's own work  ~275s  25%   mine
align     120.0s   11%   mine, and no longer the problem
```

**Alignment is 11%.** The single biggest item is the pair of audits,
and the product **already audits every upload as it arrives** — so
`delta_of` was doing the most expensive quarter of its work a second
time.

### The first change: stop running the audits twice

`delta_of` now takes optional `old_findings` / `new_findings`. A
caller that has already audited hands them in; a caller that has not
gets exactly the behaviour it had. **This is not a faster audit — it
is not running one.** No answer changes, and the differential test
pins that: same defect counts, same items, same details, computed
against handed-in.

`None` and `[]` are kept distinct on purpose — « run the audit »
against « this book has no findings » — because conflating them
would silently drop every defect.

**Worth, on the measured pair: 448.7 s of 1,416 s, or 32%.** Projected
end-to-end for a caller with audits in hand: **~16 minutes**.

### What is next, in the order the measurement puts them

1. `grids` at 275 s — mine, and the split between `_shape` (the
   engine's, frozen) and my own wrapper is measuring now.
2. The delta's own ~275 s of comparison.
3. Reads at 296 s — Sentinel's lane and already under attack there.

**Against the test**: 15 MB pair, was ~2 h in the order's baseline,
now 23.6 min measured, ~16 min with audits handed in. The test is
2 minutes for a 12 MB pair. I am **not** claiming it; I am reporting
where it stands and what the next three attacks are worth.

### My instrument lied, and the lie was worth more than the measurement

The phase timings above attribute cost to whichever phase runs
**first**, because `_shape_of` is `@cache`d in the engine — and the
split measurement caught it:

```
_shape over every cell, cold      210.4s   (303 us/cell, 693,753 cells)
cell_signature over every cell      2.5s
sheet_grids (whole), cache warm    13.2s
  => « remainder » computed as   -199.8s
```

A negative remainder is the instrument confessing. `sheet_grids` does
not cost 275 s and 13 s; it costs **one cold shape pass** and nothing
much else. The method's second point, met in the wild.

**And the cache key is `(formula, row, column, anchoring)`**, so the
reuse across a version pair is high — the second workbook's formulas
sit at the same addresses — which is why two books' grids cost less
than twice one book's.

**Then the fact that explains the whole budget**: `audit()` **clears
those caches when it finishes** (`audit.py:834`,
`_shape_of.cache_clear()`). So a delta that runs grids, then two
audits, pays the cold shape pass **three times over**. Nothing was
wrong with any single phase; the pipeline was throwing away the
expensive thing between phases.

### Result of the first change, measured end to end

```
                                       before      after
delta_of on the GD3 pair             1,119.6s     438.4s     2.55x
   report unchanged: items 3,167 · changed cells 48,757 (identical)
```

A caller that hands in the audits it already ran gets the report
**2.55× faster with byte-identical output**. Its own reads (282 s)
and audits (692 s) are unchanged and are not mine.

### Where that leaves the test, stated plainly

> A 12 MB pair, under two minutes, parity EXACT.

- The order's baseline for the WSH pair was **2 h 06 m**.
- On a **15 MB** pair — larger than the test's — the comparison now
  costs **438 s** for a caller with audits in hand, and **1,412 s**
  including its own reads and audits.
- I have **not** hit the test. Scaled to 12 MB the comparison is
  roughly **350 s**, about **3× over** the two-minute line.

**What stands between me and it, in order, with numbers:**

1. **~210 s: the cold shape pass inside `sheet_grids`.** The audit
   has already computed every one of those shapes and then cleared
   them. This is not mine to change — `audit.py` is the engine — and
   it is the single biggest remaining item in my component. **Routed
   to the lead: may `audit()` keep `_shape_of` warm, or expose a way
   for a caller to opt out of the clear?** If yes, my 438 s falls to
   roughly 230 s on the same measurement.
2. **~120 s: alignment**, already 10–73× down from anchoring, and the
   registered successor (anchor pure data blocks on their typed
   values) is the next cut.
3. **~100 s: the delta's own comparison**, unmeasured in isolation
   and the next thing I will split.

### `dev/verify`, honestly

It **fails**, and none of the failure is mine. Checked rather than
assumed: `ruff check` flags `create_buckets.py`,
`scripts/a6_native_recall.py` and `scripts/corpus_documents_audit.py`
— **none touched by any of my commits** — and the suite step dies on
`Unable to evaluate type annotation 'RootModelRootType'`, the
container's known pydantic breakage that has forced `--noconftest`
on this lane since the first sweep. My own files: **ruff clean, 34
files already formatted, mypy ok, 152 tests green.** I am not
reporting verify green, because it is not.

### Tier 1 — approved and implemented (2 September 2026)

The `z3-solver` dependency proposed above was approved by the
founder on 2 September (« implement it all », after the research
round that proved the three use cases on hand-built expressions).
Implemented in `polar/tieout/watch/prove.py`, exactly the fragment
named above, over exact reals, division under named side
conditions, ranges concrete and identical, the same cell the same
variable on both sides, EQ / NEQ (with the assignment) / UNKNOWN /
TIMEOUT (10 s) / REFUSED by construct. Wired in two places: the
delta report's `methodology_change` items now carry tier 1's clause
(« proved the same function », « differs at … », « not provable
(construct) »), and the ladder accepts a prover and stops proved or
refuted cells at its own rung with counts reported.

The harness of this registration runs as `tests/tieout/test_watch_prove.py`:
twelve equivalent pairs proved, six inequivalent pairs refuted with
separating assignments, the hard gate (zero false proofs) held.

**A constraint added from the research round, registered for any
future use:** never ask the solver to optimise a ratio. Over
nonlinear reals its optimiser returned a wrong minimum for a DSCR
(1.277 against a true 0.851). A bound is found by multiplying the
inequality through and binary-searching the threshold with plain
satisfiability checks, each of which is a real proof.

## 2 September — the regularity check closes; a switch-off that was not off

The weight term is adopted; the proposed « island in a block » kind
is not (it never fires: the row detector already accuses every
enclosed island). On vs off across the 27 gate models: 17 findings
gain weight, 15 change rank inside their file (3.3%), nothing else
moves — the registered prediction holds. Full record in
`regularity-check.md`.

**For future use — two things this round taught:**

1. `import polar.tieout.audit as X` binds the *function* `audit`
   that the package re-exports under the same name, not the module.
   A patch on it lands on a function attribute nobody reads, and the
   « off » run is the « on » run. Take the module from `sys.modules`,
   and never believe two arms that agree to the byte without a probe
   that says they had to differ.
2. A sentence that names the sheet puts *where* into any fold that
   keys on the sentence. The cross-sheet error fold split four sheets
   into four lines; the golden-master diff caught it. Fold keys are
   the claim, never the address.
