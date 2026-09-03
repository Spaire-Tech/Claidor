# Volume times price — registration, before any code

2 September 2026. The third of the four meaning-layer rounds, chosen
by the founder after the British source closed. The accountants'
dictionary knows adding and subtracting; it will never say that a
row called « Revenue » is volume times tariff, or that « Interest » is
the opening balance times a rate. The models we hold say it, sixteen
and twenty-two and twenty-seven times over. This round **counts what
formula sits under each row label across our own corpora**, keeps
the patterns that hold across independent models, and judges a
sample. Nothing is built on it yet.

## The corpora

| Folder | Files | What |
| --- | --- | --- |
| `corpus_pr24dd` | 16 | Ofwat PR24 draft-determination financial models — one template, sixteen companies |
| `corpus_regulator` | 28 | Ofwat PR24 feeder models, Ofgem PCFMs |
| `corpus_au_uk` | 27 | the gate corpus: CAA H7, Ofgem ED2 and RIIO-3 |
| `corpus_sft` | 22 | Scottish close models (values-pasted files carry few formulas) |
| `corpus_models` | 3 | Ofgem PCFMs |
| the founder's model | 1 | held out of the mining; used for the preview |

Files in `corpus_regulator` that are also in `corpus_au_uk` count once,
by content hash. A **folder** is the unit of independence: sixteen
PR24 models are one template, and a pattern they alone agree on is
one author's habit, not a convention.

## The semantic shape, fixed now

For every formula cell whose row carries a label:

1. Tokenise with the reader's tokeniser (Excel's grammar, cached).
2. Replace every reference operand by **the normalised label of the
   row it reads** (`meaning.normalise`, the same one the dictionary
   uses), whatever sheet that row is on:
   - a reference to the formula's own row (its prior period, or the
     same line on another sheet) becomes `self`;
   - a range becomes `range:` plus the label of its first row;
   - a referenced row with no label becomes `?`.
3. Numbers become `#`, text becomes `"…"`; operators and function
   names stay.
4. The **pattern** is the bag: the sorted function names, the sorted
   operators, the sorted operand labels. Order and grouping are
   dropped on purpose: `volume × tariff` and `tariff × volume` are one
   pattern, and this round asks *what a row is made of*, not how it
   is written.
5. One pattern per **formula row** (file, sheet, row): the commonest
   cell pattern along the row, so a fill counts once.

Rows whose normalised label is a schedule word (`GENERIC` in the
vocabulary) are skipped. Rows whose pattern is a single operand with
no operator or function (a plain link) are recorded but never
« confident »: a link says where a row comes from, not what it is.

## Confidence, fixed now

A label's patterns are counted by **file** (a file votes once per
pattern it uses). A pattern is **confident** when the label is used
with a formula in at least three files spanning at least two folders,
and that pattern holds a strict majority of those files.

## Measures, fixed now

1. **The mine**: files read, formula rows with a label, distinct
   normalised labels, labels with a formula in three or more files
   from two or more folders, and of those the confident ones (count
   and share).
2. **The table**: the thirty confident patterns with the most files,
   as `label = pattern (files/total, folders)`, for the reader.
3. **Precision**: forty confident patterns sampled with seed 20260902
   and kept by label, judged by the lead from the label and the
   pattern: A (this is what the line is), B (right family, incomplete
   or over-specific), C (wrong or meaningless).
4. **Preview of the future check, on the founder's model** (held out
   of the mining): of its labelled formula rows, how many carry a
   label with a confident pattern, and of those how many agree with
   it. No finding is raised.
5. **Cost**: mining time per file beyond the read.

## Predictions, registered

- Distinct labels: over 15,000; labels with a formula in three or
  more files from two or more folders: under 1,500 — the sixteen
  PR24 copies inflate the file count and the two-folder rule bites.
- Confident share of those: under 25%.
- Sample precision A+B: at or above 70%. The C will be labels that
  mean different things on different sheets (« Total », « Other »
  filtered; « Interest », « Movement » not).
- The founder's model: under 10% of its labelled formula rows carry a
  confident label; agreement among those at or above 70%.
- Mining time under one second per file beyond the read.

## Out of scope, named

- No finding. « Row X is computed differently from every other model
  we hold » is the check this makes possible; it is registered on
  this count, not built here.
- No fuzzy label matching: a label joins a pattern by its normalised
  text only.
- The patterns are not committed as product data in this round; the
  table and the sample are the deliverable, and the data file is a
  decision for the check's own round.

---

# Results

*(appended after the round; nothing above this line changes)*

## Result — 3 September 2026

### Measure 1 — the mine

| | |
| --- | --- |
| Files read | 87 distinct (4 duplicates by content hash skipped: the RIIO-3 finals held twice) |
| Labelled formula rows | 3,719,799 |
| Distinct normalised labels | 43,344 |
| Labels with a formula in ≥ 3 files from ≥ 2 folders | 5,003 |
| Confident (majority pattern, not a link) | **2,175 (43.5%)** |

**The folder rule was defeated, and this is said before the number
is used.** `corpus_regulator` holds the *final-determination* copies
of the same Ofwat PR24 financial model that `corpus_pr24dd` holds as
drafts — thirty-two files of one template across two folders. Two
folders was meant to mean two authors; here it meant one author
twice. Re-counted post hoc with those thirty-two files as one family
(`pr24-fm`), named as a deviation:

