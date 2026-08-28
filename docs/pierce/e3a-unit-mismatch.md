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
