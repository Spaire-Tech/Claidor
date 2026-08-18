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

- (none yet)
