# The population proof — registration, written before any finding is looked at

`swens-plan.md`'s first completion proof: « ten models from the
chosen first population, run cold, findings hand-verified — the same
test the regulator corpus passed, repeated where the market is. »
Registered 27 August 2026, before the engine has been run on a
single one of these files.

## The population, chosen by the founder

**UK public-infrastructure project finance: closed-deal financial
models published by Scottish Futures Trust under transparency rules**
(the model is published alongside the redacted contract two years
after completion — almost no jurisdiction publishes the model at
all). Hospitals, colleges, schools. Each file is the model agreed at
financial close: construction cost build, debt drawdown and
repayment, interest, operating costs, the unitary charge the public
body pays for 25–30 years, tax, equity IRR. Real modellers, real
deadlines, then audited; banks lent against them and lawyers wrote
them into contracts.

**Why not the alternatives**, in the founder's words and adopted:
not utilities — that is where the engine was tuned, and a good
result there proves nothing; not corporate/M&A — real files cannot
be obtained, and teaching models would make the proof a fiction.

## The contamination rule — the reason this registration exists

Six project-finance models already sit in the private corpus
(`corpus_sft/`) and the engine was **tuned against them** in the
analytical-checks rounds. A model the engine has already seen cannot
test it.

Checked by hash on arrival, and stated plainly: of the founder's
first five files, **two are byte-identical to models we already
hold** — `ayrshirecollegefinancialmodel.xls` = `ayrshire_model.xls`,
`CopyofBerthaPark…xlsm` = `bertha_park_model.xlsm`. They are
**ineligible** for this proof and stay in the tuning corpus where
they belong. Three are new and eligible:

| eligible, unseen | sha256 (16) | bytes |
|---|---|---|
| `hwcbsb_model.xlsm` | 3b28834a98e3b7fe | 3,907,164 |
| `inverness_college_model.xlsm` | d2caf87b95277206 | 2,265,188 |
| `snbts_model.xlsm` | c8d838938035cb2c | 1,881,902 |

**Every further candidate is hashed against the whole corpus before
it counts.**

### The corpus is complete: eleven eligible models (27 Aug)

The founder supplied the portal's alphabetical index and two
mechanical routes. The portal host is unfetchable (expired
certificate, `corpus-sources.md`) — but the **files sit in a public
S3 bucket with a valid certificate**, under a stable convention
discovered by probing a file we already held:
`{Project Words}+Financial+Model.{ext}` at the bucket root. Swept
across the whole index; committed as `scripts/corpus_sft_models.py`
so the corpus is rebuildable and never committed.

Found: **eleven models across eleven new deals** — eight readable
(`.xlsm`), three format-blocked (two `.xlsb`, one `.xls`). Eighteen
indexed projects have no model published at all, which matches the
portal's own rule (the agreement publishes at financial close, the
model two years after completion) and is recorded in the fetcher so
a later sweep can tell « not yet published » from « never looked ».

| eligible & readable | deal |
|---|---|
| `baldragon_model.xlsm` | Baldragon Academy |
| `glasgow_college_model.xlsm` | City of Glasgow College |
| `forfar_model.xlsm` | Forfar Community Campus |
| `inverurie_foresterhill_model.xlsm` | Inverurie & Foresterhill Health Centres |
| `kelso_model.xlsm` | Kelso High School |
| `levenmouth_model.xlsm` | Levenmouth Academy |
| `newbattle_model.xlsm` | Newbattle Centre |
| `oban_campbeltown_model.xlsm` | Oban & Campbeltown High Schools |
| `hwcbsb_model.xlsm` | (founder-supplied) |
| `inverness_college_model.xlsm` | Inverness College |
| `snbts_model.xlsm` | Scottish National Blood Transfusion Service |

Eleven readable candidates for a proof that needs ten. **All eleven
run**, and the eleventh is not a spare to drop if it scores badly —
the sample is fixed here, before any of them has been opened.

Format-blocked and excluded, held in the corpus so the gap stays
visible: `barrhead_model.xlsb`, `largs_model.xlsb`,
`inverclyde_model.xls`, `dalbeattie_model.xlsb`,
`our_lady_st_patricks_model.xlsb` — **five of sixteen published
models in this population cannot be opened by our reader**, which is
the honest size of the A6 intake gap and a number the proof reports
whatever else it finds.

