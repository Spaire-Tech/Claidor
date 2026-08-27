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
