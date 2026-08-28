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
