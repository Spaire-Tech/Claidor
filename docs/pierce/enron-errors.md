# The Enron error corpus: thirty-six outside-labelled faults — registration, before any score

4 September 2026. The research brief's cheapest item: real business
spreadsheets from the Enron archive in which Schmitz and Jannach
(« Finding errors in the Enron spreadsheet corpus », VL/HCC 2016)
found faults by reading the e-mails the sheets travelled with, and
which TU Graz packaged with a properties file per workbook naming
the faulty cells (`Error_ENRON.zip`, sha256 `4f23c7cb…a7c04292f4450`,
789,204 bytes, from spreadsheets.sai.tugraz.at). Nobody at Swens
touched a label. That makes it the second outside-labelled set we
hold after CUSTODES, and the first whose labels are **faults**, not
smells: each has a corrected later version in the archive, so the
authors know the cell was wrong, not merely odd.

The corpus is held in the scratchpad and never committed; its page
asks that use be research use citing the paper, and that is what
this is.

## What is held

| | |
| --- | --- |
| Workbooks | 26 (`.xls`, converted to `.xlsx` through LibreOffice headless, as the CUSTODES round converted its subjects) |
| Errors in the catalogue (`enron-errors.xlsx`) | 36 |
| Faulty cell entries in the properties files | 630 — one error (a 337-cell column) is more than half of them |
| Quantitative / qualitative | 28 / 8 |
| Formula / value / label cells | 33 / 2 / 1 |
| Subtypes | range error 12, wrong calculation 11, wrong reference 3, wrong values 2, wrong formula 1, wrong labels 1, fixed value 1, file reference 1, other 4 |

These are trading books, invoices, cost estimates, gas models and
request forms. They are not project-finance models and are not the
customer's world; they are real, in-use, and labelled by strangers,
which is the property the truth-set round could not buy.

## The score, fixed now

The unit is the **error**, one of the 36 catalogue rows, with the
cells its properties file names. An error is **covered** when any
finding of the audit on the faulty workbook touches at least one of
its cells. Touch is the CUSTODES scorer's own convention, unchanged:
the finding's cell, every cell in its roster, and the rectangle of a
« filled across N cells (A to B) » detail. A cell-level count (of
630) is reported beside it and named as dominated by one error.

The audit is today's engine as it stands, single file, no previous
version (the corpus holds the faulty side only; the corrected
workbooks are named in the catalogue but not packaged). Nothing is
tuned on this corpus before the score is taken.

## Measures, fixed now

1. **Coverage**: errors covered / 36, and by type (quantitative
   mechanical / logical / omission; qualitative), by cell type, and
   by subtype.
2. **Which rule covered each**, and how many findings the engine
   raised across the 26 workbooks — the flood measure. No precision
   claim: the corpus labels 36 faults and says nothing about the rest.
3. **Every miss read by hand**, from the faulty formula and its
   neighbours: could a single-file rule have seen it (a SUM that
   stops a row short is `skipped-cell`'s own class), is it a class we
   have no rule for, or is it invisible without the corrected version
   or the e-mail?
4. **Cost**: read and audit time for the 26.
5. **The registry**: 36 lines, grade `external`, with the corpus's
   own type and cells.

## Predictions, registered

- Coverage between 30% and 50% of errors (11 to 18 of 36). The
  CUSTODES coverage was one in seven, but those labels were mostly
  loose « missing formula » clusters; these are named faults in
  formulas, which is the engine's home ground.
- Range errors (12): at least half covered — `skipped-cell` and
  `inconsistent-row` are built for them.
- Wrong calculation (11, logical): under a quarter — a wrong formula
  that is consistent along its row has no witness in the file.
- Wrong values (2) and wrong labels (1): zero.
- Findings raised across the 26 workbooks: under 300.
- Cost: under two minutes.

## Out of scope, named

- No precision number; there is nothing to measure it against.
- The engine's rules were not written for hobby-scale sheets and
  several abstain on them (no period axis, no aggregations); an
  abstention on a file whose fault is in that rule's class is a miss
  and is counted as one.
- The conversion may change cached values; formulas survive it, and
  the labels are on formulas.

---

# Results

*(appended after the score; nothing above this line changes)*

## Result — 4 September 2026

**Two things named before the numbers.** The catalogue lists thirty
workbooks and the archive packages twenty-six, so four errors (17,
18, 21, 31) have no file and leave the denominator: **32 errors are
scored.** And the properties files give a sheet *index* that does
not always match the converted workbook's order (hidden and chart
sheets move it); error 27's sheet was index 2 in the properties and
the sixth sheet after conversion. The scorer resolves the sheet by
the catalogue's name where the workbook has it, and falls back to the
index — a fix made when the hand reading found a faulty cell that was
not in the read, before any grade was written.

### Measure 1 — coverage, by the registered touch

| | Covered | Of |
| --- | --- | --- |
| Errors | **15** | 32 (47%) |
| Faulty cells | 76 | 630 (one error is 337 of them) |
| Quantitative / qualitative | 12 of 26 / 3 of 6 | |
| Mechanical / logical / omission | 7 of 13 / 3 of 8 / 2 of 5 | |
| Formula / value / label cells | 14 of 31 / 1 of 1 / 0 of 0 held | |

