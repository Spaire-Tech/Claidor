# The label-column exclusion — what it costs

**Registered before any number exists.**

## What the engine does today, and why

`_read_sheet` builds a sheet's cells with an explicit
`column != label_column`: **the label column is excluded from the
numeric sweep**, formulas included. `_label_column` picks exactly
one column per sheet, from the first eight, by counting *distinct*
text values — a column of row names is nearly all distinct, which is
what naming a row is for.

The exclusion is deliberate and well-reasoned. A number sitting in
the label column is usually a label: a year heading a row, a section
number, an index. Electing those as content would put labels into
every rule's population.

**But its price has never been measured**, and A6 round 2 found a
case where the price is total: `tables.xls` holds 8 formulas, every
one of them in column A, and the engine returns 27 cells with none
of them in it. Whatever the right answer is, « one column per sheet
is invisible to every rule » should be a measured decision rather
than an assumed one.

I first wrote that finding up as a defect. It is not — it is a
design decision with an unknown cost, and this round measures the
cost. **That framing matters: if I registered it as a bug I would be
measuring to confirm, not to find out.**

## What this round is not

It **does not change the engine**. No election rule is touched, no
finding moves, and the golden-master baseline is not regenerated.
This is a measurement that decides whether a change is worth
registering at all. If the cost is small, the honest outcome is
« the exclusion stands, and here is its measured price » — a real
result, and the one I currently expect.

## What is measured, fixed now

Across every corpus we hold that the engine can read — the 27-file
AU-UK regulator set, the 10 SFT closed-deal models, and the
CUSTODES/EUSES `.xls` population — for each sheet:

1. **Which column is the label column**, and how much sits in it.
2. **Formula cells in the label column**, as a count and as a share
   of the sheet's formula cells.
3. **Numeric cells in the label column** that are *not* obviously
   labels, by a test fixed here: a cell is **label-like** if its
   value is an integer in 1900–2100 (a year), or an integer ≤ 100
   with no decimal part (an index or section number). Anything else
   — a money figure, a rate, a decimal — is **content-like**.
4. **The blind spot**: content-like cells, and formula cells, in
   label columns, aggregated per corpus.

The label-like test is crude on purpose and is registered before the
draw so it cannot be tuned to make the answer come out small. Its
job is to separate « a year in the label column » from « a cash
figure in the label column », not to be subtle.

## Criteria (fixed now)

1. **If formula cells in label columns are under 0.5% of all
   formula cells, and content-like numerics under 0.5% of all
   numerics, in every corpus** — the exclusion stands. It is
   recorded as a measured, accepted limit, written into the coverage
   story A4 established, and no change is proposed.
2. **If either share is above 0.5% in any corpus** — a sample of
   **20 such cells is hand-read at the cells**, and the round says
   how many would have been a real finding had they been elected.
   Only that answer justifies a change round.
3. **Any change is a separate registered round with the full gate**,
   because electing a new column changes what the engine reports on
   every file we hold. Nothing is wired here whatever the numbers
   say.

## Prediction (written before the measurement)

- **The share will be small** — well under 0.5% on the regulator and
  SFT corpora, which are laid out with a clean label column and
  numbers to the right of it.
- **The CUSTODES/EUSES set will be worse**, because those are
  general business spreadsheets, often small tables where the first
  column carries computed years or running totals — `tables.xls` is
  exactly that shape.
- So I expect **criterion 1 to hold on the corpora that matter for
  the product and to fail on the general-spreadsheet set**, which
  would be an interesting result rather than a clean one: it would
  say the exclusion is right for models and wrong for spreadsheets,
  and that Swens is a model tool.
- I am unsure whether `tables.xls` is representative or a curiosity.
  That is the point of counting.

---

## Results (computed after the registration)

### The cost, per corpus

| corpus | formulas | in label column | numerics | content-like in label column |
|---|---|---|---|---|
| AU-UK regulator (27 files) | 5,097,860 | **78,927 — 1.55%** | 1,101,665 | **58,536 — 5.31%** |
| SFT closed-deal (10 models) | 21,965 | **156 — 0.71%** | 3,051,388 | 4,399 — 0.144% |

Worst single files: `h7_new_debt_indexation_fp` **32.0%** of its
formulas, `h7_new_debt_indexation_fds` 31.8%, `newbattle` **20.1%**.

