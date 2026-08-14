# Pre-registered protocol: the closed-deal test

Written and committed **before the files exist**. The founder is out
finding a real closed-deal financial model, ideally published alongside
the contract it implements. Neither of us has seen the pair yet — the
git timestamp on this file is the proof. Whatever arrives tonight gets
graded by this sheet, unmodified, the same way the Ofgem crosscheck
was.

## What is being tested

Two legs, graded separately:

1. **The audit leg** — the model checked by itself. Does the engine
   surface findings a model auditor would bill for, without drowning
   them in noise?
2. **The grounding leg** — the contract checked against the model.
   This is the harder and more valuable claim: that a figure stated in
   the deal's own document can be found, matched to its cell, and
   confirmed or contradicted. The founder's words: a model somebody
   closed a deal with, against the contract it is supposed to
   implement, is the only way to test grounding rather than mechanics.

## Procedure, in order

1. **Ground truth first, run second.** Before the linker touches the
   pair, the contract is read by hand and a target list is written
   down: every figure the contract states in plain vocabulary that a
   model implementing it should contain (rates, payment amounts,
   percentages, term lengths stated as figures). Each target gets a
   page reference. Only then does the crosscheck run.
2. **Absence is verified, not assumed.** A target the model genuinely
   does not hold as a cell is removed from the recall denominator —
   with the search that failed to find it named, exactly as the Ofgem
   protocol required.
3. **Every proposal is adjudicated by hand** (all of them if ≤20, a
   random 20 otherwise). Every claimed disagreement is adjudicated
   individually, no exceptions.
4. **The audit leg is graded on adjudicated findings**: material
   findings (a typed-over value, a hidden divergence a buyer would
   care about) counted against noise, by hand.

## The grades (crosscheck leg — thresholds carried over from the
## Ofgem protocol, decided there before any result existed)

- **Pass**: R ≥ 75% of verified-present targets, AND sample precision
  ≥ 70%, AND no false drift, AND volume ≤ ~150 proposals.
- **Investigate**: R 50–75%, or precision 50–70%, or 1–2 false drifts
  with identifiable causes.
- **Fail**: R < 50%, precision < 50%, an embarrassing-shape false
  drift, or volume in the hundreds with low precision.

## The grades (audit leg)

- **Pass**: at least one hand-verified material finding OR a clean
  bill on a model hand-checked to deserve one; noise (findings a
  reader dismisses in under a minute) below half of everything shown.
- **Fail**: material findings missed that a hand pass catches, or
  noise drowning the signal.

## Declared limitations, written down before they can become excuses

The engine reads figures, not legal drafting. Stated now, so that
tonight they are predictions rather than alibis:

- Numbers written as words (« five million pounds ») are not read.
- A defined term used at a distance from its value (« the Base Rate »
  defined forty pages earlier) will not carry the value to the
  mention.
- Indexation formulas stated as prose (« adjusted annually by CPI »)
  have no single cell to match.
- A contract stating a *mechanism* rather than a *figure* is out of
  scope for the grounding leg and is not counted as a miss.

Misses of these shapes go in the backlog as named future work, not in
the denominator. Misses outside these shapes count in full.

Whatever the grade, causes get named individually in the accuracy
backlog. The number without the autopsy is not a measurement.
