# The accuracy backlog

Parked on 10 August 2026, deliberately and with the numbers written down,
to come back to fresher. Nothing here is a mystery — every item has a
measured cause and a named next step.

## Where the numbers stand

| | Measured | How |
|---|---|---|
| Model audit — recall | **56%** | 150 defects planted in real EUSES spreadsheets that were silent before |
| Model audit — collateral false positives | **0** | Same run, twice |
| Model audit — noise on untouched files | 0.62% of formulas; 93% of 1,577 spreadsheets report nothing | Full EUSES financial + modeling categories |
| Model audit — precision on untouched files | **NOT MEASURED** | Needs adjudication or a labelled corpus |
| Deck tie-out — precision | 0 false positives on two decks | The Cascade pair only |
| Deck tie-out — recall, overall | **83%** | 99 figures broken one at a time on the clean Cascade deck |
| Deck tie-out — recall, on figures it linked | **100%** | Same run: 82 of 82 |
| Deck tie-out — coverage | **80%** | 102 of 128 printed figures linked to the model |
| Deck tie-out — collateral false positives | **0** | Same run |
| Legacy `.xls` reading | 99.2% of 1,590 files | 202,499 formulas decompiled |
| Solo check — false positives | **1** on 29 real decks | gov.uk corpus, every finding read by hand |
| Solo check — the Cascade drift | Caught, both decks, nothing else | Slide 3's chart against its table |
| Solo check — recall | **NOT MEASURED** | Needs planted drifts, same method as the deck recall |

By rule, on planted defects:

| Rule | Recall |
|---|---|
| `skipped-cell` | 94% |
| `typed-over-formula` | 64% |
| `inconsistent-row` | **10%** |

## What the deck tie-out's number actually says

Measured 10 August by `scripts/deck_recall.py`. One figure at a time on
the clean Cascade deck, the printed text rewritten and re-parsed by the
reader's own parser, then put through `check.tie_out_both` — the
production path, not a replica of it.

| | found | missed | recall |
|---|---|---|---|
| one tick — last digit off by one | 33 | 8 | 80% |
| stale — a 4–15% move | 31 | 6 | 84% |
| transposed — two digits swapped | 18 | 3 | 86% |
| **on figures it had linked** | **82** | **0** | **100%** |
| **over every figure broken** | **82** | **17** | **83%** |

**Every single miss is a figure the checker never linked.** Not one is a
figure it linked and then failed to catch drifting. That is the whole
finding, and it says the work is not in the comparison — the comparison is
exact and cannot be wrong — but in **coverage**.

Coverage on this deck is **80%**: 102 of 128 printed figures reach a cell.
The 26 that do not:

| | |
|---|---|
| 23 | no output fits the label |
| 8 | two outputs fit equally well |
| 2 | one end of a printed range |

(That is 33 against 26 because the merge returns the workbook pass's
unlinked list whole — see the defect below.)

**Read this number carefully.** 83% is recall over the 99 mutations
attempted, and those are not a uniform sample: 21 sites had no usable
mutation — mostly `transposed` on figures like `9.9` where no two adjacent
digits differ. And it is one deck. Nine slides of a fixture whose author
also wrote the checker is far weaker evidence than the model audit's 150
defects in spreadsheets somebody else built. **The next real step is
decks nobody here made.**

### Three defects the measurement exposed

**1. ~~`TieOut.unlinked` over-reports.~~** Fixed 10 August. The merge
returned the workbook pass's unlinked list whole, so a figure the Outputs
pass had checked appeared in both: 94 + 8 + 33 = 135 against 128 printed.
`tie_out_both` now drops what the Outputs pass settled, keyed on the
anchor. 94 + 8 + 26 = 128.

**2. A deck figure's `location` is not a location.** It is « slide 2 » —
the slide, not the spot — so two figures printing the same text on one
slide are indistinguishable by it. Cascade has exactly one such pair
(`$48.9mm` on slide 2, once in a tile and once in a sentence) and it was
enough to make the first run of this harness report a detection failure on
the deck's headline figure that the checker had in fact caught. The anchor
is the real coordinate.

**3. Two bugs in the harness itself, both found by reading its output.**
A percentage is held as a fraction and printed as a percentage, so the
first version mutated `11.8%` into `0.1%` — a figure that links to nothing
and was counted as a miss the checker never had a chance at. And the
collision above. Both are recorded because a measurement is only worth
what its harness is worth, and the first two runs of this one were wrong.

## Why `inconsistent-row` misses what it misses

Instrumented over 70 planted defects, after the two fixes already made:

| Gate that stops it | Share |
|---|---|
| **No majority shape in the run** | **30%** |
| **Columns do not look like periods** | **30%** |
| Found | 14% |
| More than one deviant in the run | 10% |
| Run shorter than three cells | 10% |
| More typed cells than calculated | 3% |

Sixty per cent sits behind two gates. Neither wants a looser threshold;
both want a better idea.

## The two ideas

### 1. Shared formulas are ground truth, and they are already parsed

When a formula is filled across a range, Excel stores it **once** in a
`SHRFMLA` record and every cell in the range holds a stub pointing at it.
That is the file format itself asserting « these cells are one
calculation » — no heuristic, no threshold, no guess. A cell inside such a
range carrying its own independent formula is by construction an exception
to a pattern Excel has already declared.

`polar/tieout/legacy.py` reads these records and expands them, then throws
the range away. Keeping it gives a series definition with no false-positive
risk at all.

