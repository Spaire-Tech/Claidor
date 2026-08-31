# A3 candidate 3 — beat families: the registered round

The mining round's third adopted candidate (`custodes-mining.md`,
verdict 3), through the same loop: registered before the detector is
implemented, before any plant is made, before any result is looked
at. The evidence class: a family that computes on a stride —
`=1-C30` at C and E with text between (`Table II.4!F31`),
`=MAX(B6:C8)` at B, E and H in column pairs (`01sumdat CO!C11`) —
with the constant sitting on a beat position. Financial models
produce these lattices as value/% pairs and split-year layouts; the
row pass's runs bridge one spacer column and no more, so a stride-3
family is invisible to it today, and a stride-2 family over text is
too. The collapse layer already hears vertical beats when it folds
typed islands; this round teaches the *detector* the horizontal
lattice.

## The claim the check makes

A row whose formulas repeat one shape every k columns is one
calculation laid out on a stride — the k−1 columns between carry
labels, percentages of their own family, or nothing. A typed value
sitting on an interior beat position, with the family computing on
the stride to both sides, is the same defect the interior pass
catches on dense rows: a value where the series calculates.

## The detector (fixed now, implemented after)

A new pass after the edge pass, rule `typed-over-beat`, strides
**k ∈ {2, 3}**, rows only. For each row and stride, the columns of
one residue class form a lattice; a **virtual run** is a maximal
chain of lattice positions each k apart, every position holding a
cell. The interior typed-over discipline transposes onto the
virtual run whole: the calculated must outnumber the typed; only an
interior typed cell with a formula on both stride-neighbours is
judged; at least one flanking shape must repeat in the virtual run;
and the run must read as over-time.

**Guards, each registered before any measurement:**

1. *The lattice must be real.* In the spans either side of the
   typed cell — the k−1 columns between it and each stride
   neighbour — no formula may carry the flanking family's shape: a
   dense run wearing a stride is the plain row pass's territory,
   not a lattice.
2. *The boundary guard*: nothing left of a detected
   historical/forecast boundary, as in the interior pass.
3. *The identity guard*, carried forward from candidate 2's
   evidence up front: a typed 0 or ±1 is scaffolding or a base
   value, skipped.
4. *Stacked and counter-seed exemptions*, exactly as the interior
   pass applies them.
5. *No double claim*: a cell already reported by any typed-over
   rule (interior, island, edge) keeps that finding — this pass
   runs after all three.

**The finding.** Rule `typed-over-beat`, severity `error`, ref =
the typed cell. Detail: the typed number and the stride —
« typed into a series that computes every k columns » — with the
family's example formula, the same voice as the interior pass.
Catalogue entries in `RULE_NAMES` (« Values typed into a strided
series »), `HEADLINES` (« Typed beat »), a `plain_words` sentence,
elevation confidence **0.7**: a lattice is inferred layout, one
grade below a dense run's own pattern.

## The measurement (fixed now)

**Precondition.** The candidate-2 adoption sweep of 26 Aug is the
current engine's fresh 27-file sweep on this machine, gate clean
against the committed baseline — it stands as this round's
precondition unless the engine moves first.

**Planted recall.** Harness:
`server/scripts/planting/beat_families.py`, committed with this
registration; same three hosts by the registered reuse rule; seed
**20260827**; XML surgery identical to candidate 2's (the formula
element removed, the cached value kept; shared masters and arrays
refused).

- *Eligibility:* an all-formula beat lattice of **4+** same-shape
  members (harness-local shape, as before), stride 2 or 3, whose
  between-columns hold no formula of that shape, with an
  **interior** member whose cached value is numeric and not 0 or
  ±1 — a plant must not feed the registered identity guard its own
  witness, and choosing sites that pass the guards is site
  eligibility, stated here.
- *Classes:* **beat-2** and **beat-3**, up to 5 sites per class per
  host, one plant per lattice, no two plants sharing a row or a
  column on one sheet. A host with no eligible lattice for a class
  is recorded as unplantable there, not padded.
- *Truth before the engine*, caught = ref or roster, reported per
  class as caught-by-any-rule and caught-by-`typed-over-beat`.

**False-positive price.** The full 27-file sweep, diffed against
the baseline; every line hand-read with a worth-showing / noise
verdict written from the cells.

## Adoption criteria (fixed now — the marginal denominator from
## candidate 2's lesson, registered up front this time)

1. The gate diff contains only `typed-over-beat` additions; any
   existing finding that moves refuses the round.
2. Every new finding hand-read; at least two-thirds worth showing;
   no file gains more than 5.
3. Of the planted beats **no other rule catches**, the new rule
   must catch the majority, pooled across both classes; per-class
   numbers reported alongside.
4. The tieout tests stay green. On adoption with corpus additions
   the baseline regenerates in the same commit; on refusal the
   detector does not land.

## Prediction (written before running)

Planted interior beats are caught by `typed-over-beat` wherever the
lattice survives the plant and no orthogonal pass claims the cell
first — the island pass will claim some, as it did for candidate 2,
and those are its rightful catches. On the unplanted corpus the
check stays quiet or nearly so: regulator templates mostly lay
series dense; any finding it does raise is hand-read and the flood
line decides. Eligible stride-3 lattices may prove scarce on these
hosts — scarcity is recorded, not padded. No existing finding
moves.

---

## Amendment (26 Aug, before any scan result is looked at)

The three registered hosts are **unplantable for both classes** —
the harness found zero eligible lattices in all three; recorded,
not padded, per the registration. Amended before measuring
anything further: the harness gains a `--scan` mode (the same
mechanic as candidate 1's host scan — it counts eligible sites and
reads no finding), the scan runs over the whole 27-file corpus, and
the hosts become the up-to-three files with the most eligible
sites, ties by name. If the whole corpus is unplantable, the round
stops there: a recall this corpus cannot measure is not vacuously
satisfied, and the verdict is written as unmeasurable — with the
detector's fate decided in the open, not defaulted.

## Results (appended after the registration, never edited into it)

**Planting on the registered hosts (26 Aug):** zero eligible sites
in all three — beat-2 and beat-3 alike. The CAA and Ofgem templates
lay their series dense; the corpus-wide scan under the amendment
runs next.

**The corpus-wide scan (26 Aug):** zero eligible sites in **all 27
files**, both classes. The beat layout the mining round witnessed —
value/% pairs, split-year lattices — is a habit of the CUSTODES
corpus's general spreadsheets that these regulator templates simply
do not have: they lay every series dense.

## Verdict (26 Aug): UNMEASURABLE — the check does not ship

By the amendment's own clause, the round stops: the corpus cannot
plant a single beat defect, so the check's catch rate cannot be
measured here, and a recall criterion is never satisfied vacuously.
The decision, in the open rather than defaulted: `_typed_beats`
stays in the codebase behind its six unit tests — the mechanism is
real and the synthetic fixtures prove it — but it is **not wired
into the audit**: an unmeasured check does not report to anyone.
The engine's reports are unchanged from the candidate-2 adoption by
construction (the only change since that certified sweep is
additive, uncalled code, plus this unwiring); the next round's
precondition sweep re-certifies as always.

**For a future round, the case written now:** the check becomes
measurable the day the corpus grows files with strided layouts —
the round-4 unseen corpus's general-spreadsheet families, or a
pilot's real deal models. Wiring it then is one line plus the full
loop: planted recall, false-positive price, gate. Routed to the
lead via the log.
