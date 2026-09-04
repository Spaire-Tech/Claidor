# The investigator test: can a language model, reading the cells alone, see the faults the rules miss? — registration, before any run

4 September 2026. The Enron round (`enron-errors.md`) left a number
and a question. The number: the audit names 8 of 32 outside-labelled
faults, and ten of the seventeen misses are wrong-but-consistent
formulas that nothing in a single file contradicts. The question,
the founder's: is that the limit of rules, and would a model reading
the sheet as a reviewer reads it see what the rules cannot? This
round tests the narrow form of that question on the material we
have. It does not test the product design (investigator proposes,
engine proves); it tests whether the investigator has anything to
propose.

## The investigator, fixed now

A fresh instance of the model, spawned as a sub-agent with an empty
context: it has not seen this conversation, the catalogue, the
properties files or the Enron round's documents. It receives one
sheet as a plain table — every occupied cell, its formula where it
has one, its cached value — and this brief:

> You are reviewing one worksheet from a real business spreadsheet.
> The table lists every occupied cell: address, formula (if any) and
> cached value. List the cells you believe are **actually wrong** —
> a formula that computes the wrong thing, reads the wrong cell,
> covers the wrong range, or a value that contradicts the sheet.
> At most six. For each: the cell address, one sentence saying why,
> and a confidence (high, medium, low). Style complaints — a typed
> number inside a formula, a hidden sheet, an inconsistent layout —
> do not count unless you believe the number itself is wrong. If
> you believe nothing is wrong, say so. Answer only from the table:
> do not open files, search, or use any tool.

The brief gives no hint of where the faults are and no count of how
many there are. Twenty-six sheets, one per fault-bearing worksheet,
all sent whole (the largest is 4,670 cells); no sheet is trimmed, so
nothing about a fault's location leaks through the cut.

**Contamination, named.** The 36 faults were published in 2016 and
may be in the model's training data. Recognising a specific
cell-level fault in a specific Enron trading book from a table of
addresses and formulas would be remarkable; the risk is named and
not dismissed. A sub-agent has tools and is told not to use them;
whether it obeys cannot be verified from its report, and that too is
named.

## The score, fixed now

- A **claim** is one cell the investigator lists. A claim **hits**
  when the cell is one of the labelled faulty cells of an error on
  that sheet (the properties file's cells, resolved as the Enron
  scorer resolves them).
- **Recall**: errors with at least one hitting claim, over 32.
- **Recall on the rules' misses**: of the 17 errors the audit did
  not name (`enron-errors.md`, measure 3), how many the investigator
  hits. This is the number the round exists for.
- **Precision**: every non-hitting claim is read by hand against the
  sheet and graded *real* (a genuine problem the corpus did not
  label), *arguable*, or *false*. Precision is hits plus real, over
  claims.
- **Overlap with the rules**: for each hit, whether the audit also
  named it — the investigator's added value is the hits the rules
  did not have.

## Predictions, registered

- Recall: between 4 and 8 of 32.
- Recall on the rules' 17 misses: between 2 and 5.
- Claims: between 60 and 130 across the 26 sheets; false alarms
  between 3 and 8 per sheet on average; precision under 40%.
- Most claims will be the mechanical class the rules already see
  (sums that stop short, a row that breaks pattern), not the
  wrong-but-consistent class.
- At least one sheet where the investigator says nothing is wrong
  and the sheet holds a labelled fault.

## Out of scope, named

- Business sheets, not financial models; a good result is a reason
  to build the investigator-plus-evidence design, not proof of it.
- One model, one prompt, one run per sheet. No prompt tuning after
  the results are seen; a second prompt is a second registered round.
- The engine's evidence is not handed to the investigator here. That
  is the product design and a later test; this is the investigator
  alone.

---

# Results

*(appended after the run; nothing above this line changes)*

## Result — 4 September 2026

**One deviation, named.** The registration said the sheet is
« received as a plain table ». The tables were too large to place in
the prompts, so each investigator was given the path of one file
holding its table, told to read that file and nothing else, and
told not to search, browse or run anything. The tables were copied
under neutral names into a folder holding nothing else. Whether an
investigator obeyed cannot be verified from its report; every report
came back with exactly one tool use, which is consistent with one
read and nothing more.

**Two scores, because the properties files lump errors.** The
properties file for a workbook lists the faulty cells of every error
in it together, so a claim on one error's cell would count for its
neighbour. The strict score below uses each catalogue row's own
cells (`Faulty cells`, ranges expanded) and is the one to carry; the
lumped score was 22 of 32 and is reported here only because it was
computed first.

### Recall, strict

