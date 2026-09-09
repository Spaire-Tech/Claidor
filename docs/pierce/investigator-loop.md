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

## Part B — our own world, 4 September 2026

**Deviations, named before the numbers.**

1. **Twenty windows, not twenty-six.** The registration's count was
   an estimate; the nine sheets cut into 250-row windows from row 1
   give twenty (GD3 `MainInputs` seven, ET3 `Finance&Tax` two, GT3
   `SystemOperator` five, the other six one each). Windows hold
   between 294 and 4,165 occupied cells.
2. **Thirteen registry lines, not ten.** The registration miscounted:
   the registry holds twelve `engine-found-hand-verified` lines and
   one `independent-real` on these nine sheets, and two of them
   (the typed `/5` and the wrong switch) share the cells
   `AU472:AY472`. Thirteen lines, twelve distinct faults, scored
   against thirteen.
3. **Read in pieces.** A window is longer than one read, so the
   investigators read their two files in several pieces; one counted
   its table's lines with a shell command, one searched its own table
   with patterns. Every tool use in every transcript touched the two
   files handed over and nothing else — checked, not assumed.
4. **The evidence handed over the labels.** Twelve of the thirteen
   labels are the engine's own findings, and the thirteenth is found
   by the rule written the day before; the evidence file for each
   window carried those findings. Every one of the eight hitting
   claims sits on a cell the evidence named. Label recall here
   measures whether the investigator repeats the evidence, not what
   it sees; the number that means something in Part B is the
   unlabelled column below.

### Labels hit, strict

| | Hit | Of |
| --- | --- | --- |
| Registry lines | **5** | 13 |
| Distinct faults | 4 | 12 |
| Windows that said nothing is wrong | 5 | 20 — one of them (ET3 RoRE) holds a label |

