# Analytical checks — the protocol

Pre-registered before any check code exists, in the discipline of
`ofgem-crosscheck-protocol.md`: what each check is allowed to claim,
what it says when it cannot, the tolerances, and what counts as a pass
— all fixed now, so no result can move a goalpost later.

## Ground truth surveyed before registration

(Recorded so the choices below are evidence, not taste.)

- **AFW PR24 draft-determination model** (FAST): a dedicated `Time`
  sheet whose column labels are the workbook's period axis
  (`FY2022`…), `FinStat` sheets holding the statements, a
  `Model Checks and Alerts` sheet with 5,818 numeric check cells —
  4,943 exactly zero, the smallest nonzero at 0.0001, and hundreds of
  genuinely nonzero alert cells *in a published model*. Per-line
  `Error chks <item> balance` rows check each account's continuity.
- **Dumfries & Galloway close model** (project finance): sheets named
  `BS`, `IS`, `CF` (and audited twins `BS (A)`, `IS (A)`, `CF(A)`),
  an `Audit` sheet with 151 check rows, and per-tranche debt sheets
  (`EIB_TL`, `Aviva_TL`).

Two protocol-shaping facts from that survey: **published models carry
fired alerts** — so « agree with the model's own check rows » can
never mean « expect zero everywhere »; and the anchors the structure
layer needs (time sheet, statement sheets, audit sheet, tranche
sheets) exist under discoverable names in both model cultures.

## The corpora

Precision is only ever measured on files nobody here made:

- 16 Ofwat PR24 draft-determination models (`corpus_pr24dd/`), and
  their final-determination pairs where needed.
- The Scottish close models (`corpus_sft/`): Dumfries & Galloway,
  Anderson, Bertha Park, Elgin, RHSC (`.xlsm`), Ayrshire (`.xls`).

Recall is measured on **seeded breaks**: a copy of a clean model with
one defect introduced programmatically (a carry-forward link pointed
one column off; a terminal repayment halved). Seeded files exist only
under `scripts/seeded/`, are never counted in any precision number,
and are never cited as evidence of anything except that a check can
catch what it exists to catch.

## Tolerances — fixed now

- **An imbalance or discontinuity is a finding only when its absolute
  value exceeds `max(1e-6, one part in a million of the larger side)`
  in the model's own working units.** Below that is rounding residue
  and is never reported. (The AFW model's own passing checks sit at
  0 and 0.0001; this line sits above float noise and below any figure
  a person would call money.)
- **A debt terminal balance is a finding under the same rule**, with
  the larger side being the tranche's peak balance.
- Changing either number after results exist requires a worklog entry
  saying which result prompted it and why the old number was wrong —
  the same rule the linker rounds ran under.

## What each check may claim — and must say when it cannot

Every check has exactly two honest outputs: a finding in the fixed
sentence shape below, or an abstention that appears under « Checks
that did not run » with its reason. **A wrong location is the only
failure. Abstention is never a failure.**

1. **Time axis** (`time-axis` rule).
   - Claims: « Sheet X's period columns disagree with the workbook's
     own axis » — stated against the model's own period map, never
     against an assumed grid. A periodicity change the model declares
     (monthly construction → semi-annual operations) is recorded in
     the map, not flagged.
   - Abstains when: no period axis can be established for the
     workbook (fewer than two sheets with recognisable period rows).
2. **Balance** (`balance-sheet` rule).
   - Claims: « The balance sheet does not balance in period P: the
     difference is D » — computed in the model's own sign convention,
     derived from how its own totals combine. Where the model carries
     its own balance check row, ours must agree with it about D
     before the finding is reported; disagreement is an abstention
     that names itself (« our arithmetic and the model's check row
     disagree — not reported »).
   - Abstains when: the balance sheet cannot be located, or the sign
     convention cannot be derived.
3. **Cash tie-through** (`cash-continuity` rule).
   - Claims: « Account A's closing balance in period P does not carry
     into period P+1: C against O » — only for rows the structure
     layer identified as opening/closing pairs of the same account.
   - Abstains when: no opening/closing pairs can be identified.
4. **Debt** (`debt-terminal` and `interest-consistency` rules).
   - Claims: « Tranche T's balance at the end of its term is B, not
     zero », with the chain of cells behind B. Interest: « periods
     P… depart from the model's own interest convention » — the
     convention is derived from the periods where balance, rate and
     interest already agree; if no stable convention exists in the
     model, the check abstains rather than importing a textbook one.
   - Abstains when: no debt schedule is located, or (interest) fewer
     than three-quarters of periods agree on one convention.

