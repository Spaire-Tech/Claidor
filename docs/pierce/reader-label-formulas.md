# Formulas in the label column — registration, before any code

3 September 2026. The two formula-intact project-finance models
(`FORMULA_INTACT_MODELS.md`) put a number on a reader question the
patterns round had only named. The FHWA P3-VALUE tool holds 782,093
formula cells by a raw count of its sheet XML; the reader reports
768,774. The 13,319 missing are, every one, in column E — the column
the reader takes as the sheet's label column — and they are label
formulas: `= "PSC - " & 'Risk Matrix'!E$14 & " - " & C$273`,
`= 'Time&Esc'!E$311`. The same shape on a PR24 model: 13,686 of
408,024 formulas, all in column E. Roughly one formula in thirty, in
both worlds.

## What the reader does today

`_read_sheet` keeps a cell only if it is not in the label column and
is a number or a formula. A label formula's **value** is read as the
row's words (rightly: « P3 - Implementation period flag » is the
label, however it was produced), and the **formula** is dropped. Three
things then never see it:

1. **The recalculation prescan** (`recalc/denylist.py`) scans
   `book.cells`. A `SINGLE`, an `INDIRECT`, a link into another
   workbook or a function no engine we run knows, sitting in a label
   formula, cannot refuse or route the file. This is the question
   named in `modern-excel.md` and `label-patterns.md`.
2. **The two rules that judge formula text rather than a number**:
   `external-link` (a workbook read from a label is still a workbook
   that is not here) and `volatile`.
3. **The formula count** the mark and the coverage tallies carry.

Header-row formulas that do not reach another row (a year walker
`=C7+1`) are dropped the same way and are in scope for the same
three consumers.

## The change, fixed now

The reader keeps every dropped formula cell in a second map,
`Workbook.label_cells` (ref → cell, with its row's words as the
cell's name), and offers `Workbook.formulas()` — every formula in
the file, from both maps.
The prescan reads that; the `external-link` and `volatile` rules read
it too; the formula counts (ingest, coverage) add the second map.
`book.cells` does not change: the numeric rules, the folds, the
analytics and the golden master's cell-level surface are untouched
by construction, and a label formula never becomes a « typed-over »
or an « inconsistent-row » candidate — a label typed beside labels
built by formula is a fact about the words, not about the numbers.

## Measures, fixed now

1. **The gap**: reader formulas against the raw XML count, on the
   FHWA tool, the Packt model and the Affinity PR24 draft, before and
   after.
2. **The golden master**: the corpus sweep diffed against the
   committed baseline; every file whose findings change, named, with
   the rule that changed.
3. **The prescan on the corpus**: files whose recalculation route
   changes because a label formula now reaches the denylist.
4. **Cost**: read time on the FHWA tool before and after.

## Predictions, registered

- The gap closes to zero on all three files.
- Golden master: at most three corpus files change, all by gaining
  an `external-link` or `volatile` finding; no file loses a finding.
- Prescan: at most two corpus files change route.
- Cost: under two per cent on the FHWA read.

---

# Results

*(appended after the round; nothing above this line changes)*

## Result — 3 September 2026

### Measure 1 — the gap

| File | Raw `<f>` cells | Reader before | Reader after |
| --- | --- | --- | --- |
| FHWA P3-VALUE 2.3 | 782,093 | 768,774 | **782,093** |
| Affinity PR24 draft | 408,024 | 394,338 | **408,024** |
| Packt companion model | 2,973 | 2,973 | 2,973 |

Exact on all three. The first « after » run came back at 782,154 —
sixty-one *more* than the file holds — and the sixty-one were read
out: the FHWA « Key » sheet lists where each named range points, as
typed text (`='Project Inputs'!$F$71`, a shared string, no `<f>`
element), and the reader took any string beginning with `=` for a
formula. **A second reader defect, found by the measurement and
fixed in the same round**: the fast reader and the openpyxl fallback
now keep such text behind a quote, as Excel's own formula bar does,
so nothing downstream reads it as arithmetic. Named here as a
deviation: the registration foresaw one fix, not two.

### Measure 2 — the golden master

The gate corpus (27 files) swept and diffed against the committed
baseline. **Two files change, both by losing one finding**: the CAA
H7 price-control model, final proposals and final determination,
each reported `hardcode-in-formula` at `I_Series!H352`, « 5% sits
inside the formula ». That cell is a typed string
(`=5%*C_Fin_Summ!AL$191`, shared string 1209, no formula element) —
a note in the units column saying where the row's figure comes from.
The finding was a false positive of the second defect, and the
baseline is regenerated without it. No file gains a finding: no
label formula in the corpus carries an external link or a volatile
function. The prediction (at most three files change, by gaining a
finding) was right on the count and wrong on the direction.

### Measure 3 — the prescan on the corpus

Every corpus file read twice through the prescan, `book.cells`
against `book.formulas()`: **0 of 27 routes change**; 86,138 label
formulas across the corpus, none carrying a denylisted or unknown
function. The prediction (at most two) holds; the gap was real and,
in what we hold, harmless — which is a fact about the corpus, not
about the gap.

### Measure 4 — cost

FHWA read on a quiet machine: 56.4 s before, 53.8 s after. No cost
the measurement can see; the prediction holds.

### What the round decides

1. **Every formula in a file now reaches the prescan and the text
   rules.** A refusal-class function or a link into another workbook
   hidden in a label formula refuses or flags the file, which it
   could not before; the test file holds both cases.
2. **A string is not a formula.** Sixty-one cells on one file and
   one false finding on two corpus files came from `=` at the start
   of typed text. The rule is now in both readers.
3. **The numeric grid is untouched by construction**, and the golden
   master confirms it: the only change across 27 files is the false
   positive removed.