Hit: the two final-year profiling cells (ET3 `Revenue!AY25`, GD3
`Revenue!AY26`), the phasing row's typed `/5` and its wrong switch
(`MainInputs!AU472:AY472`, one row, two lines), and the TaxPools
straight-line row anchored on an empty cell (`AP106`). Missed: the
three typed-over rows (ET3 RoRE `AP29:AY29`, ET3 `Revenue!AP16:AY16`,
GT3 `PCFMInterface_SO!I184`), four typed numbers inside formulas
(`Finance&Tax` `AP258`/`AP259`, `SystemOperator` `AP931`/`AP979`,
the wedge's `E16:E17`), and the OFFSET row (`SystemOperator!AP731`).
Those are the classes the brief tells the investigator to set aside
« unless you believe the number itself is wrong », and it did.

### Every claim read by hand

| | Claims | Distinct issues |
| --- | --- | --- |
| Hit a labelled cell | 8 | 4 |
| Real, unlabelled | **25** | **7** |
| Arguable | 10 | 8 |
| False | **1** | 1 |
| Total | 44 | 20 |

Precision, hits plus real over claims: **75%**; by distinct issue,
11 of 20 (55%). One false claim in forty-four.

**The seven real faults the engine has no rule for**, in four
published Ofgem final-determination models, so the grade can be
checked:

1. ET3 `Finance&Tax` row 227, « Early equity issuance cost »,
   FY2027–FY2031: `=AU223*AU225*$AP$119` where FY2022–FY2026 are
   `=AP223*AP225`. The extra factor is the FY2022 equity issuance
   amount, zero, so the 942.79 issued in FY2027 carries a cost of 0
   where the rate gives 47. Five claims, one row.
2. GT3 `PCFMInterface_SO` rows 99–116: every allocation percentage
   is one INDEX/MATCH added to itself, `(INDEX(…))+(INDEX(…))` with
   the same arguments. The interface shows 120%, 80% and 200% where
   the `NGGT SO` sheet holds 60%, 40% and 100%. Nothing in this
   workbook reads the rows; the sheet is the hand-over to the PCFM.
   Six claims, one block.
3. GT3 `SystemOperator` row 1012, « Profit impact of tax trigger (no
   deadband) »: multiplies by `TOpf`, the transmission owner's price
   factor (`MainInputs` row 376), where row 1011 and rows 1063–1064
   use `SOpf` (row 215). Both factors are 0.871 today and the input
   is 0, so nothing moves. Six claims, one row.
4. GD3 `MainInputs` row 535, the typed date headers over the totex
   allocation block: 31/03/2022 to 31/03/2026, then 31/03/2026 five
   times over the RIIO-3 columns. Nothing reads the row; a label
   fault. Five claims, one row.
5. GT3 `SystemOperator!I287`, « Over/undercollection percentage for
   penal rate adjustment »: the year-column switch pattern copied
   into the scalar column, whose flags are empty, so 0 where the
   identically labelled `I265` holds 0.12 and the cell it reads
   holds 0.06. Nothing reads it.
6. GT3 `SystemOperator!AO280`, SONIA in the RIIO-1 column: the switch
   is `AO$10` alone where the block uses `(AO$9+AO$10)`, so 0 where
   the input is 0.00056.
7. GT3 `SystemOperator!AO286`, the K rate margin, the same way: 0
   where the input is 0.0115.

The ten arguable: a last-column flag built differently with the same
result (`Finance&Tax!AY14`); an opening balance reading the empty
column before the first year (`AP376`); a stray link without the
price-base factor, worth 0 (`MainInputs!V1490`); a dead second term
carrying the other price-base factor in columns whose flag is 0
(`AO1505`, `AO1506`, `AO1508`); a TIM line that re-derives allowed
totex past the multiplier row, equal while the multiplier is 1
(`SystemOperator!AP627`); a typed 2.8 where the blend would give
2.74 in the wedge's transition year (`C16`); a legacy link one row
off a sequence, into an empty row either way (`AU61`); flag columns
reading a numeric block (`BC47`). A reviewer would want to see each
and would not call most of them errors.

The one false claim: `MainInputs!AP1495` « should read InputSummary
row 974 » — row 974 is empty, and row 243, the one it reads, is
labelled « Disposals net proceeds ».

### The prover against the grades — and what it found in itself

| Grade | As run: confirmed / refuted / unverifiable | After the three fixes |
| --- | --- | --- |
| Hit (8) | 6 / **2** / 0 | **8** / 0 / 0 |
| Real (25) | 8 / **11** / 6 | 14 / 5 / 6 |
| Arguable (10) | 4 / 6 / 0 | 7 / 3 / 0 |
| False (1) | 0 / 1 / 0 | 0 / 1 / 0 |

As run, the prover refuted two hits and eleven real claims. Reading
each refutation against the cells found **three bugs in the prover,
not in the claims**, each fixed after the results were seen, each
with a test, and named here as a change made after the fact:

- The claim parser upper-cased the whole reference, sheet name and
  all, so « reads `MainInputs!AZ461` » never matched the sheet
  `MainInputs`. Two hits and one false claim refuted for the wrong
  reason.
- The shape comparison read `AP$9` as a fixed column, so two cells
  filled across a row looked built differently. Three true claims
  refuted.
- Defined names were unread, so « reads `TOpf` » was « does not read
  TOPF ». Six true claims refuted. The workbook now keeps its names
  and the prover resolves them, sheet scope first.

Part A re-run under the fixed prover gives the same verdicts as
before, to the claim. After the fixes every hit is confirmed and
14 of 25 real claims are. The eleven that are not:

- **Five refuted rightly, by the letter.** The date headers were
  filed as `value-contradiction` — « these hold the same value where
  they should differ » — and the kind means the opposite. The facts
  the investigator cited are true; the prover said the true thing
  (they are the same) as a refutation. A kind for « repeats where it
  should differ » is missing.
- **Six unverifiable.** The doubled lookups were filed as `other`. A
  kind for « a term repeated inside one formula » would make them
  checkable from the formula text alone.

The three arguable claims still refuted are refuted rightly: a typed
cell has no shape to compare (`C16`), a « should read » into an
empty cell (`AU61`), neighbours that are not built alike (`BC47`).

### Cost

Model tokens per window — every token the model read across its
calls, cache reads included, from the transcripts: least 85,000,
median 244,000, most 765,000; six million across the twenty. Under
120,000: five of twenty. The windows were too long for one read, so
each investigator read them in several pieces, and every piece read
the whole context again. The prover checked the 44 claims in 0.02 s;
reading the four workbooks took 279 s, which is the reader's cost on
these models, not the prover's.

### Predictions, scored

- Labels hit 3–7 of ten — **holds in count** (5 of 13; 4 of 12
  distinct), against a denominator the registration got wrong, and
  every hit sits on a cell the evidence named, so the number does
  not measure what it was registered to measure.
- Claims 40–120 across the windows — holds (44 across 20).
- Precision 40–70% — **fails, upward** by claim (75%); holds by
  distinct issue (55%).
- Cost under 120,000 tokens per window — **fails** (5 of 20).

### What the round decides

1. **On the customer's kind of model, the investigator found seven
   real faults the engine has no rule for**, in four published Ofgem
   final models, with one false claim in forty-four. Two of the
   seven change a number in the file today (the issuance cost, the
   interface percentages); one is masked by equal factors and a zero
   input (the tax trigger); four are wrong cells that nothing in the
   numeric grid reads. They are candidates for the registry
   and are not entered: the registry's grades are the founder's
   protocol, and none of them is « found by the investigator, read by
   hand by the engineer ».
2. **The loop found the prover's bugs.** Every wrongly refuted true
   claim was a defect in the checker, and the checker is the part of
   this design that has to be right. Three found, three fixed, three
   tests; the Enron verdicts did not move.
3. **Label recall on our own world is not a measure while the labels
   are the engine's.** The independent denominator this needs is the
   errata pairs (`ofgem-errata.md`), once the corrected files are held.
4. **Two kinds are missing from the claim grammar**, and both are
   checkable from the formula text: a repeated term, and a value
   repeated where its neighbours step.
5. **The cost is the window, not the model.** Two hundred and fifty
   rows of a regulator model is up to four thousand cells; a table of
   the cells that break their row's shape, with the engine's evidence,
   would be a tenth of that. That is the next registered round, not
   this one.
