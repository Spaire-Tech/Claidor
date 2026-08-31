# Period — the odd dimension, and how to unblock it without a corpus

28 August 2026. The founder's answer on `period`, checked against
our code and adopted. It reframes the problem correctly and it
arrives at a conclusion the lane had reached independently.

## The reframe: period is not the same kind of thing

Currency, scale and quantity kind **live in the text** — read the
label, learn the unit — which is why « reason from labels, never
from values » works for them and why a corpus matters: you must have
seen the words.

**Period does not live in the text. It lives in the arithmetic.**
The lead's own brief gave it away: the near-miss to reject was « a
model with monthly labels but annual arithmetic » — which is the
lead saying the arithmetic is the truth and the label is the lie,
while asking for period to be inferred from labels.

A model with live formulas declares its period repeatedly:

- **The date header row** — consecutive `EOMONTH`/`EDATE(…,1)`, or
  a 28–31 day gap between column dates (monthly), ~90 (quarterly),
  ~180 (half-yearly).
- **Divisors** — `rate/12` in an interest line *is* a monthly
  declaration. `/4`, `/2`, `days/360`, `YEARFRAC` on the real day
  gap, `(1+g)^(1/12)` on a growth line.
- **The carries** — we already map **4,566 opening/closing pairs**.
  A carry says « one period passed here »; the date row says how
  long it was. Half of it is already built.

That yields two things at once: an **independent ground truth**
(measure the label-based inference against a formula-derived answer,
labelling nothing by hand), and possibly **the fix itself**. Derived
facts need no corpus. That is why period is the odd one out.

**The lane reached the same place on its own.** `polar/tieout/units/
periods.py` now opens: « A model states its periods in its
arithmetic, not in its labels… Nothing here reads a header word. »
Two routes, one answer, which is the strongest kind of agreement.

## The bug hypothesis — checked against our code, and we are clean

The researcher's own first pass rejected two 40,000-formula
development models with « no period axis found », and found the
cause in its own tool: **in real monthly models nobody types the
date row — it is computed** (`=EOMONTH(Q21,1)` across 399 columns).
Reading with formulas on, it saw a formula and never a date. Its
warning: if our period work reads formulas rather than cached
values, it is blind to nearly every real axis, and that could be a
large slice of the 64%.

**Checked before repeating it.** `read_workbook` carries **both**:
on one corpus file, 19,261 cells hold a formula *and* its cached
value, and `Annual Inflation!I14` reads formula
`=DATE(m_baseyear,3,31)` with value `44286` — the date serial is
there. **We are not blind at the reader.** But `blocks_from_dates`
has **no caller yet**, so the trap is live for whoever wires it:
it must be fed `Cell.value`, never a parse of `Cell.formula`.
Written down before the wiring, not after.

**Second trap, same source:** the researcher capped its column scan
at 400 and the sheet was 429 wide. A 25-year monthly model is 300+
columns. **Any window sized on annual models is far too narrow** —
check ours before trusting a « no axis » result.

## We are blocked on the wrong question

« Would three or four monthly models tell us whether the signal is
hard or unseen? » is **two questions**, and only one needs found
files:

1. **Can the inference read the signal when it is there?**
   Answerable **today**: take a model we already hold with live
   formulas and **re-time its axis to monthly**. We built the
   change, so the truth is ours by construction. An afternoon, not a
   hunt — and it is *exactly* the method we already accept
   everywhere else (37 planted frauds, 37 caught; seeded defects in
   a real close model). Refusing it here was inconsistent.
2. **Does it survive real monthly models in the wild?** That one
   genuinely needs found files — and **three or four will not
   answer it either**: conventions repeat inside a model, so four
   models is nearer n=4 than n=400. Fine for capability, useless for
   a publishable rate.

## Read the spread before concluding anything

**24.9% to 64.1% is a 2.5× range — that is at least two failures,
not one.** The likely split: the bad bucket is files whose columns
are text like « Year 1 », where **no period exists to be read and
the right answer is abstain, not a guess.** We built abstention into
everything else. If period inference is guessing on models with no
date axis, part of that error rate is scoring the engine against an
answer **a human could not give either**. Split the number by
whether the file has a real date row before drawing any conclusion.

## The product answer, which may be permanent

**Period is declarable once per sheet — sometimes once per model.**
It is not per-row like currency. A reviewer looks at the top of the
sheet and answers in two seconds.

That is our own core mechanic: propose what we are confident about,
a human confirms, and afterwards it is pure arithmetic forever. We
built confirm-then-derive for document links, where there are
*hundreds* of confirmations per deal. **Period needs one to five.**
It is a better candidate for that flow than links are.

So « do not arm » for **autonomous** period inference may be correct
permanently — and completely fine for the product.

## The verified monthly corpus, and the honest gap

Six real monthly models verified by opening them and reading date
rows by hand: two commercial real-estate development models at
~40,000 live formulas each with a **399-column monthly axis**
(2024–2035), a Rotterdam rent-roll model with 169 monthly columns
and **8,254 `/12` divisors**, two French startup planning models, a
monthly SaaS template. Gaps measured `[31,28,31,30,31,30,31,31]` —
real months, not labels.

Its own oracle — a formula-only period reader — scored **71 agree,
0 disagree, 11 abstain** over 82 axis rows, and all 11 abstentions
are resolvable (nine copy the master date row and need only
reference-following, which our tracer already does; one is an
`EOMONTH(x+1,0)` idiom; one is hard-typed). **82 of 82 resolvable,
zero wrong** — with the caveat stated plainly: eight files, and it
wrote both the oracle and the scorer, so it is a capability check,
not a rate.

**The honest failure it reports: no mixed axis anywhere in 91
files.** Nothing monthly-through-construction then
semi-annual-through-operations. No quarterly, no weekly, no 13-week
cash-flow model. **The axis `swens.md` § 3a says the engine handles
is still untested**, and this hunt did not fix that. Leads for it
(A.CRE, World Bank/IFC PPP toolkits, training providers) remain
unverified — its sandbox reaches only GitHub.

Four of the six sit in repos with **no licence**, so they are
fetched by script with hashes recorded, never shipped.
