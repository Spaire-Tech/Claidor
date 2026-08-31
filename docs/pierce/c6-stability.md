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

---

# Result — 31 August 2026

Both gates pass, on the rule sets the product now produces. Raw output
is committed: `c6-stability-h7fds.json` (gate 1) and
`c6-stability-h7fds-gate2.json` (gate 2, after the harness fix below).

## Gate 1 — seed stability: PASS, and my prediction was wrong

| | five product rule sets |
| --- | --- |
| rules per set | 11, 11, 11, 11, 11 |
| label signatures per set | 4, 4, 4, 4, 4 |
| in all five ÷ in any — **by label** | 4 ÷ 4 = **1.0** |
| in all five ÷ in any — **by reference** | 11 ÷ 11 = **1.0** |
| mean pairwise Jaccard | **1.0** |
| identical | **yes, both keyings** |
| flickering rules | **none** |
| runs dropped | **zero**, all 2,000 |

The ten individual minings agree too — the comparison 27 August made,
repeated here on today's rules: 4 signatures in all ten, identical.

**I registered that this would fall short of its bar and it did not.**
The prediction was that rules near the detection boundary would
flicker once 144 of 144 cells were moving instead of 10 of 193. Not
one rule flickered, under either keying. The reasoning was wrong, and
the added reference-keyed comparison — which I predicted would come
back *lower* and which cannot hide a year-specific flicker inside a
collapsed signature — came back at 1.0 as well.

So the honest reading is stronger than the one I expected to write:
the mining is not merely stable at the resolution the label signature
can see, it is stable **cell for cell**.

## Gate 2 — cosmetic invariance: PASS

| | original | variant |
| --- | --- | --- |
| rules | 11 | 11 |
| label signatures | 4 | 4 |
| only on this side | 0 | 0 |
| **identical by label** | **yes** | |
| **Jaccard by cell reference** | **0.0000** | |

Three blank rows inserted above the block and the sheet renamed, the
edit made by LibreOffice itself so every formula moved with it.

**The 0.0000 is the point, not a failure.** Prediction 3 said the
reference-keyed comparison would collapse, because every watched cell
moved three rows. It collapsed completely: *not one* rule matches by
reference, while *every* rule matches by label. That is the whole case
for behavioural version diffing over positional diffing, measured
rather than asserted — a positional diff would have called this
identical file 100% changed.

## The defect this round found, in the harness and mine

Gate 2 first reported **11 rules against 35** and a failure. The shape
was wrong for a real failure: a variant that behaves differently does
not find three times as many rules, and *more* rules means *less*
moved — round 1b's « laws found in a corner », exactly.

The cause was mine. **Automatic typing types the whole workbook**:
3,210 inputs on this model, of which only **75 are on the mined sheet**
and 3,135 sit on `Cover` and `Outturn`. The edit moved one sheet, so
only those 75 moved — and the translation shifted all 3,210 onto the
renamed sheet, sending **98% of the perturbation to cells that do not
exist**. The variant was barely exercised and answered accordingly.

It is the un-shifted-typing defect of 27 August wearing the opposite
face. The hand typing it was originally fixed under returned only
mined-sheet inputs, so the blanket shift was correct when written and
became wrong the moment typing went automatic — inherited, not
re-examined. **That is the second time this round that a « result »
was the harness misbehaving**, which is why the direction of a number
is checked before it is reported.

Two things changed: translation is sheet-aware, and a guard **refuses
the run** unless the count of inputs moved equals the count living on
the edited sheet. The refusal prints both numbers, so the next
occurrence is a stopped run rather than a published failure.

## What this does and does not settle

- **It settles the two preconditions.** « v12 broke a rule » is not
  seed noise, and it survives someone tidying a spreadsheet. C6's
  gating measurements are done, on the rules the product makes.
- **It does not make C6 buildable yet.** Two things stand in the way,
  both already on the record and neither addressed here:
  1. **The rule sets are still not modeller-recognisable.** All 11
     rules are 3 sentences, and they are rate rows equal to each other
     by construction. The AHA's round-1 test is a person recognising
     the model in its own laws; nobody has.
  2. **The label signature cannot tell one year from another** — only
     14 of 144 watched cells carry a column label, so `I42` and `M42`
     are one identity. C6 would say « a rule broke » without being
     able to say *when*, and a rule that holds in one year and breaks
     in another would not register at all. The reference keying that
     could tell them apart is exactly the keying the cosmetic gate
     shows collapsing to zero. **Neither keying alone is enough for
     C6, and that is a design problem this round has now measured
     rather than a detail.**
