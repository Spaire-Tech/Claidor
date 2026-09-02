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
