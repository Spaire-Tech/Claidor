# The investigator loop: the engine's evidence in, structured claims out, every claim proved or refuted from the cells — registration, before any run

4 September 2026. The investigator test (`investigator-test.md`)
answered the founder's question: a blind model reading a sheet as a
table named 18 of 32 outside-labelled faults and 12 of the 24 the
rules had missed, with three false claims in seventy-one. Its
reasons were arithmetic. This round builds the design the founder
proposed on the strength of that — **the investigator proposes, the
engine proves** — and measures it twice: on the same Enron sheets,
where the labels are, and on the sheets of our own regulator models
that hold registry labels.

## The loop, fixed now

1. **Evidence in.** The investigator receives the sheet as before
   (every occupied cell: address, formula, cached value) and, as a
   second file, the engine's own findings on that sheet in the
   plain words the product shows, with their cells. The brief says
   they are evidence to use or dispute, not a list to repeat.
2. **Structured claims out.** Each claim names a cell, a **kind**,
   and the facts it rests on, so that a machine can check them:

   | Kind | Cited facts |
   | --- | --- |
   | `range-omits` | the formula's range, and the cells it leaves out |
   | `wrong-reference` | the cell the formula reads, and the cell it should read |
   | `empty-reference` | the cell the formula reads that holds nothing |
   | `differs-from-neighbours` | the neighbour cells built the other way |
   | `malformed` | — (the formula itself) |
   | `error-value` | — (the cached value) |
   | `arithmetic` | an alternative formula and the value it gives |
   | `value-contradiction` | the other cell it disagrees with |
   | `other` | free text; not checkable |

   At most six claims per sheet; a one-sentence reason and a
   confidence beside each, as before.
3. **The prover.** A deterministic checker (`polar/tieout/claims.py`)
   tests every cited fact against the cells: does the formula
   really leave those cells out, and do they hold numbers; does it
   really read that cell, and is that cell really empty; do the
   named neighbours really share a shape the cell does not; does the
   alternative formula really give the value claimed, and does the
   cell really hold something else. The verdict is **confirmed**
   (every fact holds), **refuted** (a cited fact is false), or
   **unverifiable** (the kind is `other`, or the alternative formula
   uses something the small evaluator does not know). A confirmed
   verdict proves the facts, not the judgment: « reads D5 and D10 is
   populated » is proven; « and it should read D10 » is the
   reviewer's call, and the report says so.
4. **The report** is the list of claims with verdicts, the way the
   founder described it: not « the AI found 47 errors » but « the
   investigator raised N, the engine confirmed the facts behind M ».

## What is measured, fixed now

**Part A — the Enron sheets** (26 sheets, 32 labelled errors,
the investigator test's strict scoring unchanged):

1. Recall, strict, and recall on the 24 errors the rules missed —
   with the engine's evidence now in the investigator's hands.
2. Precision: every non-hitting claim read by hand and graded real /
   arguable / false, as before.
3. **The prover against the grades**, the number the round exists
   for: of the hits, how many confirmed; of the false claims, how
   many refuted; of the arguable, how many unverifiable or refuted.
   A prover that confirms the false and refutes the true is worse
   than none.
4. Claims that simply repeat an engine finding, counted apart.

**Part B — our own world.** The RIIO-3 final models' sheets that
hold a registry label: GD3 `MainInputs` and `Revenue`; ET3
`Revenue`, `Finance&Tax`, `TaxPools`, `FinRatios RoRE
decomposition`; GT3 `SystemOperator`, `PCFMInterface_SO`; the WACC
model's `One-Off Wedge`. Nine sheets, ten registry labels (nine
engine-found-hand-verified, one independent-real: the wrong switch).
Sheets are cut into **windows of 250 rows from row 1, every window
sent**, so the label's position within a sheet is never hinted at;
the choice of sheet is a hint that the sheet holds something, and
that is named. Twenty-six windows. Measures:

5. Labels hit, of ten, strict as above.
6. Every claim read by hand, graded, and the prover's verdicts
   against the grades — on models of the customer's kind.
7. Cost: model tokens per sheet and prover time.

## Predictions, registered

Registered against the first test's numbers, not against my
earlier instinct, which was wrong by a factor of three.

- Part A recall: between 15 and 22 of 32; on the rules' misses,
  between 9 and 14 of 24. The evidence helps on the class the rules
  find and does not help on the class they miss.
- Part A precision: between 60% and 80%; false claims under 8 of
  the total.
- The prover: at least 80% of hits confirmed; at least half of the
  false claims refuted or unverifiable; under 10% of hits refuted
  (a refuted hit is a prover bug or a claim citing the wrong fact).
- Claims that repeat an engine finding: under a quarter.
- Part B: between 3 and 7 of the ten labels hit; between 40 and 120
  claims across the 26 windows; precision, by hand grade, between
  40% and 70% — the models are larger, more regular, and the
  investigator sees a window, not a sheet.
- Part B cost: under 120,000 model tokens per window.

## Out of scope, named

- The investigator does not see the previous version; the engine's
  version findings (`formula-overwritten`, the Watch's items) are
  the next evidence to hand it, once this loop holds.
- One prompt, one run, no tuning between Part A and Part B.
- The prover's evaluator is small on purpose: sums, minimums,
  maximums, averages, rounding and the four operations over cells
  and ranges. Anything else is unverifiable and says so.
- No product wiring yet; this is the measurement that decides
  whether there is anything to wire.
