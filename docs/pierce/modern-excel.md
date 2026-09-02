# Modern Excel — registration, before any code

2 September 2026. The founder chose this round first, from the four
the meaning-layer research left open. The engine must **see** the
constructs newer Excel puts in a file, say which of our calculators
can honestly compute each, and refuse in words when none can — before
any calculator is chosen. This is the registration; the code comes
after it.

## What was found reading the code, before writing any

The denylist prescan (`recalc/denylist.py`) reads formula text with
Excel's own tokenizer and routes a file to the arbiter or to a
refusal. Probed today on nine formulas, it treats the constructs of
this round as follows:

| Construct, as Excel stores it | Today | Right |
| --- | --- | --- |
| Table reference `SUM(T[Amt])` | **Silent.** No hit. Formualizer then refuses the whole workbook (« Undefined table: T »); IronCalc computes it | Seen and named; Formualizer not tried; the mark says the file carries tables |
| Spill reference `SUM(E1#)`, stored `_xlfn.ANCHORARRAY(E1)` | **Refused as a user-defined function** | An engine gap: real Excel computes it, no engine of ours does today (IronCalc returns `#VALUE!`, Formualizer `#NAME?`). Route to the arbiter, named « spill reference » |
| `FILTER`, `SORT`, `UNIQUE` and the other functions Excel stores with the double prefix `_xlfn._xlws.` | **Refused as a user-defined function** — `_canonical` strips `_XLFN.` but not `_XLWS.`, so a name in the catalogue is not recognised | A known function. Both native engines compute FILTER correctly (measured today). Strip the second prefix |
| A named LAMBDA, defined once in `definedNames` and called by its name, `=DOUBLE(21)` | **Refused as a user-defined function** | A LAMBDA: real Excel computes it, LibreOffice has none. Route to the arbiter, named as a LAMBDA, detected from the defined name's text |
| Inline `_xlfn.LAMBDA(x,x+1)(A1)` | Arbiter, correctly | unchanged |
| `LET`, `SEQUENCE`, `IFS`, `TEXTJOIN` | Recognised, correctly; both native engines compute them (measured today) | unchanged |

Two of these are **defects in the shipped prescan**, named here
before they are fixed: a file using FILTER or SORT is refused today
as if it called a macro, and a file using a named LAMBDA is refused
outright instead of being sent to the arbiter.

## The change

1. **A construct scan from the file's own bytes** (`recalc/constructs.py`),
   not from formula text alone, because three of the four constructs
   live outside the cells:
   - tables: parts under `xl/tables/` (name, sheet, range);
   - spill metadata: `xl/metadata.xml` carrying `XLDAPR`, and cells
     with the `cm` attribute;
   - named LAMBDAs: any `definedName` whose text starts with
     `_xlfn.LAMBDA(`;
   - the modern functions: every `_xlfn.` and `_xlfn._xlws.` name in
     formula text, counted by name.
   The scan reads the zip directly and never evaluates anything.
2. **The prescan fixed**: `_XLWS.` stripped like `_XLFN.`;
   `ANCHORARRAY` an engine gap (arbiter), not a UDF; a call to a
   defined name whose definition is a LAMBDA is a LAMBDA hit (arbiter),
   not a UDF.
3. **Routing per engine**: Formualizer is not asked about a file with
   tables, and the attempt record says so in words (« skipped: the
   file has 3 tables and Formualizer refuses tables »). IronCalc and
   LibreOffice are asked as before; the gate remains the truth.
4. **The mark carries the constructs**: `FileFidelity.constructs`, a
   list of (kind, count, examples), stored on the artifact's mark
   beside `attempts`, so the screen and the report can say « this
   file carries 3 tables and 12 cells that spill » whatever the
   verdict.
5. **The screen**: the refusal sentence names the construct in plain
   words (« a spill reference », « a named LAMBDA », « a table ») from
   the same short-name map that names the existing categories.

