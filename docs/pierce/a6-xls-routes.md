# A6 round 2 — the `.xls` question, which is now the whole question

**Registered before any number exists.**

## Why this round, and why now

A6 round 1 refused the conversion route on the five held closed-deal
models (`a6-intake.md`). It could not answer the question that
actually matters, because **every file it had carried zero
formulas**: `inverclyde` has 5,223 boolean cells and not one
formula, so « what does conversion do to a real formula » went
unmeasured.

The lead's 28 Aug addendum makes that the only question worth
asking. `SheetJS/enron_xls` — 9,145 real workbooks, 5,391 with live
formulas, 818 with over 1,500 formulas and project-finance
vocabulary — is **all `.xls`**, and it is the only deep, real,
unseen project-finance corpus that exists. Proof 1B, the A3 mining
rounds on a second dialect and an unplanted version pair for the
Watch all sit behind it. **A6 is the gate, and the gate is `.xls`.**

There are exactly two routes to a `.xls`, and we have never measured
either against ground truth:

| route | what it is | what we know |
|---|---|---|
| **native** | `read_workbook` → `legacy.py` (xlrd + our own BIFF decompiling) | **misses formulas** — proven arithmetically on three subjects (19/144, 10/40, 0/349), never quantified across a population |
| **converted** | LibreOffice → `.xlsx` → openpyxl | round 1: opens, keeps all 805 defined names, changes no value, but **fabricates a formula for every boolean cell** |

## Material — already on disk, no fetch

**431 `.xls` files** from the CUSTODES/EUSES subjects under
`server/scripts/custodes_work/`. Real spreadsheets, formula-bearing,
independent of us.

Named plainly: these files have been used before, as *scoring*
subjects for the Tasi and CUSTODES benchmark rounds. That is not
contamination here — this round measures **intake**, not detection.
Nothing about which cells our rules fire on enters it, and no
finding is tuned. If a later round scores detection on these files,
the contamination rule applies then, as it did before.

The Enron corpus is **not fetched for this round**. Deciding between
two routes does not need 2.8 GB, and a route that cannot read the
files we already hold will not be rescued by more files. The Enron
sample is the *confirmation* step, registered below as conditional.

## The witness

A raw **BIFF record census** of the workbook stream —
`scripts/a6_biff_census.py`, committed in round 1 — counting
`FORMULA` (0x0006) records directly. Neither route is in the loop:
not `legacy.py`, not xlrd's cell model, not LibreOffice.

**Its one known weakness, named now rather than after the result:**
BIFF8 shared-formula groups (`SHRFMLA`, 0x04BC) still emit one
`FORMULA` record per participating cell, so the census should equal
the formula-cell count — but this is an assumption about the format,
not something I have verified on these files. Before any route is
judged by it, the census is validated on files where a second,
independent count is available. **If validation fails, the round
stops and says so; it does not proceed on a witness it cannot
trust.** Round 1 is the precedent: a witness taken on faith nearly
produced the opposite verdict.

## What is measured, fixed now

For each file, **formula recall** = (formula cells the route reports)
÷ (the census's `FORMULA` record count), plus the value fidelity
round 1 established.

1. **Native route, all 431 files.** Cheap; no conversion.
2. **Converted route, a registered sample of 60**, drawn with
   `random.Random(20260828).sample(sorted(names), 60)` — the seed
   and the ordering are fixed here, before the draw, so the sample
   cannot be reshaped after a result. Conversion is slow; 60 files
   is what fits, and the sample is named rather than convenient.
3. **The repair pass** on every converted file, before it is read:
   drop `definedName` elements with an empty body (round 1's two
   refusals), and rewrite `=TRUE()`/`=FALSE()` back to boolean
   literals (round 1's fabrication). Both are mechanical and touch
   no number. The repair is measured *with* the route it repairs —
   an unrepaired conversion is already known to fail.

## Criteria (fixed now)

1. **The witness validates**, per the section above. If it does not,
   the round reports that and stops.
2. **A route is adoptable only if its median formula recall is
   ≥ 99% and every shortfall class is explained at the cells.** Not
   a threshold to tune: an unexplained loss refuses the route
   whatever the percentage says.
3. **No value may change**, on either route, to the tolerance round
   1 used (`1e-9` relative).
4. **The repair pass must not touch a number.** Verified by
   comparing values before and after repair on the same converted
   file.
5. **Nothing is wired in this round.** Routing `.xls` through
   conversion would change what the engine reports on every `.xls`
   file we hold; that is its own registered round with the full
   gate, and it does not get folded in behind a measurement.

## Prediction (written before the measurement)

- **The native route's recall is bad** — the three subjects already
  measured suggest very low, and 0/349 suggests it can be total.
- **The converted route's recall is high** once the repair pass
  runs, because LibreOffice's OOXML export writes real formulas and
  round 1 showed it changes no value.
- If both hold, the recommendation is that `.xls` should be read
  **through conversion, not `legacy.py`** — and that recommendation
  is a *proposal for a further round*, not a change made here.
- I am unsure about array and shared formulas on both routes, and
  about whether LibreOffice's own `.xls` reader loses anything of
  its own. The criteria are written as explanations-required for
  that reason.

## Conditional next step (registered now so it cannot be chosen later)

**Only if the converted route passes**, a sample of the Enron corpus
is fetched and the same measurement is re-run on it, to confirm the
result holds on the target dialect. Every fetched file is hashed
against every corpus we hold before it enters any sample, per the
lead's standing instruction and the contamination rule. **If the
converted route fails, no Enron fetch happens in this round** — a
route that fails here will not be rescued by more files, and
fetching anyway would be looking for a corpus that flatters it.
