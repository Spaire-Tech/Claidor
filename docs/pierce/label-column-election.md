# Electing numeric-valued label-column formulas

**Registered before any result.** The change round that
`label-column-cost.md` priced but deliberately did not make.

## What is being changed, exactly

`_read_sheet` builds each row's elected cells with

```python
numeric = [c for c in sorted(columns)
           if c != label_column
           and (_decimal(...) is not None or _formula(...) is not None)]
```

One column per sheet is therefore never content. The measured cost:
**49,011 formula cells** across **25 of 37 corpus files** and 97
sheets are invisible to every rule, and a hand-read of twenty said
thirteen were computed date ladders and schedule columns —
`newbattle`'s repayment schedule among them, running two different
formula shapes in one series with no rule able to see either.

**The change:** additionally elect a label-column cell **when it
carries a formula whose cached value is numeric**. The 30,072 that
resolve to text or blank stay excluded — those are the cross-sheet
label mirrors (`=East!E484`, `=InputSummary!E259`), and the
hand-read said they are correctly hidden.

## Two things the change must NOT do, fixed now

Reading the code changed the shape of this round, and both
constraints are registered because neither is obvious from the
proposal:

1. **`series` must be computed exactly as today.** The next line is
   `series = len(numeric) > 1`, and it decides whether a cell
   inherits its column header. Adding the label column to `numeric`
   would flip `series` on rows that today carry a single data value,
   handing existing cells a `column_label` they do not have — which
   moves findings on rows that already work. So the label-column
   cell is appended to the *iteration*, and `series` is still
   computed on the data columns alone.
2. **The header row is not touched.** It already has its own
   `_reaches_out` filter, and a label-column formula there is part
   of the header apparatus (a year walker). Today's behaviour
   stands.

Both exist so the change is **purely additive**: new cells appear,
no existing cell changes.

## Criteria (fixed now)

1. **No existing finding may move.** Every finding the corpora
   report today must be present afterwards, **identically worded**.
   A finding that disappears or changes text refuses the round —
   that is constraint 1 above failing, and it is the failure mode
   this change most plausibly has.
2. **Planted recall.** Defects are planted into label-column series
   on our own corpora — a typed date in a computed ladder, a broken
   formula shape in a schedule column — and the engine must catch
   them. A change that elects cells and then says nothing about a
   planted defect in them has bought nothing.
3. **False-positive price, hand-read.** A registered sample of
   **20 new findings** is read at the cells. **More than 5 of 20
   false alarms refuses the round** — a new class that is wrong more
   than once in four costs an auditor more than it gives.
4. **Volume.** If the corpus finding count **more than doubles**,
   the round refuses regardless of precision. A report nobody can
   read is not an improvement, and 34,000 of the new cells are a
   single shape (`=X+1` date ladders) on four sheets — enough to
   swamp everything else on its own.
5. **The full golden-master gate runs and the baseline is
   regenerated in the same commit**, per the charter. This is the
   first change I have made that is *expected* to move the baseline,
   so the diff is read finding by finding, not waved through.

## Prediction (written before the measurement)

- **New findings will appear**, concentrated on the four daily-date
  sheets in the two WACC models.
- **`typed-over-formula` will dominate them.** A date ladder is a
  long uniform series, which is exactly what that rule is tuned for.
- **The false-positive price is the real risk, and I expect it to be
  close to the bar.** A ladder whose first cell is typed by design —
  the anchor date every subsequent `=A+1` builds on — is a
  legitimate hardcode, and if the rule flags every ladder's anchor
  it will be wrong about most of them.
- I am unsure whether criterion 4 holds. 49,011 new cells against a
  corpus that currently reports 18 analytical and a few hundred
  audit findings is a large proportional change, and doubling is
  plausible.

## What this round does not do

It does not change `_label_column`, does not touch the 30,072
text-valued cells, and does not alter any rule. If new findings are
noisy, the answer is **not** to tune a rule inside this round — that
would be tuning to a corpus. It would be a refusal, and a separate
question.

---

## Results (computed after the registration)

### Criterion 2 — planted recall: **0 of 12**

| host | planted | caught |
|---|---|---|
| `newbattle_model.xlsm` | 6 | **0** |
| `inverness_college_model.xlsm` | 6 | **0** |

Not a tuning problem. **The change cannot do what it was registered
to do**, and the reason is visible in one screenful:

```
B97:  =IF(AND(C97>0,…),dEquityBridgeTrfr,OFFSET($H$2,0,A97))   elected
B98:  (planted: typed over)                                     NOT elected
B99:  =IF(AND(C99>0,…),dEquityBridgeTrfr,OFFSET($H$2,0,A99))   elected
B100: (planted: typed over)                                     NOT elected
```

The election admits a label-column cell **when it carries a
formula**. A typed-over cell has no formula. So the change elects
every healthy cell of a computed ladder and excludes precisely the
one an auditor needs to see — the defect it was built to reveal is
the only thing it still cannot see. `typed-over-formula` never fires
because the typed cell is not in `book.cells` at all; the series
merely looks two cells shorter.

**The other criteria were never reached.** With recall at zero there
is nothing to weigh a false-positive price against, so the corpus
sweeps, the twenty-finding hand-read and the gate were not run.
Running them would have produced numbers describing a change that
cannot work.

### The change is reverted

`workbook.py` is back to its pre-round state. The tests stay, with
the refused case **pinned as refused**, so the same design is not
tried again by accident.

## Why this happened, and it is not the implementation

The design error was in the registration, and it survived because
the evidence that produced it was about *where formulas are*, not
*where defects are*. `label-column-cost.md` measured 49,011 formula
cells hidden in label columns and concluded the engine should see
them. True — and it does not follow that electing them catches
anything, because **a hardcode is defined by the absence of a
formula**. I registered a rule keyed on the presence of one.

Planted recall caught it in a single run. Nothing else would have:
the corpus sweeps would have shown new findings appearing, the
hand-read would have found them defensible, and the round would have
been adopted having bought nothing at all. **This is the loop
working exactly as it is meant to** — the step that exists to stop a
plausible change on real evidence.

## A diagnostic, labelled as such

Before proposing a successor I checked the successor could work at
all, by electing label-column cells on their **numeric value**,
formula or not, and re-running the same planted files:

> `newbattle`: **6 of 6 caught**, all `typed-over-formula`.

**This is a diagnostic, not a measurement, and may not be quoted as
one.** It was run against an unregistered change, on files whose
defects I planted and already knew the location of, with no
false-positive price taken and no gate. It says one thing only: the
successor design is not obviously impossible. Its numbers do not
enter the record.

## What the next round registers

**Elect label-column cells by their numeric value, not by carrying a
formula** — and the false-positive price becomes the whole question,
because that admits every year, index and section number a label
column holds. `label-column-cost.md` already measured that
population: 58,536 content-like numerics on the regulator corpus,
against 3,210 the label-like test recognised. The likely shape is a
guard — elect the numeric cells of a label column **only where the
column is predominantly formula-bearing**, so a computed ladder is
admitted whole and a static list of names is left alone. That is a
different registration and it starts from a prediction I no longer
hold confidently.

## Verdict: REFUSED

Criterion 2 fails at zero. Nothing is adopted, nothing is wired, the
baseline is untouched, and the gate was not run because there was
nothing to certify.
