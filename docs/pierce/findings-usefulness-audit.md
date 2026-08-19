# The usefulness audit: are the 1,259 findings worth an auditor's time?

The mentor's question, verbatim: the engine works; are the *remaining*
findings actually useful to a professional auditor? This document is
the protocol, written and committed **before** any finding was judged.
The verdicts land in `findings-usefulness-verdicts.json` and the tally
in the worklog; anything amended after judging began is logged here as
an amendment, not silently rewritten.

## The classes

Judged as a professional model auditor reviewing *this* file — the
published model in front of them, not the product roadmap.

- **A — definitely useful.** The auditor would put this in their
  report or must investigate before signing: probable defects (broken
  references, a total that skips a live input, a structural break, a
  hardcode sitting where the row calculates), and breaches of the
  standards they audit against where the breach could move a number.
- **B — probably useful.** Worth seeing, but needs context or ranking
  to earn its place: hygiene the standards name (volatile functions,
  overlong formulas, typed-over cells that look deliberate), plausible
  constants typed into labelled rows, things a thorough audit lists in
  an appendix rather than the front page.
- **C — noise / false positive.** The auditor would be annoyed: the
  engine mis-read structure, or the flag is true but tells a competent
  reader nothing (a typed input row called a hardcode, a cover-sheet
  date called volatile risk).
- **D — duplicate manifestations.** Individually defensible but N
  findings from **one authoring decision in this file** that should be
  one line (the same constant repeated across a row's columns reported
  cell by cell, one paste reported per cell). D is within one file's
  report; the same defect recurring across the eleven ED2 *versions*
  is not D — a deal shows one version at a time.

