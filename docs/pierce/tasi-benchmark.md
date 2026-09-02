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

**The instrument validates itself.** Scoring Tasi's own tool column
with this scorer on this truth reproduces their published figures
**exactly**: `TasiError` recall **82.9%**, precision **75.2%** —
the two numbers the paper reports, independently recomputed here
from the label file by a scorer that knows nothing of them. And
the frozen cold run against the CUSTODES truth returns **283**
covered cells, the same numerator as 23 August. Both label sets
mapped cleanly: **0 unmapped rows** of 291, all 70 subjects read.
(One junk file in the ground-truth archive, `._01-38-PK…` — a macOS
resource fork, not a spreadsheet — fails to open and holds no
comments; reported, not hunted.)

### Our engine against both label sets

| engine | vs Tasi (3,702) | vs CUSTODES (1,974) |
|---|---|---|
| today (frozen at `eaa0153`) | 489 = **13.2%** | 438 = **22.2%** |
| frozen cold run (23 Aug) | 333 = 9.0% | 283 = 14.3% |

Agreement, today's engine: **26.7%** against Tasi (346/1,295),
**25.7%** against CUSTODES. Per rule against Tasi, the shape is the
one the CUSTODES round found and this one confirms on independent
labels: `typed-over-formula` 57.2%, `skipped-cell` 68.4%,
`inconsistent-total` 57.1% (the new rule's first outside score),
`inconsistent-row` 41.2%, `hardcode-in-formula` 3.5% — the same
taxonomy mismatch, priced the same way by a different labeller.

### Tasi's two classes — the split CUSTODES could not give us

- **Formula error** (678 cells): coverage **17.6%**, and it is
  `skipped-cell` that carries it (80 of 119) — our incomplete-total
  check meets their formula-error class almost exactly.
- **Missing formula** (3,024 cells): coverage **12.2%**, carried
  entirely by `typed-over-formula` (354 of 370).

The classes barely share a covering rule: `typed-over-formula`
covers **0** formula-error cells, `skipped-cell` covers **1**
missing-formula cell. Two labels, two of our rules, cleanly
partitioned — which is a stronger statement about the engine's
taxonomy than either benchmark's headline number.

### The seven tools, one truth, one scorer

| tool | detected | hits | recall | precision |
|---|---|---|---|---|
| TasiError | 4,081 | 3,068 | 82.9% | 75.2% |
| Custodes | 2,443 | 1,582 | 42.7% | 64.8% |
| Cacheck | 1,814 | 1,388 | 37.5% | 76.5% |
| AmCheck | 2,163 | 1,259 | 34.0% | 58.2% |
| Excel | 4,980 | 481 | 13.0% | 9.7% |
| ExceLint | 249 | 81 | 2.2% | 32.5% |
| Ucheck&Dimension | 1,878 | 40 | 1.1% | 2.1% |

**ExceLint scores 2.2% recall here**, which is the answer task #55's
blocked run was for — and the reason is a convention difference the
registration anticipated: ExceLint reports *regions*, and its
column holds 249 cells against a truth of 3,702. The number is
what one convention applied to all produces; it is not a verdict on
their tool, and this round does not offer one.

Our engine's 13.2% coverage sits above ExceLint's and
Ucheck&Dimension's recall and below everything else. **That
comparison is weaker than it looks and the weakness runs against
us**: our coverage counts a truth cell as covered if it falls in
any finding's cell set, and a folded finding's roster can blanket
cells the finding is not really about — so our coverage is an
*upper bound* on a like-for-like recall, while the tools' numbers
are exact. Per the registration, no sentence here compares our
agreement to any tool's precision.

### The label disagreement — a nesting, not a conflict

On the 136 `(workbook, sheet)` pairs both label sets cover:

- CUSTODES: **1,963** cells · Tasi: **3,138** cells
- In both: **1,952** · CUSTODES only: **11** · Tasi only: **1,186**
- **Jaccard: 62.0%** of their union.

The headline is not the Jaccard. It is that **99.4% of CUSTODES's
labelled cells (1,952 of 1,963) are also labelled by Tasi**, while
Tasi marks 1,186 cells CUSTODES does not. Two independent expert
labellings of identical files **nest** rather than conflict: they
agree almost perfectly on what CUSTODES calls a smell, and differ
almost entirely on how much further the label extends. Exactly 11
cells — 0.6% — are genuine one-way calls by CUSTODES.

Per the registration's own prohibition, this is **not** a noise
floor and is not offered as one. What it supports is narrower and
more useful: on this corpus, « ground truth » is nearly
scope-determined — who defines the question fixes the answer's
size, not its centre.

### The prediction, scored honestly: two right, three wrong

- ✅ Coverage lands in the same low-tens band on both label sets.
- ✅ **Missing-formula coverage (12.2%) is lower than formula-error
  (17.6%)** — the loose-witness class is where quiet-by-design
  costs us, as predicted.
- ❌ **Serious-error coverage is *lower*, not higher: 7.8% against
  13.2% overall.** The prediction assumed their serious class would
  concentrate on cells any detector finds; it does the opposite.
  Their 1,308 serious cells are ones our engine is *less* likely to
  reach — the single most interesting miss of this round, and the
  clearest pointer for a future mining round: read the serious
  cells we do not cover.
- ❌ **The fresh-vs-frozen difference is large, not small** (13.2%
  vs 9.0%; 22.2% vs 14.3%) — and per the amendment it may **not**
  be attributed to the four adopted rounds, because the sweeps also
  differ in reading route. What can be said: `inconsistent-total`,
  a rule that did not exist in August, covers 4 Tasi cells at 57.1%
  agreement, and `typed-over-formula` coverage rose 202 → 354. How
  much of that is the column-orientation round and how much is
  reading originals instead of converted copies **this container
  cannot separate**, and the honest answer is that it is unmeasured.
- ❌ **The label sets agree on a majority of their union (62.0%),
  not a minority** — and the nesting above is why.

### What this round does not claim

No precision for our engine. No verdict on any tool. No noise
floor. No engine-drift conclusion from fresh-vs-frozen. The engine
was not modified between the registration and these numbers, and
nothing here changes what it reports.

### What it hands the next round (named, not done)

1. **The serious-error gap** — 1,206 of their 1,308 serious cells
   are outside every finding we raise. That is a mining question
   with a ready-made sample, and it is the first thing this record
   would fund.
2. **A conversion-free re-score of the frozen era** would separate
   engine change from reading route — it needs a machine whose
   LibreOffice can load these files, not this one.
3. The `skipped-cell`/formula-error alignment (80 of 119) is the
   strongest cross-corpus signal any of our rules has produced; a
   witness-widening round for that class would now have two
   independent label sets to be measured against.

---

## Amendment (27 Aug, after the serious-error mining round)

The mining round that followed this one found a defect in the
engine's legacy `.xls` reader: it **misses some formulas** —
19 of 144 `FORMULA` records in `01-38-PK_tables-figures.xls`,
10 of 40 in `act3_lab23_posey.xls`, 0 of 349 in `01sumdat.xls` —
so on some subjects a computed cell is read as a typed value.
Proof at the cells: `Table II.5!B17` holds exactly the mean of
`B6:B16` and the reader returns `formula=None` for it.

Every number in this round taken through the direct `.xls` route —
which is today's-engine coverage and agreement against both label
sets — therefore **understates the engine** by an unmeasured
amount. The frozen cold run, produced on converted copies, does not
share the defect.

This does not overturn any conclusion here; it sharpens two:

- The refusal to read fresh-vs-frozen as engine drift was correct,
  and now has a named mechanism rather than a general caveat.
- The label-set comparison stands, because it compares *labels* to
  each other, not to our findings — the disagreement result never
  passed through the engine.

The fix is routed to the lead: `legacy.py` is outside Sentinel's
paths, and correcting it changes findings on every `.xls` file.

### Re-run, 2 September 2026 — today's engine at commit `4f028d6`

Same instrument, same truth, same seven-tool table (identical to
the digit). The engine has moved since `eaa0153` (the fill fold keys
skipped totals on their label row, long formulas fold to one line,
the consequence sentence is mandatory):

| engine | vs Tasi (3,702) | vs CUSTODES (1,974) | agreement vs Tasi |
|---|---|---|---|
| today (`4f028d6`) | 473 = **12.8%** | 437 = **22.1%** | 26.5% (344/1,297) |
| 27 Aug (`eaa0153`) | 489 = 13.2% | 438 = 22.2% | 26.7% |

Sixteen fewer Tasi cells covered, one fewer CUSTODES cell; the
per-rule shape is unchanged (`typed-over-formula` 354 both times,
`skipped-cell` 78 against 80, `hardcode-in-formula` 27). The drop is
within what the fold changes would do to a roster-based coverage
count and is not attributed further here. Unmapped rows: 0 of 291.
The Tasi clone is pinned at commit `81b4366` (31 May 2021), read
from the scratchpad, not committed — the licence note above stands.