## Pass criteria — per phase, before results

- **Structure layer:** on a hand-verified sample (every sheet of two
  Ofwat models and two Scottish models, plus spot checks across the
  rest), the period map is correct sheet by sheet; statement and debt
  blocks are located on at least 80% of the 22 models **with zero
  mislocations**. A block located wrongly anywhere is a round
  failure, exactly as a false drift was for the linker.
- **Balance:** zero false « does not balance » across all 22 models.
  These models closed or were determined on; the presumption is they
  balance, and any imbalance we report is read by hand in the cells
  on both sides before it counts as anything. Agreement with the
  model's own balance-check rows wherever both exist.
- **Cash:** zero false discontinuities across all 22; every reported
  discontinuity hand-read before counting.
- **Debt:** zero false terminal-balance findings on the five Scottish
  models with real tranches; interest checked for self-consistency
  only, same hand-read rule.
- **Recall (all checks):** every seeded break of the kind the check
  exists for is caught. A missed seeded break fails the round.
- A round that fails is repaired and rerun in full, and every round —
  pass or fail — gets its worklog and accuracy-backlog entries.

## What is deliberately out of scope

Assumption reasonableness (a judgement, not a check), covenant and
ratio recomputation, tax, sculpting — all sit on the same structure
layer and are cheap later; none are in these four rounds. Macros
remain unread, as everywhere in the engine.

## Interest self-consistency — registration before results (16 August)

The deferred Phase-4 half, made concrete. Everything below is fixed
before the survey runs; changing any number after results exist
requires the worklog entry naming the prompting result.

**Rule key** `interest-consistency`. Scope: pairs on located
debt-schedule sheets whose label reads as debt — the same population
`debt-terminal` walks.

**Association gate.** A tranche's interest row must be found, never
assumed: candidate rows are those strictly between the pair's opening
and closing rows whose label contains the word « interest » and is
not a rate row (label also containing « rate », « index », or a
percent sign disqualifies). **Exactly one candidate associates; zero
or several is a named abstention.** No cross-sheet association in
this round.

**The model's own convention.** For each axis column where the
opening balance and the interest amount both clear the FLOOR
(0.01 working units, as registered), the implied rate is
|interest| / |opening|. At least **6 rated periods** or the tranche
abstains (too short to have a convention). The convention is the
median implied rate m; a period agrees when its rate lies within
[m/1.5, 1.5m] — wide enough that floating drift and indexation never
fire. The convention stands when at least **three quarters** of rated
periods agree (the fraction already registered above); below that
the tranche abstains as having no stable convention.

**What may be claimed** (only where a convention stands):
1. **Departure**: a rated period whose implied rate exceeds 3m or
   falls below m/3 — a factor of three against the model's own
   median, so no real rate reset can reach it.
2. **Interest on nothing**: interest above FLOOR in a period after
   the tranche's last live balance — charged on debt already repaid.

Zero-interest periods with a live balance are **not** claimed in this
round: semi-annual interest inside a monthly model produces them by
convention, and telling that pattern from a genuine stop needs
payment-frequency detection that would otherwise be guessed.

**Pass criteria**, same shape as the sibling checks: zero false
findings across all 22 corpus models, every firing hand-read in the
cells before it counts; a seeded departure and a seeded
interest-after-repayment on a real file both caught by cell name.
Tally: tranches with a standing convention, clean = no findings.

### Amendment, same day, before any finding was counted (16 August)

Two behaviors above are amended on the first survey's evidence, per
the amendment rule, with the prompting results named in the worklog:

1. **A candidate interest row must be live** — at least one value
   above FLOOR inside the axis. Prompting result: Dumfries's sub-debt
   corkscrews carry « Interest rolled up » rows that are entirely
   zeros; counting empty presentation rows as candidates blocked
   association with nothing.
2. **Zero live candidates is silence, not an abstention.** Prompting
   result: on Anderson, Bertha Park, Elgin and RHSC no debt pair
   holds any in-block interest row — their interest lives elsewhere
   in the model. A named abstention per such pair describes layout,
   not a declined claim; nothing was measured and nothing refused.
   Several live candidates remain the named abstention, and an
   associated tranche with fewer than six rated periods now abstains
   by name exactly as registered.

