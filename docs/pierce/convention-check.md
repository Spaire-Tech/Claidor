# « This line is computed differently from every model we hold » — registration, before any code

3 September 2026. The check the patterns round made possible
(`label-patterns.md`) and declined to build until material from the
founder's world existed. That material arrived with the two
formula-intact project-finance models (`FORMULA_INTACT_MODELS.md`):
the FHWA P3-VALUE tool and the Packt companion model. This round
builds the check, mines the conventions with those two models in the
pool, and measures it the only honest way a two-model pool allows —
each model held out in turn, the check run against conventions it
had no part in.

## The claim, fixed now

For a labelled formula row in a model under review, when the same
normalised label is computed the same way in at least three files
from at least two independent families, and this model computes it
differently, the check says so: what the row is made of here, what
it is made of everywhere else we hold, and how many models agree.
It is a **question, not an error** — a reviewer's « why is this one
different? » — and it grades as a smell.

The shape compared is the bag of `meaning.patterns`: sorted function
names, sorted operators, sorted labels of the rows read. A plain link
(one operand, no operator) is never a convention. Rows whose label is
a schedule word (`GENERIC`) are skipped, as in the mine.

## The pool and the families, fixed now

The corpora of the patterns round plus the two project-finance
models. Independence is by **author**, not folder — the patterns
round's lesson: the thirty-two Ofwat PR24 financial models (drafts
and finals) are one family, `pr24-fm`; every other corpus folder is
a family; the FHWA tool and the Packt model are one family each.
Files are de-duplicated by content hash.

The conventions are committed as product data
(`polar/tieout/meaning/data/conventions.json.gz`): one line per
label — the pattern, the number of files, the number of families —
and nothing from any file's contents beyond the label words and the
shape. A regenerating script (`scripts/conventions_build.py`) takes
the mine and a list of files to hold out.

## Where the check runs

In the analytics layer (`analytics.py`), beside the statement checks,
as rule `convention`: it reads the same structure and reports through
the same tallies, abstentions and pass sentences, so the Overview's
checks list carries it without a new screen. It is not an audit rule:
the golden master's cell-level surface does not change, and the
corpus files — which are the pool — would otherwise be judged against
conventions they themselves supplied.

## Measures, fixed now

1. **The pool**: files, families, labelled formula rows, labels with
   a convention (three files, two families, strict majority, not a
   link), and of those the ones held by three or more families.
2. **Reach, held out**: for each of the FHWA tool, the Packt model and
   the founder's model, with that file out of the pool: labelled
   formula rows; rows whose label has a convention; agreeing;
   disagreeing.
3. **Precision of the disagreements**: every disagreement on the three
   held-out files read by hand (all of them, if under thirty;
   otherwise a seed-20260903 sample of thirty), graded A (a real
   difference in how the line is computed, worth a reviewer's
   question), B (the same computation written differently — the bag
   lost the equivalence), C (the label means something else here).
4. **The sentence**: the finding's words on one A case, as the screen
   would show them.
5. **Cost**: the check's time on the FHWA tool beyond the read.

## Predictions, registered

- Pool: over 1,900 labels with a convention; the two project-finance
  models add fewer than 40 of them, because their labels are theirs.
- Reach: under 3% of labelled formula rows on the FHWA tool, under 10
  rows on the Packt model, under 5 on the founder's model. The check
  will be nearly silent on the founder's world, and this round says
  so with a number instead of a hope.
- Of the rows reached, at least half disagree — a label shared across
  worlds is usually computed differently across worlds.
- Precision: A+B at or above 60%; C the rest.
- Cost: under two seconds on the FHWA tool beyond the read.

## Out of scope, named

- No fuzzy label matching, no synonyms: a label joins a convention by
  its normalised text only. The reach number says what that costs.
- No formula-tree comparison: the bag stays the bag.
- The founder's model stays out of the pool.

---

# Results

*(appended after the round; nothing above this line changes)*

## Result — 3 September 2026

Two deviations from the registration, both made after the first
numbers were read and both stated here before any number is used:

- **The family rule was written one way and first coded another.**
  The registration says a convention is « computed the same way in
  at least three files from at least two independent families »; the
  first build counted the families that *use* the label, so
  thirty-two copies of the Ofwat template agreeing with each other
  passed as a convention. Re-coded to count the families among the
  *agreeing* files, as written. 930 conventions became 753.
- **Two kinds of row were let through that the registration's own
  logic excludes.** A row named for the time axis (« Financial year
  ending », repeated at the top of every block: seventy-six of the
  first run's seventy-nine departures on the FHWA tool) is a header,
  not a line; and a row that merely links to a line says where it
  comes from, not how it is computed — the mine never makes a
  convention of a link, and the check now judges none against one.
  Both are the reader question the patterns round named (« year rows
  read as row labels ») answered where it bites. Numbers before and
  after are both given.

A third deviation, found on the product's own fixture after the two
above: **a plain block sum is not a convention either.** `SUM` over
one range and nothing else is « the block above, added up » — true
of every total line in every model and different in every one only
by the block's first label, so the Cascade demo model's « Total
adjustments » was reported as computed unlike six models whose
« total adjustments » sums a different block. Excluded from the mine
and from the check, on the same logic as the link. This took the
FHWA tool's one remaining departure (« Taxable profit », whose held
side was a block sum) with it.

### Measure 1 — the pool