Nothing in the audit (the 17 rules, folds, elevation) changes. The
audit golden master must diff clean.

## Measures, fixed now

1. **Corpus construct counts** (descriptive, before and after are the
   same numbers): on the 27 gate models, the founder's model and the
   22 close models, how many files carry tables, spill metadata,
   named LAMBDAs, and each `_xlfn`/`_xlws` function.
2. **Route changes**: the prescan's route for each of those 50 files,
   before the fix and after. Every file whose route changes is named
   with the construct that moved it.
3. **Built-file behaviour, pinned by tests**: one file per construct;
   for each, what the scan reports, which engines are asked, and what
   the mark says. IronCalc's `#VALUE!` on a spill reference and
   Formualizer's whole-file refusal on a table are pinned as measured
   today, so a future engine version that fixes them fails a test and
   the routing is revisited on evidence.
4. **LibreOffice 24.2 on the constructs file** (this container's
   version; production runs 25.8 — named, not hidden): what it
   returns for LET, FILTER, a table reference, a spill reference and
   a named LAMBDA, so the fallback's honesty on each is measured, not
   assumed.
5. **Audit golden master**: clean.

## Predictions, registered

- Tables: at least one of the 27 gate models carries a table part;
  the RIIO-3 files are the likely carriers.
- Spill metadata: at most two of the 50 files; regulators publish
  classic workbooks.
- Named LAMBDAs: zero in all 50.
- The `_xlws.` defect has refused at least one real file: at least
  one of the 50 changes route from « refuse » to « none » or
  « arbiter » after the fix. If zero, the defect was real but not yet
  costly, and that is said.
- LibreOffice 24.2 computes LET and FILTER, returns an error on the
  spill reference and on the named LAMBDA, and reads the table
  reference (Calc has had structured references for years) — a guess,
  which the measure replaces.
- Audit golden master: identical.

## Out of scope, named

- No new calculator. The arbiter (real Excel through the Graph
  connector) stays Piece 4 and is not wired here.
- No attempt to compute spills or LAMBDAs ourselves.
- Excel's own spill-metadata bytes were not observed (the sample was
  written by IronCalc); the scan reads the `XLDAPR` metadata and the
  `cm` attribute as documented, and the first Excel-written spill
  file that reaches us is a test to add.

---

# Results

*(appended after the round; nothing above this line changes)*

## Result — 2 September 2026

**Built as registered, with one routing change the measurements
forced, and one prediction wrong.**

### What deviated from the registration, and why

- **A spill reference no longer goes to the arbiter unasked.** The
  registration said « route to the arbiter ». Measured on a real
  spill (the anchor stored as a dynamic array over four cells, with
  the array metadata): IronCalc computes both the spill and the `#`
  reference; Formualizer returns `#SPILL!` on the anchor and `#NAME?`
  on the reference; LibreOffice 25.8 fills the spill and errors on
  the reference. So the arbiter-class hits — a spill reference, a
  LAMBDA, the `@` operator — now let the native engines be asked
  first, and the gate decides. Only when no native engine passes does
  the file go to the arbiter, with every attempt on the mark, and
  LibreOffice is not asked. A refuse-class hit (a feed, a macro, a
  link outside the file) still refuses before anything runs.
- **The first spill measurement was wrong and is withdrawn.** The
  registration's line « IronCalc returns `#VALUE!` on a spill
  reference » came from a test file openpyxl wrote, which stores the
  anchor as a plain formula with no array metadata, so no engine
  could have resolved a reference to it. That measured the builder,
  not Excel's bytes. The fixture is now written by IronCalc, which
  writes the same parts Excel does.
- **« Cells that spill » counts multi-cell arrays only.** Current
  Excel stores *every* formula that could return an array as a
  single-cell dynamic array with the metadata attached — 125,060 of
  them in one RIIO-3 model, none spilling past its own cell. Those
  are ordinary formulas to every engine and are counted separately
  as information (`dynamic-array`), never named in the sentence.
