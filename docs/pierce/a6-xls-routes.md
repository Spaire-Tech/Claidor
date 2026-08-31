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

**430 `.xls` files** from the CUSTODES/EUSES subjects under
`server/scripts/custodes_work/` (the population is fixed by
`scripts/a6_sample.py`, committed with this round). I first wrote
431 here: that count came from a `find` across all of `scripts/`
and included `corpus_sft/inverclyde_model.xls`, which belongs to
round 1's material, not this population. Corrected before the draw. Real spreadsheets, formula-bearing,
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

1. **Native route, all 430 files.** Cheap; no conversion.
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

### A method fault found before it could corrupt a number

The first conversion pass wrote every output into one flat
directory. Two files in the population share a basename while
**differing in content** —
`grades_Spring04_Geol%#A8A32.xls`, one under `subjects/` and one in
the Tasi tree — so one conversion silently overwrote the other, and
pairing by name would have measured one file against a different
file's conversion. Sixty conversions produced fifty-nine outputs,
with no error reported anywhere; the count is the only thing that
showed it.

Fixed by converting each original into its own indexed directory and
pairing through a committed manifest (`scripts/a6_manifest.py`),
never through a basename. The sample was re-converted from scratch.

Checked in the same breath, since it would have mattered more: the
430 files are **430 distinct contents** by md5 — the collision is a
naming coincidence, not a duplicated population.

---

## Criterion 1 — the witness validates (measured)

The census was checked against LibreOffice's independent count on
all 60 sampled files. **59 agree exactly, record for record.**

The one difference is fully explained and is not the census's:
`rdc022801.xls` holds 141 `FORMULA` records and 4 `BOOLERR` records,
and its conversion carries 141 real formulas **plus 4 fabricated
empty `=` formulas** — one per boolean cell. The census is right
about the original; the excess is round 1's fabrication defect,
reproduced here on a completely different corpus and by a different
route into the finding.

The shared-formula worry registered in advance did **not**
materialise: files carrying `SHRFMLA` groups (up to 131 of them)
agree with the census exactly, so BIFF8 does emit one `FORMULA`
record per participating cell as assumed.

### A fourth instrument error, found by this validation

The validation first reported two disagreements. The second,
`ribimv001.xls`, showed 3,758 records against 3,762 converted
formulas with no boolean cells to explain it. Localised per sheet
and then per cell, the four turned out to be **text that begins with
an equals sign** — human notes such as `=tput learn x unyld dice x
ult yld` and `=1 millionths of mm2`, stored as strings in the
original and preserved as strings by the conversion.

My counter classified any string starting with `=` as a formula.
The correct discriminator is openpyxl's `data_type`: `"f"` is a
formula, `"s"` is a string that merely looks like one. With it, that
file agrees exactly — 1,619 against 1,619 on the sheet that differed.

**This also touches round 1.** `a6_fidelity.py` used the same wrong
test, which is the likeliest source of the one unexplained extra
formula recorded there (`our_lady`, 10,716 against 10,715 boolean
cells). Round 1's material is re-measured with the corrected
instrument and its document corrected if the number moves — the
finding itself does not depend on it, since the fabrication was
established by exact agreement with the boolean counts.

**Verdict on criterion 1: the witness is validated** and the round
proceeds.

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

---

## Results (computed after the registration)

### The native route — all 430 files

| | |
|---|---|
| files scored (records hold ≥ 1 formula) | 428 |
| **median formula recall** | **1.000000** |
| aggregate recall (79,546 records) | **0.9872** |
| files read exactly | 352 |
| files below 1.0 | 76 — 1,213 formulas missed between them |
| files above 1.0 (over-reported) | 7 — 192 formulas too many |
| refusals | 1 |

The single refusal is `._01-38-PK_tables-figures_Table II.2.xls`, a
macOS AppleDouble resource fork rather than a workbook. **Refusing
it is correct**, and it is not counted against the route.

### The converted route — the registered 60

| | |
|---|---|
| **median real-formula recall** | **1.000000** |
| aggregate recall (15,113 records) | **0.9920** |
| files read exactly | 50 |
| refusals | **0** |
| fabricated formulas | **4 — against exactly 4 `BOOLERR` records** |

### Head to head, on the same 60 files

