# A hand-labelled cell diff on one regulator pair — registration, before any code

3 September 2026. The truth-set round ended with a denominator of
zero: no held model carries a cell-level defect label that owes
nothing to the engine (`truth-set.md`, measure 4). This round makes
the denominator the only way it can be made — by reading what a
revision changed, cell by cell, without the engine's flags in view,
and grading the changes by hand.

## The pair, fixed now

Affinity Water's PR24 financial model, draft determination → final
determination (`corpus_pr24dd/AFW-DD-financial-model.xlsx` →
`corpus_regulator/PR24-FD-FM02-Financial-model-Affinity-Water.xlsx`).
The study's own pair, one template, ~414,000 formulas a side.

## The diff, fixed now

Cells are matched by **meaning, not address**: the sheet, the row
label (with its occurrence index within the sheet, because « Total »
repeats), and the column header where the row is a series (the
column letter where it is not). A cell has changed when its formula
shape — the audit's own relative shape, references made relative and
numbers erased — differs between the two versions, or when a formula
became a constant or a constant a formula. A row whose label exists
only on one side is **unmatched** and counted apart. Cells that
merely moved keep their shape and are not changes.

The script (`scripts/cell_diff.py`) writes every changed cell,
grouped by row, and a sample of thirty changed rows drawn with seed
20260903. Sampling is by row, not cell, because one edit filled
across a row is one decision.

## The grading, fixed now

The thirty rows are read **before any engine finding is looked at**,
from the two formulas and the two values only, and graded:

- **fixed** — the draft was wrong and the final puts it right;
- **introduced** — the draft was right and the final is wrong (a
  formula overwritten with a constant, a tail hardcode, a reference
  moved to the wrong row);
- **neutral** — a re-modelling, a re-labelling, a re-sourcing:
  neither side wrong;
- **unreadable** — the two formulas cannot be judged from the cells
  alone.

Only then are the engine's findings on both versions joined to the
graded rows: for each *introduced* row, whether any rule flags one of
its cells at final; for each *fixed* row, whether any rule flagged
one at draft. That is recall on labels the engine had no part in.

## Measures, fixed now

1. **The diff**: matched rows, unmatched rows each side, changed
   cells, changed rows.
2. **The grading**: thirty rows by grade.
3. **Recall**: introduced rows flagged at final / introduced rows;
   fixed rows flagged at draft / fixed rows. Stated with both
   denominators, however small.
4. **The registry**: every fixed and introduced row added as
   independent-real, with the file hash, the cells and the two
   formulas.
5. **Cost**: the diff's wall time beyond the two reads.

## Predictions, registered

- Changed cells between 2,000 and 40,000; changed rows between 200
  and 4,000; unmatched rows under 5% of either side.
- Of thirty rows: at least twenty neutral; introduced between 1 and
  6; fixed between 0 and 4.
- Recall on introduced at or above 50%; on fixed, unknown and
  probably lower — the engine's rules are about the final's shape.
- Cost under one minute beyond the reads.

## Out of scope, named

- One pair. The number will be small and will say so.
- No second reader; the grading is one person's, named.

---

# Results

*(appended after the round; nothing above this line changes)*

## Result — 3 September 2026

**One deviation, made after the first sample was read and before any
grade was written.** The registration said « matched by meaning, not
address » and then defined a change as a different *shape*. The
first run's thirty sampled rows were thirty links whose absolute row
reference had moved with an inserted row (`'Bill Module'!$M$246` →
`$M$247`, the same line): the shape changed, the meaning did not.
The diff now resolves every reference to the meaning key of the cell
it reads on its own side, so a pointer that followed an insertion is
not a change and a pointer that failed to follow one is. Both runs'
counts are given; the sample was redrawn with the same seed on the
second run and graded once.

### Measure 1 — the diff

| | Shape diff (first run) | Meaning diff |
| --- | --- | --- |
| Matched rows | 109,893 | 109,893 |
| Unmatched rows, draft / final | 1,877 / 1,376 (1.7% / 1.2%) | same |
| Compared cells | 672,662 | 672,662 |
| Changed cells | 15,896 | **3,103** |
| Changed rows | 4,043 | **513** |
| of which formula → constant | 14 | **14** |
| Diff time beyond the reads | 20 s | 15 s |

Under the meaning diff the changes are 2,690 constants (inputs and
pasted outputs refreshed between draft and final), 399 formula
meanings, and 14 formulas overwritten with constants. 470 of the 513
changed rows are on the inputs sheet and the pasted-outputs sheet.

### Measure 2 — thirty rows, graded from the cells alone

