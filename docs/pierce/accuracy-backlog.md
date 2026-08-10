# The accuracy backlog

Parked on 10 August 2026, deliberately and with the numbers written down,
to come back to fresher. Nothing here is a mystery — every item has a
measured cause and a named next step.

## Where the numbers stand

| | Measured | How |
|---|---|---|
| Model audit — recall | **56%** | 150 defects planted in real EUSES spreadsheets that were silent before |
| Model audit — collateral false positives | **0** | Same run, twice |
| Model audit — noise on untouched files | 0.62% of formulas; 93% of 1,577 spreadsheets report nothing | Full EUSES financial + modeling categories |
| Model audit — precision on untouched files | **NOT MEASURED** | Needs adjudication or a labelled corpus |
| Deck tie-out — precision | 0 false positives on two decks | The Cascade pair only |
| Deck tie-out — recall | **NOT MEASURED** | 5 injected errors on one deck is not a measurement |
| Legacy `.xls` reading | 99.2% of 1,590 files | 202,499 formulas decompiled |

By rule, on planted defects:

| Rule | Recall |
|---|---|
| `skipped-cell` | 94% |
| `typed-over-formula` | 64% |
| `inconsistent-row` | **10%** |

## Why `inconsistent-row` misses what it misses

Instrumented over 70 planted defects, after the two fixes already made:

| Gate that stops it | Share |
|---|---|
| **No majority shape in the run** | **30%** |
| **Columns do not look like periods** | **30%** |
| Found | 14% |
| More than one deviant in the run | 10% |
| Run shorter than three cells | 10% |
| More typed cells than calculated | 3% |

Sixty per cent sits behind two gates. Neither wants a looser threshold;
both want a better idea.

## The two ideas

### 1. Shared formulas are ground truth, and they are already parsed

When a formula is filled across a range, Excel stores it **once** in a
`SHRFMLA` record and every cell in the range holds a stub pointing at it.
That is the file format itself asserting « these cells are one
calculation » — no heuristic, no threshold, no guess. A cell inside such a
range carrying its own independent formula is by construction an exception
to a pattern Excel has already declared.

`polar/tieout/legacy.py` reads these records and expands them, then throws
the range away. Keeping it gives a series definition with no false-positive
risk at all.

**Open question:** `.xlsx` has the same mechanism (`<f t="shared"
ref="B2:B10" si="0"/>`) and openpyxl may normalise it away before this
code sees it. Check before building.

**Targets:** the 30% blocked by « no majority shape ».

### 2. Ask whether headers resemble each other, not whether they match a list

`_over_time` tests column headers against a whitelist of period formats.
Real headers are `Jan-03`, `2003-04`, `Q1 FY05`, `Week 1`, and the
whitelist fails all of them.

The distinction that actually matters is **homogeneity**. A series has
headers of one shape — all dates, all `FY####`, all integers. A table of
different quantities has headers like « Min coverage | Rating | Cost of
debt ». Comparing headers to each other is format-agnostic and captures
the real thing; comparing them to a list of formats never will.

**Targets:** the 30% blocked by « columns are not periods », without
losing the five rows of Damodaran's ratings table that this gate exists
to suppress.

**Expected together:** `inconsistent-row` from 10% toward 40–50%, overall
recall from 56% toward 70%, with the precision cost measured at each step
rather than assumed. For reference the best published detector on this
problem sits near 62% recall and 64% precision; this one is at 56% recall
with zero collateral.

## Three measurements still owed

1. **Ablation.** Turn each gate off in isolation and record what it costs
   and buys. The current knowledge is *where* things stop, not what each
   gate is *worth*.
2. **Precision on untouched files.** The audit reports ~1,250 findings
   across EUSES and nobody has judged them. Hand-adjudicate a random 60,
   with the method stated: the tool's author is the judge, which is weaker
   than an independent corpus and better than a hole.
3. **The deck tie-out has no recall number at all.** This is the largest
   blind spot and the one that matters most, because the tie-out is the
   product and the model audit is a feature. Same mutation technique: take
   a clean deck, perturb the *model* rather than the deck, and check that
   the deck is reported stale — which is the realistic case, a model
   revision the deck never caught up with, not a single typo.

## What is blocked, and by whom

**CUSTODES** — 70 spreadsheets with the wrong cells marked by hand, the
only place published precision baselines live. `sccpu2.cse.ust.hk` returns
403 from the egress proxy, as does all of `cse.ust.hk`. The proxy's
documentation says to report a policy deny rather than route around it, so
it is reported here: **one hostname on the environment's network
allowlist, plain HTTP.**

It is no longer on the critical path. Mutation testing gave a recall
number without it, and adjudication will give a precision number without
it. What CUSTODES adds is *independence* — somebody else's judgement of
which cells are wrong — and that is worth having eventually and is not
worth waiting for now.

## The lesson worth keeping

The rule was switched off for a day and the worry was written down the
same afternoon: *« either those models contain no inconsistent rows, or I
tightened until the rule stopped firing »*. It stayed an open question
because there was no way to settle it — and there was, for the cost of an
hour, by breaking spreadsheets on purpose.

**A checker with no recall measurement is a checker that is silently
allowed to be quiet.** Every rule added from here starts with the mutation
that proves it fires.
