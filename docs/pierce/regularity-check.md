# The regularity check — registration, before any code

2 September 2026. The founder's research agent built and ran
ExceLint (Barowy, Berger, Zorn — OOPSLA 2018, Apache-2.0) and
recommended not embedding it but porting its one idea: a formula is
suspicious in proportion to how much it breaks the rectangular
regularity of the references around it. The founder said « implement
it all ». This is the registration; the code comes after it.

## The idea, in our vocabulary

We already compute a **shape** for every formula (references made
relative, numbers erased) and we already accuse a cell whose shape
differs from its row's family. What we do not do is weigh the
accusation by the *size and tidiness of the region it breaks*. A
lone different cell inside a 20 × 30 block of one shape is a strong
signal; a different cell at the edge of a ragged 3-cell run is a
weak one. Today both raise the same finding with the same weight.

ExceLint's score is the information gained by « fixing » the odd
cell: how much simpler the map of rectangular regions becomes if
that cell took its neighbours' shape. The port here is the same
measure over our shapes:

1. On each sheet, tile the formula cells into maximal rectangles of
   one shape (row-major greedy tiling, deterministic).
2. For each formula cell, ask: if this cell took the shape of the
   largest rectangle touching it, how many rectangles would the
   tiling lose? That count, weighted by the area of the region it
   would join, is the cell's **regularity score**.
3. A cell scores only when the region it would join has at least
   `REGION_MIN` cells (registered: 6) and the cell's own region has
   at most `ISLAND_MAX` cells (registered: 2).

## Amendment, before any measure ran (2 September, later the same day)

Reading the row detector before writing the code: its exemptions are
*positional* — the ends of a series may differ, the first forecast
period reaches back to actuals, a seed reads an anchor. To inherit
them without re-deriving them, **the new kind is raised only for an
island enclosed on at least three of its four sides by the same
one-shape region.** *(Corrected the same hour, before any measure:
three sides admits an island on a block's top or bottom row, which
is an edge; enclosure means all four.)* An island on a block's edge is never accused by
this check; the row detector already judges edges under its own
rules. The weighting term is unchanged by this amendment.

## Amendment 2, before any measure ran (2 September, same day)

Step 1 said maximal rectangles. Building it showed that a row-major
rectangle tiling fragments the block *around* an island into several
rectangles, so an island in the middle of a tidy block touched four
different regions on one side each and was never « enclosed ». A
block is therefore the **connected component** of cells sharing one
shape (four-neighbour), which is what a reader means by the word.
The score, the thresholds and the enclosure rule are unchanged.

## What it changes and what it does not

- It **does not add a rule**. It adds a term to the weight of
  existing `inconsistent-row` and `inconsistent-anchoring` findings,
  so a break inside a large tidy block ranks above one in a ragged
  edge. Findings that already exist keep existing; their order may
  change.
- It **may add findings** of one kind only: a formula island inside a
  large one-shape block on a *column* family, which the row-family
  rules do not see today. These arrive as `inconsistent-row` with
  `kind="island in a block"`, and the grammar's exemptions apply to
  them unchanged.
- It never fires on typed values; ExceLint's number-in-a-formula-
  block class is our `typed-over-formula`, already built and measured.

## Measures, fixed now

1. **Golden master.** Every finding that changes rank or appears is
   traced to this check by name; nothing else moves.
2. **Planted recall.** Twenty islands planted by XML surgery into
   blocks of one shape across five lab models (four per model),
   ground truth written first: share found.
3. **Clean-model silence.** Zero new findings on the believed-clean
   set.
4. **Usefulness of the new kind.** Every new « island in a block »
   finding on the 27-model corpus judged from the cells, A/B/C/D;
   A+B must be at or above the engine's 80% bar or the kind is not
   adopted (the weighting term can still be).

## Predictions, registered

- The weighting term reorders under one finding in twenty on the
  lab corpus and changes no verdict.
- Planted recall on islands above 90%: they are the easy case.
- The new kind produces fewer than ten findings on 27 models, and
  at least one C, which will be a designed edge (a total row
  entering a block, or a first-period seed).

## Source

ExceLint-core, `github.com/ExceLint/ExceLint-core`, read for the
idea only; no code is copied. Cite the OOPSLA 2018 paper in anything
that reports the number.

---

# Results

*(appended after the round; nothing above this line changes)*

## Result — 2 September 2026

**The weight term is adopted. The new kind is not.**

### What was run, and where it deviated from the registration

- **Blocks are components, not rectangles** (amendment 2 above).
- **Enclosure is four sides**, not three (the correction to
  amendment 1).
- **Hosts.** The registration said five lab models; the believed-clean
  set and the round-4 planting hosts (NZCC, Damodaran, Ofwat CA101)
  are not held in this container. Substituted: the two CAA H7
  indexation models, two Ofgem ED2 versions, and the RIIO-3 WACC
  model — all in the gate corpus. Named here, not hidden.
- **Plants.** The registration said twenty islands planted into
  blocks of one shape. The planter that exists plants the round-4
  classes at any filled-row site (`scripts/plant_defects.py`); the two
  island-shaped classes — a displaced reference and a flipped
  operator — were planted at up to four sites per class per host,
  seed 20260902. That is a recall measure on the existing detectors
  with the block term on, **not** the registered island-in-a-block
  measure, and the number below is read that way.