**Open question:** `.xlsx` has the same mechanism (`<f t="shared"
ref="B2:B10" si="0"/>`) and openpyxl may normalise it away before this
code sees it. Check before building.

**Targets:** the 30% blocked by « no majority shape ».

### 2. Ask whether headers resemble each other, not whether they match a list

`_over_time` tests column headers against a whitelist of period formats.
Real headers are `Jan-03`, `2003-04`, `Q1 FY05`, `Week 1`, and the
whitelist fails all of them.

The distinction that actually matters is **homogeneity**. A series has
headers of one shape — all dates, all `FY####`, all integers. A table of
different quantities has headers like « Min coverage | Rating | Cost of
debt ». Comparing headers to each other is format-agnostic and captures
the real thing; comparing them to a list of formats never will.

**Targets:** the 30% blocked by « columns are not periods », without
losing the five rows of Damodaran's ratings table that this gate exists
to suppress.

**Expected together:** `inconsistent-row` from 10% toward 40–50%, overall
recall from 56% toward 70%, with the precision cost measured at each step
rather than assumed. For reference the best published detector on this
problem sits near 62% recall and 64% precision; this one is at 56% recall
with zero collateral.

## Three measurements still owed

1. **Ablation.** Turn each gate off in isolation and record what it costs
   and buys. The current knowledge is *where* things stop, not what each
   gate is *worth*.
2. **Precision on untouched files.** The audit reports ~1,250 findings
   across EUSES and nobody has judged them. Hand-adjudicate a random 60,
   with the method stated: the tool's author is the judge, which is weaker
   than an independent corpus and better than a hole.
3. **The deck tie-out has no recall number at all.** This is the largest
   blind spot and the one that matters most, because the tie-out is the
   product and the model audit is a feature. Same mutation technique: take
   a clean deck, perturb the *model* rather than the deck, and check that
   the deck is reported stale — which is the realistic case, a model
   revision the deck never caught up with, not a single typo.

## What is blocked, and by whom

**CUSTODES** — 70 spreadsheets with the wrong cells marked by hand, the
only place published precision baselines live. `sccpu2.cse.ust.hk` returns
403 from the egress proxy, as does all of `cse.ust.hk`. The proxy's
documentation says to report a policy deny rather than route around it, so
it is reported here: **one hostname on the environment's network
allowlist, plain HTTP.**

It is no longer on the critical path. Mutation testing gave a recall
number without it, and adjudication will give a precision number without
it. What CUSTODES adds is *independence* — somebody else's judgement of
which cells are wrong — and that is worth having eventually and is not
worth waiting for now.

## The lesson worth keeping

The rule was switched off for a day and the worry was written down the
same afternoon: *« either those models contain no inconsistent rows, or I
tightened until the rule stopped firing »*. It stayed an open question
because there was no way to settle it — and there was, for the cost of an
hour, by breaking spreadsheets on purpose.

**A checker with no recall measurement is a checker that is silently
allowed to be quiet.** Every rule added from here starts with the mutation
that proves it fires.

---

## Measured and rejected: reading a PDF with geometry

11 August. A research pass recommended `pdfplumber` (MIT) for the source
reader, on the argument that character coordinates would fix the debris
labels — a figure named by the number in the next column rather than by
words. That argument is right about the *cause* and wrong about the fix,
and this is the measurement, so nobody reads the recommendation again and
repeats it.

**What was built.** Words with boxes, grouped into lines by baseline,
each line cut wherever the gap between two words exceeded the word's own
height. Prose word-gaps on a real annual report measure 2.1–2.4pt and
table column-gaps 17–52pt, so the separation is clean and the threshold is
not a guess. (The page's median gap is *not* usable as the denominator: a
page that is mostly table has a median gap of 33pt and the measure eats
itself.)

**What it did, on five pages of Shell plc's 2025 annual report:**

| | flat text | with geometry |
|---|---|---|
| figures | 85 | 14 |
| poorly labelled | 29 | 2 |

Which looks like a win until you read the 78 it dropped. **Forty-nine of
them were correctly labelled:**

```
27,361  'Future cash inflows'
 6,529  'Future production costs'
 1,731  'Standardised measure of discounted future net cash flows'
```

On a statement, the row label sits in column 1 and the first figure in
column 2 — separated by exactly the gap the split fires on. So splitting
severs the label from the figure it names.

**Flattening already produces the right outcome, by accident.** The row
label and its first number land in one line, so the first figure is named;
the remaining columns have only a number in front of them and the
`_named` rule rejects them. One named figure per row, the rest declined —
which is what the geometry was supposed to achieve.

**And it cost 212 seconds against 20.7.** Ten times slower on one file.

**What geometry does win.** Multi-column *prose*, where flattening merges
two columns: it newly found seven figures such as `11%` named « increased
by ». Seven against forty-nine.

**When to revisit.** Not with a splitter. The only version of this that
works is real table reading — first cell names the row, header row names
the column — and that is the project already deferred. If it is ever
built, `pdfplumber` is still the right tool and this note is the design.

## The metadata checker, measured on files nobody here made

Built 12 August. A pure function from the bytes of an Office file to a
list of things in it that are not on its screen: `polar/tieout/metadata.py`.
No deal, no model, no corpus, no login.

**The corpus is 85 public gov.uk attachments** — 34 Excel, 29 PowerPoint,
20 Word — fetched by `scripts/document_corpus.py` and chosen for nothing
at all. Departments publish decks built in PowerPoint and in Google
Slides, spreadsheets built by analysts and by consultants, letters saved
with track changes still on. It is not investment banking. It is real work
by people under deadline, and every leak in it is one somebody shipped.

