# A3 candidate 4 — column-direction typed-over: the registered round

The mining round's fourth adopted candidate (`custodes-mining.md`,
verdict 4), which is a *verification* candidate: « verify the
current typed-over detector's orientation against these misses; if
row-biased, extend to column families — per-entity column models
are real. » Registered here before any plant is made or result
looked at. Round 1 changes no code: it measures what the engine
already catches in the column direction, by planting; only a gap
the measurement names becomes an extension, in its own registered
round with the full gate.

## What the engine already has, mapped before measuring

The column direction is the island pass (`_typed_islands` /
`_island_findings`): typed islands inside strictly-adjacent
vertical runs, witnessed by an edge formula whose shape repeats in
the column, with the mnemonic, seed and block-height guards — and
one guard whose orientation is the question this round asks:
**every island row must hold a formula to the left of the typed
cell**, the typed-history test for a row-major model (history =
constants first in the row). A column-major model — entities
across, time down — puts typed cells in columns whose rows hold no
formula to the left, and the mining's own evidence
(`Q3 FY04!F121`, a typed row-total above `F122 =SUM(B122:E122)`)
is exactly that shape. The prediction below names it; the plants
decide.

## The measurement (fixed now — round 1 plants, it does not patch)

**Harness:** `server/scripts/planting/column_typed.py`, committed
with this registration, `--scan` mode built in from the start (the
candidate-3 lesson). Same strip surgery: the formula element
removed, the cached value kept; shared masters and arrays refused.

- *Eligibility:* strictly-adjacent vertical all-formula runs of
  **5+** cells sharing one harness-local shape, whose planted
  member keeps a cached numeric value that is not 0 or ±1 (the
  uniform site rule since candidate 2). Per site the harness also
  records **left-formula** — whether the planted cell's row holds a
  formula left of it — because the guard under examination keys on
  exactly that, and the analysis must be able to see it.