| Grade | Rows | What they were |
| --- | --- | --- |
| neutral | 27 | inputs and pasted outputs re-entered (WACC, CPIH, opening balances, a switch set from 2 to 1), and two formula rows whose references all moved together with a deleted row |
| unreadable | 2 | links into a sheet where the same label occurs twice and the occurrence number changed (`#1` → `#0`); whether the line is the same cannot be told from the cells |
| **introduced** | **1** | `InpS!F101` « Switch - QAA reward/(penalty) »: a live link to the inputs sheet at draft, a typed `2` at final — while the input it linked to (`F_Inputs!T1586`) was changed to `1` in the same revision. The switch and its source now disagree. |
| fixed | 0 | |

### Measure 3 — recall on the graded rows

| | Flagged | Of |
| --- | --- | --- |
| Introduced rows flagged at final | **1** (`typed-over-formula` at `InpS!F101`) | 1 |
| Fixed rows flagged at draft | — | 0 |

One of one, on a denominator of one; the number is real and it is
small.

**Post hoc, and named as such:** the diff lists every formula
overwritten with a constant, mechanically and without the engine —
fourteen cells in ten rows — and that class is gradable at sight:
each is a live link to the inputs sheet replaced by a typed value.
All fourteen are defects by the study's own standard. Joined to the
engine's findings at final:

| Row | Cells | Flagged at final |
| --- | --- | --- |
| InpS « Switch - Infrastructure renewal expenditure flag » | F53 | no |
| InpS « Switch - Run off rate pre 2025 RCV » | F83 | no |
| InpS « Switch - Run off rate for post 2025 RCV » | F84 | no |
| InpS « Switch - QAA reward/(penalty) » | F101 | **yes** |
| InpS « Switch - Ordinary shares issued » | F214 | no |
| InpS « Switch - Dividend yield » | F225 | **yes** |
| InpS « Switch - Reprofiling » | F284 | **yes** |
| InpS « Ofwat - Base revenue for 2024-25 - real » (WR, WN) | M2024, M2025 | **yes** |
| InpS « Ofwat - Ordinary shares issued - control - nominal » | O2190, Q2190, O2191, Q2191 | no |
| InpS « Ofwat - Dividend yield » | F2207 | no |

**Recall on this class: 5 of 14 cells, 4 of 10 rows.** The misses
are switch cells and small typed blocks whose row carries no series
of formulas beside them, so the typed-over rule has no row pattern to
break; F101, F225 and F284 were caught because the fold down the
switch column found them together. That is a named gap for the
audit — « a link overwritten where the row has no series » — and the
fourteen cells are its test.

### Measure 4 — the registry

Nine independent-real lines added (`truth-set/registry.jsonl`), one
per overwritten row above, with the file hash and both formulas. The
two base-revenue rows were already held as one engine-found line;
its grade rises to independent-real, because the label now owes
nothing to the engine. The registry holds 13 independent-real lines,
of which 11 are cell-level defects in models we hold.

### Measure 5 — cost

Fifteen seconds beyond the two reads (about 100 s each).

### Predictions, scored

- Changed cells 2,000–40,000 — holds under both diffs (15,896;
  3,103). Changed rows 200–4,000 — holds (4,043 at the edge; 513).
  Unmatched under 5% — holds (1.7% / 1.2%).
- At least twenty neutral — holds (27). Introduced 1–6 — holds (1).
  Fixed 0–4 — holds (0).
- Recall on introduced at or above 50% — holds on the sample (1 of
  1); **fails on the full overwrite class** (5 of 14), which the
  registration did not foresee measuring and which is the number
  that matters.
- Cost under a minute — holds.

### What the round decides

1. **The independent denominator exists.** Fourteen cells in one
   pair, labelled by the revision and a reader, owing nothing to the
   rules. The truth-set round's zero is now fourteen.
2. **The engine misses most of them.** Five of fourteen. The class is
   precise — a link to the inputs sheet replaced by a typed value on
   a row with no series — and the fix is a rule that reads the
   revision rather than the row: a cell that *was* a formula in the
   version before is exactly what the Watch can see and the audit
   cannot. That is the next round, and it has its test set.
3. **Meaning, not shape, is the diff.** Thirty of thirty first-run
   changes were addresses following insertions. The pipeline that
   matches findings by name (`revision_diff.py`) was right to; the
   cell diff now does the same.
4. **The sixteen finals share the class.** The truth-set round found
   the switch overwrites in every company's final; this pair shows
   the revision also overwrote share-issue and dividend-yield inputs
   with the numbers the inputs sheet was about to hold. Re-running
   the meaning diff on the other fifteen pairs is mechanical and is
   not done here.