| | |
| --- | --- |
| Files | 89 (87 corpus files by content hash, plus the FHWA tool and the Packt model) |
| Families | 7: `pr24-fm` (32 Ofwat financial models), `corpus_regulator`, `corpus_au_uk`, `corpus_sft`, `corpus_models`, `fhwa`, `packt` |
| Conventions (three agreeing files, two agreeing families, strict majority, not a link, not an axis word, not a block sum) | **668** (753 before the block-sum exclusion; 930 before the family correction) |
| Held by three or more agreeing families | **21** (29; 132) |
| Added by the two project-finance models | 0 net: the pool holds 668 with either held out |

The prediction of « over 1,900 » was wrong twice over: it carried the
patterns round's eligible-label count, not its confident count, and
it predates the family correction. Under the rule as written, most of
what the corpus agrees on is one regulator's template agreeing with
itself; twenty-nine lines are conventions in the sense a reviewer
would mean.

### Measure 2 — reach, held out

| Held-out file | Labelled formula rows | Reached, first run | After axis and link exclusions | After the block-sum exclusion | Agree | Disagree |
| --- | --- | --- | --- | --- | --- | --- |
| FHWA P3-VALUE 2.3 | 16,161 | 79 (0.5%) | 1 (0.01%) | **0** | 0 | 0 |
| Packt companion model | 102 | 3 → 1 after the family fix | 1 (1.0%) | **0** | 0 | 0 |
| The founder's model | 217 | 0 | 0 | **0** | 0 | 0 |

The check is silent on all three files. The founder's model shares
no computed line name with anything we hold; the two project-finance
models shared two, and both were block sums. Every row the check
reached before the last exclusion disagreed (prediction: at least
half); after it there is nothing to count.

### Measure 3 — precision of the departures, read by hand

First run, FHWA, seed-20260903 sample of thirty of the seventy-nine:
28 C (« financial year ending », a block header linking to the axis)
and 2 A — **7% A+B**. After the exclusions there are two departures
across the three files, both read:

| File · row | Here | Held | Grade |
| --- | --- | --- | --- |
| FHWA `P3 Financing!301` « Taxable profit » | taxable profit before losses × a pass-through flag, adjusted for losses carried forward | the sum of a revenue block (4 of 7 files, two Ofgem families) | **A** — two worlds compute taxable profit differently, and the question is fair; the held side is a thin convention (four of seven) |
| Packt `P&L!17` « EBIT » | `SUM` over the block from EBITDA | EBITDA plus the depreciation line (6 of 6, two families) | **B** — the same computation written as a block sum; the bag lost the equivalence |

**A+B 2 of 2** on a denominator of two, before the block-sum
exclusion removed both rows from the check's reach (the Packt row
was itself a block sum; the FHWA row's held side was one). The
prediction (at or above 60%) failed on the registered run and cannot
be scored on the final one: the denominator is zero.

On the product's own demo model (Cascade), the check's one departure
before the third exclusion — « Total adjustments », a block sum
against six models' block sums — was a C, and is why the exclusion
exists.

### Measure 4 — the sentence

On the FHWA row as it stood before the block-sum exclusion, as the
Overview would carry it under « A line is computed unlike every
other model we hold »:

> Here « Taxable profit » is made of a typed number, « tax pass
> through to parent company 0 no 1 yes », « tax pass through to
> parent company 0 no 1 yes » and « taxable profit using nol carry
> forward », added and multiplied and subtracted. In 4 of the 7
> models we hold that carry this line, from 2 independent sources, it
> is made of the range from « tirg revenue », through SUM.

Readable, and honest about the thinness of the held side. The
repeated operand is the bag telling the truth about a formula that
reads the same flag twice.

### Measure 5 — cost

| | |
| --- | --- |
| First implementation (every labelled row shaped, then compared) | 109 s on the FHWA tool |
| After shaping only the rows whose label is held | **0.7 s** |
| Packt | under 0.01 s |

The prediction (under two seconds) holds after the change; the first
implementation was wrong by two orders of magnitude, and the fix is
the registration's own rule read literally: the check compares rows
we hold a convention for, so only those rows need a shape.

### Predictions, scored

- Pool over 1,900 — **wrong** (668; the count was the wrong count and
  the rule was the wrong rule). Two models add fewer than 40 — holds
  (0 net).
- Reach under 3% / under 10 rows / under 5 rows — holds (0 / 0 / 0).
- At least half disagree — holds where anything was reached; nothing
  is, on the final run.
- Precision A+B at or above 60% — **wrong on the registered run**
  (7%); not scorable on the final one.
- Cost under two seconds — **wrong at first** (109 s), holds after
  the row filter (0.7 s).

### What the round decides

1. **The check exists, runs in the product, and says nothing about
   the founder's world** — not one row on the FHWA tool, the Packt
   model or the founder's model. That is the number the patterns
   round asked for, and it is zero.
2. **Reach is a vocabulary problem, not a pattern problem.** The two
   project-finance models compute revenue as traffic times toll, debt
   service as interest plus principal, interest as rate times balance
   — and none of those lines shares a normalised label with anything
   we hold, so no convention forms. Three independent project-finance
   families with formulas would make them; two do not, by the rule.
3. **Twenty-one real conventions, all regulators'.** Under the rule
   as written the corpus agrees on twenty-one lines across three or
   more authors: tax, RAV and revenue-building lines. Those are the
   check's whole reach today, and a regulator's model is where it
   would speak.
4. **Three exclusions the registration implied and did not state**
   — axis rows, links, block sums — each found on a real file within
   the hour. The bag says what a row is made of; for a total line
   that is « the block above », and the check now knows to stay
   quiet there.
5. **The axis-row question is closed** for this check and the mine.
   The reader's own header detection still picks one header row per
   sheet; block-repeated headers remain a reader question for the
   audit's rules.