```
uv run python -m scripts.document_corpus     # fetch
uv run python -m scripts.metadata_survey     # measure
uv run python -m scripts.metadata_check FILE # one file, read cold
```

| | |
|---|---|
| Files read | 83 of 85 |
| Refused, correctly | 2 — password protected, both named `.xlsx` |
| **Files with no leaks at all** | **50 of 83 (60%)** |
| Files with nothing at all, not even a trace | 2 |

| Rule | Grade | Files | Found |
|---|---|---|---|
| `document-properties` | trace | 79 | 391 |
| `cell-comment` | leak | 8 | 228 |
| `custom-property` | trace | 55 | 200 |
| `custom-xml` | trace | 54 | 180 |
| `speaker-notes` | leak | 9 | 55 |
| `cropped-image` | leak | 12 | 35 |
| `very-hidden-sheet` | leak | 1 | 33 |
| `hidden-sheet` | trace | 7 | 29 |
| `external-workbook` | leak | 5 | 17 |
| `embedded-file` | leak | 6 | 12 |
| `external-cached-values` | leak | 4 | 9 |
| `macros` | leak | 6 | 6 |
| `local-path` | leak | 2 | 2 |
| `hidden-slide` | leak | 1 | 2 |
| `tracked-changes` | leak | 1 | 1 |
| `comment` | leak | 1 | 1 |
| `off-canvas-shape` | leak | **0** | **0** |
| `hidden-text` | leak | **0** | **0** |

**60% of files come back with no leaks.** That is the number to watch, and
it matters more than any of the others: a checker that finds something in
every file has found nothing in any of them.

### What it actually found

Real things, in files a government department published:

- `\\ad.culture.gov.uk\dfs\Bids\BDUK\Devon & Somerset\4. D&S (blended
  contingency)\…` — a bid folder tree, inside a published procurement
  template, carried by an external workbook link. This is the incident the
  rule exists for, found on the first corpus it was ever run against.
- `\\Ofqual.internal\DFS\UserData\Beth.Black\Documents\BB projects\…` — a
  named person's home directory, reached from a chart in a published deck.
- **33 very hidden sheets in one published financial model**, including
  ones called `Dashboard`, `Key Outputs >>>` and `Scenario Manager`.
  Confirmed independently by loading the same workbook with `openpyxl`.
- 74 values cached from another workbook inside a workforce statistics
  spreadsheet — the other file's numbers, travelling.
- Two hidden slides in a survey deck, with their text.

### Two rules with no confirmation in the wild, said plainly

`off-canvas-shape` and `hidden-text` fire on constructed files in the unit
tests and on **nothing** in 83 real ones. For `hidden-text` that is
unremarkable — Word's hidden-text formatting is rare.

`off-canvas-shape` is the interesting one, because it *did* fire three
times before being tightened, and all three were wrong in the way that
matters: empty text boxes left beside the slide by a Google Slides export.
Off the canvas, correctly identified, holding nothing. The rule now
requires the shape to carry something, and the honest state of it is: the
geometry is verified, the judgement is not, and a deck with a real parked
chart on it has not yet been seen.

### Four defects in my own rules, all found by reading the output

1. **`cropped to 100% of itself`** — a negative `a:srcRect` side scales a
   picture *out* of its frame rather than hiding any of it, and Office
   writes one whenever a picture is nudged inside a placeholder. Read as
   « any side set means cropped », the report contained a sentence about
   nothing. Fixed by clamping and requiring a real hidden fraction: 70
   findings became 35.
2. **The same cropped logo, six times.** A crop in a slide layout appears
   in every layout that inherits it. Folded by image and crop.
3. **The same path said twice** — once by `local-path`, once by
   `external-workbook`. Two findings, one fact. 15 became 2.
4. **One sensitivity label written as eight properties.**
   `MSIP_Label_<guid>_Name`, `_SiteId`, `_SetDate` and five more are one
   action by one person. 309 custom properties became 200.

And one that was not a defect in a rule but in a grading: `custom-property`
and `custom-xml` were `leak`. 55 of 83 files carry custom properties —
`ContentTypeId` 48 times — and grading those as leaks buried the speaker
notes and the hidden slides underneath them. Both are traces now. **The
cost is stated rather than hidden:** a matter number naming another client
is now graded the same as a `ContentTypeId`, and the only thing separating
them is reading them. Every one is still reported.

### What this number is not

There is no recall figure and there cannot be one from this corpus. Nobody
has labelled these files, so « how many speaker notes did it miss » has no
answer short of opening 29 decks by hand. What *was* checked is the other
direction: every finding above was confirmed by unzipping the file and
reading the part, and the very-hidden sheets were confirmed by a second
library.

The sample is also not stable — gov.uk publishes and withdraws constantly,
so a run next month returns an overlapping but different set. The survey
prints its own file count for that reason.

## The metadata checker's recall, and the bug it exposed

The section above ended with « there is no recall figure and there cannot
be one from this corpus ». That was true of *that* corpus and not of the
question, and leaving a check in the state « I don't know what it misses »
was the wrong place to stop.

**So the misses are manufactured.** `scripts/metadata_recall.py` plants one
known leak into a real file that was silent about that rule before, checks
the file again, and records whether the rule fired. The same method as the
model audit's 150 planted defects: ground truth by construction, inside
somebody else's real work rather than a fixture built to be found.