By subtype: range error 7 of 15, wrong calculation 4 of 10, wrong
reference 1 of 3, file reference 1 of 1, wrong values 1 of 1, wrong
formula 0 of 1, fixed value and wrong labels not held, other 1 of 2.

### Measure 2 — which rule, and the flood

| Covered by | Errors |
| --- | --- |
| `skipped-cell` | 4 |
| `inconsistent-total` | 3 |
| `inconsistent-row` | 2 (both on the same total row as a skipped-cell) |
| `hardcode-in-formula` | 6 |
| `error-value` | 1 |
| `external-link` | 1 |

Findings raised across the 26 workbooks: **370** — 135 error values,
133 numbers typed inside formulas, 46 hidden sheets, 16 typed-over,
13 skipped cells, 11 external links, 4 disagreeing totals, 3
inconsistent rows, 3 broken names, 3 wrong-switch, 2 volatile, 1 long
formula. Many of the error values are the conversion's: LibreOffice
cannot evaluate the user-defined functions these books call (`HEAT`
in the crack-spread book) and writes `#NAME?` where Excel had a
number.

### Measure 3 — every error read by hand

**The touch convention flatters a flood rule.** Reading each covered
error against the finding that touched it:

| Found — the finding names the fault | 8 | #1, #3, #4, #9 (sums that stop short: `skipped-cell`), #27, #32, #36 (a total whose range differs from its neighbours': `inconsistent-total`, `inconsistent-row`), #26 (a link into a workbook that is not there: `external-link`) |
| Touched by coincidence | 7 | #11 (fault is `D5` for `D10`; the finding is about the `1500` beside it), #12, #19, #29 (a typed number inside the wrong formula; the fault is the formula's logic), #20 (value cells inside a hardcode roster), #30 (a wrong reference two columns from a flagged literal), #22 (`#NAME?` from the conversion, not the fault) |

**Coverage by a finding that names the fault: 8 of 32 (25%).** That
is the number to carry; the 47% is what the registered convention
measures and is reported because it was registered.

The seventeen misses, by what would have been needed:

| Class | Errors | What it would take |
| --- | --- | --- |
| Invisible in one file — a lone total or a consistent formula that is wrong, known only from the e-mail or the corrected version | #2, #7, #13, #14, #15, #16, #24, #25, #28, #34 (10) | the version before (the previous-version rule) or a reviewer |
| A two-cell row: one neighbour, differing range (`AVERAGE(F46:H52)` beside `AVERAGE(E46:E52)`; `SUM(AD129:AD131)` beside `SUM(AE121:AE131)`) | #5, #8 | a row rule that speaks on two cells, at smell weight |
| Siblings with blank columns between (`SUM(AL11:AL43)` between `SUM(AJ12:AJ42)` and `SUM(AN12:AN42)`) | #6 | a row rule that steps over blanks |
| A one-cell range inside a sum (`SUM(V18:V18)`, `SUM(M21:M21)`) | #23, and the unflagged half of #36 | a smell: a range of one cell |
| A sum wrapped round arithmetic (`SUM(D8*E8)`) | #35 | a smell: SUM of a single expression |
| A formula that became a comparison (`=N38-9=SUM(T6:T36)+T38`, TRUE where a number belongs) | #10 | a rule: a top-level `=` in a numeric row |
| An off-by-one row inside a product, consistent all the way down (`=G24*H25`, `=G25*H26` …) | #33 | a rule on references that straddle two rows in a row-wise table — a candidate, not obviously safe |

Four of those seven classes are cheap, deterministic and measurable
on this corpus; they are the next rules this corpus can test.

### Measure 4 — cost

2.5 s to read and audit all 26.

### Measure 5 — the registry

The `enron-errors` external line is corrected: 36 errors in the
catalogue, 32 held, scored 4 September; coverage by touch 15 of 32,
by a finding that names the fault 8 of 32.

### Predictions, scored

- Coverage 30–50% — **holds by touch** (47%); by the stricter reading
  it is 25%, and the stricter reading is the one that means anything.
- Range errors at least half — **fails narrowly** (7 of 15).
- Wrong calculation under a quarter — fails by touch (4 of 10), holds
  by name (0 of 10): every touch on a wrong calculation was a typed
  number beside the wrong logic, not the logic.
- Wrong values and labels zero — one value error touched, by a
  hardcode roster; zero by name.
- Findings under 300 — **fails** (370), a third of them conversion
  artefacts.
- Cost under two minutes — holds.

### What the round decides

1. **A quarter of thirty-two real faults, found by name, by strangers'
   labels.** That is the first recall number on outside-labelled
   *faults* rather than smells, and it is small and real.
2. **Touch scoring overstates a flood rule by a factor of two.** Seven
   of fifteen touches were a hardcode finding landing beside the
   fault. The CUSTODES and Tasi numbers were scored by touch too and
   should be read with that in mind.
3. **The misses split cleanly.** Ten need a second version or a
   person. Seven are single-file shapes with no rule yet, four of them
   cheap: the one-cell range, the sum round arithmetic, the
   comparison in a numeric row, the two-cell row. This corpus is
   their test set, and the registered loop is how they get written.
4. **Conversion matters.** A third of the flood is `#NAME?` from
   functions LibreOffice does not have; the same file in Excel would
   not raise them. Scoring `.xls` corpora needs the arbiter or the
   error-value rule told about the conversion.
