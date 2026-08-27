# The Tasi re-score — registration, before any score is computed

27 August 2026, ordered by the lead (`china-os-findings.md` §1).
The engine meets a **second, independent expert labelling of the
same 70 files** our CUSTODES benchmark uses — Tasi's error dataset
(ISSTA 2021, `github.com/tcse-iscas/Tasi`). This section is written
and committed **before** any score is computed; results are
appended below it, never edited into it.

**Licence and use, first:** the Tasi repository carries no licence
file. This round benchmarks internally and cites the paper (Zhang,
Lv, Dong, Dou, Han, Zhang, Wei, Ye — *Semantic Table Structure
Identification in Spreadsheets*, ISSTA '21). Nothing from that
repository is committed or redistributed: the clone lives in the
container's scratchpad, and the scorer re-fetches it.

## What was read before this was written (shapes and counts only)

Exactly the discipline the CUSTODES registration used — the shape
needed to design the scoring, no finding content, no score:

- `Groundtruth and tool results.xls`: one sheet, **292 rows** (a
  header + **291 worksheet rows**), **15 columns** — `Index`,
  `category`, `Spreadsheet`, `Worksheet`, `Groundtruth`,
  `Serious error`, `Formula error`, `Missing formula error`, then
  seven tool columns: `TasiError`, `Custodes`, `Cacheck`,
  `ExceLint`, `Excel`, `AmCheck`, `Ucheck&Dimension`.
- Every cell list is comma-separated **plain A1 references** —
  7,404 tokens across the three truth columns, zero non-A1-shaped.
  `Groundtruth` is the union of `Formula error` and
  `Missing formula error`, so the truth is **3,702 cells**. The
  repository README says « 3,072 », a digit transposition the
  founder's researcher already caught; **3,702** is what the file
  holds, and the discrepancy is reported, not quietly corrected.
- **The subjects are the same 70 files** as our CUSTODES benchmark:
  70 of 70 match on stem, 69 on exact name — the one difference is
  case only (`summ0602.xls` here, `summ0602.XLS` there).
- Our CUSTODES truth extraction stands at **1,973 cells** (paper:
  1,974) over the same files.

## The engine under test (frozen now)

The engine is **frozen at commit `eaa0153`** — the candidate-4
adoption, the current tip of `swens/sentinel` — and is not modified
between this registration and the results. Any change this round
suggests is its own registered round, measured on our own corpora
and gated, exactly as the four A3 candidates were.

Two engine sweeps are scored, and the reason is stated up front:

1. **The frozen cold run** (`custodes/sweep-cold-run.json`, 23 Aug,
   1,187 findings) — continuity with every number already in
   `custodes-benchmark.md`.
2. **A fresh sweep with today's engine** — because four rounds have
   been adopted since (`inconsistent-total`, `typed-over-edge`, the
   sibling-total and column-orientation work), and a comparison of
   two *label sets* is confounded if the *engine* also moves
   between them. Both label sets are scored against this same fresh
   sweep, which is the only way the 1,973-vs-3,702 comparison is
   about the labels.

## Mapping rules (fixed now)

1. A truth row keys directly: `(workbook, worksheet, cell)` —
   columns `Spreadsheet` and `Worksheet` give both, so **no
   prefix-matching is needed** (the CUSTODES rule existed only
   because its filenames glued workbook and sheet together).
2. Workbook names match **case-insensitively** (`summ0602`), against
   the same LibreOffice-converted `.xlsx` copies the CUSTODES
   scorer builds — one conversion, both label sets, so conversion
   artefacts cannot favour either.
3. Worksheet names match exactly, then case-insensitively, then
   stripped of surrounding whitespace. **Any row that fails to map
   is counted and reported by name** — never silently dropped, and
   its cells are excluded from every denominator with the exclusion
   stated.
4. A finding's **cell set** is defined exactly as in
   `custodes-benchmark.md` §Mapping 3 — anchor `ref`, roster cells,
   and the full rectangle of a « filled across N cells (A to B) »
   detail. One definition, both benchmarks.

## Metrics (fixed now)

Per the CUSTODES registration, extended where Tasi's columns allow
something new:

- **Coverage** — the share of the 3,702 truth cells falling inside
  any finding's cell set: overall, by covering rule, and **split by
  Tasi's own two classes** (formula error vs missing formula). That
  split is the thing CUSTODES's truth cannot give us.
- **Serious-error coverage** — the `Serious error` column scored
  separately. It is their own severity signal and the nearest thing
  in the field to our tier-1 notion; a detector that is quiet
  overall but finds the serious ones is a different animal from one
  that is quiet everywhere.
- **Agreement** — the share of our in-scope findings whose cell set
  touches at least one truth cell. **This is not precision**, for
  the same reason as before: their labels answer their taxonomy's
  question, and a finding outside them is not thereby false.
- **Out of scope, excluded from agreement and reported separately:**
  `hidden-sheet`, `broken-name`, `external-link` — file-level
  findings a cell-level truth cannot encode.

## The seven tools (fixed now)

Each tool column is scored **on this same truth with this same
scorer**: the first same-convention table the record has held.

The asymmetry is registered rather than smoothed over: a tool
column is a **cell set**, so for tools the two numbers are honest
**recall** and **precision**. Our findings are not cell sets but
claims with cell sets attached, at a different granularity — so
ours stay **coverage** and **agreement**, and the table prints them
in their own columns under their own names. Any sentence comparing
our agreement to a tool's precision is a category error, and this
registration forbids writing one.

## The label-disagreement result (fixed now)

Computed on the shared `(workbook, sheet, cell)` key, restricted to
the sheets both label sets cover: the size of each truth set, their
intersection, each-only counts, and the Jaccard index.

**Framed honestly, and the framing is fixed here before the number
exists:** these are not two labellings of one question. CUSTODES
labels *smells* by its taxonomy; Tasi labels *errors* of two named
kinds. Overlapping questions, identical files, expert labellers
both. So the number bounds how much « ground truth » in this field
depends on who defines the question — it is **not** a measurement
error bar, and no sentence in the results may call it one. « The
field's noise floor » is a claim this round may not make; « two
expert labellings of the same 70 files agree on X% of their union »
is what the data supports.

## What is deliberately not claimed

No precision claim for our engine. No re-run of any tool — the
columns are the authors' own published results, and where their
scoring conventions differ from ours, the tools' numbers here may
differ from their papers'; that is a property of one convention
applied to all, and it is the point.

## Prediction (written before running)

Coverage against Tasi lands in the same band as against CUSTODES
(low tens of per cent at best), and **lower on missing-formula than
on formula-error cells** — the engine demands strong witnesses, and
missing-formula is precisely the loose-witness class the CUSTODES
round priced at ~85% of their labelled recall. Serious-error
coverage is **higher** than overall coverage, because their serious
class should concentrate on the cells any detector would find.
Today's engine covers slightly more than the frozen cold run — four
adopted rounds, all additive on this dialect — but the difference
is small, because none of those rounds was aimed at this corpus.
The two label sets agree on a **minority** of their union.

The scorer is `server/scripts/custodes_tasi.py`, committed with
this registration; results are appended below it, never edited into
it.

---

## Amendment (27 Aug, before any score was computed)

**The conversion the registration assumed is impossible in this
container.** LibreOffice 24.2.7.2 is installed and launches, but
fails on **all 70** subjects with « Error: source file could not be
loaded » — verified on an isolated user profile, with a writable
HOME, and on a normal-permission copy of a file outside the work
tree, so it is neither a profile nor a permissions problem. The
files themselves are sound: `file` reports genuine Composite
Document V2, and both xlrd and our own reader open them.

So mapping rule 2 is amended, in the open and before any number:

1. **The subjects are read directly as `.xls`**, through the
   engine's own xlrd path — which the reader has always had. No
   conversion, therefore no conversion artefacts at all.
2. **The CUSTODES truth is extracted directly** from the 291
   ground-truth `.xls` files via xlrd's note map — the same
   registered rule (comment-bearing cells), a different reader. All
   291 files read.

**Two consequences, both stated rather than absorbed:**

- The direct read finds **1,974** comment-bearing cells — *exactly
  the paper's figure*, and one more than the converted route's
  1,973. The CUSTODES registration recorded « one cell lost
  somewhere in conversion or distribution; accepted and noted, not
  hunted ». It was lost **in the LibreOffice conversion**, and the
  direct read recovers it. This round's CUSTODES denominator is
  therefore 1,974, and any comparison with the 23 August numbers
  must carry that one-cell difference.
- The frozen cold run was produced on LibreOffice-converted copies;
  the fresh sweep reads the originals. A fresh-vs-frozen difference
  now confounds engine change with conversion change, so **this
  round will not attribute any such difference to engine drift** —
  which costs the registration one of its stated purposes, and
  saying so is cheaper than a conclusion that would not hold.

## Results (computed and read after the registration)
