# E3b — a monthly figure in an annual line, without the units inference

**Registered before any result.** My objection to the test is in the
lane log, written before I began, and this document is what I did
about it rather than instead of it.

## Why this does not use the `period` dimension

**Not an accuracy judgement — a vocabulary one.** The units
inference's entire period vocabulary is `annual`, `point-in-time`,
`none` and `unknown`. The word « month » does not occur anywhere in
`units/inference.py`. A monthly row classifies as `unknown`, never
as something that *disagrees* with `annual`.

So « a monthly figure in an annual line » is not inaccurate on that
dimension, it is **inexpressible**, and no accuracy work on it would
produce the check. One grep established that; it would otherwise
have been a week of arming a dimension that cannot say the word.

## What it uses instead — and it is already in this lane

`PeriodAxis.per_year` in `structure.py`: **columns per canonical
year, read from the sheet's own printed labels** — 1 annual, 2
semi-annual, 4 quarterly, 12 monthly, 0 when the labels are not
year-shaped. No inference, no second key, nothing owed by another
lane.

**Measured before designing anything** (`scripts/period_axis_survey.py`,
10 closed-deal models, 150 axes):

| per_year | axes | reading |
|---|---|---|
| 2 | 97 | semi-annual |
| **12** | **37** | **monthly** — `InpM`, `CalcM`, `Monthly Project Workings` |
| 1 | 11 | annual |
| 4 | 1 | quarterly |
| 0 | 2 | labels not year-shaped — an honest abstention |
| 80, 120 | 2 | **the instrument distorting — see below** |

**All ten of ten models mix periodicities.** The substrate the check
needs is not hypothetical: every one of these deals has monthly
sheets feeding coarser ones.

### The instrument's own weakness, found before it was trusted

`newbattle`'s `Interface Constn` reports **per_year = 120** and
`Interf Constn Ops costs` **80**. Their axes label *every* column
`FY2018`, so `per_year` counts columns for one canonical year rather
than measuring a periodicity. The labels do not decide, and the
honest value is **unknown**, not 120.

Guard, fixed now: **only `per_year` in {1, 2, 4, 12} is trusted.**
0 and anything above 12 mean the axis did not say, and the check
abstains rather than guessing. Repairing `per_year` itself is a
separate registered round — it is structure, and it moves findings.

## The defect, stated so it can be wrong

A formula on a **coarse** sheet (per_year 1 or 2) that reads a cell
on a **finer** sheet (per_year 4 or 12) **without aggregating it** —
one month's number used where a year's belongs.

Aggregation is what makes the ordinary case ordinary: a semester
column summing six monthly columns is correct and must stay silent.
So the check fires only on a **bare cross-axis reference**: the
formula reads a single cell from the finer sheet and does not sum
across that sheet's columns.

## Criteria (fixed now)

1. **Planted recall.** Defects are planted by replacing an
   aggregating cross-axis reference with a bare one, on our own
   models. The rule must catch them, reported **against its scope** —
   how many plantable sites exist, not just the ratio.
2. **False-positive price, hand-read at the cells.** The standing
   instruction holds: *if the price is anything but tiny, report it,
   do not tune it to pass.*
3. **No existing finding may move**, in wording or presence.
4. **Full gate, golden master regenerated in the same commit** if
   adopted. The catalogue would move 20 → 21 and I name that in the
   log the same day.
5. **The sentence must be one a banker would repeat.** Not a
   criterion I can measure, so it is written into the round as a
   thing to be judged rather than claimed: the detail names the two
   sheets, their periodicities, and the cell.

## Prediction (before the measurement)

- **Plantable sites will be plentiful** — 37 monthly axes against 97
  semi-annual ones in ten models, and every model mixes.
- **The false-positive price is the risk.** A model may legitimately
  read a single monthly cell into a coarse sheet — an opening
  balance, a rate, a flag — and I expect a real rate of those. If it
  is not tiny, this refuses like the last one.
- I am unsure whether « does not aggregate » is separable from
  « aggregates elsewhere in the same formula ». That is where I
  expect the design to be wrong first.

## Routing

A new rule key routes to Atelier before adoption, per standing
orders.
