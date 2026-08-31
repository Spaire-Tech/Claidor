# E3a — currency and scale mismatches, armed only where E2 answers

**Registered before any result.** Orders: E3 is the top item, and it
splits — E3a arms the dimensions Dynamo's E2 verdict measured as
safe (`currency`, `scale`: answered on 34.6% of rows, **wrong on
none**), while E3b (`period`) waits, because E2 says `period` is
wrong on 24.9%/64.1% and is not to be quoted.

## What is being added

Two rules, kept separate so each can be adopted or refused on its
own evidence:

| rule | the finding |
|---|---|
| `currency-mismatch` | an additive formula whose terms are in two different currencies |
| `scale-mismatch` | an additive formula adding a thousands figure to a millions one |

## How it rests on E2, and where it must stay silent

Dynamo's `units` library already computes the evidence:
`propagate()` returns a `Conflict` for a formula that only adds and
subtracts whose terms' units disagree, and `unknown` in a dimension
is an **abstention, not a failed guess**. Two consequences fixed
now:

1. **A finding may only rest on a dimension E2 *answered*.** If any
   disagreeing term is `unknown` on the dimension in question, there
   is no finding — an abstention is recorded instead (A4's
   machinery), so the report says we looked and could not tell.
2. **`Conflict.units` merges currencies and scales into one tuple**,
   so it cannot say which dimension disagreed. Sentinel derives that
   itself from the precedent labels through the public surface.
   `units/` is Dynamo's and is not edited here.

Further guards, registered rather than discovered:

3. **Row-wise sheets only.** `orientation()` exists because a data
   table's row is a record — `Date | Maturity | rate` — with no
   single unit, and typing it would be a lie. A conflict on a
   column-wise sheet is not judged.
4. **Two distinct *answered* values minimum** on the dimension. One
   answered value plus one abstention is an abstention.

## What I expect to find, and it is close to nothing

**Written before running anything, because it is the most likely
outcome and it would be easy to present a null result as a
disappointment rather than a prediction.**

Dynamo measured that **neither ED2 nor GD3 carries a single
currency-bearing number format** — the « £m » lives in a Units
column and nowhere else — and `rows_from_cells` does not populate
`declared_units`. So on the regulator corpus the currency dimension
has **no anchor to spread from** and will be `unknown` nearly
everywhere. E2 answering on 34.6% of rows is the same fact.

Therefore:

- **`currency-mismatch` will fire on almost nothing**, and that is
  the inference being honest rather than the rule failing.
- **`scale-mismatch` is the one with a real chance**, because scale
  can be read from magnitudes and headers without a declared column.
- If both fire zero times on the whole corpus, the round's result is
  « armed, correct, and silent here » — which is a pass on the
  false-positive criterion and **not** evidence the check works. The
  planted recall is what shows that.

## Criteria (fixed now)

1. **Planted recall.** Currency and scale mismatches are planted
   into our own corpora — a sum crossing two declared units — and
   each rule must catch its own class. A rule that catches none of
   its planted defects is refused, however quiet it is on the
   corpus.
2. **False-positive price: every new corpus finding is hand-read at
   the cells.** The orders override the usual autonomy here and the
   instruction is taken literally: **if the price is anything but
   tiny, report it — do not tune the rule to pass.** A unit finding
   that cries wolf teaches a reviewer to ignore the class that
   contains the best finding we will ever ship.
3. **No existing finding may move**, in wording or presence.
4. **Full gate, baseline regenerated in the same commit** if adopted
   — the catalogue would go 20 → 22, which is a consequence I name
   in the log the same day, per the lead's standing instruction.
5. **E3b is not armed and the record says why**, wherever the
   flagship finding is discussed: it is blocked on *measurement*,
   not on code.

## Routing, named in advance

Adoption needs Atelier's category map
(`clients/apps/web/src/components/Workspace/files.ts`) to learn
`currency-mismatch` and `scale-mismatch`, or they file under the
fallback category. Nothing breaks without it. Not my path; routed
on adoption, as with the three rules before these.

