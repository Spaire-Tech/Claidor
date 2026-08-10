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
| Deck tie-out — recall, overall | **83%** | 99 figures broken one at a time on the clean Cascade deck |
| Deck tie-out — recall, on figures it linked | **100%** | Same run: 82 of 82 |
| Deck tie-out — coverage | **80%** | 102 of 128 printed figures linked to the model |
| Deck tie-out — collateral false positives | **0** | Same run |
| Legacy `.xls` reading | 99.2% of 1,590 files | 202,499 formulas decompiled |

By rule, on planted defects:

| Rule | Recall |
|---|---|
| `skipped-cell` | 94% |
| `typed-over-formula` | 64% |
| `inconsistent-row` | **10%** |

## What the deck tie-out's number actually says

Measured 10 August by `scripts/deck_recall.py`. One figure at a time on
the clean Cascade deck, the printed text rewritten and re-parsed by the
reader's own parser, then put through `check.tie_out_both` — the
production path, not a replica of it.

| | found | missed | recall |
|---|---|---|---|
| one tick — last digit off by one | 33 | 8 | 80% |
| stale — a 4–15% move | 31 | 6 | 84% |
| transposed — two digits swapped | 18 | 3 | 86% |
| **on figures it had linked** | **82** | **0** | **100%** |
| **over every figure broken** | **82** | **17** | **83%** |

**Every single miss is a figure the checker never linked.** Not one is a
figure it linked and then failed to catch drifting. That is the whole
finding, and it says the work is not in the comparison — the comparison is
exact and cannot be wrong — but in **coverage**.

Coverage on this deck is **80%**: 102 of 128 printed figures reach a cell.
The 26 that do not:

| | |
|---|---|
| 23 | no output fits the label |
| 8 | two outputs fit equally well |
| 2 | one end of a printed range |

(That is 33 against 26 because the merge returns the workbook pass's
unlinked list whole — see the defect below.)

**Read this number carefully.** 83% is recall over the 99 mutations
attempted, and those are not a uniform sample: 21 sites had no usable
mutation — mostly `transposed` on figures like `9.9` where no two adjacent
digits differ. And it is one deck. Nine slides of a fixture whose author
also wrote the checker is far weaker evidence than the model audit's 150
defects in spreadsheets somebody else built. **The next real step is
decks nobody here made.**

### Three defects the measurement exposed

**1. `TieOut.unlinked` over-reports.** The merge returns the workbook
pass's unlinked list whole, so a figure the Outputs pass checked appears
in both: 94 + 8 + 33 = 135 against 128 figures printed. `service.figure_map`
already works around it; the check itself still has it, and any denominator
built on it is wrong.

**2. A deck figure's `location` is not a location.** It is « slide 2 » —
the slide, not the spot — so two figures printing the same text on one
slide are indistinguishable by it. Cascade has exactly one such pair
(`$48.9mm` on slide 2, once in a tile and once in a sentence) and it was
enough to make the first run of this harness report a detection failure on
the deck's headline figure that the checker had in fact caught. The anchor
is the real coordinate.

**3. Two bugs in the harness itself, both found by reading its output.**
A percentage is held as a fraction and printed as a percentage, so the
first version mutated `11.8%` into `0.1%` — a figure that links to nothing
and was counted as a miss the checker never had a chance at. And the
collision above. Both are recorded because a measurement is only worth
what its harness is worth, and the first two runs of this one were wrong.

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
