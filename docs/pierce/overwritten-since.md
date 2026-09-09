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

## Result — 3 September 2026

**Three deviations from the registration, named.**

1. *What counts as a link.* The registration said « a plain link to
   one cell ». Every one of the Affinity pair's fourteen overwrites
   was Ofwat's blank-guarded form, `=IF(x="",0,x)`, which reads one
   cell twice and nothing else — under the registered test none of
   them would have said where it came from. A link is now a formula
   whose every reference is the same single cell.
2. *The sentences.* The sentence gate (`test_findings_read_well.py`)
   holds every rule to a headline and a detail that do not repeat
   each other, read under the founder's bar together, and say what
   the fact costs. The wrong-switch rule of the round before had
   never been through it, and its headline used « sibling », a banned
   word. Both rules were rewritten to pass: the headline names the
   fact (« holds a typed 2 where the version before held a formula »),
   the detail the consequence (« The cell it used to read now holds
   1, so this one will not follow it »). The wrong-switch finding's
   detail changed with it, and the golden master is recut for that
   one line.
3. *The record.* The audit's own abstentions now reach the run
   record beside the statement checks' — registered above as a fix,
   done here. `broken-aggregation` appears on the fixtures' checks
   lists as « could not run » for the first time, which it always
   was.

### Measure 1 — the test set

| | Found | Of |
| --- | --- | --- |
| Registered cells (`pr24-afw-inps-*`, 14 cells) | **14** | 14 |
| Registered rows | **12** | 12 (the registration's table wrote 10, grouping the two base-revenue rows and the two share-issue rows) |
| Other cells flagged on the pair | **0** | — |

Every finding carries the previous formula and, for the single-cell
rows, what the source holds now: on `InpS!F101` « The cell it used
to read now holds 1, so this one will not follow it » — the case the
round was built on, said by the engine.

### Measure 2 — the other fifteen PR24 pairs

| Pair | Rows | Cells | | Pair | Rows | Cells |
| --- | --- | --- | --- | --- | --- | --- |
| Anglian | 11 | 27 | | South Staffs | 14 | 24 |
| Hafren Dyfrdwy | 15 | 40 | | Severn Trent | 31 | 103 |
| Northumbrian | 12 | 32 | | Thames | 24 | 72 |
| Portsmouth | 11 | 28 | | United Utilities | 26 | 74 |
| South West | 31 | 103 | | Welsh | 13 | 37 |
| SES | 47 | 207 | | Wessex | 20 | 68 |
| South East | 20 | 68 | | Yorkshire | 28 | 112 |
| Southern | 35 | 131 | | | | |

Ten rows drawn with seed 20260903 from the 338, read by hand: **10 of
10 genuine** — every one a link from the model's inputs sheet
(`InpS`) to the regulator's inputs sheet (`F_Inputs`), replaced at
final by typed values: switches, base revenue, reprofiling revenue,
share issues, the capitalised-revenue proportion. One of the ten has
already drifted from its source: Thames' base revenue for 2024-25
holds a typed 45.21 where the cell it used to read now says 45.79.
The other single-cell row in the sample (Thames' share-issue switch)
still agrees with its source, and the finding says so.

### Measure 3 — the GD3 pair

10 rows, 59 cells. All ten read by hand; **10 of 10 are formulas
typed over**, which is the registered criterion, so the prediction
« fewer than half genuine » fails — and fails because the criterion
cannot tell a deliberate re-sourcing from an overwrite. A second
reading, post hoc and named as such, of what a reviewer would make of
them:

| What the draft had | What the final has | Rows | A reviewer's reading |
| --- | --- | --- | --- |
| Interpolated inflation forecasts (`=0.75*(prev)+0.25*(next)`) | typed forecasts | 2 | re-sourced inputs |
| Cadent capitalisation rates as the average of four networks | typed 0.25 / 0.7 / 1 | 3 | re-modelled — worth a question |
| Network innovation allowance as `=6.2/10`, `=11.8/5` | typed 2.43, 3.696 | 3 | a typed number over a typed number — the draft was already a hardcode |
| Scenario cap rate `=SUM(TIM!…)/5` across 20 cells; a user-defined switch | typed 0.7; typed 0.65 | 2 | overrides |

The rule is right that every one of them stopped following its
inputs. Whether that was a decision is the reviewer's to say, and
the finding hands them the previous formula to say it with.

### Measure 4 — the founder's model

One version held. The rule abstains: « This is the first version we
hold; the check needs the one before. » Zero findings.

### Measure 5 — cost

| | |
| --- | --- |
| The rule alone, Affinity pair (279,199 typed cells matched) | 3.5 s |
| The rule alone, GD3 pair | 1.0 s |
| Reading the previous version's stored cells in the product | not measured here; the light read is the cost, 4.0 s on 470,594 cells (`repository.cells_for_graph`, measured 28 August) |

### Predictions, scored

- Measure 1: 14 of 14 cells — **holds**; 10 of 10 rows — holds as 12
  of 12 (the registration miscounted rows, not cells); other cells
  0–5 — holds (0).
- Measure 2: every pair flags something — holds; 3–40 cells per pair
  — **fails**, eleven of fifteen pairs are above 40 (24 to 207); at
  least 8 of 10 genuine — holds (10).
- Measure 3: under 200 cells — holds (59); fewer than half genuine —
  **fails** under the registered criterion (10 of 10), for the reason
  given.
- Measure 4: holds.
- Measure 5: under 20 s — holds (3.5 s).

### What the round decides

1. **Recall on the cell-diff class is 14 of 14**, from 5 of 14. The
   nine misses were cells no row rule could see, and the version
   before sees all of them. This is the first rule in the audit that
   reads anything but the file in front of it.
2. **The class is common, and it is the regulator's own practice.**
   Every Ofwat final pastes between 24 and 207 typed values over the
   draft's inputs links. A firm that revises its own model the same
   way will see the same volume, and the finding's second sentence —
   whether the source has moved — is what separates the paste that
   still agrees from the one that no longer does. The volume is a
   fact about the models, not a false-positive rate; the ten read by
   hand were ten overwrites.
3. **The rule cannot see intent.** A forecast typed in place of an
   interpolation is a decision; a switch typed in place of its link
   is a defect; the rule reports both the same way, with the previous
   formula as evidence. That is the honest scope, and a reviewer who
   accepts a finding once has the ruling carried forward on every
   re-check like any other.
4. **The product wiring is the Watch's own resolution** — same
   lineage, same deal, the highest lower ready version — and the
   rule abstains by name on a first upload. The Overview's checks
   list now carries the audit's abstentions as well as the statement
   checks', which it should have since the A4 round.