**The first run returned 100% on 204 plants, which was not a result.**
Every plant was the shape I had in mind while writing the rule, so all it
measured was my imagination. The plants were then rewritten as the *other*
legitimate spellings of the same leak — the attribute Office also accepts,
the element nested where a real document nests it, the newer part that
replaced the old one — and one of them failed.

### `cell-comment`: 0 of 12

Excel has two kinds of comment. The original *note* lives in
`xl/comments1.xml` in the spreadsheet namespace. The **threaded comment**,
which is what the « New Comment » button has produced since 2018, lives in
`xl/threadedComments/` in a Microsoft namespace of its own, with the names
held separately in `xl/persons/person.xml`. The rule knew only the first.

**What that cost in practice was smaller than 0-of-12 suggests, and the
difference is worth stating.** Excel usually writes a legacy fallback note
beside each threaded comment. The one corpus file that has threaded
comments — an FSA data collection spreadsheet with 21 of them — has those
fallbacks, so the *text* was being read all along. What was missing was
the name on each one, and the names are real: Craig Jones, Ese Hughes. The
plant is the case where no fallback was written, and there the loss is
total.

Fixed, with both kinds read and the fallback deduplicated against the
threaded comment so nothing is reported twice.

### Where it stands after the fix

| | |
|---|---|
| Plants | 264, across 23 variants of 17 rules |
| Found | **264 (100%)** |
| Collateral findings | **0** |
| Rules with a plant written by a real Office writer | 4 of 23 variants, marked `library` |
| Rules with a hand-written plant | 19 of 23, marked `hand` |

**What 100% here does and does not mean.** It means every rule fires on
the leak it is for, in each spelling tested, inside a real file, without
making a second rule fire. It does not mean the checker finds every leak a
real person leaves — the threaded comment was invisible until somebody
thought to plant one, and the next gap will be invisible the same way
until the next variant is written. The number is a floor that moves up as
the plants get more awkward, not a score.

`document-properties` has no plant: every file in the corpus already
carries `docProps/core.xml`, so there is nothing silent to plant into. It
fires on 79 of 83 real files in the survey, which is stronger evidence
than a plant would be.

## Grounding meets a pair nobody here wrote

The chain has three legs. The deck against the model has been measured on
real decks; the formula graph on real models; the figure reader on a real
annual report. **Grounding** — a figure in a source document matched to the
typed input cell it is the origin of — had only ever run against the
Cascade fixture, where the accounts and the model were both written here,
by the same hand, on the same afternoon. That is not evidence of anything.

**A real pair is a government department publishing a report and the
spreadsheet behind it on the same page, on the same day.** A PDF stating
figures and a workbook whose typed cells are where those figures came from,
by people who have never heard of us. `scripts/grounding_pairs.py` measures
it; the pairs come from gov.uk the same way the document corpus does.

### The first pair found two links and both were false

NHS workforce statistics, September 2015 — a 113-figure overview report
against the workbook published beside it.

```
0.74 (next 0.57)   13,686  p8  'FTE are Support to clinical staff'
                   → Controls!A10 'Support to clinical staff' = 10
0.56 (next 0.45)   11,237  p8  'FTE are Infrastructure support staff'
                   → Controls!A11 'NHS infrastructure support' = 11
```

`Controls` is a lookup list. Column A counts `1, 2, 3 … 15`; column B holds
the staff group's name. So `A10` is *named* « Support to clinical staff »
and *holds* the number ten. The label matched; the cell was never a
quantity. And because the values differ, each was then reported as the
document **contradicting** the model — the confidently-wrong finding this
whole product exists to avoid, produced on the first real file it saw.

**Fixed structurally, not by a threshold.** A column that counts its own
rows is an index, and an index is not something a set of accounts can be
the origin of. Two shapes, both about position rather than magnitude: the
value equals the row it sits on, or the values count up from one. A column
of years fails both — 2015 is not row 3 and does not start at 1 — which
was checked, because suppressing a model's period headers would take real
inputs out of the grounding set. On this workbook it removed exactly one
column, `Controls!A`, and 15 of 167 candidate inputs. Nothing else.

### The true match exists, and the linker declines it

The report's `13,686` really is in the workbook: sheet `3`, cell `C24`,
`13686.22044000018`, row label *Support to clinical staff*. The linker
scores it **0.82** — and refuses:

```
two outputs fit equally well (4!I24 0.82, 4!H24 0.82)
```

The same staff category appears on many sheets and in many columns, one
per period, and the report's prose — « FTE are Support to clinical staff »
— names no period at all. So the label genuinely does not identify a cell,
and declining is the designed behaviour working rather than failing. Using
the value to break the tie would fix this case and destroy the product:
picking the cell that already matches is how a checker stops finding
discrepancies.

**What this leaves.** No false positives on this pair after the fix, and no
true positives either. Real accounts name their period — « for the year
ended 31 December 2025 », which is what `as_fiscal_year` exists to
translate — and a statistical release does not. Whether that is the whole
explanation is not yet established, and the honest state of the grounding
leg is: **one class of false positive found and removed on real data, and
still no demonstrated true positive outside a fixture we wrote.**

## Grounding, finished: three true positives on a model nobody here wrote

The section above ended with « one class of false positive found and
removed on real data, and still no demonstrated true positive outside a
fixture we wrote ». That is no longer where it stands.