**Readability is asserted by extension only at registration time.**
Whether the engine actually opens each `.xlsm` is part of the run,
not a precondition assumed here; a file that fails to read is a
refusal counted in the denominator, per the cold-run conditions.

### Contamination log (every candidate, accepted or rejected)

| candidate (as supplied) | sha256 (16) | verdict |
|---|---|---|
| `HWCBSBBaseCase…FCclose.HC.xlsm` | 3b28834a98e3b7fe | **eligible** |
| `InvernessCollegeFinancialModel.xlsm` | d2caf87b95277206 | **eligible** |
| `ScottishNationalBloodTransfusionService…xlsm` | c8d838938035cb2c | **eligible** |
| `ayrshirecollegefinancialmodel.xls` | 51ea8ab291a3f4ff | rejected — identical to `ayrshire_model.xls` (tuning corpus) |
| `CopyofBerthaPark28SeptemberFINAL.HC.xlsm` | cd690a68ae340e87 | rejected — identical to `bertha_park_model.xlsm` |
| `CopyofRHSCDCN_FinancialModel…Solved.HC.xlsm` | a4b52c7c6c9a9b94 | rejected — identical to `rhsc_dcn_model.xlsm` |
| `DumfriesandGallowayRoyalInfirmary…xlsm` | b413cde63f9e4f1c | rejected — identical to `dumfries_model.xlsm` |
| `DalbeattieLearningCampusFinancialModel.xlsb` | 900475eabfaf98e4 | **new deal, format-blocked** — `.xlsb` |
| `OurLadyandStPatricksPrimarySchool…xlsb` | b366fb206a2c9bfe | **new deal, format-blocked** — `.xlsb` |

Four of the founder's first seven were already in the tuning corpus.
That is not waste: it is the contamination rule doing precisely the
job it was written for, before a number existed to be flattered.

### The deals already held — excluded from this proof by name

Anderson · Ayrshire College · Bertha Park · Dumfries & Galloway
Royal Infirmary · Elgin · RHSC/DCN (all six tuned against), plus the
three eligible ones above once they are run. **Any further candidate
must be a different deal from these nine.**

## Run cold — what that means here, fixed now

1. **The engine is frozen** at the commit named in the results
   section when the run starts. No detector change, no threshold
   change, no fix, however obvious, between the first file and the
   last. Anything the run exposes becomes a *later* registered
   round, and the proof's numbers stand as taken.
2. **House rules at shipped defaults.** No per-file configuration.
3. **One file at a time** (the heavy-job rule), each read and
   audited exactly as the product does it.
4. **The `.xlsb` discovery, recorded on arrival (27 Aug).** Two
   eligible new deals — Dalbeattie Learning Campus and Our Lady &
   St Patrick's — arrived as **`.xlsb`, Excel's binary workbook
   format**. Verified from the containers: both are valid zip
   containers whose sheets are `.bin` parts, not XML (295 parts /
   163 binary, and 404 / 258). Our reader is built on openpyxl,
   which reads the XML formats only and **cannot open `.xlsb` at
   all**. So this is a *third* intake gap beside `.xls`, it was
   found by the corpus rather than by a customer, and it is
   plan-visible now: **A6 widens from « legacy `.xls` » to « every
   format Excel ships »**, and the conversion path (LibreOffice, the
   same pass A6 already names) must be measured for fidelity like
   everything else — a converted file is a different file until
   proven otherwise. Until A6 lands, these two are held in the
   corpus, **counted as format-blocked, and excluded from the ten**
   rather than silently dropped.

5. **Refusals are results.** A file the reader cannot open, or opens
   with structure it will not claim, is reported as such and counted
   in the denominator — never quietly dropped. (`.xls` intake is
   plan step A6 and is **not built**; if an eligible file is legacy
   format its refusal is the honest outcome, and the conversion
   round comes after this proof, not during it.)

## What is measured, and how it is judged

Per model: findings by rule and severity; the coverage denominator
the report already prints; wall-clock as coarse context only.

**Hand verification.** Every finding is adjudicated against the
cells if a model produces ≤ 40; above that, a **seeded stratified
sample** — seed `20260827`, drawn per rule so no class hides —
verified in full, with the drawn set recorded before judging
begins. Each verdict is one of:

- **True defect** — a real mechanical or structural error.
- **Judgement call** — defensible modelling the reviewer would
  still want to see (reported as useful, never as an error).
- **False alarm** — the engine is wrong about the model.

