# The engine: what it is, how it got here, and where it goes next

This is the return point. When we come back to improve the engine,
start here — it says what was built, what every round taught, what
the numbers honestly are, and exactly where the frontier sits. The
chronological account lives in `worklog.md`; the measurement
protocols and results in `findings-usefulness-audit.md` and
`round4-stress-test.md`; this document is the map.

## What the engine is

A static auditor for financial models. It reads a workbook's cells,
formulas, cached values, labels and structure — never executing
anything — and reports what a senior model auditor would want to
know: displayed errors, torn references, totals that step over live
money, values typed over calculated series, formulas out of step
with their families, buried assumptions, provenance it cannot check,
and the hygiene the published standards (ICAEW, FAST, EuSpRIG) name.
Findings are ranked (tier 1 defect / 2 assumption at risk /
3 hygiene), folded so one authoring decision is one finding with its
cells as the roster, and phrased as a banker hears them: what is
wrong → where → why it matters.

The code: `server/polar/tieout/audit.py` (rules, folds, elevation),
`workbook.py` (the reader), `structure.py` (period axes, labels),
`evaluate.py` (the one-step evaluator). The product surfaces are the
deal audit and the solo Check-a-model, both fed from `audit()`.

## The discipline that made it improve

Five habits, adopted from the mentor and never broken since:

1. **The golden-master gate.** `scripts/corpus_gate.py` sweeps the
   27-model lab corpus; the baseline
   (`corpus-golden-master.json`) is committed; **every engine change
   must trace every diff line to a named fix**. The gate has caught a
   judged-A deletion, a principle over-reach, a capped walk reading
   one row differently from its siblings, and a half-copied baseline.
2. **Pre-registered measurement.** Sample seeds, metrics and reading
   rules are written and committed *before* any finding is judged.
   Amendments are logged, never silently rewritten.
3. **Judge from the cells.** Verdicts come from harvested
   neighbourhoods (the cell, its formula, labels, surroundings) —
   never from the finding's own sentence.
4. **Every piece of noise names its fix.** A C (false positive) must
   state the general principle that removes it — never « if this
   exact cell then ignore ». A D (duplicate) names the fold. The
   audit's output *is* the next round's spec.
5. **Nothing detected is deleted; representation changes.** Folds
   change what the report says, not what the engine sees. Correctness
   up, even when the count goes up.

## The journey, in numbers

Usefulness = the judged share of findings a professional would keep
(A definitely + B probably useful), stratified where sampled.

| Measurement | Corpus | Population | A+B | What changed before it |
|---|---|---|---|---|
| 1st (18 Aug) | lab 27 | 1,259 | **26%** | — the honest starting point |
| 2nd (19 Aug) | lab 27 | 852 | **61%** | the fix round: 14 C causes, 4 D collapses |
| 3rd (19 Aug) | lab 27 | 669 | **91%** | Round 1 Collapse + Round 2 Purify |
| 4th (19 Aug) | lab 27 | 632 | **98%** | Round 3 Elevate (+ 4 judged fixes) |
| Round 4 exam | **unseen 11** | 1,678 | **5.8%** | nothing — the engine as it stood, on models it had never seen |
| 5th (20 Aug) | **unseen 11** | 136 | **80.1%** | Round 5 Generalize |

The two numbers that matter now: **80.1% useful on unseen models
(2.9% false positives, 8 ACT-grade finds)** and **62% recall on
planted defects** (broken references 13/15, overwrites 9/13, wrong
assumptions 8/11, displaced references 5/15, operator flips 1/5).
Clean models stay clean: no believed-clean file has ever produced a
false defect claim; one is perfectly silent.

## What each round taught (the mentor's framing)

- **Round 1 — Collapse:** one authoring event can produce many
  cell-level findings. Folds: sibling sheets keyed by shape and
  label (fourteen company balances are one layout decision), row
  templates, column beats, designed-error regions.
- **Round 2 — Purify:** suspicious-looking things are often
  legitimate spreadsheet behaviour. The question is never « is this
  cell odd » but « what semantic fact makes this legitimate? »
  Percent postfixes, text builders, MATCH case lists, sentinels,
  calendar comparisons, block headers, partition coverage.
- **Round 3 — Elevate:** not everything deserves equal attention.
  Every finding carries tier, weight (structural risk × confidence,
  raised only by real money the engine computed), a basis sentence
  arguing the rank, and — on folds — the roster of member cells.
- **Round 4 — Stress test:** the lab number means nothing until the
  engine leaves the lab. 98% became 5.8% on eleven unseen models —
  one unexercised convention (inter-workbook links) with no fold,
  plus seven noise classes the lab never taught. But the *signal*
  generalized: real torn checks, hand-keyed revenue in Thames
  Water's final determination, typed-over ERPs — found cold. And
  recall got its first honest numbers, including two zeros.
- **Round 5 — Generalize:** implement what the exam taught, measure
  on the unseen corpus, not the lab. 5.8% → 80.1%. The loop closes:
  named noise → general principle → the next unseen number moves.

## The grammar the engine now knows

Every rule below was learned from a judged false positive on real
cells — this list is the moat. A number typed in a formula is NOT an
assumption when it is:

- a **date constructor's argument**, a **text function's argument**,
  a **rounding precision**, an **ABS-comparison tolerance**, or a
  **power-of-ten exponent** (the original set);