---

## Found before the corpus price: the inference reads `[$...]` as USD

**Routed to the lead — `units/` is Dynamo's and is not edited from
this lane.** Verified at the format strings, not inferred from a
label:

| number format | what it is | inference says |
|---|---|---|
| `_-[$€-2]* #,##0.00_-;…` | **euro**, locale-bracketed | **USD** |
| `[$-409]#,##0.00` | a **locale code carrying no currency at all** | **USD** |
| `[$$-409]#,##0.00` | dollar, locale-bracketed | USD ✓ |
| `"£"#,##0.000"m"` | sterling, quoted | GBP ✓ |
| `#,##0.000_);\(#,##0.000\);…` | no symbol | unknown ✓ |

`CURRENCY_IN_FORMAT` tests `£`, then `$`, then `€`, by plain
substring. Excel's `[$…]` bracket is **syntax** — it introduces a
currency-and-locale token — so every format using it contains a `$`
whatever currency it actually names. A euro format reads as dollars,
and `[$-409]`, which names only US *English* and no currency,
reads as dollars too.

**Why this matters here rather than as a curiosity.** It is exactly
the shape that manufactures a false `currency-mismatch`: a model
using `[$-409]` beside a `"£"` format has, to the inference, two
currencies in one sum. `forfar_model.xlsm` already reads as
**GBP 3 rows, USD 53** — a Scottish schools deal with no dollars in
it.

**It also bears on E2's verdict.** « `currency` … wrong on none » is
the measurement E3a was armed on. That measurement cannot have
included locale-bracketed formats, because these are wrong. The
verdict is not thereby overturned — it is a different corpus — but
the arming decision rests on it and the lead should know before the
number travels further.

I have not changed `units/`, have not tuned my rule around it, and
have not withdrawn the check before measuring. The corpus price
below is taken as things stand.

---

## Results (computed after the registration)

### Criterion 2 — the false-positive price: **103 of 103 wrong**

| corpus | files | unit findings | true |
|---|---|---|---|
| SFT closed-deal | 10 | **103**, all on `inverness_college_model.xlsm` | **0** |

The tally is the damning part: `{"total": 103, "raised": 103}`. The
rule fired on **every sum it examined**.

**Every one has the same shape — « GBP, none ».** And `none` is not
a currency. It is the inference saying *this quantity has no
currency at all* — a rate, a percentage, a count. `=C20-C25` on
`PF5_SPV Running costs`, `=SUM(AA18,AA20:AA27)` on `PF6_Cashflows`:
money terms beside dimensionless ones, which is what a cashflow
does.

**The error is mine and it is a category error, not a threshold.**
The registration says « two distinct *answered* values », and `none`
is an answered value — so I counted « has no currency » as a
currency that could disagree with sterling. Nine of the ten models
abstain correctly; the tenth fires on everything.

Per the orders, which override the usual autonomy here: **this is
reported, not tuned away.** The measurement stands as taken.

### The other two dimensions

- **`scale-mismatch`: structurally unable to fire.** Measured, not
  assumed — see above; it abstains with its reason, which is the
  honest state.
- **`period`: never armed.** E3b, blocked on measurement.

So of the three dimensions E3 could speak on, **one is wrong on
everything, one cannot answer, and one is not allowed to.**

## Verdict: REFUSED

Criterion 2 fails at a 100% false-positive rate. Criterion 1
(planted recall) was **not reached** — there is nothing to measure
recall against on a rule that is wrong every time it speaks, and
spending a planting run on it would have produced a number
describing a check that cannot ship. The gate was not run and the
baseline is untouched.

**The rule is implemented, unit-tested and deliberately unwired**,
the way `_typed_beats` is, with a test pinning that `audit()` stays
silent on units so a future edit cannot quietly re-arm it.

## What was learnt that is worth more than the rule

