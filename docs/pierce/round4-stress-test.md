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