**The pair that made it possible.** Ofgem publishes the RIIO-ET1 price
control financial model *and* the direction document that states the values
fed into it — a real financial model built by working analysts, and a real
source document, published by the same regulator on the same day. The
statistical pairs used before were a narrative report against a data dump;
this is the shape a deal actually has.

```
uv run python -m scripts.grounding_pairs scripts/corpus_pairs/ofgem-et1-aip-2015
```

| | Before | After |
|---|---|---|
| Typed input cells the model offers | **0** of 26,392 | 7,265 of 25,852 |
| Figures linked | 0 | 3 |
| **Agreeing** | 0 | **3** |
| **Contradicting** | 0 | **0** |

All three confirmed by hand against page 7 of the direction:

```
15.7  'Legacy price control allowed revenue adjustment 7A …SOLAR'
      → NGET SO!AH16  = 15.739015040384885
 2.9  'Legacy price control RAV additions adjustment 7A …SOLRAV'
      → NGET SO!AH17  = 2.9301486584244367
12.6  'Uncertain costs - enhanced security 7D …SOIAEEPS'
      → NGET SO!AH10  'FY2014 Uncertain costs - enhanced security' = 12.6
```

### Four defects, each of which produced silence or a lie

Every one was invisible until a real model met a real document, and every
one now has a test.

**1 · A label may sit past column D.** The label-column search stopped at
D. Ofgem's model indents through B, C and D for section headings and puts
its parameter names in **column E**, so all 26,392 cells came back with no
name at all — which empties the tie-out and the grounding both, since each
needs a named cell to have anything to match. Widened to H, and the column
is now chosen by how many *different* things it says rather than how much:
`£m 09/10 prices` appears on 247 rows of one sheet against 251 parameter
names beside it, indistinguishable by volume and 10 distinct values against
143.

**2 · A label that is a formula still names its row.** The model builds one
sheet per licensed business from its input sheet, so the name beside every
row of `NGET TO` is `=Input!E31` rather than words, and `_label` refuses a
formula. The reason it refuses one is about the formula *text* — a column
of arithmetic must not name the figures beside it — and not about what the
formula produces. The formula text is still refused; the cached words are
used. A numeric formula still produces no label, because numbers are not
strings.

**3 · `TO` is a preposition and also a licensed business.** The transmission
owner is on `NGET TO` and the system operator on `NGET SO`. `to` is a
stopword, so `NGET TO` tokenised to `['nget']` — a strict subset of `NGET
SO`, unable to win any match against it. Every transmission-owner figure in
the document went to a system-operator cell: **seven false contradictions**.
A run of capitals is now read as a name rather than a word, unless the whole
line is set in capitals and is therefore shouting.

**4 · A period header written as a date is not a header.** Ofgem writes
`2017-03-31` where a banker writes `FY2017A`. A date is not a string, so
the header row came back empty and all eight year columns of a row carried
the same name — and a figure naming the row matched whichever column
happened to hold a typed value. Two more false contradictions, both now
honest declines. Read as `FY` plus the calendar year, which is a convention
and is documented as one.

### And one thing the model knew that the matcher was not told

The model holds `Legacy price control adjustments to allowed revenue` on
the transmission owner's sheet *and* on the system operator's, word for
word. The direction document prints the same row and tells them apart by
the licence term beside it — `LAR` against `SOLAR` — and **the model has
that term too, three columns along**. Those descriptors now go into the
matcher's `basis`, weighted below the name so they can settle a tie and
never carry a match on their own: `£m 09/10 prices` is on hundreds of rows
and says nothing about which one.

### A miss the Cascade deck had been carrying

Adding row descriptors put a sheet called *FY2025 balance sheet* into a
cell's basis and broke a grounding test — which turned out to be a latent
bug rather than a regression. `FY2025` was treated as a different period
from `FY2025A`. An unmarked year asserts a year and not a basis; refusing
to match it rejects the right cell for saying less rather than for saying
something else. Actuals and estimates are still held apart, which is what
the gate is for.

Fixing it raised the Cascade deck's reconciled count from **102 to 103**:
slide 4's « ERP implementation of FY2025 programme cost » is `Model!D21`,
*FY2025A EBITDA adjustments ERP implementation costs*, and both say 2.8.
One figure, verified by hand, and a real miss rather than a new guess.

### What still declines, and why that is the right answer

- **The other two directions** — SHE Transmission and SP Transmission — are
  narrative documents that name a figure by its licence code alone: « ARC
  revision », « ACO revision ». The code is in the model, in the basis, and
  the basis is deliberately not allowed to carry a match by itself. Nothing
  links, and nothing is wrong.
- **The gov.uk statistical pairs** link nothing. A narrative release against
  a data dump repeats the same row label across dozens of sheets and
  columns, and the prose names no period, so the matcher ties and declines.
  Verified on one: the true cell for « 13,686 FTE are Support to clinical
  staff » is sheet `3`, `C24`, `13686.22` — scored 0.82 and refused because
  two other cells scored 0.82 as well.
- **A row of eight years** gives its label to the first figure only; the
  rest are rejected as unnamed. Reading those needs real table reading,
  which stays deferred — see the pdfplumber note above.

**Formula coverage was re-measured after all of this and is unchanged**:
59,705 formulas across three real models, 0 silent partial losses.

### Nine minutes to read a two-megabyte spreadsheet

Found by the same sweep, on a published schools funding allocation:
22,004 rows, 135,348 cells, **555 seconds**. Against Ofgem's model at
25,852 cells in 16 seconds that is 6.5× the cost per cell, so something was
superlinear rather than merely large.

