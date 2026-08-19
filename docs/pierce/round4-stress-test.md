# Round 4 — the stress test (protocol, registered before any finding was read)

The mentor's exam, adopted whole: take the engine outside the
laboratory. Three tests, each with its metric registered here before
any finding's content was looked at. The only thing read before this
document was written: whether each file parses, its cell count, and
its finding *counts* (needed to design the draw) — no finding text,
no refs, no details.

## The unseen corpus

Eleven models the engine has never seen, from three jurisdictions,
three industries, at least three modelling cultures, 284 KB to 12 MB:

| Family | Files | What it is |
|---|---|---|
| ofwat (England, water) | PR24-FD-FM02-Financial-model-Thames-Water; PR24-FD-CA101-Energy-cost-adjustment-model; DDCM-model-v1g | Ofwat PR24 final determinations (via the UK Government Web Archive) |
| nzcc (New Zealand, electricity) | Financial-model, Financeability-model, CPI-model, Existing-asset-depreciation-model (DPP4 draft); Reliability-standards final decision | NZ Commerce Commission DPP4 |
| damodaran (US, corporate valuation) | fcffginzu, fcffsimpleginzu, capstru | Prof. Damodaran's NYU valuation models — single-author style |

Sources are public; files are kept in the session corpus store, not
committed (same as the AU/UK corpus; the manifest is this table).

## Test 1 — Generalization: precision on unseen models

- Engine run as shipped — no fixes between the sweep and the verdicts.
  Whatever the engine does to these files IS the measurement; fixes
  come after, as their own gated round.
- The pre-flight counts revealed two finding floods (both large NZCC
  models, ~750 findings each): those two files are sampled per
  detector (floor 25, the third-measurement sampler), seed
  **20260822**; every other file's findings are judged whole.
- Classes A/B/C/D exactly as the lab protocol, judged from harvested
  cell neighbourhoods.
- **The action grade**, new this round and now the headline metric,
  recorded per judged finding alongside the class: would a senior
  financial modeller or auditor **ACT** (stop what they are doing and
  investigate), **NOTE** (want it in the appendix), or **IGNORE**
  (not want to see it)? A+B counts what is defensible; ACT counts
  what the product is for.
- Reported per file, per detector, per tier. The tier-1 ACT share is
  the number that matters. No bar is promised in advance — the lab's
  98% does not entitle the engine to anything here.

## Test 2 — Quiet on clean models

- The believed-clean set, designated before reading any finding:
  **NZCC CPI-model**, **NZCC Reliability-standards final decision**,
  **Damodaran capstru** — small, single-purpose, professionally
  maintained files where a defect would likely have been caught by
  their authors.
- Metric: tier-1 findings per file (target: zero that judge A), and
  total findings per 1,000 examined cells. Every tier-1 finding
  raised on a clean file is judged from the cells and explained.

## Test 3 — Recall on planted defects

- Hosts (quiet files, so a hit is attributable): **Damodaran
  fcffginzu**, **Ofwat CA101**, **NZCC Reliability final decision**.
- Six defect classes, the mentor's list: broken reference (a ref
  replaced with #REF!), overwritten formula (a series formula
  replaced by a typed constant), skipped total (a SUM range narrowed
  by one live row), bad reference (one ref shifted one row off),
  inconsistent formula (one operator swapped in one cell of a fill),
  incorrect assumption (one reference in one cell of a fill replaced
  by a plausible literal).
- Planting is scripted (`server/scripts/plant_defects.py`), by XML
  surgery so every untouched cell keeps its cached value; up to 5
  eligible sites per class per host, chosen with seed **20260823**;
  the ground truth is written before the engine runs. One planting
  run per host — no re-rolls.
- **Caught** means: a finding's ref is the planted cell, or the
  planted cell appears in a finding's cells roster. Reported as
  recall per class and overall, with the catching rule named.
- Precision on planted hosts: findings on a planted file that are at
  neither a planted site nor in the host's own un-planted report are
  collateral and reported as such.

## Order of operations

1. This registration (committed first).
2. Test 1 sweep → draw → harvest → judge → tallies.
3. Test 2 read-out from the same sweep.
4. Planting → Test 3 sweep → recall tallies.
5. One honest report; engine fixes come after, as their own round.

---

## Results (20 August)

### Test 1 — Generalization