**Criterion 1 fails on both corpora.** The bar was 0.5% for each
share; AU-UK is over it on both, SFT on formulas.

### The prediction was wrong

I predicted « well under 0.5% on the regulator and SFT corpora,
worse on the general-spreadsheet set », and reasoned that clean
model layouts keep numbers to the right of the label column. Both
named corpora are over the bar, one of them by three times on
formulas and ten times on content-like numerics. The general set
was never reached, because the corpora I expected to be clean
already settled it.

### Criterion 2 — twenty cells, hand-read

Every label-column formula cell in both corpora was enumerated
(79,083 of them) and twenty drawn with
`random.Random(20260828).sample(...)`. Reading them at the cells,
they fall into three kinds:

| kind | of 20 | example | verdict |
|---|---|---|---|
| **computed date ladder** | **13** | `=A11989+1` → 47785, on `Daily Data` beside `=A11990<=UserInterface!$B$3` | **wrongly hidden** — a typed date here silently breaks every lookup against the ladder |
| **cross-sheet label mirror** | 6 | `=CHOOSE(m_identity,SHET!E896,…)`, `=MainInputs!E530`, `= C$23 & " repayments, Year " & F165` | **correctly hidden** — these produce label *text* |
| degenerate | 1 | `=` | neither |

The SFT half sharpens it. All 156 hidden formulas there are
computed date columns — repayment, drawdown, swap profiles,
`=EOMONTH(B12,12)` period ends. On `newbattle`'s `Schedule 7 -
Repayment Schedule` the same series carries **two different formula
shapes**: `=OFFSET($H$2,0,A21)` on rows 21–25, and
`=IF(AND(C95>0,C95='Schedule 1- Lenders'!$E$7),dEquityBridgeTrfr,
OFFSET($H$2,0,A95))` on rows 95–126. A hardcoded date in a
repayment schedule is a live project-finance defect, and it is
exactly what `typed-over-formula` and `inconsistent-row` exist to
catch. Neither can see it.

### The split the hand-read implies, measured

The two kinds separate on one fact — **what the formula's cached
value is**:

| | count | share |
|---|---|---|
| label-column formulas with a **numeric** result | **49,011** | 62% |
| label-column formulas producing **text or blank** | 30,072 | 38% |

The numeric class is the date ladders; the non-numeric class is the
label mirrors (`= E406`, `=East!E484`, `=InputSummary!E259` — all
resolving to text). That is a principled, measurable discriminator
rather than a heuristic tuned to this sample.

**Its honest weakness:** the numeric class is not pure. It contains
`SelectedInputs!E66: =CHOOSE($B$3,ENWL!E66,…) → 0`, a label mirror
whose result happens to be a number. 133 `CHOOSE` mirrors sit in it.

### How concentrated this is — the number on its own misleads

| | |
|---|---|
| numeric-valued label-column formulas | 49,011 across **97 sheets** |
| from the top 4 sheets | 34,180 — **70%** |
| shaped `=X+1` (a date ladder) | 34,178 — **70%** |
| files touched | **25 of 37** |

So: **widespread in incidence, concentrated in volume.** Most of the
1.55% is four daily-date sheets in the two WACC models. Quoting the
headline without this would overstate a blind spot that is, by
volume, mostly one shape in one place — and understate that it turns
up in two files out of three.

## Verdict

**The exclusion has a real, measured cost, and it is not what I
expected.** Criterion 1 fails on both corpora; criterion 2's
hand-read says 13 of 20 hidden cells are computed series a rule
would have something true to say about.

**Nothing is wired, per criterion 3.** Electing 49,011 new cells on
the regulator corpus would move findings on files the golden-master
baseline covers, which is a registered round with the full gate and
a regenerated baseline — not an amendment to a measurement.

**What I propose that round tests**, priced by what is above:
*elect a label-column cell when it carries a formula whose result is
numeric* — 49,011 cells, 62% of the hidden class, admitting the date
ladders and excluding the label mirrors. It must be measured for its
false-positive price like any other change: a date ladder is a
plausible source of `typed-over-formula` noise as well as of true
findings, and 34,000 cells of one shape could swamp a corpus report
on its own.

**What this round settles for the record:** the label column is not
a safe place to not look. It was a reasonable design decision, it
was never measured, and measured it costs more than anyone thought —
including me, in writing, before the numbers.
