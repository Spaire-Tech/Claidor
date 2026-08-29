# E3c — the flagship finding, third attempt: judge a row against itself

**Registered before any code was written or any result looked at.**
This is the successor design the previous round specified in its own
post-mortem, built by the lead after the lanes were stood down.

## The question, unchanged since the plan

`swens.md` § 3a names it as the class that survives every other check:
« a formula that adds a monthly figure to an annual one is a perfectly
valid formula. It is only wrong in meaning. » `swens-plan.md` E3 makes
it the flagship demo finding, and the fourth amendment puts units at
the top of the holes.

## Two attempts died first, and both post-mortems are the design

**Attempt 1 — read the words.** `period` in the units inference. Killed
by vocabulary, not accuracy: the inference's whole period vocabulary is
`annual`, `point-in-time`, `none`, `unknown`, and **the word « month »
does not occur in `units/inference.py` at all**. « Monthly in an annual
line » is not inaccurate there, it is inexpressible (`e3b-period-granularity.md`).

**Attempt 2 — read the formulas, then read the values.** Kelso ships
470,594 values and 814 formulas, so the formula path died on it. The
values path — « if an annual value equals the sum of twelve monthly
values, that *is* the aggregation » — then failed **its own registered
coincidence control**:

| prediction | outcome |
|---|---|
| 1 — a row aggregates across ≥ 6 periods | 655 rows did |
| 2 — zero defects on clean Kelso | **failed: 65 reported** |
| 3 — a planted defect is caught | not run |
| 4 — **the coincidence control** | **failed: 503 of 655, 77%** |

Two causes, both named at the time:

1. **Most rows are mostly zeros, and zero aggregates with zero.**
   `0 = 0 + 0 + …` holds for forty periods, so any sparse row pairs
   with any other sparse row. The six-period bar measured nothing.
2. **The 65 « defects » were all stocks** — retained earnings, MRA,
   cash at bank, deferred tax. **A closing balance is not the sum of
   twelve months.** The check demanded `coarse = sum(fine)` of rows
   that never obey it and never should.

## The successor, and it is about what a row *is*

Not a threshold change. Two corrections:

1. **A row must actually vary.** The same triviality rule
   `recalc/mine.py` already applies to mined relations: a series whose
   relative spread is at or below `FROZEN_SPREAD` is arithmetic about
   constants, not a fact about the model. Applied to both series of a
   pair, this removes every zero-with-zero match.
2. **Each row declares whether it is a flow or a stock, from its own
   behaviour.** A **flow** satisfies `coarse = sum(fine)` — revenue,
   opex, interest paid. A **stock** satisfies `coarse = last(fine)` —
   any closing balance. Both are tested across all periods and the row
   is whichever it obeys.

**Then a defect is a break in the row's own established pattern**: a
flow row that takes one month where it takes twelve everywhere else,
or a stock row that suddenly sums. The row is judged against itself,
not against an assumption about what rows do.

This also fixes the sentence. « Your closing cash does not equal the
sum of its months » is wrong and a banker knows it instantly. « This
row sums its twelve months in every year but 2031, where it takes
March alone » is a finding.

## Definitions, fixed now

- **A row varies** when `(max − min) / max(|values|) > FROZEN_SPREAD`
  (1e-12), the rule already in `recalc/mine.py`. Both the fine and the
  coarse series must vary.
- **A flow period** matches when `coarse[i] == sum(fine[i·r : (i+1)·r])`
  at the lane's standing tolerance (relative 1e-9, floor 1e-12).
- **A stock period** matches when `coarse[i] == fine[(i+1)·r − 1]` — the
  last fine value in the window — at the same tolerance.
- **A row's kind** is whichever it matches in **strictly more** periods,
  and only when that kind matches at least `MIN_PERIODS` (6). A tie is
  no kind, and no kind is no finding.
- **A defect** is a period that breaks the row's established kind **and**
  equals a single fine cell in its window. A period that matches neither
  the kind nor a single cell is `unexplained` and is **not** a finding —
  it is reported as coverage.

## Criteria — the previous round's bar, verbatim and unmoved

> **The bar does not move**: the shuffle control runs again, and unless
> mismatched pairs fall to near zero the line of attack is dead and I
> will report it dead.

« Near zero » was not given a number, so one is fixed here **before the
run**, erring strict:

1. **The coincidence control.** Rows paired with deliberately wrong
   partners must produce **at most 5% as many aggregating rows as the
   real pairing**. Above that, the design is dead and this document
   says so. (Previous round: 77%.)
2. **Zero unexplained defects on clean Kelso**, and **every** defect
   reported is hand-read at the cells before it is called anything.
   Kelso is a control, not a hunting ground.
3. **Planted recall, reported against its scope.** One year of a flow
   row's coarse value is overwritten with one month's value; the check
   must name that row and that year. The number of plantable sites is
   reported alongside the ratio — a recall of 1/1 on a scope of 1 shows
   the mechanism connects and nothing more, and is not to be quoted as
   more.
4. **No existing finding may move**, in wording or presence, and the
   full golden-master gate runs before anything is wired into `audit()`.
5. **The sentence must be one a banker would repeat.** Judged, not
   measured, and written into the round so it is judged rather than
   assumed.

## Predictions, written before the run

- **The control will pass.** Requiring both series to vary should
  eliminate the sparse-row coincidence entirely, because the failure
  mode was arithmetic on zeros and nothing else.
- **Prediction 2 is the one at risk.** Stocks are now classified rather
  than mis-flagged, so the 65 should disappear — but I expect a
  residue of rows that are neither clean flows nor clean stocks
  (part-period rows, rows restated mid-model, rows whose fine and
  coarse blocks do not start on the same date). If that residue is not
  small, this refuses like the two before it.
- **Block alignment is where I expect to be wrong first.** The window
  arithmetic assumes coarse period *i* covers fine periods
  `i·r … (i+1)·r − 1`. Two blocks whose first columns are not the same
  date break that silently, and nothing currently checks it.

## What adoption would require, named in advance

A new rule key routes to the workspace category map before adoption;
the catalogue moves 20 → 21 and the golden master is regenerated in
the same commit. Nothing is wired into `audit()` until criteria 1–4
hold.
