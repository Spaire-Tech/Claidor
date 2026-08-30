# C6's two stability gates, re-measured on the rules the product now produces

*Registered 30 August 2026, before a single run. Nothing below the
« Result » heading existed when this was committed.*

## Why this round exists at all

The founder-relayed third amendment gates behavioural version diffing
on two measurements taken *before* any diff code:

1. **Seed stability** — mine one unmodified model five times under five
   seeds; the rule sets must agree, or « v12 broke a rule » is seed
   noise.
2. **Cosmetic invariance** — insert blank rows, rename a sheet; the
   mined sets must be identical, or the claimed advantage over
   positional diff is unproven.

**Both were measured on 27 August and both passed** (`logs/dynamo.md`):
five seeds (11, 22, 33, 44, 55) × 200 runs on `h7_new_debt_indexation
_fds.xlsx`, gate-clean at 1.000000, gave identical rule sets; three
inserted rows plus a renamed sheet gave identical sets compared by
`(sign, row label, column label)`. `pieces.md` said neither had been
measured; that was wrong and is corrected.

**So why run anything.** Because that measurement no longer describes
the product. It was taken under *hand* typing, when perturbation
coverage reached **10 of 193** cells and the miner's own reading was
that the rules were « artifacts of the frozen remainder » — equalities
among cells that never moved. Round 2 replaced hand typing with E2's
automatic typing, coverage went to **144 of 144**, and the rule sets
changed outright: **36 stable rules became 11** on `h7-fds`, **167
became 17** on `h7-fp`.

Identity is cheap when nothing moves. A rule that says « J52 = K52 »
because neither cell ever changed will be identical under any seed,
any row insertion, and any rename — and it proves nothing about
whether mining is stable when the model is actually exercised. **The
gates have never been run on the rule sets the product now produces.**
Dynamo recorded the prediction that they would still pass and, on the
log's evidence, never tested it.

One more reason to re-run rather than cite: the raw output
(`stability-h7*.json`) was written into `logs/dynamo/` and never
committed, and a container restart took it. The 27 August numbers
survive only in that log's tables. **This round's raw output is
committed.**

## Conditions, fixed now

- Model: `scripts/corpus_au_uk/caa_h7/h7_new_debt_indexation_fds.xlsx`
  — the same file, gate-clean at 1.000000 (0 mismatches of 6,665
  cells), so nothing is being mined behind a failed fidelity gate.
- Typing: **E2 automatic**, never `--hand`. This is the whole point.
- Runs: **200 per mining**, matching round 2 exactly so the numbers
  are comparable to the 36 → 11 result.
- LibreOffice **25.8.7.3** at `/opt/libreoffice25.8`, which
  `find_install()` already prefers. (The container does *not* run
  24.2 as `pieces.md` claimed.)
- Coverage is printed beside every rule set. **Below 50% the round is
  uninformative and no rule is quoted** — the standing practice from
  round 1b, applied here without exception.

## Gate 1 — seed stability

The product's rule set is `stable_rules(a, b)`: the intersection of
**two** independent minings, because « a rule that appears in one
sampling and not the other was luck ». So one rule set costs one seed
*pair*, and five rule sets need five disjoint pairs. Seeds:
**(11, 12), (22, 23), (33, 34), (44, 45), (55, 56)** — round 1's
anchors kept so the runs are recognisable against the old record.

Reported: the five sets; how many rules appear in all five (**core**);
how many in at least one (**union**); core ÷ union; and the mean
pairwise Jaccard, which is what the existing `agreement()` computes so
this round is comparable to every earlier one.

**The bar: the five sets must be identical — core ÷ union = 1.0.**
That is the bar round 1 passed and it is not being lowered because the
conditions got harder. Short of it, the shortfall is reported rule by
rule, and « v12 broke a rule » is seed noise to exactly that extent.

## Gate 2 — cosmetic invariance

A variant with **three blank rows inserted above the modelled block
and the sheet renamed**, written by LibreOffice itself so every
formula and reference moves with them.

Two harness defects are already paid for and must not be repeated —
both are in `logs/dynamo.md` and both produced falsely clean results:

- **The un-shifted typing.** Type once on the original and *translate*
  the typing to the variant's coordinates. Typing the variant directly
  perturbed nothing, froze every watched cell, and reported 0 rules as
  an invariance failure that was not one.
