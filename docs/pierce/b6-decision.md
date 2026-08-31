# Piece 8 — does root-cause diagnosis (B6, Reiter) earn its keep?

*Registered 31 August 2026, before a single number below the
« Result » heading existed. This round settles an argument with a
measurement, and the honest answer may be no.*

## The question, and the decision rule already on the record

`swens-plan.md` (fifth amendment, founder-relayed, 27 Aug) holds B6:

> if real regressions break one or two rules, blame-the-changed-cell
> wins and Reiter is over-engineering; if they break many, B6 is
> exactly right — the Ofwat run decides.

So the decision quantity is: **how many mined rules does one real
authoring decision break?** B6 (Reiter minimal-diagnosis +
spectrum-based fault localisation) is a machine for collapsing *many*
broken rules into *one* explanation. If a regression breaks zero, one
or two rules, there is nothing to collapse and the cell diff already
names the culprit.

## What the audit established before this registration

1. **B5 is built and its stable rule sets are committed with cell
   references** (`logs/dynamo/round4-h7fds.json`: 11 rules,
   `round4-h7fp.json`: 17). They pass both stability gates on the
   product's own typing (`c6-stability.md`, 31 Aug). Two limits stand
   on the record: the rules are **not modeller-recognisable**
   (duplicate calculations and boundary conditions, 3 and 7 distinct
   sentences), and the label identity **cannot tell one year from
   another** (14 of 144 watched cells carry a column label).
2. **The narrowing that already exists (B4's) is measured**: 43
   narrowings, 0 misses, 32 exact-to-one-cell (`logs/dynamo.md`,
   27 Aug). The single measured case one run cannot localize (a
   constant pasted into a total: a hit of size 3) is the only recorded
   gap B6 would close in the perturbation setting.
3. **The registered Ofwat run cannot run from this container.**
   Probed today: `ofwat.gov.uk` answers 403 to the direct PR24 file
   URLs and to the determinations page; the National Archives replay
   route returns a « Human Verification » captcha page (405). This is
   the same blocker `worklog.md` recorded for Prism's container. The
   16 PR24 pairs and the 84 verified regressions
   (`revision-defect-results.md`) exist as a record, but the files
   themselves need a human browser — the AER situation again.
4. **Even with the files, mining a PR24 model is out of one
   container's budget today**: each FM02 model carries ~413k formulas;
   the C6 stability round cost 32,879 s for ~2,200 runs on a 100 KB
   model (~15 s/run), and a run's cost is a full `calculateAll()`.
   B5 has never produced an informative rule set on anything larger
   than the H7 pair; ED2-scale typing exists but RoE-scale coverage
   collapses are on the record. The only models B5 can mine
   informatively **today** are `h7-fds` and `h7-fp`.

## The substitute measurement, named as a deviation

The amendment's measurement (rules broken per regression, over the
real PR24 84) is replaced this round — deviation stated in writing,
per the standing rules — by the same decision quantity measured on
the models B5 can actually mine, using the PR24 study's **verified
regression classes verbatim**:

- **Class A — formula overwritten with a constant** (Yorkshire's 40
  cells: `=IF(F_Inputs!J1142="",0,F_Inputs!J1142)` →
  `0.5248991766742258`).
- **Class B — manual adjustment hardcoded into a formula tail**
  (Severn Trent's `N1885`: `…-0.490096707821704` appended). The
  planted constant is the study's own `0.490096707821704`.

The known bias, stated up front: these are designed plants, and the
plant sites are chosen **adversarially in B6's favour** (the cell
that touches the most rules — Reiter's best case). A « no » from this
round is therefore a strong no *on everything minable today*; it is
not a claim about rule sets that do not yet exist.

## Measurement 1 — the rule graph's field of view (static, no machine)

For each H7 file: read the workbook with the engine reader, take the
committed round-4 stable rule set, and for every cell `c` in the
workbook compute **R(c)** = the number of stable rules with at least
one term inside `c`'s downstream dependent cone (`c` included). R(c)
is a **ceiling** by reachability — a defect at `c` cannot break more
than R(c) rules, and may break fewer (a defect reaching both sides of
an equality breaks nothing).

Reported: the share of cells with R = 0 (cells where B6 is blind to
any regression, however bad), the distribution, and max R —
separately for formula cells and constant cells. Known edge carried
over: the reader caps range expansion at 200 cells, so a cone through
a larger range can under-count; recorded if it bites.

**Bar, fixed now**: if fewer than **25%** of the model's cells can
break even one rule, B6 cannot be the primary diagnosis instrument on
today's rule sets, whatever the counts say.

## Measurement 2 — live regressions, real classes (the machine)

On each H7 file, with typing, families and perturbation exactly as
round 4 (E2 inferred, constrained families legal, same bands):

| plant | site (chosen by rule, not by hand) | class |
|---|---|---|
| a1 | the rule-term cell with the highest R(c), ties alphabetical | A: formula → its stored constant |
| b1 | the same cell | B: tail hardcode `-0.490096707821704` |
| c1 | the alphabetically-first watched formula cell with R(c) = 0 | B |

Plus one **clean control** per file: the unplanted workbook under the
same runs.

Per plant: **40 perturbed runs, seed 7** (control: seed 8), each run
recalculated by `UnoCalculator`; every committed stable rule is then
checked (`Rule.holds`) against every kept run. A rule counts as
**broken** when it fails in more than half the kept runs;
broken-in-any is reported beside it. Typing is taken from the clean
file (a regression does not change what the model's inputs are).
Tolerances are the lane's standing ones and may not move. Runs
dropped for engine errors are counted, never data; a round with more
than 10% drops is unreliable, not scored.

**The attribution check**: for every plant, diff the planted file
against the clean one, cell by cell (formulas). Report how many cells
differ and whether the diff alone names the planted cell.

## The verdict rule, fixed before any number

- **Broken-count**: per the amendment, 0–2 distinct broken rules per
  plant at B6's *best-case* site → blame-the-changed-cell wins and
  B6 is over-engineering on today's rule sets. « Many » is fixed at
  **≥ 5** distinct broken rules that the cell diff cannot attribute.
- **Attribution**: if the one-line cell diff names the planted cell
  exactly in every broken case, a diagnosis layer adds nothing here.
- Both must point at B6 for a « build it » verdict; either pointing
  away is a « not now », and the conditions that would reopen it are
  written in the verdict.

## Predictions, registered before any run

1. **Field of view is small**: fewer than 20% of all cells on
   `h7-fds` have R ≥ 1, and max R ≤ 6 (the 11 rules are 3 sentences
   sharing cells, so the ceiling should saturate well below 11).
2. **a1 and b1 break between 1 and 4 distinct rules** on `h7-fds`,
   1 and 6 on `h7-fp` — under the amendment's rule, the
   over-engineering side, even at B6's best-case site.
3. **c1 breaks zero rules** — the typical cell's regression is
   invisible to the rule set entirely.
4. **The clean controls hold every rule in every run.** If any rule
   fails on the unplanted file, the harness is defective and the
   round stops there.
5. **The cell diff names exactly one changed cell — the planted one —
   in every plant**, so changed-cell blame needs no diagnosis layer
   on top.
6. **Something in the harness misbehaves once and a control catches
   it.** Registered every round; it has happened every round.

## What this round does not decide

A rule set that were someday dense and modeller-recognisable — the
thing the AHA's round-1 gate is still waiting for — could change the
distribution, and the PR24 run (files in hand, a machine that can
afford it) remains the measurement the amendment actually asked for.
The verdict below is about building B6 **now**, on the rule sets the
product actually produces.

---

# Result

*(nothing below this line existed at registration)*
