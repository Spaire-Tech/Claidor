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