- a **percent-postfix component** (`+0.1%` is one number), part of a
  **text-building formula** (a label, not a value), a **MATCH case
  list** member, a **calendar-part comparison** (`WEEKDAY(x,2)<6`),
  a **sentinel** (9999, year-lengths), documented by the **row's own
  words, in digits, percent, basis points or number words** («
  half » documents 0.5), or documented by the **block's nearest
  header above, however tall the block** (Round 2 + judged fixes);
- a **lookup index argument** (`VLOOKUP(x,table,15)` picks, it does
  not assume — even through a conditional), a **bare power-of-ten
  sentinel in a branch** (`10000000` = infinity), a **`^0.5`
  exponent** (a square root), a **diagnostic threshold** in a
  formula whose outputs are sentences, a **compared-and-echoed
  literal** (`IF(D14<5," ",5)` labels itself), a **divisor equal to
  the operand count** (a written-out mean), or excluded by a **total
  whose label states its own window** (« 5 years » over five rows)
  (Round 5, from the unseen corpus).

And the structural grammar: typed history is data, parameter columns
are data, designed `#N/A` tails are answers, cumulative seeds are
seeds, a row's first cell reading an anchor is the chain's seed, a
column total crossing a row of row totals is two designs meeting,
INDEX tables are picked not walked (no circularity through them),
and external links are **one import event per source workbook**.

The detectors' positive side grew too: the **mutation detector** —
a family identical token-for-token except one cell, differing in
exactly one position, is *the same calculation with one changed
token* (a flipped operator, a displaced reference). Precision is
protected by family-agreement, seed, and crossing-family exemptions,
each learned from its own judged spray. It found a real anchoring
break (`Y228` vs `Y$228`) in the lab corpus that five measurements
had blessed, and a real displaced window on an unseen model.

## The equipment

| Tool | What it does |
|---|---|
| `scripts/corpus_gate.py` | sweep a corpus to JSON; diff two sweeps finding-for-finding (order-insensitive) |
| `scripts/usefulness_sample.py` | seeded stratified draws — by family×rule, or per-detector with a floor |
| `scripts/plant_defects.py` | plant six defect classes into a host by XML surgery (cached values preserved), ground truth first, one plant per row/column |
| scratchpad `harvest_neighborhoods.py` | cell neighbourhoods for judging cards |
| `docs/pierce/corpus-golden-master.json` | the committed 27-model baseline (632 findings, tiered) |
| `tests/tieout/` | 494 tests; every judged principle has a regression test |

The corpora themselves (lab 27: Ofgem ED2/RIIO-3, CAA H7, AER;
unseen 11: Ofwat PR24 via the UK Government Web Archive, NZ Commerce
Commission DPP4, Damodaran) are public files, re-fetchable; the
manifests are in the protocol docs.

## The frontier — where to start next time

Named, judged, and waiting. In rough order of value:

1. **Three unbuilt folds** (all of the unseen corpus's remaining D
   mass, 17%): the rolling-average seed family, the torn `#REF!`
   check row (same-shape error cells in one row), and the
   per-company literal column (`=N/1000` sixteen times under one
   label block).
2. **Singleton mutations** — the deepest gap. A flipped sign in a
   formula with no family (`=Revenue+Costs` standing alone) is
   invisible to every static witness we have. The path is semantics:
   the labels say « margin », « net », « less » — the words imply
   the sign. This is where the engine stops being structural.
3. **Recall gaps with known shapes:** INDEX table bounds displaced
   by one; error values in label columns the reader never elects;
   totals narrowed at the *head* of their own range (deferred — an
   ungated version floods; needs designed corpus evidence);
   growing-product rows where no two shapes match.
4. **Grammar residue:** diagnostic thresholds one arithmetic step
   inside the compared expression; count-window totals whose label
   omits the count; the index-factor limitation (all of the lab's
   remaining tier-1 noise — a general multiplicative-block rule
   risks pinning judged-A totals, so it needs corpus evidence).
5. **Engine plumbing:** the statement checks (analytics) still ride
   outside the elevation layer; banner errors are tier-1 when a live
   column resumes below (a tier miss); `_mutations` costs ~8 minutes
   on a 400k-formula BPFM (shape memoization landed; the census
   could be lazier).
6. **The next exam:** 10–20 genuinely new models — new industries,
   new modelling cultures (project finance, corporate three-statement,
   LBO), clean-model set expanded, defects planted, same three
   questions: precision, recall, silence. The mentor's bars: >80%
   unseen precision (met once, must hold), <5% false positives
   (holding), >90% recall on broken/overwrites/structural (not yet:
   87%/69%/—), mutations substantially up (moving), and **no
   catastrophic blind spots** — we must always know exactly what the
   engine cannot see. Today we do; keep it that way.

## The bet, as the mentor framed it

Every unseen corpus so far has converted its failures into general
rules within one round, and the next unseen number moved. The
question this repository is answering is not « how many rules have
we programmed » but « how much of the grammar of financial modelling
does the engine understand ». As long as each new corpus keeps
producing named principles and the implemented principles keep
moving the *next* corpus's number, the loop is working — and the
loop itself, with its gate, its registered measurements, and its
judged verdict history, is the thing that is genuinely difficult to
reproduce.