| | native | converted |
|---|---|---|
| median recall | 1.000000 | 1.000000 |
| aggregate recall | 0.9811 | **0.9920** |
| better on | 1 file | 2 files |
| equal on | 57 files | 57 files |

The two routes agree on 57 of 60. Where they part, conversion
usually wins by repairing a native shortfall —
`2003-4%20budget.xls` goes 0.520 → 0.996, `01-38-PK_tables-figures`
0.826 → 0.917 — and loses once, `Lalit_TimeReport_Fall02.xls`
1.000 → 0.939.

## The prediction was wrong, and this is the important part

The registration predicted the native route's recall would be
**bad — « very low, and 0/349 suggests it can be total »**. It is
not. **The median `.xls` is read perfectly and the aggregate is
98.7%.**

The record has been carrying a stronger claim than the evidence
supported. `serious-mining.md` measured three subjects, found two
with losses, and the handoff generalised it to « every `.xls`-route
measurement we hold understates the engine ». The three subjects
reproduce here — `act3_lab23_posey.xls` matches exactly, 40 records
and 30 read — so **the finding was real**; it was the *scope* that
was wrong. A tail of 76 files out of 428 was described as the rule.

**What this does to A6's price.** A6 has been carried as the gate on
the Enron corpus, on the premise that we cannot read `.xls`. We can:
today, natively, at 98.7% of formula cells. The corpus is
**substantially readable now**, and A6 is a quality problem in a
tail, not a locked door. That is a materially different plan input
and is the single most useful thing this round produced.

## What is still wrong, by class

1. **Conversion fabricates a formula per boolean cell** — 4 for 4
   here, exactly as round 1 found on the closed-deal models. Two
   corpora, two formats, exact agreement.
2. **The native reader counts text as formulas.** Seven files
   over-report; on `ribimv001` the excess is exactly three cells
   holding human notes that begin with `=`, such as `=tput learn x
   unyld dice x ult yld`. `legacy.py` makes the same misclassification
   my own instrument did.
3. **The label column is not elected, and nor is any formula in
   it.** `tables.xls` holds 8 formulas, all in column A (`=+A5+1`,
   cached 1989-1996). Both routes lose all 8: `read_workbook`
   returns 27 cells and **not one is in column A**.

   **Mechanism, established after this section was first written:**
   it is neither an intake fault nor an accident. `_read_sheet`
   excludes the label column from the numeric sweep by an explicit
   `column != label_column`, and `_label_column` picks exactly one
   column per sheet from the first eight, by distinct-value count.
   The exclusion is deliberate and documented — a number in the
   label column is usually a label.

   The honest statement is therefore narrower than « a defect »:
   **one column per sheet is invisible to every rule, by design, and
   the cost has never been measured.** I first wrote this up as
   something wrong. It is a design decision carrying an unmeasured
   price — a different claim, and its own round
   (`label-column-cost.md`).

## Verdict

**No route is adopted, and criterion 5 says nothing is wired
regardless.** Both clear the median bar; neither has every shortfall
class explained at the cells, which criterion 2 requires before
adoption. What the round delivers instead is the comparison and the
correction:

- the native route is **good, not broken** — 98.7% aggregate;
- conversion is **slightly better** (99.2%) and **repairs the worst
  native failures**, at the cost of fabricating formulas from
  booleans;
- and the most valuable defect found is in **neither** route.

**The Enron fetch does not happen in this round.** The registration
made it conditional on the converted route passing, and « passing »
means criterion 2 in full, not the median alone. It is also no
longer urgent in the way the orders assumed: if `.xls` is already
readable at 98.7%, the corpus can be sampled for Proof 1B on the
native route while the tail is fixed.

## Next, priced by what was measured

1. **The label-column exclusion** (class 3) — measure what it costs
   before proposing to change it: `label-column-cost.md`.
2. **The native tail**: 76 files, 1,213 formulas. The two worst
   (`2003-4%20budget.xls` at 0.520, `20030114144840!Superi` at
   0.772) are where the mechanism will be legible.
3. **Text-as-formula in `legacy.py`** (class 2) — small, mechanical,
   and it currently inflates every `.xls` formula count we report.
4. Only then, conversion as a *repair* for the native tail — it
   demonstrably fixes the worst cases, but it is a second intake
   surface and should be justified against a fixed native reader,
   not against a broken one.
