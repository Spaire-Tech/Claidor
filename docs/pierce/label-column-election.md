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