Judging set of 232 (two floods sampled per detector, the rest judged
whole, all from harvested neighbourhoods). Raw: **A 4 · B 93 · C 54
· D 81**. Stratified over the 1,678 findings the engine raised on
the unseen corpus: **A ≈ 0.2% · B ≈ 5.5% · C ≈ 3.2% · D ≈ 91% —
A+B ≈ 5.8%**. Action grades: **ACT 0.4% · NOTE 5.4% · IGNORE 94.2%.**

The lab's 98% became 6%. The collapse has one dominant cause: the
NZ Commerce Commission builds its determination as a suite of
workbooks that read each other, and **external-link — the one rule
the AU/UK corpus never exercised — has no fold**, so two files
flooded 1,496 per-cell findings that are one import decision per
source workbook. Excluding the two flood files, the rest of the
unseen corpus judges A+B ≈ 54% — still far below the lab, driven by
noise classes the lab never taught:

- lookup column indexes (`VLOOKUP(…,15)`) read as assumptions — 45
  of the 54 C verdicts trace to selector-family constants;
- power-of-ten sentinels (`10000000` as infinity in a guard);
- `^0.5` as square-root notation in Black–Scholes;
- bounds inside diagnostic formulas whose outputs are text warnings;
- the year-counter ladder (`IF(D14<5," ",5)`);
- a divisor equal to the count of summed operands (a written-out mean);
- a total whose own label states its row window (« 5 years »).

And duplicate families the folds don't cover yet: per-cell external
links, a torn `#REF!` check row, per-company literal columns
(`=N/1000` sixteen times), rolling-average seeds.

What the engine **did** find on files it had never seen: hand-typed
regional ERPs inside a lookup column (Damodaran), a torn check row
in the NZCC draft determination, four values typed down the 2024-25
revenue column of Thames Water's final-determination model, and a
recurring unexplained 0.999 asset haircut across the NZCC suite —
seven ACT-grade findings, each one exactly the kind of thing the
product exists for. The signal generalizes; the noise control does
not, yet.

One under-reach flagged for investigation, not yet explained: the
12 MB, 699k-cell Thames FM02 produced only 4 findings.

### Test 2 — Quiet on clean models

| File | Findings | Tier-1 | Invented defects |
|---|---|---|---|
| NZCC CPI-model | 0 | 0 | none — silent |
| Damodaran capstru | 14 (6.4/1,000 cells) | 0 | none — all tier 2/3, 5 judged C |
| NZCC Reliability final | 20 | 1 | none — the tier-1 is a real external link, judged B |

**No clean file produced an A-grade defect claim.** The engine does
not invent problems; it chatters (the capstru noise is the lookup
-index class again).

### Test 3 — Recall on planted defects

72 defects planted across the three hosts (some sites ineligible on
the smaller hosts, reported as such; the planter needed two
mechanical corrections mid-run — whole-range #REF! wrecking and
preserving cached-value types — both applied with the same seed and
recorded here). Collateral: planting produced **1** finding not at
a planted site across all three hosts — the engine's report is
stable under damage.

| Planted class | Registered recall | On-point rule recall |
|---|---|---|
| broken reference | 15/15 | 15/15 (error-value) |
| overwritten formula | 12/14 | 12/14 (typed-over) |
| incorrect assumption | 8/10 | 8/10 (hardcode) |
| skipped total | 7/10 | 7/10 (skipped-cell) |
| bad reference (row shift) | 5/15 | 1/15 |
| inconsistent formula (op swap) | 2/8 | 0/8 |
| **Overall** | **49/72 = 68%** | **43/72 = 60%** |

The two failing classes are the subtle ones: a reference shifted
one row, and a `+` flipped to `-`, in short rows or singleton
formulas where the row pass has no series to compare against. The
skipped-total misses are ranges narrowed at the *top* (the rule
only looks above the total for omissions, not at the range's own
first rows). These are named recall gaps, not mysteries.

Two robustness findings from the planting run itself: the reader
dies on a formula containing a partial-range `#REF!` (one bad
formula makes the whole file unreadable — it should cost one cell),
and the measurement scripts only work when cached-value types
survive — both recorded for the fix round.

### The Round 5 agenda this round wrote

Every number above reduces to named work: fold external links by
source workbook; the seven unseen noise principles; four new fold
families; detect single-cell reference shifts and operator flips
against shorter witnesses; check a SUM range's head as well as the
rows above it; per-formula error tolerance in the reader; the
Thames under-reach investigation; and the banner-error tier miss.
Fixes come as their own gated round — nothing was patched between
the sweeps and these verdicts.
