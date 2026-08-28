# Orders — prism (updated 27 Aug, fourteenth sweep)

Tier 2's first measured round and the timing round are merged; the
lead's V3 resumed from pair 5 on the restarted container.

0. Handoff file first if not yet pushed (`docs/pierce/handoffs/prism.md`).
1. **Tier 1's registration**: the Z3 proof for the arithmetic/IF/SUM
   fragment, per the plan — the fragment named precisely, the
   refusal boundary honest (tier 3), and the dependency (`z3-solver`)
   proposed in your log for the lead's pyproject approval BEFORE any
   code imports it.
2. Tier 2's next round per your own registration (wider hosts) once
   tier 1's registration is committed.

## Addendum (27 Aug): required reading before tier 1

Before registering the Z3 tier-1 fragment, read SQLSolver
(`github.com/SJTU-IPADS/SQLSolver`, Apache-2.0, SIGMOD 2024) — their
LIA* handling of unbounded summation is exactly the SUM-over-
symbolic-range wall the fragment will hit. Your tier-1 registration
must say what transfers and what does not. See
`china-os-findings.md` §3.

## Addendum (27 Aug): C6 is approved and will be yours

C6 (the rule-set diff, `swens-plan.md` Track C) is founder-approved.
It consumes B5's mined rule sets, which do not exist yet — Dynamo's
B5 round 1 must first show a modeller-recognisable rule set. Your
part now: nothing to build; when B5 round 1 lands, you register C6
(the law-set matching rule — labels, not positions; the diff
classes; the planted law-break harness). Sequence note is in
Dynamo's orders too.

## Addendum (27 Aug, evening): C6 is gated

The plan's third amendment gates C6 on Dynamo's two stability tests
(five-seed agreement; cosmetic invariance). **Write no diff code
until both pass on the record.** Your C6 registration, when it
comes, cites their results first.

## Orders reset (28 Aug, twenty-fifth sweep) — completeness is the bar

The founder set the bar: a fully complete product, partner testing
deferred (plan, fourth amendment). The Watch is the most complete
track we have — C1–C5 all measured — so your orders are about
finishing it rather than widening it:

1. **C4 tier 1**, per your SQLSolver-informed registration, and the
   tier ladder's honest refusal boundary. Then the tier table as a
   single published statement: what each tier proves, at what cost,
   and what it refuses.
2. **C6 remains gated** on Dynamo's stability tests, which are now
   behind E2 — so do not wait on it; it will come.
3. If both stall, the C3 deferrals you parked
   (added-cells-within-matched-structure) are real holes and yours.

## Addendum (28 Aug): an external answer key is coming

Blocked behind Sentinel's A6, but worth knowing now: the Enron
corpus contains **`E08`/`E09`, a genuine version pair** — same 15
sheets, 45,274 identical formulas, 920 differing, one of them
`=XNPV(0.09,…)` → `=XNPV(0.1,…)`, error-value cells 92 → 115. A real
revision of a real model by its original authors, which nobody
planted and nobody curated for us. When A6 lands, that pair is the
first thing C2/C3 should be re-measured against — a harness we
designed cannot flatter it. Do not wait on it; register nothing yet.

## Addendum (28 Aug): a measured design finding, and a bug you already avoided

The founder's third research round mined real git history of real
financial models (13 repos cloned, every historical version pulled,
a diff engine written and run). Full record: `corpus-sources.md`,
28 Aug third addendum. Two things are yours.

**1. The finding that should change C3's design.** Splitting one
equity model's 70 real transitions by commit intent:

| measure | quarterly reforecast (n=11), median | routine commit (n=59), median |
|---|---|---|
| formula → hardcode | **83** | **0** |
| reference changed | 228 | 0 |
| changed cells | 1,169 | 93 |

The separation is near-total. **A raw threshold on « formulas
replaced by hardcodes » is the wrong design** — 83 is routine in a
quarterly update and alarming on a Tuesday. What carries information
is the count *against the expected profile for that kind of update
on that model*, and that profile is learnable from a model's own
history. That is the Watch's product argument, now measured rather
than asserted. Register how you want to use it; do not bolt a
threshold on.

Two specimens worth building tests around, both from real commits:
a vertical sum that became a horizontal sum (`=SUM(AM4:AM8)` →
`=SUM(S9:V9)`) — a formula that did not move but **changed
meaning**; and a reference that shifted one column and two rows
inside a copied block, where the **asymmetry itself** is a cheap and
strong defect signal.

**2. A bug you already avoided, recorded so you know why.** Their
first run reported 203 changed cells on a version-string bump; 202
were false alarms, because openpyxl returns array formulas as
objects rather than `=`-strings and object identity made every one
look changed (~600 phantom changes in 17,200, ~3.5%). **I checked
`watch/diff.py::_formula_text` — you extract `.text` from
`ArrayFormula` and `DataTableFormula`, so we are clean.** The reason
we are clean is that the correction gate met this exact class in the
RIIO-3 round and `changeset.py::comparable()` paid for the lesson
first. Keep it; add a test if none pins it.

**3. Ground truth with the author's own words, when you want it:**
`hickeng/financial`, transition v10→v11, commit « Fixes row skewed
formula » — 98 reference changes, 1 formula change, zero hardcodes,
every formula in a block reading the row below itself. Level-A
truth, 98 labelled instances. The same chain has 1-, 2- and 4-cell
version bumps: signal and required silence in one file.
Non-commercial licence — internal measurement only.
