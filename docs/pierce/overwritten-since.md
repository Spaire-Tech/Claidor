# A formula in the version before, typed over now — registration, before any code

3 September 2026. The cell-diff round (`cell-diff-labels.md`) left
fourteen independent labels on one pair — links to the inputs sheet
at draft, typed values at final — and the engine found five. The
nine misses share one shape: the row has no series of formulas
beside the cell, so no row rule has anything to compare it with. The
one thing that does know the cell was a formula is the version
before. This round writes the rule that reads it.

## The claim, fixed now

A cell holds a typed value in this version, and the cell that
*means the same thing* in the version before held a formula. Then
the formula was typed over between the two versions. The finding
names the previous formula, and — where that formula was a plain
link to one cell — what the linked cell holds now, so a reviewer can
see at once whether the typed value has already drifted from its
source (`InpS!F101` in the Affinity pair: a `2` typed over a link to
an input that now says `1`).

**Means the same thing** is the cell-diff round's key, carried into
the engine unchanged: the sheet, the row's label, the occurrence of
that label within the sheet counted top-down, and the column's
header where the row is a series (the column letter where it is
not). A cell is matched by that key, never by its address, so a row
inserted above it does not turn every link below into a change. A
row whose label exists on one side only is unmatched and outside the
rule.

Only cells in the number grid count — a label-column formula
replaced by text is the reader's business, not this rule's — and
only a typed value that is present: a cell emptied is the Watch's
« emptied cell », a different event.

What it is not: a formula that became a different formula (a
re-modelling, the Watch's « methodology change »); a typed value
that became a different typed value (« moved assumption »); a
constant that was a constant. None of those is this rule's.

Severity is error, weight 0.85: a live formula replaced by a number
is wrong however the model is used, and the evidence is the file's
own history rather than a pattern the engine inferred. It sits below
the wrong-switch rule (0.9), whose evidence is a like-shaped sibling
in the same file, and above the typed-over rule (0.8), whose
evidence is the rest of the row.

## Where it runs

An audit rule, `formula-overwritten`, folded one finding per row of
this version with the cells as the roster, in the « Embedded
hardcodes » family beside `typed-over-formula`. It needs the version
before, so:

- `audit(book, previous=...)` takes the earlier workbook; the rule
  runs after the row rules and before the folds, and its findings
  are elevated, flowed and sorted with everything else.
- In the product, the audit run and the version-scoped read resolve
  the model's previous ready version in the same lineage
  (`repository.previous_version`, the Watch's own resolution) and
  read its stored cells. The rule reads rows, never files, like the
  rest of the audit.
- With no earlier version the rule **abstains by name**: « This is
  the first version we hold; the check needs the one before. » The
  Overview's checks list shows it under « Could not run » with that
  sentence. **Named, and fixed here because it is wrong as it
  stands:** the audit's own abstentions were never carried into the
  run's record — only the statement checks' were — so a rule with
  nothing to walk read as « Ran and found nothing » on the checks
  list. They are carried from this round on.
- House rules can switch it off like any rule; the settings screen
  lists it from the catalogue.
- The golden master does not change: a single-file sweep has no
  version before, so the rule abstains on every corpus file.
- Check a model (one file, no deal) has no version before and shows
  the abstention.

## Measures, fixed now

1. **The test set**: the Affinity pair, draft → final. The fourteen
   registered cells in ten rows (`truth-set/registry.jsonl`,
   `pr24-afw-inps-*`): found / not found, cell by cell. Every other
   cell the rule flags on the pair, read by hand and graded genuine
   (a link or formula typed over) or not.
2. **The other fifteen PR24 pairs**: findings per pair (rows and
   cells); ten rows drawn with seed 20260903 across the fifteen and
   read by hand, graded the same way.
3. **One RIIO-3 pair**: the GD3 business-plan model, draft → final,
   where the truth-set round found the final *added* structure.
   Findings; ten rows with the same seed, read by hand.
4. **The founder's model**: one version, so the abstention and its
   sentence, and zero findings.
5. **Cost**: the rule's time beyond the two reads on the Affinity
   pair, and the time to read the previous version's stored cells in
   the product on a model of that size (the light read, measured at
   4 s on 470,594 cells, is the expected figure).

## Predictions, registered

- Measure 1: **14 of 14 cells, 10 of 10 rows.** Other cells flagged
  on the pair: between 0 and 5 — the cell diff found exactly
  fourteen formula-to-constant changes among matched rows, but the
  engine's key is built from each cell's stored row label rather
  than the reader's row-words table, and the two can disagree on a
  handful of rows.
- Measure 2: every pair flags something — the truth-set round found
  the switch overwrites in every company's final — between 3 and 40
  cells per pair; of the ten rows read, at least 8 genuine.
- Measure 3: under 200 cells on the GD3 pair; of the ten rows read,
  fewer than half genuine — new structure at final will produce
  typed inputs where the draft had placeholder formulas, and that is
  the class the rule cannot tell from an overwrite without a person.
  Stated so the number can fail.
- Measure 4: abstention shown, zero findings.
- Measure 5: under 20 s beyond the reads on the Affinity pair.

## Out of scope, named

- A typed value that equals what the formula would have produced is
  still flagged: the link is gone, and the next input change will not
  reach the cell. The finding says whether the source has moved yet.
- Matching across a renamed row is not attempted; a relabelled line
  is the Watch's item, and this rule will miss an overwrite on it.
- The Watch's delta report already lists « a live formula became a
  typed constant » as a review item, computed on request from the
  files. This rule is the same fact as a *finding* — with a ruling,
  a fingerprint, a place on the model page — computed from stored
  rows at every audit. The two are not reconciled here; the delta's
  alignment is by row similarity, this rule's by label, and where
  they disagree on a pair is a later measurement.
