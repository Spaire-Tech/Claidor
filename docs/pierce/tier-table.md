# The tier table — what the Watch proves, at what cost, and what it refuses

*Prism (Track C), 28 August 2026. Written under the twenty-fifth
sweep's orders: « the tier table as a single published statement ».
Every number here is measured on the registered pair — Ofgem ED2 v2,
**14 July → 31 July 2023**, 41,049 cells in the engine's universe —
and each is traceable to a round in `docs/pierce/logs/prism.md`. No
number in this document is an estimate.*

---

## The question, and why it needs tiers

« What changed between these two versions of the model? » has a cheap
half and an expensive half. The cheap half is what a diff can see:
text and stored values. The expensive half is what only evaluation
can see: whether two cells that *look* identical still compute the
same thing.

The tiers are that split, made explicit and kept apart. Each cell of
the new version gets **exactly one** verdict, reached at a named
rung, and the rungs are never blurred: a cell proved at hash cost is
never reported beside a cell supported by five samples as though the
two claims were equal.

## The ladder, in order

```
raw evidence  ->  tier 0  ->  tier 1  ->  tier 2  ->  tier 3
   (C1)          (hashes)     (Z3)     (evaluation)  (refusal)
```

Raw evidence comes **first**, and that ordering is a correction the
record carries: the engine's formula shape erases numeric literals,
so `=B2*0.4` and `=B2*0.5` hash identically, and a coefficient edit
in a file that was never recalculated would be « proved unchanged ».
Excel recalculating on save closes that in practice — the count of
proofs the raw grid had to overrule on this pair is **0** — but the
ladder does not rely on it.

---

## Raw evidence — what a diff can see

| | |
|---|---|
| **Claims** | The cell's stored content or value differs between the versions |
| **Strength** | Fact about the files. No tolerance anywhere, values compared type-tagged (`1` ≠ `"1"` ≠ `TRUE`) |
| **Cost** | Two file reads. **86 s** of the 131 s ladder run |
| **On the pair** | **1,278 cells** — 1,240 by stored value, 24 added, 14 by content |
| **Refuses** | Nothing. It is evidence, not a judgement |

The 14 content changes on this pair are **retyped inflation inputs**,
not rewritten formulas. Verified over the raw grids: **zero** cells
have differing formula text anywhere in the workbook, and none of the
24 added cells is a formula.

## Tier 0 — verifying-trace fingerprints

| | |
|---|---|
| **Claims** | This cell's **stored value** could not have changed: same shape, same own value, same input values |
| **Strength** | Proof, given the files. It does **not** claim the stored value is *correct* — a value stale the same way on both sides matches |
| **Cost** | A SHA-256 per cell. **~46 s** for 41,049 cells, after reading |
| **On the pair** | **38,255 cells — 93.19%** proved at hash cost, before any evaluation |
| **Refuses** | A cell whose own result the reader cannot see (**1,222**: formulas returning text read as `None` in the numeric universe) · a cell with no aligned counterpart (**24**) · a cell whose trace differs (**294**) |

The refusal that matters most is the first, and it is a fact about
the instrument rather than the revision: **on a real adjacent
revision, the commonest reason the cheap proof cannot speak is not
that a cell changed — it is that the cell's own result is invisible
to the reader**, four to one over cells that actually moved.

## Tier 1 — the Z3 proof · **NOT BUILT**

| | |
|---|---|
| **Would claim** | Two cells compute the same function over the arithmetic / IF / SUM fragment — equivalence, not sampling |
| **Status** | **Blocked.** `z3-solver` is not a dependency of this repository, and no code of this lane imports it |
| **What unblocks it** | One line in `server/pyproject.toml`, the lead's to add. Registered in the lane log; re-raised at every sweep since |
| **On the pair** | **1,516 cells reached tier 1's rung** and it decided none of them |

The hole is printed in every run as `tier1_would_have_been_asked`,
never inferred from this document. A cell tier 1 might have proved
and tier 2 merely supported is reported as tier-2 supported **and**
counted in that number.

## Tier 2 — randomized differential evaluation

| | |
|---|---|
| **Claims** | Both versions computed the same value on every trial, and the trials **moved** this cell |
| **Strength** | Evidence, never proof: five trials, one seed. « No divergence found », stated as such |
| **Cost** | `2 × trials` recalculations of the whole workbook. **14 min** at a fixed band; **39–57 min** when the band is searched |
| **On the pair** | **313 supported · 0 plain divergences · 7 latent** |
| **Refuses** | `no_perturbable_input` (939) · `degenerate_under_perturbation` (257) · `tier2_divergence_latent` (7) · `not_offered_to_tier2` · `volatile` · `environment_dependent` · `not_read_by_driver` |

**The band matters more than the seed.** ED2 tolerates ±1% and not
±5%: every band from ±50% down to ±5% drives the same ~1,379 cells
into `#DIV/0!`, and only ±1% keeps the model inside its own domain —
against a baseline of **0** error cells in the untouched file. A
harness that perturbs harder does not test more; it tests nothing,
loudly.

**`degenerate_under_perturbation` exists because this lane got it
wrong first.** Those 257 cells were reported as « the trials never
moved this cell's inputs » for a round. They were reached; the
perturbation pushed them out of the domain where the model computes
anything, and comparing two versions at `#DIV/0!` is vacuous. The
refusal was right; its published name was false, and it is now two
names.

**`tier2_divergence_latent` is the tier's most interesting output.**
Seven cells on `Finance&Tax` are byte-identical in both files —
same formula, same stored value, **zero** — and compute *different*
numbers once the model is exercised. A cell diff calls them
unchanged and is right about the files; only evaluation separates
them. They are reported on their own line and never folded into the
revision's `changed` account, because the model does not take that
path as configured.

## Tier 3 — the honest refusal

Every undecided cell carries a reason from a **closed** vocabulary;
a reason outside it fails a gate rather than reaching a report.
On this pair: **1,203 refusals, every one named.**

---

## The gates every run must pass

| | |
|---|---|
| **G1 soundness** | No cell whose stored value moved may be proved or supported |
| **G2a / G2b** | The ladder may never prove more than the fingerprints do, and only raw evidence may overrule a proof |
| **G3 partition** | The four verdicts are disjoint and cover the universe exactly |
| **G4 named refusals** | Every refusal and every change carries a word from its closed vocabulary |
| **G5 tier-2 honesty** | A supported cell must have varied across the trials |

**Violations across every published run: 0.** The control — the same
file against itself through the identical pipeline — is clean on
both configurations run: 0 divergences, 0 latent, 0 violations.

## The cross-instrument check

C1's raw diff and the ladder are separate instruments written weeks
apart over different universes. On this pair they reconcile to a
single named cell:

```
C1 (raw, 60,609 cells)      added 24 · changed 1,255
ladder (engine, 41,049)     added 24 · content 14 · value 1,240 = 1,254
difference                  1 — Cover!G4, the workbook printing its
                                own filename through CELL("filename")
```

## What the pair turned out to be

Stated because it is the point of the whole track: the 31 July
revision **rewrote no formula anywhere**, and **replaced twelve
months of forecast inflation with the published outturn**
(`Monthly Inflation!H284:H295`, typed in the new version, absent in
the old), which feeds whole-column `AVERAGEIFS` aggregates and moves
everything downstream of them.

The cell diff sees 1,255 changed cells and cannot say that. The
ladder says: 93.19% could not have moved · 3.11% moved and is named
· 313 cells verified to compute identically under perturbation ·
7 cells that agree as saved and differ once exercised · 1,203
refused, by name.