| | Hit | Of |
| --- | --- | --- |
| Errors | **18** | 32 (56%) |
| Of the 24 errors the rules did not name | **12** | 24 (50%) |
| Of the 8 errors the rules named | 6 | 8 |
| Rules and investigator together | **20** | 32 (63%) |
| Sheets where the investigator said nothing is wrong | 3 | 26 — all three hold a labelled fault (#22, #26, #35) |

The twelve the rules missed and the investigator found: a total
that omits its first row (#2, #34), an average over three columns
where every neighbour takes one (#5), a total that includes the rate
row above the data (#6), a two-cell row where one total covers three
rows and the other eleven (#8), a formula that has become a
true-or-false comparison (#10), a formula reading the wrong case's
input (#11), a day count of 364.25 (#12), a subtotal that
double-counts a line already deducted (#14), a net that omits two
purchase columns (#23), a reference two columns off (#30), and a
product that reads the row above (#33). Each reason states the
arithmetic — « 79,625 instead of 83,055 », « 3,395 where 470 × 7
belongs » — which is why these are not the pattern-matching the
rules do.

The fourteen it missed: the unchanged half of a range error the
authors labelled separately (#4), a lone total with no neighbour to
disagree with (#7), a missing term consistent down 337 cells (#13),
two consequences of a fault it did find (#15, #16), a fuel-percentage
block (#19, #20), a user-defined function the conversion turned into
`#NAME?` (#22), a total spanning subtotals (#24), a cell that reads
another cell outright (#25), **a link into a workbook that is not
there (#26, which the rules find)**, a block with an omitted factor
(#28), a rounding formula's 1.9% (#29), and `=SUM(D8*E8)` (#35).

### Precision — every claim read by hand

| | Claims |
| --- | --- |
| Hit a labelled cell | 31 |
| Real — a genuine problem the corpus did not label | **20** |
| Arguable — could be deliberate; cannot be settled from the sheet | 17 |
| False | **3** |
| Total | 71 |

Precision, hits plus real over claims: **72%**. Counting only
outright false claims: 3 of 71, about one per nine sheets.

The twenty real unlabelled problems, so the grade can be checked:
a formula multiplying by an empty cell where its twin multiplies by
the headcount (wb06 V43); three totals ending in `#REF!` (wb06
P130, Q130, S130) and one more (wb24 X38); a demand charge times an
empty cell (wb05 AQ45); two column totals carrying a fault the
corpus labelled upstream (wb19 AE44, AE46); an ending balance
reading an empty row instead of the last day (wb25 F40) and two
running-balance cells skipping a row (wb25 F36, F37); two pulls
pointing at an empty row and at the adjustment row (wb09 Y34, Y35);
two after-tax factors that differ within one row and within one
block (wb20 K138, K54); two swing volumes using 30 days in a 31-day
month (wb03 L6, M6); two stray values in unheaded columns that make
the row totals disagree with the grand total by exactly their amount
(wb23 J18, L18) and a 1e-09 that leaks into three totals (wb23 D22).

The three false: a meter reading guessed to be a typo (wb05 F37), a
November basis guessed to be a summer value (wb04 F17), a
three-decimal amount guessed to be mistyped (wb21 B33). All three
are low-confidence guesses about typed inputs, and the investigator
marked them low.

The seventeen arguable are mostly typed inputs whose value looks
inconsistent (basis columns that go to zero, strike prices that
differ between tranches) and formulas that work today by
coincidence. A reviewer would want to see them and would not call
most of them errors.

### Predictions, scored

- Recall 4 to 8 of 32 — **fails, upward**: 18.
- On the rules' misses 2 to 5 — **fails, upward**: 12 of 24.
- Claims 60 to 130 — holds (71).
- False alarms 3 to 8 per sheet, precision under 40% — **fails,
  downward**: 3 false claims across 26 sheets; precision 72%.
- Most claims mechanical, not the wrong-but-consistent class —
  partly holds: most hits are wrong ranges and wrong references,
  which are the rules' class, but found without a row to compare
  against; the double-count (#14) and the day count (#12) are
  logic.
- At least one sheet where it says nothing and a fault is there —
  holds (three).

### What the round decides

1. **The investigator sees what the rules cannot, on this
   material.** Half of the faults the rules missed, at a false-alarm
   rate the rules would be proud of. The founder's question has an
   answer, and it is not the one I predicted.
2. **It is not the rules' replacement.** It missed the one class
   the rules never miss (a dead external link), it went quiet on
   three faulty sheets, and it cannot be measured without the
   labels; the rules' eight are proven on every model we hold. The
   union, 20 of 32, is the number that argues for the design the
   founder proposed: investigator proposes, engine proves.
3. **Its claims are checkable by the engine as they stand.** Every
   hit and every real claim names a cell and an arithmetic reason
   — a range, a reference, a comparison of two values — which is
   exactly what the engine can confirm or deny deterministically.
   That is the next round: hand each claim to the engine and
   measure how many it can prove.
4. **The limits stand.** Business sheets, not financial models; one
   prompt, one run; the contamination risk named above; and no
   evidence yet on the founder's world, where the faults are
   contracts and assumptions rather than ranges.
