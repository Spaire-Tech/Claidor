# A3 candidate 2 — family-edge typed cells: the registered round

The mining round's second adopted candidate (`custodes-mining.md`,
verdict 2), through the same loop: registered here before the
detector is implemented, before any plant is made, before any result
is looked at. The evidence class: a constant typed at the head or
tail of a same-shape run — `Table II.5!E17/F17` hold −0.556/−0.539
where B–D compute `=AVERAGE(…)`; `Q3 FY04!B132` holds 0.09 where C–E
compute `=+{col}76`. The typed last period over a computed row is
the classic late-adjustment defect, and the engine's interior
typed-over pass — which demands a formula on *both* sides — cannot
see it by construction. The mining's own warning travels with the
round: this check needs the historical/forecast boundary guard, so
typed actuals never flood.

## The claim the check makes

A row run whose members share one formula shape is one calculation
dragged across periods. A lone constant sitting at that run's edge,
in line with it, is the series ending in a typed number — either a
late manual adjustment nobody wrote down, or an actual that belongs
to the typed past. The check flags the first and must never flag the
second; every guard below exists for that line.

## The detector (fixed now, implemented after)

Row direction only in this round — the column-direction analogue is
candidate 4's question, per the mining verdicts.

Inside the row pass's existing run machinery (same runs, same
spacer rule, same shapes): a **family-edge typed cell** is a cell
with no formula, holding a number, adjacent to the head or tail of
a stretch of **at least 3** same-shape formulas at the run's edge —
and on the typed cell's far side, nothing: the run ends (row ends
or a real gap follows). Up to **2** adjacent typed cells at one
edge are the evidence class's own shape (E17/F17); they are one
authoring event and fold into one finding with both cells named.
Three or more adjacent typed cells are a data region, not an edge.

**Guards, each registered before any measurement:**

1. *The boundary guard, asymmetric on purpose.* A typed cell on the
   **head** (left) side is flagged only when the sheet has a
   detected historical/forecast boundary and the cell sits at or
   right of it — on a sheet with no boundary, head-typed cells are
   skipped entirely: typed actuals lead rows from the left, and the
   mining explicitly rejected flagging the typed-meets-computed
   boundary. A **tail** (right) typed cell carries the flagship
   claim and is eligible everywhere.
2. *The series must be a series.* The existing over-time test —
   labelled columns must name periods; absent labels prove nothing
   either way — exactly as the row pass already applies it.
3. *Lone, in both axes.* The typed cell must not sit in a vertical
   stack of constants (the existing stacked test — a parameter
   column is data), and the counter-seed exemption applies as in
   the interior pass.
4. *Zero is scaffolding.* A typed 0 at an edge is a template's
   spare cell, the mining's own template-of-zeros rejection —
   skipped.
5. *No double claim.* A cell already reported by the interior
   typed-over pass or the island pass keeps that finding.

**The finding.** Rule `typed-over-edge`, severity `error`, ref =
the typed cell (the outermost when a pair folds, both in the
roster). Detail: the typed number, which end of the series it sits
on, and the calculation the series does — the same voice as the
interior pass. Catalogue entries in `RULE_NAMES` (« Values typed
over a series' edge »), `HEADLINES` (« Typed series edge »), a
`plain_words` sentence, and elevation confidence **0.7** — one
flank is the weakest witness in the typed-over family, and the
grade says so.

## The measurement (fixed now)

**Precondition.** The candidate-1 adoption sweep of 26 Aug is the
current engine's fresh 27-file sweep on this machine, gate clean
against the committed baseline — it stands as this round's
precondition unless the engine moves before measurement.

**Planted recall.** Harness: `server/scripts/planting/family_edge.py`,
committed with this registration. Same three hosts as candidate 1 —
the registered reuse rule: they are the corpus's family-rich files
and the planter's eligibility logic decides sites, not the reader
of any finding. Seed **20260826**. XML surgery: the edge cell's
`<f>` element is removed and its cached `<v>` kept, so the cell
becomes exactly what the defect is — a value where the formula was.
Cells without a cached value are ineligible and reported as such.

- *Eligibility:* a row run of **4+** same-shape formulas (
  harness-local shape: references relativized to the holding cell,
  numbers erased — mirrors the engine in spirit, decides nothing
  outside the harness) whose head or tail cell has empty space
  beyond it, and whose edge cell holds a cached numeric value that
  is not 0.
- *Classes:* **edge-tail** (the run's last formula replaced by its
  cached value) and **edge-head** (the first). Up to 5 sites per
  class per host, one plant per family, no two plants sharing a row
  or column on one sheet.
- *Truth before the engine:* (host, class, ref, before formula,
  kept value) written before any planted file is read.
- *Caught:* ref or roster, reported per class as caught-by-any-rule
  and caught-by-`typed-over-edge`.

**False-positive price.** The full 27-file sweep with the detector
live, diffed against the baseline; every line hand-read with a
worth-showing / noise verdict written from the cells.

## Adoption criteria (fixed now)

1. The gate diff contains only `typed-over-edge` additions — any
   existing finding that moves refuses the round.
2. Every new finding hand-read; at least two-thirds worth showing;
   no file gains more than 5.
3. The **edge-tail** class must be caught in the majority by the new
   rule. Edge-head recall is reported but does not gate: the
   boundary guard is *designed* to suppress head findings on
   boundary-less sheets, and a suppressed head plant is the guard
   working, telling us its price.
4. The tieout tests stay green. On adoption with corpus additions,
   `corpus-golden-master.json` is regenerated **in the same
   commit**; on refusal the detector does not land.

## Prediction (written before running)

Edge-tail plants are caught by `typed-over-edge` wherever 3
same-shape formulas survive and the guards' own conditions hold;
some edge-head plants are silenced by the boundary guard on sheets
without a detected boundary, and that suppression is reported as
the guard's price, not hidden. On the unplanted corpus the check
stays quiet — these are dragged regulator templates — but quieter
is not promised: any real typed edge it finds on the corpus is
hand-read like everything else, and the flood line decides. No
existing finding moves.

---

## Results (appended after the registration, never edited into it)
