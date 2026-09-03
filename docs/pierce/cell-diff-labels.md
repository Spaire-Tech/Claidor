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