- **The truncated sheet name.** Excel caps a sheet name at 31
  characters, so a name is read back from the stored file rather than
  assumed. Assuming it made all 200 variant runs fail.

**The comparison is by label, never by cell reference.** A rule's
identity is the `(sign, row label, column label)` triples of its
terms. Inserting rows moves every watched cell, so a reference-keyed
comparison would report total disagreement for a model that behaves
identically — which is precisely the failure of positional diffing
that behavioural mining exists to escape. The raw reference-keyed
number is reported *as well*, because it is the size of the problem
C6 would have without label keying.

**The bar: identical by label.** Otherwise the differences are counted
in both directions.

## Predictions, before any run

1. **Gate 1 passes but is no longer trivially identical, and I expect
   it to fall short of its own bar.** Round 1's identity was cheap:
   equalities among frozen cells are stable because nothing moved.
   With 144 of 144 cells moving, rules come from a finite sample of
   200 runs and rules near the detection boundary should flicker. I
   predict **core ÷ union between 0.85 and 1.0, short of 1.0**. If it
   comes back exactly identical my reasoning was wrong and I will say
   so plainly rather than claim I expected it.
2. **Gate 2 is only interpretable to the extent gate 1 holds.** The
   variant is mined under its own seeds, so any seed flicker
   contaminates it. If gate 1 flickers, gate 2's difference must be
   compared against **gate 1's flicker**, not against zero — otherwise
   seed noise gets reported as a cosmetic-invariance failure.
   Registering this now so it cannot look like an excuse afterwards.
3. **Raw reference-keyed comparison scores near zero** on the
   row-insertion variant, because `Rule.terms` is keyed on cell refs
   and every ref below the insertion shifts. That is not a defect —
   it is the measurement of why C6 needs label keying.
4. **The surviving sentences are the same three** round 2 read on this
   model: rate rows equal by construction.

## What may not happen

No tolerance (`RELATIVE`, `FLOOR`, `FROZEN_SPREAD`), no run count, and
no seed may change after a number has been seen. The run count is
fixed at 200 above, before the first run, so this measures the product
rather than a version tuned to pass. Any correction must be a
**category error** — a class of thing the measurement was wrong to
consider — stated with its direction before the number is recomputed.

## An amendment to this registration, made before any number was computed

The smoke run (3 runs, not a measurement) exposed a property of the
instrument that has to be stated before the real run, not after.

**Only 14 of the 144 watched cells carry a column label.** A rule's
registered identity is the `(sign, row label, column label)` triples
of its terms, so with the column label empty, `I42`, `J42`, `K42`,
`L42` and `M42` — the same row in five different years — collapse to
**one** identity. On this model the product's 11 rules become **4
signatures**.

Two consequences, both real:

1. **Gate 1's registered comparison is weaker than it sounds.**
   Comparing 4 collapsed signatures across five seeds is an easier
   test than comparing 11 rules.
2. **For C6 this is a defect in reach, not a defect of intent.** The
   signature is *designed* to carry the year in its column label; the
   reader simply does not assign one on this sheet. So « v12 broke a
   rule » could not say which year broke, and a rule that holds in
   year I and breaks in year M would still contribute its signature
   from year I — C6 would report no change where there was one.

**The 27 August result was measured on the same collapsed
signatures**, using this same `signature()`. That is not a criticism
of it; it is the reason both rounds must be read the same way.

**What I am changing, and what I am not.** I am not touching
`signature()` — changing the instrument mid-round is how a bar
becomes whatever the result needed, and keeping it is what makes this
round comparable to 27 August. Instead gate 1 additionally reports the
**reference-keyed** comparison, which on an unmodified file is not
merely valid but *stronger*: the five seeds mine the same file, so
`I42` means `I42` in all five, and no collapse occurs. Gate 1 is
therefore judged on **both**, and the bar applies to both.

Gate 2 keeps label keying as its only fair comparison, because there
the rows really did move — with the collapse noted, so « identical by
label » is never read as more than it is.

**Prediction for the added comparison, before it runs:** the
reference-keyed core ÷ union will be **lower** than the label-keyed
one, because it cannot hide a year-specific flicker inside a collapsed
signature. If they come back equal, the collapse was costing nothing
on this model and I will say so.