- **LibreOffice was 25.8, not 24.2.** The container's UNO driver runs
  the 25.8 build the product uses; the 24.2 on the path is not what
  the gate calls. The measure is the better one for it.

### Measure 1 — what the held files carry (44 files: 27 gate models, the founder's model, 16 close models readable as zip)

| Construct | Files | Where |
| --- | --- | --- |
| Tables | 8 | every RIIO-3 business-plan and WACC model (2 to 13 tables each) |
| Real spills (multi-cell arrays) | 9 | the RIIO-3 models (1 to 5 each) and **the founder's own model (6)** |
| Single-cell dynamic arrays | 25 | every file saved by current Excel |
| Named LAMBDAs | 0 | — |
| Modern functions | XLOOKUP in 2 files (64,369 cells), FORMULATEXT 3 files, IFS 6, SINGLE 4, FILTER 3, SORT 3, IFNA 2 | |

### Measure 2 — routes before and after the prescan fixes

**Zero of 44 files change route.** Before: 39 no route, 4 arbiter
(the `@` operator in the RIIO-3 finals and one draft PCFM), 1 refuse
(the Dumfries model's links to two other workbooks). After: the
same. The `_xlws.` defect was real and cost nothing on these files,
for a reason found by looking: the three files that use FILTER and
SORT hold them in one array formula in the sheet's leftmost filled
column, which the reader carries as the row labels, not as cells —
so the prescan never saw the formula. The byte-level scan sees it
(that is where the counts above come from). Whether a formula in
the label column should reach the prescan is a reader question,
named here and not decided in this round.

### Measure 3 — built files, pinned

Eighteen tests: the scan on a plain file, a table, a spill, a named
LAMBDA, the modern functions and an unreadable file; the three
prescan defects fixed; Formualizer refusing a workbook with a table
and computing the modern functions; IronCalc computing a table
reference, a spill and its reference; Formualizer failing the spill;
the router skipping Formualizer on a table with the sentence the
mark carries; and the whole gate flow — a spill believed through
IronCalc, a named LAMBDA sent to the arbiter after both native
engines were asked.

### Measure 4 — LibreOffice 25.8 on the constructs file

| Construct | Result |
| --- | --- |
| LET | 60, correct |
| FILTER (double prefix) | 50, correct |
| Table reference | 12, correct |
| Spill anchor and its cells | filled, correct |
| Spill reference `B1#` | error 525 (`#NAME?`) |
| Named LAMBDA | error 509 |

### Measure 5 — audit golden master

No audit file is in the diff (`audit.py`, `regularity.py`, the
folds and elevation are untouched); the change is confined to
`recalc/` and the gate call in the service. Unchanged by
construction, not re-swept.

### Predictions, scored

- Tables in at least one gate model, RIIO-3 the likely carrier —
  **holds**: eight, all RIIO-3.
- Spill metadata in at most two of the files — **wrong**: nine
  files carry a real spill, the founder's model among them; and every
  file saved by current Excel carries the metadata on ordinary
  formulas. The prediction assumed regulators publish classic
  workbooks; they publish from current Excel.
- Named LAMBDAs zero — **holds**.
- At least one file changes route after the `_xlws.` fix — **wrong**,
  for the reader reason above.
- LibreOffice computes LET and FILTER, errors on the spill reference
  and the named LAMBDA, reads the table — **holds**, on 25.8.
- Audit golden master identical — **holds** by construction.

### What a customer sees differently

A model that uses a spill, a LAMBDA or the `@` operator is no longer
turned away before any engine has tried it; the fast engine is asked,
and if its numbers match what Excel saved, the model is recalculated
and believed. A model with tables is not handed to the engine that
refuses tables. Every mark now says what the file is made of — so
many tables, so many cells that spill, a named LAMBDA by name — on
the screen and in the report, whatever the verdict.