**The criteria, set before results** (the lead's, anchored to the
regulator-corpus measurement of 80.1% useful / 2.9% false
positives, and subject to the founder's override *before* the run,
never after):

- **Pass:** ≥ 70% of verified findings are true defects or
  judgement calls, **and** false alarms ≤ 10% of verified findings,
  **and** no model produces a flood (> 150 findings) without the
  flood itself being one authoring situation.
- **Fail:** anything else — reported as a fail, with the classes
  that caused it named.

A pass is not « the engine is good »; it is « the engine transfers
from the population it was tuned on to a population it has never
seen ». That is the only question this proof asks.

## SUSPENDED, 27 August, before a single model was audited

**The corpus is value-only. The proof cannot run on it as written.**

Measured two ways before any claim: a formula count over every
worksheet part of all sixteen models, then the real reader
(openpyxl) on two of them as a check.

| model | cells | formulas | share |
|---|---|---|---|
| `inverness_college_model.xlsm` | 380,506 | **20,027** | 5.26% |
| `kelso_model.xlsm` | 1,074,011 | 875 | 0.08% |
| `newbattle_model.xlsm` | 1,074,692 | 616 | 0.06% |
| `levenmouth_model.xlsm` | 1,230,971 | 224 | 0.02% |
| `baldragon_model.xlsm` | 914,364 | 220 | 0.02% |
| `hwcbsb_model.xlsm` | 931,292 | 169 | 0.02% |
| `bertha_park_model.xlsm` | 927,013 | 113 | 0.01% |
| `inverurie_foresterhill_model.xlsm` | 171,203 | 3 | 0.00% |
| `forfar`, `glasgow_college`, `oban_campbeltown`, `snbts`, `anderson`, `dumfries`, `elgin`, `rhsc_dcn` | 199k–1.9M each | **0** | 0.00% |

The reader confirms it: Forfar returns **zero** formulas across
383,497 populated values. These files are published as values —
the formulas are stripped before release. Of eleven eligible
models, **one** (Inverness College) carries a live calculation
layer; the rest are printouts of a model, not models.

**Why the engine cannot be proved on them.** Swens's structural
checks — typed-over formulas, sums that skip rows, hardcodes in
formula tails, frozen references, family disagreements — are
statements *about formulas*. Run cold on a value-only file they
have nothing to read and will report almost nothing, and that
silence would measure the corpus, not the engine. Publishing « the
engine found little on eleven real infrastructure models » would be
one of the most misleading true sentences we could write.

**The lead's error, named.** The founder's own research reported
this in advance — « the spreadsheets are published with the
formulas stripped out » — and the lead recorded it in
`corpus-sources.md` as a limitation *for Track D*, then wrote this
registration without carrying it across. Scribe found it
independently from the other side (D5 round 3, « value-only, 0.03%
formulas ») at almost the same hour. The registration discipline
worked exactly as intended — the corpus was checked before it was
scored, not after — but the check should have happened when the
limitation was first written down, and that is on the lead.

**What is *not* damaged.** This is a corpus property, not a product
one: customers send their own working models, which carry formulas.
Nothing measured on the regulator corpora, the fidelity gate, the
behavioural laws or the Watch depends on these files. The
value-only corpus remains useful for the analytical checks (balance,
cash carries, debt terminal balances) — which is what the earlier
Scottish rounds used it for — and it is exactly the right corpus for
those.

**What happens now.** The population question is open again and is
the founder's to answer, with three routes and the lead's reading:

1. **Find a formula-bearing population.** The proof needs models
   with a live calculation layer. MCC's ~114 published economic
   models are the named candidate (real, third-party, outside our
   regulator corpus) — but `assets.mcc.gov` fails certificate
   verification from these containers, so reachability is unproven
   and the founder's browser may be the route again.
2. **Redefine this proof for what the corpus can carry** — an
   analytical-checks proof on eleven real closed deals, published
   as exactly that, and the structural proof deferred to a
   formula-bearing population. Honest, smaller, and available now.
3. **Inverness College alone**, as a single deep hand-verified
   subject rather than a population — evidence, not a proof.

The lead's recommendation: **(2) now and (1) in parallel** — the
analytical proof is real and publishable on its own terms, and it
does not pretend to be the structural one.

**Founder's decision, 27 August: do both.** This document therefore
splits into two proofs, each with its own corpus, its own criteria
and its own honest name. Neither may be cited as the other.

### Proof 1A — the analytical proof (this corpus, runnable now)

