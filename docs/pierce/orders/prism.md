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

## Standing addition (28 Aug): refusal is not the finish line

Read the new `lanes.md` section of this name before your next round.
The founder's correction, and the lead's to own: killing a bad design
is right and stays right, but **a refusal now closes with a successor
that differs in kind, not in degree** — a loosened threshold or « retry
when the corpus improves » does not count. Write the three designs you
did not try, in a line each. Attack the constraint, not the
parameters. And read your own handoff's lessons *before* acting — the
traps we keep walking into are ones we have already written down.

## Routed to you (28 Aug, twenty-seventh sweep): export `keyed_findings`

A small, specific ask from Atelier, and the lead approves it. Atelier
built a fast path for « this upload is byte for byte the version
before it » — two equal SHA-256 digests, so nothing can differ and no
comparison is run. For that case the true report is knowable exactly:
new 0, repaired 0, persistent = the keyed findings of the one
workbook. It cannot build that today because `keyed_findings` is
private to `watch/delta.py`, and it declined to reach through a
private name — correctly.

**So: export it, at whatever interface you judge right.** Your file,
your call on the signature; the constraint is only that a caller can
get the keyed findings of a single workbook without running a delta.
Say in your log what you exported and what you deliberately did not.

This does **not** come with a sheet filter. Atelier's CRC-pruning
design — pass the Watch a list of sheets whose zip CRCs prove them
untouched — is refused on measurement, not on taste: the lead ran it
over eleven real consecutive-version pairs (ten Ofgem ED2 revisions
and the CAA H7 proposals→determinations pair) and found **0
byte-identical worksheets out of 372**. Excel rewrites every
formula-bearing sheet on save. Do not add a sheet filter for it, and
if you ever want one, it needs a different justification.

## The finding that matters more (28 Aug): the Watch may not terminate on a real pair

Measured by the lead while the V3 exam ran, and it is a completeness
hole, not a performance nicety.

- Atelier profiled `delta_of` on levenmouth (4.3 MB, 432,596 cells):
  **158 s**, of which the two reads are 58 s and the two audits 5 s.
  **The alignment is all the rest, and 87% of it sits in two sheets of
  twenty-four** (`Distributions` 113.9 s, `Ratios` 111.9 s).
- The V3 exam's WSH pair is Welsh Water draft determination against
  final determination: **12 MB against 12 MB**, so roughly 2.8× the
  bytes. It has now been running **over 115 minutes at 99.9% CPU and
  9.1 GB resident**, and had not returned when this was written.

Two point eight times the input, at least forty-three times the time,
and it may not have finished. That is not a constant factor — it is
strongly superlinear, and the shape of Atelier's profile says where:
the per-sheet alignment on the largest sheets. A 12 MB utility model
is not an exotic file; it is the ordinary case for the regulator
corpus and for the customers this product is aimed at.

**So the Watch's honest status is: works on a mid-sized workbook,
unproven on a large one.** Track C cannot be called complete while a
real published pair cannot be diffed in usable time, and no amount of
skipping identical sheets fixes an algorithm that goes quadratic on
the sheets that are not identical.

**Your round: make the alignment scale, and attack the constraint
rather than the parameters.** Before writing code, measure — take the
two biggest sheets of a big pair and find out what the alignment is
actually doing per row, and whether the cost is in candidate
generation, in scoring, or in a nested scan nobody intended. Then
state the complexity you have and the complexity you need. A cheap
blocking key that makes most row pairs never compared is the usual
answer to exactly this shape, and it is the same family of fix that
worked for the linker's coverage asymmetry. Report the before and
after on the same pair, and if it still cannot finish, say so plainly
and name the size at which it stops working — an honest limit stated
in the product beats a check that hangs.

Both of the above are ahead of any C6 work.
