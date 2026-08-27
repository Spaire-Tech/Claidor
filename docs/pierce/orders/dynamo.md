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