**Claim under test:** on eleven real closed-deal infrastructure
models it has never seen, published as values, the engine's
*analytical* checks — the conservation laws — behave. Does the
balance sheet balance? Does every cash carry hold? Does debt
amortise to zero where it claims to? Does the time axis hold
together? These read stored values and need no formulas, which is
precisely why this corpus can carry them.

**What it is not, stated in the same breath wherever it is quoted:**
it is *not* evidence about the structural checks (typed-over
formulas, skipped rows, hardcoded tails, frozen references), which
cannot be tested on files with no formulas. Any published version
of 1A carries that sentence.

**Conditions:** the cold-run conditions above apply unchanged — the
engine frozen at one commit, house rules at defaults, one file at a
time, refusals counted. All eleven readable models run;
`inverness_college_model.xlsm` runs too and is *reported
separately*, because it is the one file with a live calculation
layer and folding it in would blend two populations.

**Criteria, fixed now:** every analytical finding is adjudicated by
hand against the cells (these are conservation claims — there is a
right answer, and it is checkable). **Pass:** ≥ 80% of analytical
findings are true breaks or defensible judgement calls, false alarms
≤ 10%, and — the criterion that matters most on a corpus of *audited,
closed* models — a model that is genuinely clean produces **no**
analytical findings. A flood of balance-sheet complaints on a deal
that closed and was lent against would indict us, not the model.

**A prediction, registered before the run:** most of these models
will be analytically clean, because they were audited before
financial close and banks lent against them. The expected result is
therefore mostly silence, and silence is the pass. Whatever breaks
is either a real post-close artifact of the value-only publication
(a stripped file can lose a carry) or our own false alarm, and the
hand check will say which.

### Proof 1B — the structural proof (corpus not yet found)

**Blocked on a formula-bearing population**, and it stays open with
no target date rather than being quietly folded into 1A. Candidates,
in order: MCC's ~114 published economic models (real, third-party,
outside the regulator corpus — `assets.mcc.gov` fails certificate
verification from these containers, so the route is unproven); a
design partner's own working models under NDA (the best evidence and
the slowest to obtain); the founder's browser as the fetch route of
last resort, as with the SFT bucket.

Until 1B has a corpus, **the plan's first completion proof is not
met**, and no summary of Swens's state may say otherwise.

## Results

### Proof 1A — the analytical proof (run 28 August 2026)

**Engine frozen at `c6ff9a4e`.** House rules at shipped defaults,
one file per process, no change of any kind between the first model
and the last.

**Corpus, and one honest gap.** The container was restarted between
the registration and the run, which wiped the founder-supplied half
of `corpus_sft/`. Two of the three were recoverable from the same
public bucket the committed fetcher uses, and both verify
**byte-identical to the hashes in this registration** —
`inverness_college_model.xlsm` `d2caf87b95277206` (2,265,188) and
`snbts_model.xlsm` `c8d838938035cb2c` (1,881,902) — so they are the
registered files, not lookalikes. **`hwcbsb_model.xlsm` could not be
recovered**: it was founder-supplied, no deal name is on record, and
six plausible bucket keys were probed and all refused. It is
reported here as **unavailable**, not as a refusal (the engine never
saw it) and not dropped. **Ten of the eleven ran.**

**Refusals: none.** Every one of the ten opened and was audited.

**Caveat on the cold-run condition, recorded rather than buried
(28 Aug).** Scribe reported, against its own interest, that it had
read nine of `newbattle`'s finding records before this proof ran,
while chasing a claim it later retracted. The lead's ruling: the
model **stays in the sample**. Its four findings were adjudicated at
the cells by Sentinel in a separate session, independently, and they
were among the eight false alarms that *failed* the proof — a prior
reading could not have manufactured that outcome, and removing a
model after seeing its result would be re-cutting the sample, a
worse fault than the one being cured. The condition is tightened for
everything after: **no lane may read the engine's output on a proof
model before that proof runs; a lane that does reports it, and the
model is excluded from any future proof.** Newbattle is therefore
excluded from **1B**.

| model | formulas | analytical findings |
|---|---|---|
| baldragon | 220 | **0** |
| forfar | 0 | **0** |
| glasgow_college | 0 | **0** |
| levenmouth | 224 | **0** |
| oban_campbeltown | 0 | **0** |
| inverurie_foresterhill | 3 | 4 |
| kelso | 814 | 4 |
| newbattle | 492 | 4 |
| snbts | 0 | 1 |
| *inverness_college (separate)* | 19,900 | 1 |

