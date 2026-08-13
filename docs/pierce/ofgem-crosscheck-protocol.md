# Pre-registered pass criteria: Finance Annex ↔ GD-BPFM crosscheck

Written **before reading the result**. The linker run (1,234 document
figures against 146,274 workbook candidates) was still computing when
this file was committed — the git timestamp is the proof. Twelve
figures is a small ground truth and it would be tempting to grade
generously after the number arrives; this is the grade sheet decided
beforehand.

## The ground truth (hand-built earlier, from the Finance Annex text)

Twelve figures the document states with plain-vocabulary names, all of
which exist in the BPFM's subject matter:

1. Risk-free rate 2.30% (p45)
2. Total market returns 6.9% (p45)
3. Equity beta 0.83 (p45)
4. Equity beta 0.74 — ET (p45)
5. 20-year ILG 2.21% (p46)
6. Asset beta 0.375 (p54)
7. Debt beta 0.075 (p54–55)
8. Notional gearing 60% (p55/77)
9. Notional gearing 55% (p55/77)
10. Cost of equity allowance (real) 6.12% (p77)
11. Cost of debt allowance (semi-nominal) 4.56% GD&GT (p77, also p13)
12. WACC allowance (semi-nominal) 5.18% (p77)

Caveat recorded now: some of these may genuinely not exist as labelled
cells in the GD-BPFM (the WACC parameters may live in a PCFM or be
inputs without prose labels). A target that is *hand-verified absent*
from the model after the fact is removed from the denominator — absence
of the answer is not a miss. Every removal must name the search that
failed to find it.

## The grades

- **R — recall**: of the targets present in the model, how many did the
  linker connect to a correct cell (hand-verified: the cell genuinely
  holds that quantity)?
- **V — volume**: total proposals made across all 1,234 figures.
  Twelve-of-twelve inside ~40 proposals is a product;
  twelve-of-twelve inside 900 is not.
- **P — sample precision**: 20 proposals sampled at random (all of
  them if fewer than 20), hand-adjudicated. A proposal is correct when
  the linked cell is genuinely the quantity the document states.
- **D — drifts**: every claimed disagreement is hand-checked
  individually. A false drift is the most expensive answer this
  product can give and is graded more harshly than a missed link.

## The thresholds, decided now

- **Pass**: R ≥ 75% of present targets, AND P ≥ 70%, AND no false
  drift in D, AND V such that the proposals are individually readable
  (≤ ~150 — a proposal list nobody can read is noise whatever its
  precision).
- **Investigate** (neither pass nor fail — name the causes finding by
  finding): R between 50% and 75%, or P between 50% and 70%, or
  1–2 false drifts with identifiable causes.
- **Fail**: R < 50% of present targets, or P < 50%, or false drifts of
  a shape that would have embarrassed a banker, or V in the hundreds
  with low precision.

Whatever the grade, the causes get named individually in the accuracy
backlog — the number without the autopsy is not a measurement.
