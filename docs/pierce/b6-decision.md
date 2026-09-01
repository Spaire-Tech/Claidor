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

# Result — 31 August 2026

*(nothing below this line existed at registration)*

Both H7 files re-verified gate-clean before anything ran: 5,005 of
5,005 cells at 1.000000 on this container's fresh fetch. Raw output is
committed beside this file: `b6-decision-h7fds.json`,
`b6-decision-h7fp.json`. Harness: `scripts/b6_decision.py`. Machine
cost: ~38–40 minutes per model for 160 runs — ~15 s/run, the same
measured rate as the C6 stability round.

## M1 — the field of view: the rule sets are blind to ~95% of each model

| | h7-fds (11 rules) | h7-fp (17 rules) |
| --- | --- | --- |
| cells that could break ≥ 1 rule | **287 of 5,443 — 5.3%** | **150 of 6,750 — 2.2%** |
| median R over all cells | 0 | 0 |
| max R (ceiling, any cell) | 6 | 11 |
| max R among rule-term cells | **2** | **6** |

The registered bar was 25%: below it, B6 cannot be the primary
diagnosis instrument on today's rule sets. Measured: **5.3% and
2.2%.** A regression at ~19 of every 20 cells breaks nothing at all,
so there is nothing for a diagnosis layer to see, let alone minimise.

## M2 — live regressions, the PR24 classes verbatim

Controls first: on both unplanted files, **all rules held in all 40
runs, zero drops** — the instrument is sound, and the committed
round-4 rules reproduce under fresh runs.

| plant | site | class | rules broken | of | distinct sentences | in how many runs |
| --- | --- | --- | --- | --- | --- | --- |
| fds a1 | `I42` (best case, ceiling 2) | constant-overwrite | **2** | 11 | 1 | 40 of 40 |
| fds b1 | `I42` | tail-hardcode | **2** | 11 | 1 | 40 of 40 |
| fds c1 | `F86` (R = 0) | tail-hardcode | **0** | 11 | — | — |
| fp a1 | `I52` (best case, ceiling 6) | constant-overwrite | **3** | 17 | 2 | 40 of 40 |
| fp b1 | `I52` | tail-hardcode | **3** | 17 | 2 | 40 of 40 |
| fp c1 | `F86` (R = 0) | tail-hardcode | **0** | 17 | — | — |

Two of the six deserve their sentences written out:

- **The best case is two or three, not many.** At the single most
  rule-connected cell either model has, one authoring decision breaks
  2 (fds) or 3 (fp) rules — and those collapse to 1–2 distinct
  sentences, because the « extra » breaks are the same row-pair
  equality's instances in other columns. The amendment's own rule
  says this is blame-the-changed-cell territory.
- **The R = 0 control site, chosen alphabetically by rule, landed on
  `F86` — « Total adjustment », the model's own bottom line.** A
  constant pasted into the headline output of a cost-of-debt model
  breaks **zero** mined rules on both files. The rule set is blind to
  the one cell a reviewer cares most about.

**Attribution.** In all six plants, the workbook diff contains
**exactly one changed formula — the planted cell** — so
blame-the-changed-cell attributes the regression uniquely, with no
diagnosis layer. (The raw content diff also reports 27/20 changed
constants per file; hand- and XML-verified, every one is the file
writer re-serialising Excel's 17-significant-digit decimals at 16
digits — a ≤ 1-ulp shift, seven orders of magnitude below the lane's
tolerance, and present identically in every plant including the
clean-shaped ones. Named as an instrument artifact, not counted as
attribution failure — but prediction 5 is scored failed as written.)

## Predictions, scored

| registered | outcome |
| --- | --- |
| 1 — fds field of view < 20%, max R ≤ 6 | **confirmed** — 5.3%, max exactly 6 |
| 2 — best-case plants break 1–4 (fds), 1–6 (fp) | **confirmed** — 2 and 3 |
| 3 — R = 0 plants break zero rules | **confirmed**, and the site was the model's own output |
| 4 — clean controls hold every rule in every run | **confirmed**, both models, zero drops |
| 5 — the diff names exactly one changed cell | **FAILED as written** — one changed *formula*, plus 27/20 writer-dust constants the raw diff counts; the artifact is named above |
| 6 — the harness misbehaves once, caught by a control | **confirmed, twice** — see below |

## The two harness defects, on the record

1. **The first fds run crashed after b1**: the site-value lookup held
   only rule-term cells, and the R = 0 control site is not a term.
   Because the JSON was written only at the end, the run's record
   survived only in its log — the « write partial results per item »
   lesson from the lead handoff, re-bought in full. Fixed (values
   from the workbook; per-condition checkpoints); the crashed run's
   control/a1/b1 numbers are preserved in scratch and the re-run
   reproduced them exactly under the same seeds.
2. **The diff instrument counts serialization dust** — the openpyxl
   round-trip's 16-digit float writing versus Excel's 17. Verified at
   the raw XML on `J6` of the fds file. It affects the diff *count*
   only; rule arithmetic is untouched at 1e-9 tolerance.

## The verdict, under the pre-registered rule

Every one of the three registered tests points the same way:

- **Broken counts: 0–3, against a « many » bar of ≥ 5** — at B6's
  best-case site, with the defect classes real reviewers actually
  introduced in PR24.
- **Field of view: 2–5%, against a bar of 25%.**
- **Attribution: the diff alone named the culprit in 6 of 6.**

**B6 — Reiter minimal-diagnosis with spectrum-based fault
localisation — is over-engineering on the rule sets the product
produces today, and it stays unbuilt.** The founder's amendment
already held it pending exactly this evidence; the evidence is now
measured rather than suspected. Blame-the-changed-cell wins, and the
narrowing that already exists (B4's frontier walk + ddmin: 43
narrowings, 0 misses) covers the perturbation setting.

**What would reopen it, written down so the decision has edges:**

1. **B5's rule sets becoming dense and modeller-recognisable** — the
   AHA round-1 gate that also holds C6. Today's stable sets are 3–7
   sentences of duplicate calculations and boundary conditions; on
   such sets a single decision cannot break « many » rules, ever,
   because there are not many rules to break. If a future mining
   round produces a rule set where M1's field of view clears 25% and
   a single-cell plant breaks ≥ 5 rules the diff cannot attribute,
   this round's verdict no longer describes the product and B6 is
   back on the table.
2. **The actual Ofwat run.** The registered measurement (rules broken
   per real regression, over the PR24 84) stayed out of reach:
   probed today, `ofwat.gov.uk` answers 403 and the National Archives
   replay route serves a captcha page — the PR24 pairs need a human
   browser, like the AER files. And mining a ~413k-formula FM02 model
   at ~15 s/run is days of this container. Both blockers are
   logistics, not physics; if the founder wants the real-84 version,
   the files are the ask.

**One positive finding that outlives the no:** inside its field of
view, B5's mined rules caught every planted regression
deterministically — 4 of 4 plants at covered sites, flagged in 40 of
40 runs, both defect classes, zero false alarms across 80 control
runs. The instrument works; it is the *coverage* (2–5%) and the
*sentences* (still not a modeller's) that keep it from mattering yet
— the same two limits already gating C6.