- *Classes:* **col-interior** (a mid-run member, formulas above and
  below), **col-top** (the run's first cell, nothing above),
  **col-bottom** (the run's last cell, nothing below). Up to 5
  sites per class per host, one plant per run, no two plants
  sharing a row or a column on one sheet.
- *Hosts:* the three candidate-1 hosts by the reuse rule; if all
  three are unplantable, the corpus-wide scan picks new hosts; if
  the corpus has none, the candidate-3 precedent applies and the
  verdict is written as unmeasurable.
- *Seed:* **20260828**. Truth before the engine, one planting run
  per host. Caught = ref or roster, per class and per
  left-formula stratum, with the catching rule named.

**Round 1 runs no corpus sweep**: the engine is untouched, so there
is no report to gate. The candidate-2 adoption sweep remains the
last certification; the next engine change's precondition sweep
re-certifies, as the protocol already provides.

## The decision rule (fixed now)

A class or stratum caught in the **majority** by the engine as it
stands is verified covered — recorded, no code moves. A class or
stratum missed in the majority names the extension: what guard or
pass fails, written from the misses run to ground, and the
extension becomes **round 2** — registered before implementation,
measured by re-running these same plants plus the full
false-positive sweep, gated, baseline regenerated in the same
commit on adoption. No extension ships from round 1.

## Prediction (written before running)

Interior and edge plants whose rows hold formulas to the left are
caught by the island pass in the majority. Plants in
left-formula-free strata — the column-major shape — are missed in
the majority, because the history guard reads them as typed
history; if the hosts offer few such sites, the scarcity is
recorded, not padded. The row passes catch nothing here (vertical
runs cross their grain), except where a planted cell happens to sit
in a horizontal family too.

---

## Results (appended after the registration, never edited into it)

**Planting (26 Aug):** 45 of 45 drawn sites planted across the
three hosts, seed 20260828 — vertical formula families are
everywhere in these models, unlike the beat lattices.

**Round-1 verification (26 Aug):**

| class | planted | caught |
|---|---|---|
| col-bottom | 15 | 15 |
| col-top | 15 | 14 |
| col-interior | 15 | 12 |
| **overall** | **45** | **41 (91%)** |

By the stratum the round exists to examine: **left-formula rows
40 of 41 caught (98%)** — the island pass owns the column direction
where models are row-major. **No-left-formula rows: 1 of 4** —
missed in the majority, the sample small because these hosts *are*
row-major (recorded, not padded). Every miss run to ground at the
cells:

- `C_Capex!F294` and `Inflation!B151` (interior) and
  `C_Performance!F167` (top): all three suppressed by the
  **left-formula history guard** — no formula sits left of the cell
  in its row, so the guard reads the typed cell as history. The
  predicted row-major bias, confirmed three of three. (F167 was
  first misread against the wrong twin host and the plant blamed;
  re-examined in the right file the plant took cleanly and the
  guard is the suppressor — the error and its correction both
  recorded.)
- `Inflation!E211` (interior, left-formula present): suppressed by
  the **seed exemption** — the stripped cell sits mid-chain where
  the formula below reads it and continues, indistinguishable from
  a rebase seed. A designed guard's stated cost, not a defect.

**Verdict, by the registered decision rule:** the column direction
is verified covered for left-formula strata (all three classes in
strong majority); the no-left-formula stratum is missed in the
majority and **names the extension**.

## Round 2, registered now, before it is implemented or measured

**The extension, scoped precisely:** for an **interior** island
only — one with a formula above and below inside the same
strictly-adjacent run, a repeating witness shape at its edge — the
left-formula history test is waived: a typed cell sandwiched
vertically between same-shape formulas is not how typed history is
laid out in any orientation, and the sandwich itself is the
anti-history evidence. Top and bottom islands keep the guard
unchanged: column-major models genuinely put typed history at the
top of columns, and waiving it there is the flood the guard exists
to prevent — `C_Performance!F167`'s class stays a named limitation.
All other island guards (witness, mnemonic, seed, block height)
stand.

**Measurement:** the precondition sweep of the unchanged engine
runs now (the next formal certification rides it, per the lead's
note). After the change: the three planted files re-audited, and
the full 27-file sweep diffed against the baseline.

**Adoption criteria (fixed now):**

1. Every gate difference is one of exactly two things, hand-read
   and verified: a new `typed-over-formula` finding at an interior
   island a left-formula guard suppressed before, or an existing
   typed fold absorbing such cells (island findings carry the
   interior rule, so folds may legitimately grow). Anything else
   refuses.
2. No file gains more than 5 findings; at least two-thirds of new
   findings judged worth showing from the cells.
3. The two interior no-left-formula plants (`C_Capex!F294`,
   `Inflation!B151`) are caught on re-audit; `E211` (seed) and
   `F167` (top) are predicted to stay missed, and staying missed is
   the guards working, not a failure.
4. Tieout tests green, with new tests pinning both sides of the
   waiver; on adoption with corpus changes the baseline regenerates
   in the same commit.

**Prediction (written before running):** both interior
no-left-formula plants are caught; the corpus gains few or no
findings — interior islands suppressed *solely* by the left-formula
guard need a typed cell vertically sandwiched in a repeating
family with no left formula, which in row-major regulator templates
is rare; whatever appears is hand-read and the flood line decides.

---

## Round-2 partial results (27 Aug — checkpoint; the verdict is NOT
## yet decided, honestly labelled)

**Precondition: gate clean** — the pre-waiver engine's fresh 27-file
sweep matches the committed baseline finding for finding (this is
also the formal certification the lead's gate note was waiting on).

**Planted recall, re-audited with the waiver live: 42 of 45.**
`Inflation!B151` — the only plant suppressed *solely* by the
left-formula guard — is now caught, the waiver doing exactly what
it claims. Still missed, each run to ground:

- `C_Capex!F294`: **criterion 3's letter refuses here**, and the
  examination corrects this round's own record: the run's formulas
  each pin their own absolute row (`I_InputSets!R253C[+0]`,
  `R254`, …), so **no shape repeats and the island witness can
  never fire** — verified shape by shape at the cells. The round-1
  diagnosis stopped at the first failing condition (the left guard
  does fail there) and missed that the witness fails too; F294 was
  never recoverable by the registered change. This is the
  pre-existing « no two shapes match » blind spot round 4 named,
  not the guard. The mistaken attribution and its correction are
  both on the record.
- `C_Performance!F167` (top island) and `Inflation!E211` (seed):
  predicted to stay missed; they did — the guards working as
  designed.

**The decisive sweep is complete on disk but its diff is not yet
read** — checkpoint ordered before the comparison ran. The per-file
counts already show movement (`final_wacc` 13 → 15), so the diff,
the hand reading of every line against criteria 1–2, and the
adopt-or-refuse decision — with criterion 3's letter-refusal and
the examination above weighed in the open — are all still owed.
Nothing is claimed for round 2 yet.
