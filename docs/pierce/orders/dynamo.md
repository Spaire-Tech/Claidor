# Orders — Dynamo (updated 27 Aug, eighteenth sweep)

Round 1b is the most valuable result of the week, and it redirects
your lane. You measured that the mining is stable, deterministic and
cosmetically invariant — and that its rule sets are artifacts of low
perturbation coverage, because typing by hand reached 10 of 193
cells on one model and is impossible on another (21,638 constants
across 3,279 label groups). « Laws found in a corner are not the
model's laws » is exactly right, and reporting coverage beside every
rule set — with low coverage declared uninformative rather than
sold as a result — is now standing practice.

**Therefore: you own Track E's first half** (`lanes.md`, 27 Aug
amendment). B5's remaining rounds wait behind it; C6 and B6 stay
gated. This is a promotion of the blocker, not a detour.

1. **E1 — the ground truth, registered first.** A hand-labelled
   sample of input rows across real corpus models, labelled for the
   dimensions that matter to both consumers: continuous vs
   categorical (B5's need), and currency / scale / period / rate-vs-
   decimal (Track E's need). Registered sample, registered labelling
   rules, committed before any inference exists. The labelling cost
   is itself a reported number.
2. **E2 — the inference**, as a standalone module
   (`polar/tieout/units/` or similar — propose the name and the
   interface in your log for the lead before building deep). Number
   formats plus labels plus propagation through the dependency
   graph, with **abstention as a first-class outcome**. Measured per
   dimension against E1. It reports nothing to any user: it is a
   library two tracks consume.
3. **Then B5 round 2** with automatic typing, coverage reported, and
   only then a rule set that may be called the model's.
4. Standing: B3 design-only; B4's widening resumes after E2.

## Addendum (27 Aug, nineteenth sweep): E2 measured — the round that matters next

E2 measured blind on 3,796 author-labelled rows is the strongest
foundation any lane has laid this week, and B5 round 2 now types
from it rather than by hand. Next, in order:

1. **Report B5 round 2's coverage number first**, beside its rule
   set, per your own adopted practice — a rule set without its
   coverage is not a result. If coverage is still low, say so and
   name what the inference could not type.
2. **The units corpus just changed shape.** The population-proof
   corpus (`corpus_sft/`) is **value-only** — sixteen published
   closed-deal models, one with a live calculation layer
   (`inverness_college_model.xlsm`, 20k formulas); see
   `population-proof.md`. For E2 that is *good* news: value-only
   files still carry labels, number formats and column headers, so
   they are a large, free, unseen test set for the inference's
   label-and-format half — and a hostile one, because nothing can be
   propagated through formulas that are not there. Register it as an
   E2 generalisation round if you judge it worth the time; the
   propagation half stays measured on formula-bearing files.

## Orders reset (28 Aug, twenty-fifth sweep) — completeness is the bar

The founder set the bar: a fully complete product, partner testing
deferred (plan, fourth amendment). Yours, in order:

1. **Finish E2 to a shippable verdict**: per-dimension accuracy
   against E1, stated dimension by dimension, with the honest line
   on which dimensions are good enough to arm a *finding* and which
   are not. Sentinel cannot build E3 — the flagship missing feature
   — until that verdict exists. This is the single highest-value
   thing on your board.
2. **B3 — the arbiter.** Four corpus files are engine-gap files that
   only real Excel can certify, and B2's report has said so for
   days. Your design is written; the lead now routes it: build it
   against the existing Microsoft connector surface, propose the
   interface in your log first, and treat a Graph call like any
   other measured instrument.
3. B5/B6 continue behind those two, not ahead of them.

## Correction (28 Aug): B3 is parked, not routed

Supersedes the « the lead now routes it » line above. The founder
has a **Microsoft 365 Business** account, so B3's real prerequisite
is a dedicated Azure app registration (client id + secret) which is
five minutes' work whenever it is wanted — the connector and its
stub already exist (`polar/connector/graph.py`,
`scripts/graph_stub.py`). The founder's decision: **park it, return
to it in due time.** So B3 stays design-only. Do not build against
the stub in the hope of credentials; the four engine-gap corpus
files stay recorded as arbiter-bound, which is already honest.

**Your priority is unchanged and unambiguous: E2 to a shippable
per-dimension verdict.** Sentinel cannot build the flagship missing
feature until it exists.

## URGENT addendum (28 Aug): E2's design just changed — read before the next round

The founder's fourth research round is about **exactly what you are
building**. Full record: `corpus-sources.md`, 28 Aug fourth
addendum. Do not carry on without reading it; two of its findings
invalidate design choices E2 would otherwise make.

**1. The percent convention is decided by the NUMBER FORMAT, not by
the value and not by the label.** Six real models declare `%`
explicitly: three store decimal fractions, three store whole
numbers. Percent-style format → decimal; `General` → whole number;
**six of six, no exceptions.** The cell that kills any value-based
heuristic: `Module Degradation`, unit `% p.a.`, value **`0.5`**,
meaning half of one percent — « below 1 means a fraction » is out by
100× there. And an Australian model has both conventions **in one
column of one sheet** (`E25` = 65 `General`; `E61` = 0.065 percent
format), so per-sheet or per-column inference is wrong on real
files.

**Verified against our own corpus by the lead:** `final_wacc.xlsx`
has **183,987 percent-formatted cells and none above 1.5** — every
percentage we have ever measured on is a decimal fraction. E2 tuned
on our corpus alone would be silently 100× wrong on a whole class of
real models, and nothing in our files would have shown it. This is
the strongest argument yet for the number-format rule.

**2. Nine of 27 real models keep units in a dedicated column, not in
the label.** 698 declarations extracted that way. Our regulator
corpus puts units in labels — so a label-only inference finds
nothing in those files **and reports full coverage on them**. Silent
blindness, the failure shape we hate most. E2 needs a units-column
detector (narrow text column immediately right of values, short
contents matching unit patterns, bound per row).

**3. Build order the report recommends, and I am adopting as your
sequence** — it is ordered by value per unit of work and matches the
evidence: (a) number format for percentages; (b) units-column
detection; (c) the scale ladder including `MM`/`K`/`B`/`crore`/
`lakh`/`千`/`百万`; (d) read *cached* values for labels and units and
**abstain** when there is none (one real model computes its unit
label as `=Applied_currency & "'000"` and has a 49-row block whose
row labels are references, so it looks unlabelled); (e) real-vs-
nominal as a dimension inherited from section headings, because both
blocks can carry the identical unit string; (f) the energy-price
family and its collisions (`MWh`/`kWh`, `W`/`kW`, `kW-month`/
`kW-year`, `MWac`/`MWdc`); (g) a **non-unit class** — `Choice`,
`Index`, `Check`, `[1,0]`, `Toggle YES/NO` all appear in real units
columns and must never enter dimensional arithmetic, with « declared
but not parseable » reported honestly rather than guessed.

**4. Two positive cases for your test set — the checker must stay
silent on both**: `AUD/MWac/yr × MWac = AUD/yr` (the units cancel,
and the workbook proves it in its own formula), and
`veh/year × £/vehicle ÷ 1000 = k£`. And one caution: the same toll
road file carries **two unit labels its own author got wrong**. Real
ground truth is not always right; say so in any number you publish.

None of this changes E1's registration or the blind-scoring rule. It
changes what E2 must handle and the order you build it in.

## Addendum (28 Aug): the period key is now your highest-value work

Your E2 verdict is adopted as written, per dimension, and Sentinel is
arming **only** `currency` and `scale` on it (E3a). The flagship
finding — « a monthly figure in an annual line » — is a `period`
mismatch, so **`period` is now the single thing standing between us
and the most quotable check in the product.**

You named the fix yourself: « a second hand-labelled set drawn by
someone else is the highest-value thing anyone could add to this
lane », and you named the trap — the 3,796-row author key holds one
value for `kind`, so its 96.4% is not evidence about the hard cases,
and E1's hundred is self-graded.

**So: build the period answer key properly, and do not grade your own
homework.** Register the draw, label *before* running the inference,
and if the honest way to avoid self-grading is to have the lead draw
or judge the sample, say so and I will do it — a lead who adjudicates
a sample he did not design is a better referee than the lane that
wrote the inference. Report `period`'s accuracy per corpus dialect,
not blended: the founder's fourth research round shows monthly models
are absent from every corpus anyone here holds, which may be exactly
why `period` is weak.

## Standing addition (28 Aug): refusal is not the finish line

Read the new `lanes.md` section of this name before your next round.
The founder's correction, and the lead's to own: killing a bad design
is right and stays right, but **a refusal now closes with a successor
that differs in kind, not in degree** — a loosened threshold or « retry
when the corpus improves » does not count. Write the three designs you
did not try, in a line each. Attack the constraint, not the
parameters. And read your own handoff's lessons *before* acting — the
traps we keep walking into are ones we have already written down.

## Reframe (28 Aug): you are already holding the purest key in the company

Read `docs/pierce/ground-truth.md`. The lead's brief asked outsiders
for « somebody else's labels » and failed to count what this lane
already produced: **the fidelity key is the most independent
evidence Swens owns.** 3,862,412 cells checked against values *Excel*
computed and the model's own author accepted and saved — an answer
key written by Microsoft and by a stranger, that we did not touch,
could not have influenced, and cannot be accused of grading.

It measures fidelity rather than defect-finding and must always say
so. But when the units work makes you doubt the value of a
self-graded key, note that you have already built the opposite of
one.

**Consequence for E1/E2:** split the key by class before asking
anyone to label anything. Dimensions with a **computable** right
answer do not need a human — they need a spec and a second
implementation by someone who did not write the first, with
disagreement as the signal. Reserve every human judgement for the
rows where nothing else can decide. If we ever do buy labels: three
labellers, blind and apart, one written protocol, and **publish
their disagreement rate** — nobody in model audit has ever published
a human-versus-human number, and our own evidence says it will be
large.
