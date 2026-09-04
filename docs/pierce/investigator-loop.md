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

---

# Results

*(appended after the runs; nothing above this line changes)*

## Part A — the Enron sheets, 4 September 2026

**Deviation, named.** As in the first test, the tables and the
evidence were delivered as two files to read, not inline; every
report came back with exactly two tool uses.

### Recall, strict

| | Hit | Of | First test (blind) |
| --- | --- | --- | --- |
| Errors | **19** | 32 | 18 |
| Of the 24 errors the rules did not name | **13** | 24 | 12 |
| Of the 8 the rules named | 6 | 8 | 6 |
| Rules and investigator together | **21** | 32 | 20 |
| Sheets where it said nothing is wrong | 4 | 26 — all four hold a labelled fault (#19/#20, #22, #26, #35) | 3 |

The evidence added one error (#15, the income statement's second
wrong line, claimed as arithmetic with the right number) and lost
none. It did not make the investigator repeat the engine: 26 of the
74 claims sit on a cell the engine also named, mostly because the
engine's `#REF!` and stopped-short-sum findings are real faults the
investigator agreed with.

### Precision — every claim read by hand

| | Claims |
| --- | --- |
| Hit a labelled cell | 36 |
| Real, unlabelled | **15** |
| Arguable | 16 |
| False | **7** |
| Total | 74 |

Precision, hits plus real over claims: **69%** (first test 72%).
False claims 7 of 74 (first test 3 of 71). Four of the seven false
claims are one sheet (wb09) where the investigator said four cells
« should read » a row that turns out to hold nothing. **I had graded
two of those four as real in the first test.** The prover caught
all four; see below.

### The prover against the grades — the number the round exists for

| Grade | Confirmed | Refuted | Unverifiable |
| --- | --- | --- | --- |
| Hit a labelled cell (36) | **33** | 2 | 1 |
| Real, unlabelled (15) | 12 | 2 | 1 |
| Arguable (16) | 10 | 2 | 4 |
| False (7) | 1 | **6** | 0 |

- **Hits confirmed 33 of 36 (92%).** The two refuted hits are the
  claim over-citing, not the fault being wrong: on wb30 M22 the
  investigator listed eight omitted cells and one of them holds
  nothing; on wb04 L16 it named four neighbours that are not built
  the same way as each other. The fault is real in both; the claim
  as written is not, and the prover said so.
- **False claims refuted 6 of 7 (86%).** The one false claim that
  passed is a value-contradiction whose facts are true (0.505 and
  0.85 are both there) and whose judgment is wrong; the verdict's
  note says the judgment is the reviewer's.
- **Two real claims refuted, and that is a prover gap, named:** wb20
  K54 and K138 differ from their neighbours only in a typed factor
  (0.5895 against 0.5995), and the shape comparison erases typed
  numbers by design, so it sees them as the same. The fix is a
  second comparison with the numbers kept when the shapes agree;
  it is not made in this round.
- **One arguable claim refuted for the wrong reason:** wb21 B117 is
  a label, and labels are not in the number grid the prover reads.

**The prover corrected the grader.** In the first test I read wb09
Y34 and Y35 as real (« pulls point at an empty row while the data
sits above »). The prover checked the cells the investigator said
they should read — B35, C35, B36, C36 — and every one holds
nothing. My grade was wrong; the claims were wrong; the machine
was right. That is the argument for the design in one line.

### Predictions, scored

- Recall 15–22 — holds (19); on the rules' misses 9–14 — holds (13).
- Precision 60–80% — holds (69%); false under 8 — holds (7).
- Hits confirmed ≥ 80% — holds (92%); false refuted or unverifiable
  ≥ half — holds (6 of 7); hits refuted under 10% — holds (5.6%).
- Claims repeating an engine finding under a quarter — **fails**
  (35%), for the reason above: where the engine is right the
  investigator agrees with it, and the brief did not forbid that.

### Kinds, for the record

Range-omits 23, wrong-reference 17, arithmetic 8, other 6,
differs-from-neighbours 6, empty-reference 5, value-contradiction 4,
error-value 4, malformed 1. Sixty-eight of seventy-four claims were
checkable; the six « other » were labels, a day count and a stray
value.