## Severity grading and de-duplication — registration (16 August)

**Grading.** A statement finding whose value is money grades against
the model's own scale: the workbook-wide median absolute cell value
above FLOOR. Below one thousandth of that scale the finding is a
`smell` — true, reported, and marked as sitting below the model's own
materiality; at or above it is an `error`. The line was calibrated on
the hand-read close-model findings and sits four orders of magnitude
clear on both sides: Elgin's ±0.5 grades smell at 4.3e-6 of its
model's scale, while the smallest genuine money finding (Dumfries,
50.92) sits at 0.282 — 280 times above the line — and Ayrshire's
±700,016 at 9.0. Money rules: `model-own-check`, `balance-sheet`,
`cash-continuity`, `debt-terminal`. Structural findings — a period
column out of order, an implied rate a factor of three off its own
convention, interest charged after repayment — are always `error`:
no rounding produces them. Grading never creates or suppresses a
finding; it only says how loud it is.

**De-duplication.** A fired balance-flavoured check row and the
independent balance identity can state the same fact twice. The
model's own words win, as everywhere in this protocol: a
`balance-sheet` identity finding is dropped when a `model-own-check`
finding with a balance-flavoured label reports the same period — or,
where the check row carries no period, the same sheet. The kept
finding is the model's own; nothing is silenced, one sentence is
chosen over its echo.

## The one-step evaluator — registration before results (17 August)

To say « typed 19,100 where the row would calculate 19,605 », the
engine must compute what a cell's formula would produce. Registered
before any number is shown:

**Method.** One-step substitution only: the formula's references are
replaced by the cached values Excel itself last computed — never a
recursive recomputation. Whitelist of forms: numbers, cell and range
references, `+ - * / ^`, unary minus, percent, parentheses,
comparisons, and the functions SUM, IF (lazy — only the taken branch
is evaluated), MIN, MAX, ABS, ROUND, AVERAGE. Anything else — any
other function, any text arithmetic, any reference to a cell whose
cached value is unknown — is an **abstention**: the evaluator claims
nothing rather than guessing. A reference to a coordinate holding no
stored numeric cell counts as empty (zero in arithmetic, skipped in
aggregates), which is Excel's own convention; the corpus grading
below judges whether that assumption survives contact with real
files.

**Proof.** The corpus grades the evaluator: every formula cell in the
22 models whose cached value is known is a test case with the answer
written in it. Acceptance: agreement with Excel's cached value
(relative tolerance one part in a million) on **at least 99.5%** of
the cells the evaluator claims, and a hand-read sample of the
disagreements with each cause named. Coverage (how many cells it
claims) is reported, never inflated — an abstention is not a failure.

**Use.** Where a typed value interrupts a formula row, the row's
nearest formula is shifted to the typed cell's column (respecting
absolute references) and evaluated; the finding then says the typed
figure, the calculated figure, and the difference. No standing
evaluation, no claim — the finding falls back to its structural
sentence.

**Results (17 August, same day, after the registration above).**
Graded against the full corpus: 6,076,269 formula cells with cached
values across the 16 Ofwat PR24 DD models and Bertha Park; the
evaluator claimed 91.4% of them and agreed with Excel's own cached
value on **99.9985%** of those it claimed — worst single model
99.995% (UUW), against the registered bar of 99.5%. The hand-read of
the disagreement sample found one cause, named: strict-equality flag
rows (`IF(sum of six allocation fractions <> 1, 1, 0)` on the Tax
sheets), where Excel's live arithmetic sums to exactly 1 but
re-summing the file's decimal-serialised cached copies lands a few
billionths off, flipping the strict `<>`. That is the known limit of
one-step substitution over cached values, not a parse error, and it
touches ~0.0015% of claimed cells, all in checksum rows. Honest
coverage gap: five of the six SFT files (Anderson, Ayrshire,
Dumfries, Elgin, RHSC) contribute zero test cases — no
formula-with-cached-value pairs survive their values-pasted or
legacy formats — so the grade rests on the Ofwat sixteen and Bertha
Park (107/107). One reader fix fell out of the grading: dates are
numbers (Excel serials) now, which took Bertha Park from 88.8% to
100% agreement and was the entire cause of its disagreements.