- **Silence set.** The believed-clean three are not held; the 22
  close models (`corpus_sft`) and the 27 gate models stand in.

### The numbers

| Measure | Result |
| --- | --- |
| 2 — planted island-shaped defects (50 sites, 5 hosts) | **34 caught (68%)**; 20 of the 34 carry the block term in their basis. Caught by: displaced reference 17, flipped operator 11, the column-family rule 1, other rules 5 |
| 3 — silence, the new kind | **0** island-kind findings on the 27 gate models; **0** on the 22 close models |
| 4 — usefulness of the new kind | nothing to judge: it never fired |

### Why the new kind never fires, and why that is right

An island enclosed on four sides by a one-shape block sits in a row
of at least three formulas with the island interior — which is
exactly the row detector's own definition of a series with a
departure. So every enclosed island is already accused by the row
detector, and the kind is redundant by construction. The check was
right to defer to it (« one situation, one finding »), and the
measured zero says the deferral is total. The kind's code is
removed; `regularity.islands` stays as the input to the weight term.

### Measure 1 — the golden master, traced line by line

The 27-model gate was re-swept with the final engine and diffed
against the committed baseline (`corpus-golden-master.json`, last cut
at A3 candidate 4). Every difference is named here; the regularity
term accounts for **none** of them, which is what the registration
required of it.

| Rule | Baseline | Now | Cause |
| --- | --- | --- | --- |
| long-formula | 246 | 24 | The one-line fold from the consequence round: a file's long formulas are one finding, not one per formula. 222 lines folded into the 24 that remain. |
| skipped-cell | 24 | 26 | The fold key now includes the rows a sum misses. Two RIIO-3 draft PCFM fills (`RAVBalances!AH75`/`AP75`, `RAVBalances!Y42`/`AH42`) skip different rows in different periods and are reported as two situations each, not one. |
| error-value | 47 | 46 | Two effects of the sheet-level sentence being rewritten. (a) **A regression, found by this diff and fixed before the baseline was cut:** the new sentence opens with the sheet's name, which put *where* into the cross-sheet fold's grouping key, so one `#VALUE!` at A1 on four sheets of the RIIO-3 ET3 BPFM split into four lines. The fold now keys on the claim without the name; a test holds it. (b) The cell count moved out of the sentence into the figure, so the GT3 BPFM's `PCFMInterface_TO!A1` (two cells) now folds with the four one-cell sheets — five sheets, one line. |
| every other rule | 363 | 363 | Same findings at the same cells. Every sentence changed, because the house-style rewrite and the consequence clauses landed after the baseline was last cut; the fingerprint includes the sentence on purpose. |

The regenerated baseline is committed with this round; its git diff
is the review artifact, per `corpus-golden-master.md`.

### A measurement error, caught before it was reported

The first « check off » sweep was not off. It patched the weight term
out with `import polar.tieout.audit as module; module.X = …` — and
the package re-exports the *function* `audit` under the same name, so
that import binds the function, not the module, and the patch landed
on a function attribute nobody reads. Both sweeps ran the same engine
and agreed to the byte, which looked like « the term is inert on real
models ». The probe that caught it: the row findings on the CAA and
RIIO-3 models sit at one-cell islands beside 6- to 38-cell blocks,
which the term must bump, so an identical result was impossible. The
switch-off now takes the module from `sys.modules`, and a built-file
check shows the term moving a break's weight from 0.9 to 1.0 when it
is on and not when it is off. The on-vs-off numbers below come from
the corrected run only.

### The prediction, scored

- Weighting reorders under one finding in twenty and changes no
  verdict — **holds.** See « on vs off » below: 15 of 461 findings
  (3.3%) change rank inside their file; no tier, severity or sentence
  moves.
- Planted recall above 90% — **not measured as registered** (see
  Plants above); the substitute measure is 68% on the existing
  detectors, which is the round-4 classes' recall, not the island's.
- Fewer than ten new-kind findings with at least one C — **zero**,
  which is under ten and carries no C.

### On vs off — the term's own effect on the 27 gate models

The corrected switch-off sweep against the final engine, same code,
same corpus, same hour:

| | Result |
| --- | --- |
| Findings compared | 461 (identical sets; the gate diff is clean, finding for finding) |
| Weight moved | 17, all `inconsistent-row`, by 0.01 to 0.08 |
| Rank moved inside a file | 15 (3.3%) |
| Tier, severity or sentence moved | 0 |

Where it moved: the CAA H7 models' displaced references in `C_Ratios`
(a 20-cell block), `C_Tax` (24) and `C_RABDepr` (6); the RIIO-3 BPFMs'
breaks in `MainInputs`, `Depn` (0.9 → 0.98, the largest block) and
`Revenue`. Each is a one-cell island beside a block of one shape, as
the probe that exposed the first sweep's error had said. The row
findings that did not move sit beside runs under six cells
(`C_Index!F93`, the GD3 PCFM's `TaxPools!AU98`) or already carry the
top weight.

**What a customer sees differently:** nothing new appears and nothing
disappears; a break inside a large tidy block now ranks a little
above the same break beside a ragged run, and its basis says so.