1. **`none` and `unknown` are different abstentions.** `unknown` is
   « the evidence did not decide »; `none` is « decided: this has no
   currency ». Treating them alike is what produced every false
   alarm. Any future dimension check must say which of the two it
   means.
2. **The `[$…]` misread** (above) is real and separate, and would
   have produced a *different* false-alarm class had the first not
   swamped it. Still routed to the lead.
3. **The corpus price is what caught this**, not the tests. My five
   tests all passed — because I built them on rows that were money
   or money, never money against a rate. A hand-built test agrees
   with whatever I already believe; the corpus does not.

## The correction, registered before it is measured

**`none` is not a currency.** A mismatch requires two distinct
values that are both *actual currencies* — `GBP`, `USD`, `EUR` —
and a `none` term is excluded from the comparison, not counted
against it.

Fixed now, before any re-measurement, so the next number is taken
under a criterion written in advance: **on the same ten models the
corrected rule must raise zero findings**, because none of the 103
is a real currency mismatch and no other candidate exists in that
corpus. If it raises any, each is hand-read before adoption. Planted
recall then runs against the currency harness already committed.

That is a correction of a category error, not a loosened threshold:
the rule's question is unchanged and its bar is unchanged. Said
plainly so the distinction is on the record rather than assumed.

---

## The correction measured, and then overtaken

### The correction hits its registered bar

Re-run on the same ten models with `none` excluded: **0 findings**,
which is exactly the bar fixed before it ran. `inverness` reports
`{"total": 103, "raised": 0}` — the same 103 sums examined, none
raised. « Looked and found nothing », not « never looked ».

### Planted recall: 1 of 1, **against a scope of one site**

Reported the way the lane now reports recall, because the scope is
the number that matters here. Across **both corpora — 37 files —
there is exactly one plantable site**: a sum whose terms span two
rows the inference reads as two *real* currencies. One site, planted,
caught, with the right sentence: « =SUM(B17:B26) adds terms of
different currency: GBP, USD ».

**A recall of 1/1 on a scope of 1 is not evidence the check works.**
It shows the mechanism connects end to end. Nothing more, and it is
not to be quoted as more.

### And then the premise went

Dynamo **revised E2's verdict the same day, against a second
corpus** (its handoff, 28 Aug):

> **ARM WITH CARE `rate_form` — and nothing else.** `kind`,
> `currency` and `scale` were armed against the Ofgem key and **fail
> on the closed-deal one (7.77%, 24.62%, 23.32%)**.

**`currency` is wrong on 24.62% of rows against the second key.**
This round armed it on « answered on 34.6% of rows, wrong on none »,
which was one key's answer and has been superseded. Dynamo's own
inherited lesson says the rest:

> A dimension whose key cannot contain its failure case must not be
> armed. Not « flag the limitation and arm anyway ».

So the arming decision is void — not because my rule misbehaved
after the correction, but because the measurement it rested on no
longer says what it said. The `[$…]` misread I routed is very
probably part of that 24.62%.

## Verdict: REFUSED, and refused twice over

1. **The category error** — 103 of 103 false, `none` counted as a
   currency. Mine, corrected, re-measured to zero.
2. **The arming premise** — `currency` is measured wrong on 24.62%
   by the only key that contains the hard cases. Nothing may be
   armed on it.

The rule stays **implemented, tested and unwired**, with a test
pinning that `audit()` says nothing about units. The gate was not
run and the baseline is untouched: there is nothing to certify.

**Where the units family actually stands, stated plainly because it
is the flagship:** of the six dimensions, `rate_form` is « arm with
care » and **every other one is unarmable today** — `currency`,
`scale` and `kind` failed the second key, `period` was never armed
and is wrong on 24.9%/64.1%, `b5_type` never armed. E3 has **no
shippable check right now**, and no amount of work in this lane
changes that: it is blocked on the inference's accuracy, which is
Dynamo's, and on a second hand-labelled key drawn by someone else,
which is nobody's yet.