**Five of the nine value-only models are completely silent** — the
registration's predicted pass, and it held for them.

### Every finding adjudicated against the cells

**Kelso and Newbattle — 8 findings, all FALSE ALARMS, one cause.**
Both fire on `ReportRatiosSA!E352/E353/E356/E357`, check rows whose
labels read « Check: Minimum − forward looking ADSCR > breach
level » and « … > distribution lockup level », reporting 1.15 and
1.1. Read at the cells: **column E is the model's parameter column,
not a period.** The sheet's time axis starts at **column H** (row 2:
`G='period'`, `H='15/16: I'`, `I='15/16: II'`, …), and column E is
where the model parks its scalars — rows 4–7 of the same column hold
`Input checks:`, `Calc checks:`, `Output checks:`, `Accounting: IFRS
- Financial Asset`. So 1.15 *is* the covenant breach level and 1.1
*is* the lockup level: parameters, sitting in the parameter column.
The check rows' actual period series is **zero from G onward** —
these covenants pass in every period.

The mechanism, named precisely: `_own_checks` collects every numeric
cell of a check-labelled row and has **no notion of which columns are
periods**. It receives the structure — which knows the period axes —
and does not consult it. A threshold parked in a scalar column is
read as a failing period.

Per the cold-run conditions this is **not fixed here**. It becomes a
later registered round, and these numbers stand as taken.

**Inverurie — 4 findings, TRUE BREAKS.** `SG ASP Proforma` rows 38,
67, 91, 121 are labelled `Check` and hold **0 in every column except
one**, where they hold −2.3234 (rows 38/67, column BG) and −2.323 /
−2.32 (rows 91/121, column AF). The engine's sentence is exactly
true of the file: a check row that is zero everywhere reports −2.32
in one period. Two column positions, four rows — plausibly one
underlying break reported four times, which is a folding question
rather than a correctness one.

**SNBTS — 1 finding, TRUE BREAK.** `Outputs` row 74 « Cash Balance
Carried Forward » ends the prior period at 4.5e-13 (zero), and row
73 « Cash Balance Brought Forward » opens the next at **1,196.13**.
The published numbers genuinely do not carry. Whether that is a real
post-close artifact of value-only publication or was so in the
original cannot be told from the file — but the engine is right
about the file, which is what « false alarm » would have had to
deny.

**Inverness College — 1 finding, JUDGEMENT CALL** (reported
separately, as registered: it is the one model with a live
calculation layer). `PF5_SPV Running costs!C26`, a row labelled
`Check`, holds 239,039.5 in column **C** while every period column
D–J is zero. Column C's header is `FinClose` — the financial-close
stub — and the nominal and real cost rows both read 0 there while
the sheet's own inputs at C carry 223,727 and 8,750. So the model's
own check is genuinely non-zero at close. An auditor would want to
look; it may equally be a stub column excluded from the build by
design. Defensible either way, and not a false alarm.

### The verdict, against the criteria fixed before the run

| criterion | required | measured | |
|---|---|---|---|
| true breaks or judgement calls | ≥ 80% | **5 of 13 = 38.5%** | ✗ |
| false alarms | ≤ 10% | **8 of 13 = 61.5%** | ✗ |
| a genuinely clean model produces **no** analytical findings | — | Kelso and Newbattle are clean and we spoke, four times each | ✗ |

**Proof 1A: FAIL.** All three criteria fail, and they fail on one
defect class: the own-check pass reading a parameter column as a
period. Remove those eight and the remaining five findings are all
true breaks or defensible — but the criteria were fixed before the
run and are not re-cut after it, and the false alarms are exactly
what the proof existed to detect.

**What this bought.** The registration predicted silence and got it
on five of nine models. It also found, on a real population the
engine had never seen, a false-alarm class that the entire regulator
corpus never surfaced — because those models do not park scalars in
a column beside their period grid. That is precisely the transfer
question the proof asks, and the answer is: *not yet, and here is
the reason, on one line of code.*

**Scope, restated as the registration requires:** this is **not**
evidence about the structural checks — typed-over formulas, skipped
rows, hardcoded tails, frozen references — which cannot be tested on
files with no formulas. That is Proof 1B, still without a corpus.
Structural counts were recorded incidentally and are **not scored
here**; one of them is worth a later look on its own terms
(newbattle raises 68 structural findings on a value-only file), but
nothing in this section rests on them.

