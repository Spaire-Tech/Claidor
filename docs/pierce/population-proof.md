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
it counts.** Seven more unseen models are needed.

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
4. **Refusals are results.** A file the reader cannot open, or opens
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

## Results

*(Nothing here until the ten eligible models exist and the run is
complete. The engine commit, the per-model table, the drawn samples
and the verdicts land here in one push.)*