One class per finding; where two apply, the more damning of C/D wins
over A/B (the mentor's question is about waste), and A wins over B.

## The sample

- Population: the 1,259 findings in `corpus-golden-master.json`.
- Stratified by (file-family × rule) — 28 strata, so no rule and no
  family is judged only by its loudest member.
- Allocation: every stratum contributes `min(size, max(2,
  round(size × 120 / 1,259)))`; strata of size 1 contribute their 1.
- Drawn by `scripts/usefulness_sample.py` with seed **20260818**;
  the script and the drawn sample are committed, so the draw is
  reproducible and cannot be quietly re-drawn.

## The procedure

For every sampled finding, the verdict is read **from the cells**, not
from the finding's own sentence: the harvester extracts the cell, its
formula, its row label, and a neighbourhood (same row ±4 columns, same
column ±4 rows, formulas and values) from the corpus file, and the
judge writes a one-line reason with each class. No finding is classed
from its description alone.

## Pre-registered reading of the result

- The mentor's bar: "the majority of remaining findings are A/B" is
  the claim under test. The tally is reported whatever it says.
- Per-stratum rates are extrapolated to the population by stratum
  size (a stratified estimate, not a raw sample share), reported with
  the raw counts beside it.
- Every C and D verdict names the rule improvement or collapse that
  would remove it, so the next engine round is the audit's output,
  not a separate wishlist.

## Amendments

- During the pass, three volatile verdicts first marked B (#114, #116,
  #117) were revised to D when later cards showed the same sheet's
  OFFSET idiom recurring row by row in the same files — the group
  membership only became visible across cards. Revised before any
  tally was computed; recorded here per protocol.

## Result (18 August)

Raw sample of 145: **A 12 · B 35 · C 54 · D 44.**
Stratified over the 1,259: **A ≈ 4% · B ≈ 22% · C ≈ 39% · D ≈ 35%.**
The pre-registered bar — a majority of remaining findings A/B — is
**not met**: A+B ≈ 26%. Per-finding verdicts with reasons:
`findings-usefulness-verdicts.json`. The C mass reduces to fourteen
named rule fixes (one reader gap — array formulas read as typed
values — accounts for the largest slice) and the D mass to four
collapse patterns; both lists are in the worklog entry for this
round, each verdict naming its fix.

## The re-measure (19 August)

The fix round implemented every named fix, gated by the golden
master (each corpus diff traced to a named fix; the gate also caught
one regression — an ED2 long-formula flood — and two engine truths
the first sample never touched: a multi-area SUM misread and a
false circular-reference class closed only through INDEX tables,
which Excel does not walk). The population is the regenerated
baseline; this section is the protocol for the second measurement,
registered before any verdict.

- Same classes, same procedure, same allocation formula, same
  judge-from-the-cells rule as above. Nothing re-defined.
- Fresh draw, seed **20260819** — a new seed, because the population
  changed and the old draw must stay reproducible against the old
  baseline. The sampler takes the seed as an argument now; both
  seeds are recorded here.
- Sample: `findings-usefulness-sample-2.json`; verdicts:
  `findings-usefulness-verdicts-2.json`.
- One reading note registered in advance: the fix round *collapses*
  duplicates and *deletes* noise, so the surviving population is
  smaller and each surviving finding stands for more cells. D now
  means a duplicate the collapse layer still misses within one
  file's report, judged exactly as before.

### Amendments (second pass)

- Three verdicts first marked B were revised to D during the pass,
  before any tally was computed: #90 and #92 when the per-debt-block
  «Check» rows of the BPFM F1 sheets showed the same 326-character
  formula repeating at a row beat (the group only became visible
  across cards), and #129 when #131/#132 showed the same
  import-source template on sheet after sheet. Recorded here per
  protocol, as in round one.

### Result (19 August)

Raw sample of 143: **A 13 · B 77 · C 19 · D 34.**
Stratified over the 852: **A ≈ 6% · B ≈ 55% · C ≈ 11% · D ≈ 28%.**
The pre-registered bar — a majority of remaining findings A/B — is
**met**: A+B ≈ 61%, against 26% before the fix round. Per-finding
verdicts with reasons: `findings-usefulness-verdicts-2.json`.

What remains, honestly read:

- The D mass (≈28%) is dominated by a single family the fix round's
  sibling-sheet fold missed by one key choice: Ofgem ED2's typed pool
  opening balances repeat the same layout decision on every DNO sheet
  with *different numbers*, and the fold keys on identical numbers.
  Three named fixes (shape-keyed sibling fold, a column-beat fold for
  repeated check rows, a same-file template fold) cover 30 of the 34
  raw D verdicts.
- The C mass (≈11%) reduces to nine small named skips (basis-point
  label vocabulary, string-concatenation literals, MATCH array
  constants, sentinel 9999, block-header documentation, the mnemonic
  gate in the row pass, unread TODAY cells, below-the-total partition
  coverage, calendar notation), each recorded on its verdict.
- The A mass is small in share (≈6%) but no longer buried: thirteen
  raw A verdicts — torn check rows, displayed errors in shipped
  models, totals stepping over live money, typed-over switch cells,
  one-cell breaks in filled rows — now sit among ~850 findings
  instead of 1,259, and the B mass around them is dominated by real
  formulas the reader could not even see before (array-entered
  blocks), folded to one line each.

## The third measurement (registered 19 August, before any draw)

After the collapse and purify rounds settle the population, the
third measurement changes one thing about the draw, on the mentor's
direction, and it is registered here first:

- **Stratified by detector.** Each rule is guaranteed
  min(rule size, 25) picks, distributed over its family strata
  proportionally with every non-empty stratum contributing at least
  one — so the four inconsistent-row findings are judged whole and
  the hardcode mass cannot crowd out the skipped-cell detector. The
  sampler takes the floor as its fourth argument; a floor of zero
  reproduces the earlier draws exactly.
- **Reported per detector.** The tally is published as a
  useful/noise/duplicate table *per rule*, alongside the stratified
  whole-population estimate. The question graduates from « is the
  report useful » to « which detector is excellent and which still
  needs work ».
- Classes, judging procedure, and amendment discipline are unchanged.
- Seed for the third draw: **20260820**. Sample:
  `findings-usefulness-sample-3.json`; verdicts:
  `findings-usefulness-verdicts-3.json`.

### Result (19 August, third measurement)

Raw sample of 191: **A 33 · B 131 · C 13 · D 14.**
Stratified over the 669: **A ≈ 8% · B ≈ 83% · C ≈ 4% · D ≈ 5% —
A+B ≈ 91%**, against 61% after the fix round and 26% at the start.
No amendments this pass. Per-finding verdicts with reasons:
`findings-usefulness-verdicts-3.json`.

The per-detector table (raw counts; stratified A+B beside it):

| Detector | n | A | B | C | D | A+B raw | A+B stratified |
|---|---|---|---|---|---|---|---|
| hardcode-in-formula | 50 | 4 | 40 | 2 | 4 | 88% | 87% |
| long-formula | 44 | 0 | 44 | 0 | 0 | 100% | 100% |
| error-value | 25 | 6 | 16 | 3 | 0 | 88% | 87% |
| volatile | 25 | 0 | 25 | 0 | 0 | 100% | 100% |
| skipped-cell | 24 | 14 | 2 | 8 | 0 | 67% | 67% |
| typed-over-formula | 19 | 5 | 4 | 0 | 10 | 47% | 47% |
| inconsistent-row | 4 | 4 | 0 | 0 | 0 | 100% | 100% |

Honestly read, the residue is concentrated and named:

- **typed-over-formula** carries over half the D mass in one family:
  I_Series row 218 has five adjacent columns typed over `=X212` in
  one gesture, in both H7 PCM files, reported cell by cell. Fix:
  fold varying-value typed runs of 4–7 into one finding (today the
  engine folds identical values and singles, not short varying runs).
- **skipped-cell**'s C mass is entirely the documented index-factor
  limitation (the omitted row is the multiplicative factor the block
  reads); the eight C verdicts name no new fix — a general skip was
  weighed and rejected in Round 2 because it pins judged-A totals.
- **error-value**'s three C are the two documented limitations
  (end-of-sheet marker tails, market-calendar gaps in daily series).
- **hardcode**'s four D are one ED2 pool-balance family whose
  members escape the sibling fold only by literal shape (`#`,
  `#+#`, `#+-#`); fix: normalise shapes before keying the fold. Its
  two C name two small fixes: number-words documentation (a label
  saying « half » documents 0.5) and walking the block-header search
  up to the nearest header instead of a fixed three rows.