It was not `openpyxl`: iterating all 308,056 cells of the offending sheet
takes **0.5 seconds**. It was this module.

`max_row` and `max_column` are not attributes. `openpyxl` computes each one
by walking every cell it has read, so `range(1, sheet.max_column + 1)`
written *inside* a row loop is a full sweep of the sheet per row. The tags
loop added earlier the same day did exactly that: 3,000 labelled rows ×
90,000 cells = **126 million comparisons**, all re-answering one question.

Asked once per sheet and passed down:

| | Before | After |
|---|---|---|
| Schools allocation, 135,348 cells | 555s | **10.1s** |
| Ofgem ET1, 25,852 cells | 15.9s | **12.3s** |

Same cell counts, same grounding result — 3 links, 3 agreeing, 0
contradicting. Two smaller costs went with it: the label-column search now
reads the first 1,000 rows rather than all of them (which column names the
rows is a fact about a sheet's layout, and a sheet does not change layout
half way down), and row descriptors are collected only for rows that have a
name.

**Two process notes, because they cost more than the bug did.** Timings
taken earlier in the session were inflated by runaway processes from
previous runs that had not been killed — including the « 40 minutes » that
started this. And a test run that came back with 248 errors was two `pytest`
sessions started concurrently, fighting over the template database, not a
regression.

## The solo check: 82 findings argued down to 1, all of them read

*13 August 2026.* `polar/tieout/solo.py` — a file checked against itself,
the check that works on a loose attachment before anybody has made a deal.
It looks for one thing: the same name carrying two figures. Measured
against the 29 gov.uk decks in the corpus and the Cascade pair before any
screen shows its output.

**The first honest number was 82.** Group figures by full label, flag any
group holding two values, and 29 real decks produce 82 « disagreements » —
nearly three per deck, on decks that are not wrong. Every one was read.
None was a drift. The reading produced four rules, each with its cause
written down:

**1 · Two values inside one shape are data, not statements (82 → 23).**
Nearly every false positive was two points in one chart series or two
cells in one table, read under one truncated label — a chart plotting
« Double mark » scores for two seed items is not a deck restating a
figure. The filter keys on the anchor's `kind` **plus** shape identity,
never `shape_id` alone: PowerPoint numbers charts and tables
independently, and on Cascade's slide 3 the chart and the table both
carry `shape_id` 4 while being two shapes — the pair that *is* the real
finding. It filters pairs, not groups, so a chart against a table
survives while the chart's own points merge.

**2 · The year is part of the name (23 → 12, with rule 3).** `tokens`
drops number-only words — right for deck-against-model, where the model
writes `FY2023A`, and wrong here: « 2018 Aldi » and « 2019 Aldi » fell
into one key and eleven of the twenty-three survivors were chart
categories differing only in a bare calendar year. The solo key appends
bare years.

