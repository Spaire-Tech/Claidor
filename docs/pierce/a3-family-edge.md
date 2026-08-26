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

**Planting (26 Aug):** 23 planted of 30 drawn — the harness refused
shared masters and cells without a cached value, recorded per site
in the truth files.

**Planted recall (26 Aug):**

| class | planted | caught (any rule) | by typed-over-edge |
|---|---|---|---|
| edge-tail | 15 | 15 | 5 |
| edge-head | 8 | 4 | 0 |
| **overall** | **23** | **19** | **5** |

Run to ground, catch by catch: the ten tails and four heads caught
under `typed-over-formula` are the **island pass** seeing the same
cell from the orthogonal direction (« typed into a column that is
otherwise calculated ») plus one interior catch across a bridged
gap — and the registered no-double-claim dedup then rightly kept
this rule silent there. All four head misses verified at the cells:
`boundary: None` on every one — the asymmetric boundary guard's
registered suppression, the predicted price, no bug. The new rule's
own territory is the cells no other pass can see, and there it went
**5 for 5**: every tail with no column witness was caught by
`typed-over-edge` and nothing else.

**False-positive price (26 Aug):** ten new findings across six BPFM
files (1–3 per file, under the flood line), every one hand-read at
the cells, and every one the same authoring pattern: **a typed 1 at
the head of an index series**. `MainInputs` rows head cumulative
`PRODUCT(1+…)` indices with their typed base-period 1; one deflator
chain (`=AU466/(1+AU530)` walking right) *reads* its typed 1 — the
horizontal seed, literally; the Cadent pair heads a DNO-average
index row whose base periods are 1 by construction. Ten of ten are
correct index-base authoring. Noise.

## Round-1 verdict (26 Aug): REFUSED, twice over, by the registration's own criteria

Criterion 2 fails: zero of ten corpus findings are worth showing.
Criterion 3's letter also fails — 5 of 15 tails by the new rule —
and the examination shows the letter measured the wrong
denominator: the registration's own no-double-claim guard hands any
cell the island or interior pass sees to that stronger witness, so
« majority of all tails » counts exactly the cells this rule is
built to leave alone. The two clauses of one registration pull
against each other; recorded as written, not argued away.

## Round 2, registered now, before it is measured

Three changes, nothing else:

1. **The identity guard**: the zero exemption widens to a typed
   value of 0 or ±1 at either edge — the multiplicative identity is
   how an index row spells its base period, witnessed ten of ten on
   this corpus. A genuinely typed-over 1 goes unreported; the
   quietness is the product, and the cost is stated.
2. **The horizontal seed guard**: a typed edge cell that the
   adjacent stretch formula *reads* (the typed cell among its
   precedents) is the series' own starting value whatever its
   number — the vertical counter-seed exemption, turned 90°, the
   `AU466` deflator witnessed live.
3. **Criterion 3, re-registered with the denominator the dedup
   implies**: the edge-tail class must be caught in the majority by
   `typed-over-edge` **among tails no other rule catches** — the
   marginal recall, which is this rule's actual territory. This
   round's measurement of that number: 5 of 5.

**Prediction (written before running):** the ten corpus findings
vanish and the gate diff is empty. Planted marginal recall holds at
5 of 5 — the one planted tail whose kept value is exactly 1
(`C_Index!BJ49`) is silenced by the identity guard, and it was
never in the marginal set (the island pass catches it). Any other
corpus difference, or any marginal-recall drop, refuses round 2.

---

## Round-2 verdict (26 Aug): ADOPTED — the prediction held exactly

**The decisive sweep: gate clean.** All 27 files report identically
to the committed baseline, finding for finding — the ten index-base
findings are gone, nothing else moved, no new finding appeared.

**Planted recall, re-measured:** identical to round 1 in every
cell — tails 15 of 15 caught engine-wide, heads 4 of 8 with every
miss the boundary guard's registered suppression, and the
re-registered criterion 3 met at its measured maximum: **5 of 5**
tails that no other rule catches are caught by `typed-over-edge`.

Against the criteria: (1) the diff is empty; (2) zero new corpus
findings; (3) marginal edge-tail majority — 100%; (4) the
conftest-free tieout tests green (424 passing, 11 of them this
check's). **Adopted.** Like candidate 1, the check ships quiet on
this corpus and earns its keep where a model's series genuinely
runs out in a typed number with no column to testify — the cells
every other pass is structurally blind to.

**On the baseline:** untouched — no corpus report changed, so there
is nothing to regenerate; the same-commit rule binds the day one
does.

**Carried forward, named:** the identity guard's stated cost (a
genuinely typed-over 1 or 0 goes unreported); heads on
boundary-less sheets are invisible by design; the harness could not
plant into shared-formula masters, so master-edge recall is
unmeasured; row direction only — the column analogue is candidate
4's question.