| Family rule | Count |
| --- | --- |
| Labels in ≥ 3 files from ≥ 2 families | 1,837 |
| Confident | **930 (50.6%)** |
| Confident across **three or more** families — the ones that read as a convention rather than a habit | **129** |

The close models (`corpus_sft`, 18 files) contributed almost
nothing: they are values-pasted, and a file with no formulas has no
patterns. That is the round's most important limit, below.

### Measure 2 — the table

Patterns that hold across three or more families (the convention
tier), with files:

- `corporation tax charge after losses = corporation tax rate × profits attributable to corporation tax after losses` (21 files)
- `discounted closing rav = closing rav × single year discount factor` (21)
- `in year taxable loss = MIN(#, profits attributable to corporation tax)` (21)
- `tax allowance before tax trigger adjustment = corporation tax charge after losses × grossing up factor` (21)
- `grossing up factor for tax on tax charge = # / (# − corporation tax rate)` (21)
- `less capital allowances = − capital allowances` (21)
- `tax = SUM(tax paid)` (32 of 41)
- `dividend = − # × dividend wholesale nominal` (32 of 38)
- `opening net debt = opening fixed-rate debt + … − …` (32 of 52)

And, in the same tier, three kinds of noise the reader hands the
miner: year rows read as row labels (`fy2015 … fy2021`, seven
« labels » whose pattern is the sheet's projection formula), a
workbook's `filename = CELL(…)` plumbing, and `balance carried
forward = SUM(range: taxable losses brought forward)` — a real
convention wearing a schedule word the stoplist does not hold.

Under the registered rule the top of the table is the PR24
template's own grammar, thirty-two times: `active X = CHOOSE(company
X, ofwat X, override X, …)` for every input line, `company base
revenue = SUM(company base revenue)`. True of that model; a habit,
not a convention.

### Measure 3 — precision, forty confident patterns (seed 20260902, kept by label)

**30 A, 9 B, 1 C — 97.5% A+B.** The A: `measured water customer
service revenue = households connected × allowance per household`
(volume times price, exactly), `cpih interest on index-linked loans =
rate × balance`, `corporation tax charge after losses = rate ×
profits`, `equity issuance cost = percentage × new equity`, `allowed
revenue = payg + pension deficit recovery`, sums over named ranges,
CHOOSE selectors between company and Ofwat inputs. The B are lookups
(`INDEX MATCH` over a table with the specifics lost in the bag), a
guard (`IF ISBLANK`), and two patterns with an unlabelled operand
(`?`). The one C is `fy2068`, a year read as a row label. Sixteen of
the forty stay confident under the family rule; the other
twenty-four are the PR24 template alone.

### Measure 4 — the founder's model, held out

217 labelled formula rows; **1 carries a confident label** (0.5%):
« net increase / decrease in cash », which the model builds as cash
from operations + investing + financing and the corpus builds from
rows called « net cash generated / used in … ». The pattern is the
same idea with different operand labels, and the bag calls that a
disagreement. Agreement cannot be measured on one row.

### Measure 5 — cost

The founder's model mines in 0.19 s. The regulators' giants take 26
to 88 s beyond the read (108,000 labelled formula rows a file, each
reference resolved to a label through the tokeniser). The prediction
of « under one second » was made for a product-sized file and is
wrong for a corpus sweep.

### Predictions, scored

- Distinct labels over 15,000 — holds (43,344). Labels eligible under
  1,500 — **wrong** under the registered rule (5,003) because the
  rule was defeated; 1,837 under the family rule, still over.
- Confident share under 25% — **wrong** (43.5%; 50.6% by family).
  Labels that survive to three files agree more than predicted: a
  label repeated across models is usually a template's line, and a
  template computes it one way.
- Sample precision at or above 70% — holds (97.5%).
- Founder's model under 10% with a confident label — holds (0.5%);
  agreement at or above 70% — not measurable.
- Mining under one second per file — wrong for large files.

### What the round decides

1. **Patterns are real and, where they exist, precise.** A row that
   reaches three independent families is computed one way, and the
   way reads as its definition: revenue is volume times price,
   interest is rate times balance, tax is rate times profit. About
   130 such lines exist in what we hold, nearly all Ofwat and Ofgem
   tax, RAV and revenue-building lines.
2. **The founder's world is not in the mine.** The close models are
   values-pasted, so the corpora hold regulators' conventions and
   almost no project-finance ones; the founder's model shares one
   label with them. A check built on this today would say nothing
   about a project-finance model. The material that would change
   that is a corpus of project-finance models *with formulas* — the
   truth-set pipeline's material, which is the fourth round.
3. **Two reader gaps surfaced by the mine, named**: a year row taken
   as a row label, and « carried forward » lines the stoplist does
   not hold. Both are cheap and are the first fixes of the check's
   own round.
4. **No finding, as registered.** « This row is computed differently
   from every model we hold » is buildable for the 129 convention
   lines now; whether that is worth building before a project-finance
   corpus exists is the founder's call, and this count is what it is
   made with.