**3 · Two charts never disagree with each other.** A plotted point is
data wherever it is plotted; a restatement needs at least one side to
*state* the figure — a cell, a tile, a sentence. Every chart-against-chart
pair in the corpus was two different survey questions sharing answer
labels (« Yes », « No », « Don't know »). A real drift between two
copies of one chart is now a deliberate miss, written down here.

**4 · A fragment is not a name, and neither is one word (12 → 1).**
« Events = » is the front half of a sentence about one exam board — the
words telling two boards apart came *after* the number. A label ending
mid-thought (`=`, `:`, a dash, a line break) is skipped. And « Average »
names a row of whatever table it sits in; a one-word label matched two
different quantities every time it was read by hand, so a name must
carry at least two content words.

**The one that stays, examined.** Beth_Black.pptx, slides 23 and 24: two
tables with the identical column « Average difference (%) in probability
of candidates receiving the definitive grade », row « Average », 4.95
against 1.3. It is false — slide 23 is Geography and slide 24 is English
Literature — and the distinguishing words live in the slide *title*, not
the label. Requiring section agreement would kill the check's central
case, a summary slide restating a detail slide, so this stays: **one
false finding per 29 real decks, cause known, trade named.**

**Cascade, both decks, hand-verified.** Exactly two findings each and
nothing else: slide 3's chart series says adjusted EBITDA was 37.8 and
43.0 while the table beside it says 30.8 and 39.6. The « clean » deck
genuinely carries this — its chart was drawn from pre-adjustment EBITDA
and never redrawn (documented in `deck.py` when charts were first read).
The broken deck's planted errors are deck-against-*model* drifts: the
same number changed on every slide that states it, which is internally
consistent and exactly what a solo check must stay silent about.

**Owed, and said plainly:**

- **Recall is not measured.** The false-positive side has a corpus;
  the recall side needs planted second statements, the same
  one-at-a-time method as `scripts/deck_recall.py`. Until then the solo
  check's claim is « quiet on correct files, catches the Cascade chart
  drift » — not a percentage.
- **Totals are not checked**, and no screen claims they are. « The rows
  sum to the total row » needs real table reconstruction; a totals check
  that guesses its columns reports correct tables as broken.
- **Memos have no corpus yet.** The rules were measured on decks; the
  paragraph-anchor path (two sentences restating a figure) is covered by
  unit tests but has not met 29 real memos. The corpus has `.docx` files
  waiting.

Rules pinned in `tests/tieout/test_solo.py`, one test per rule, plus the
Cascade regression: both decks, the same two findings, nothing more.

## The regulator corpus: the day the audit met a defect it did not plant

13 August 2026. The corpus in `scripts/corpus_regulator/` (sources in
[corpus-sources.md](corpus-sources.md)): 17 Ofwat PR24 final-
determination files fetched through the UK Government Web Archive
(Ofwat's own site blocks this environment), 6 Ofgem RIIO-3 files
fetched directly, and the documents that quote them — including
Ofwat's **PR24 FD inbound queries** document, which quotes exact cell
references and is written by neither this team nor the companies.

### The ground truth nobody here made

The queries document (p8) reports that in "XXX's" FM02 financial model
the cells `InpS!N1885-1888` are **hard-keyed where every other year is
a formula**, that the amount is material (£2.7m of revenue), and that
only two companies — both anonymised — carry it. Checking that one
cell across all sixteen companies' models de-anonymised it:
**Northumbrian and Yorkshire**, exactly two, matching the document.

Ofwat's answer calls the overwrite deliberate. It is still precisely
what a reviewer must be shown: values pasted over a template's
plumbing, flagged orange, undocumented in the model itself.

### The audit against it, before and after

Before: **0 of 8** (both companies, four cells each). Two causes,
each a rule protecting against a measured false-positive class:

1. The `typed-over-formula` veto on *stacked* constants vetoed on any
   vertical neighbour. A four-cell pasted block vetoes itself. Fixed
   by measuring the stack: a run of ≤8 typed cells is a paste, longer
   is a parameter column (`TYPED_BLOCK`, both ends measured — the
   4-cell confirmed paste, the 59-cell CollarsAnalysis column).
2. Yorkshire's paste is **wider than the regulator recorded** — five
   year-columns × four rows, twice over. No row keeps a formula
   majority, so the row pass is structurally blind. A new column pass
   (`_typed_islands`) flags a short island of constants interrupting a
   *repeating* column formula. Two guards, both measured: the column's
   formula must repeat (an input column with one `SUM` under it
   repeats nothing), and every island row must hold a formula **left**
   of the typed cell (typed history is constants-first; a paste sits
   after the calculations begin). The sheet-wide history boundary is
   deliberately not consulted — on Yorkshire's own `InpS` it votes for
   column 19 and would hide the paste at column N.

After: **8 of 8**, with Anglian (whose same cells are formulas — the
clean twin) at zero, and — the sentence worth keeping — **Ofwat's
queries document describes one Yorkshire block; the audit found two.**
The people whose full-time job is reading these models, with the
companies' own explanations in front of them, documented half of it.

### The overfit check: all sixteen companies, every cell

A rule fitted to two examples deserves suspicion, so the audit ran
over all sixteen FM02s in full (`sweep16.log`). Result: **101
`typed-over-formula` findings** — the 44 confirmed
(Northumbrian 4, Yorkshire 40), **57 more in eight companies the
queries document never mentions**, and six companies clean:

| Company | Findings | Hand-checked |
|---|---|---|
| Yorkshire | 40 | confirmed by Ofwat + template comparison |
| Portsmouth | 30 | 3 of 3 sampled real **and material**: WACC typed 6.08% where the feed delivers 5.56%; income 18.5 vs 0; RPI rate 3.10% vs 2.59% |
| Southern | 8 | 1 of 1 sampled: opex typed 52.7 where the feed delivers **153.3** |
| South-West | 5 | structural match (same template rows) |
| Northumbrian | 4 | confirmed by Ofwat |
| Thames | 4 | same labelled row (« Base revenue 2024-25 ») as Affinity |
| United Utilities, Severn Trent | 3 each | not yet read |
| Affinity, South Staffs | 2 each | Affinity structurally matches Thames |
| Anglian, Hafren, SES, South East, Welsh, Wessex | 0 | Anglian verified formulas at the confirmed cells |

Every sampled finding is a value typed over the template's
`=IF(F_Inputs!…)` feed with a **different value than the feed
delivers**. Whether each is a deliberate adjustment (as Ofwat said of
the two it knew about) or an error is the regulator's question; that a
reviewer must see them is not. This is the second independent win:
paste-overs in the public record that the public record does not
mention.

**Directionality.** The « formula to the left » guard assumes time
runs left to right. On Ofgem's GD-BPFM — a different modelling house —
the rule fired 45 times, and the shape matches the confirmed class
(`MainInputs` rows 140-142: a 3-row × 8-year block typed over
`=AP$11*$I$14*InputSummary!…`). No sixteen-way template exists for
Ofgem, so these are recorded as **plausible, unconfirmed**. A
right-to-left model would defeat the guard; none has been seen.

### Reading real models: the half-hour that became forty seconds

`read_workbook` loaded every file twice through openpyxl's ordinary
mode — an object per cell of the rectangle, nine million of them on a
company FM02. Profiled 150 seconds in: seven sheets of sixty-four
done. Streamed (`read_only`, one pass per load, dictionaries of only
the cells that exist): **FM02 in 39-68s** (was: never finished in 25
minutes), GD-BPFM 645k cells in 151s, the 1.27M-cell Cost of Debt
model in 302s. Regression: byte-identical cells/formulas/defects on
every previously-read file.

### Audit noise: one decision, one finding

CA05 reported 8,017 defects; 7,752 were **one** 625-character formula,
fill-copied, reported per cell (verified: one distinct shape).
Findings from fill rules now collapse by sheet + formula shape —
CA05 falls to **182**, the summary-tables file from 1,794 to 66.
Hardcode findings keep their buried numbers in the key, so distinct
assumptions stay distinct — which is why GD-BPFM still reports 6,068
hardcodes (distinct literals) and the CoD data-workbook 354k defects:
**data-shaped workbooks still overwhelm the audit**, owed below.

### The crosscheck against foreign pairs, per the pre-registered protocol

Criteria committed before the result in
[ofgem-crosscheck-protocol.md](ofgem-crosscheck-protocol.md).

- **Ofwat queries ↔ CA20** (the £55.448m ↔ `Allowance!C17` pair,
  hand-verified): **0 links from 534 figures.** Cause read in the
  code, not guessed: the linker matches names, never bare values, and
  Ofwat labels cells in codes (`CWW3_007TOT_PR24 NES`). The value-
  coincidence bound was measured — 174 of 534 figures share a value
  with *some* CA20 cell, almost all « £5m »/« 10% » coincidences — so
  the refusal to match on value is what keeps the checker honest.
  Named class: **code-labelled models**, whose own solution artifact
  exists — Ofwat publishes a 1,066-row mapping tool
  (`mapping_tool_v4.xlsx`) translating table codes to model lines. A
  mapping layer under house rules is the design; not built this round.
- **Cadent ↔ GD-BPFM: 0 links from 432 figures — graded specificity
  success.** Every Cadent headline value was searched for in the BPFM:
  the value-matches that exist sit under unrelated labels (« NTS Exit
  Flat Capacity Costs », not the FWACV allowance). The document's
  numbers live in the PCD annex models, not this file. 432 chances to
  guess wrong; none taken.
- **Finance Annex ↔ GD-BPFM**, the fair pair: **12 proposals from
  1,234 figures** (volume passes the protocol: 12, not 900), **all 12
  claimed as drifts, 0 agreements**. Denominator work: of the twelve
  pre-registered targets, **five are verified present under their own
  labels** (risk-free rate, TMR, equity beta 0.83, notional gearing
  60%, CoE 6.12%), one ambiguous, six verifiably absent (ET-sector or
  PCFM values — absence is not a miss). Drift adjudication: see below.
- **Specificity vs the daily-rates workbook: unmeasured** — the
  linker timed out at 20 minutes against 351k candidates.

**The linker does not scale**: 1,234 × 146,274 took 20 minutes.
Banker models offer ~250 candidates and it is instant; regulator
models offer 146k. Owed: candidate pre-filtering by shared vocabulary
before scoring.

### The Annex drift adjudication: FAIL, per the protocol

All twelve proposals hand-checked, and all twelve are **false
drifts** — the expensive failure, and the pre-registered criteria say
what that means without room to argue: **the fair crosscheck test
fails.** R = 0 of the five verified-present targets linked. P = 0 of
12. D = 12 false. Only V (12 proposals, not 900) passed.

What the twelve actually are, verified in the raw file: every one
links a document figure whose extracted label is a bare licensee
acronym (« NGET », « SHET », « SPTL » — from the Annex's
electricity-transmission tables) to cells on the BPFM's
**« F7 - Data Validation » sheet — the integers 6, 7 and 8 in an
inflation-lag dropdown list** that happen to sit in rows the label
reader named with the same acronyms. Score 0.54 with runner-up 0.00:
one shared token, nothing else in 146k candidates matched at all, and
one lone token cleared the 0.50 threshold. The checker then compared
« £13,359.4m » against « 8 » and called it a disagreement.

Causes, named:

1. **A lone-acronym label can clear the threshold when both sides are
   the same lone token.** The solo check already learned this lesson —
   its names require two content words, measured (« Average » matched
   two different quantities every time it was read by hand). The
   linker never inherited the rule. It should, and the fix is testable
   against this exact log.
2. **Machinery sheets are candidate material.** A data-validation
   sheet's dropdown integers are not statements a document can
   disagree with. Candidate harvesting needs to refuse
   validation/lookup furniture — by sheet-name convention at minimum,
   better by shape (a column of consecutive small integers under an
   enum header names nothing).
3. **The five present targets went unlinked for reasons not yet
   known.** « Risk-free rate » sits in the model under exactly that
   label (`InputSummary!AU869`) and the document prints 2.30% beside
   the words « Risk-free rate forecast » — this should have linked and
   did not. A focused debug is owed before any claim about regulator-
   scale recall; do not guess the cause in a document.

What still stands, unchanged by this grade: the banker-vocabulary
pair links correctly (Cascade accounts ↔ model: 7 of 8, all
agreeing, measured the same day with the same code), and both honest
zeros (code-labelled Ofwat, wrong-pairing Cadent) graded as designed.
The fail is specific: at regulator scale, with acronym-labelled
tables and machinery sheets in the candidate pool, the linker
produces confident nonsense — twelve pieces of it, now pinned in
`annex_bpfm2.log` as the regression corpus for the fixes.

### Owed from this round

- **The linker's two fixes from the failed Annex test** — the
  two-content-word rule the solo check already carries, and refusing
  machinery sheets as candidates — then the re-test against the same
  pair, graded by the same protocol, plus the debug of the five
  unlinked present targets.
- Data-shaped workbooks (daily-rate series) need either detection
  (« this is not a model ») or restraint; 354k findings is not an
  answer a person can use.
- Linker candidate pre-filtering (above).
- The mapping-layer design for code-labelled models.
- United Utilities and Severn Trent sweep findings not yet read.
- The errata-tracker recall test (260 published corrections — pair
  the pre-erratum documents with corrected models) remains the best
  future recall corpus and is untouched.
