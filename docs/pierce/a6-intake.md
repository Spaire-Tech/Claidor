# A6 — intake: the five held models, and whether a converted file
# is the same file

**Registered before any fidelity number exists.** Written to be
falsifiable: the criteria below are fixed now, and the round refuses
if they are not met, whatever that costs.

## The hole, priced

Of sixteen published models in a real closed-deal population, **five
cannot be opened by our reader at all** (`population-proof.md`).
One real model in three.

| model | format | readable today |
|---|---|---|
| `barrhead_model.xlsb` | `.xlsb` | **no** |
| `largs_model.xlsb` | `.xlsb` | **no** |
| `dalbeattie_model.xlsb` | `.xlsb` | **no** |
| `our_lady_st_patricks_model.xlsb` | `.xlsb` | **no** |
| `inverclyde_model.xls` | `.xls` | opens, **formulas missed** |

**A correction to my orders, recorded rather than passed on:** the
twenty-fifth sweep describes the five as « three `.xlsb` and two
`.xls` ». By extension they are **four `.xlsb` and one `.xls`**. The
total and the conclusion are unchanged; the split is not.

All five are on disk and hash-verified. `dalbeattie` and
`our_lady_st_patricks` were fetched from the same public bucket the
committed fetcher uses and match the sha256 prefixes recorded in the
contamination log byte for byte — `900475eabfaf98e4` and
`b366fb206a2c9bfe`. They are the registered files, not lookalikes.

## What the reader does today

`read_workbook` routes `.xls`/`.xlt` to `polar/tieout/legacy.py`
(xlrd) and everything else to openpyxl. openpyxl reads the XML
formats only: **`.xlsb` is a binary workbook and cannot be opened at
all**. The `.xls` route opens but is known to miss formulas — proven
arithmetically per subject in `serious-mining.md`, and until now
routed to the lead as outside my paths.

**On paths, said plainly.** `lanes.md` gives me
`tieout/{audit,structure,analytics,workbook}.py`; `legacy.py` and a
new `.xlsb` route are in **no lane's ownership row**, and my « never
touches » is product code and other lanes' packages, which neither
is. The twenty-fifth sweep assigns A6 to me by name. I read that as
covering the intake files A6 cannot be done without, and I am
naming the reading here so the lead can overrule it at a sweep
rather than discover it in a diff.

## The container fact this round had to correct first

Every previous note in my record says LibreOffice cannot convert
anything here — « source file could not be loaded », for the
CUSTODES `.xls` subjects and, as tested today, for a plain valid
`.xlsx` from our own corpus. **The cause was not the files.**
`libreoffice-core` was installed without **`libreoffice-calc`**:
there was no Calc component, so no spreadsheet of any format could
load. With `libreoffice-calc` installed, all five held models
convert.

Two consequences, both named now rather than discovered later:

1. My handoff's standing lesson (« LibreOffice cannot convert the
   CUSTODES/Tasi `.xls` subjects here … not profile, not
   permissions ») is **wrong** and is corrected in the same push.
2. If the product converts, **`libreoffice-calc` is a dependency of
   the product image**, not a developer convenience. Naming it is
   part of this round; installing it anywhere but this container is
   not mine.

## The measurement — a converted file is a different file

The orders' phrase is the whole design: conversion is worthless
unless the converted file is shown to carry what the original
carried. Showing that needs an **independent read of the original**,
because comparing a conversion against itself proves nothing.

| format | independent witness |
|---|---|
| `.xls` | `xlrd` directly — the same library `legacy.py` sits on, read raw, so our own decompiling is not in the loop |
| `.xlsb` | **`pyxlsb`**, a separate implementation, neither ours nor LibreOffice's |

`pyxlsb` is installed **for measurement only**. It is not proposed
as a product dependency: that would be its own decision, and the
whole point of this round is that the conversion route is what
ships.

### What is compared, fixed now

Original (witness) against converted (our reader), per file:

1. **Sheets.** Every sheet in the original is present in the
   converted file.
2. **Numeric cells.** For every (sheet, ref) the witness reports as
   numeric, the converted file holds a numeric value equal within a
   relative tolerance of `1e-9` (exact where both are integral).
   Reported four ways: matched, **changed**, **missing**, added.
3. **Formulas.** For every cell the witness reports as carrying a
   formula, the converted file carries a formula. Losses enumerated
   by reference.
4. **Text is not compared, deliberately.** Our reader elects only
   numeric-or-formula cells, so a text difference is invisible to
   every rule downstream. Named so the omission is a decision, not
   an oversight.

### The failure mode this exists to catch

**LibreOffice may recalculate on load.** If it does, the converted
file's values are *LibreOffice's answers*, not the file's — and
every one of them would agree with a recalculation while silently
disagreeing with what the model published. This is the single
outcome that would sink the conversion route, it would look like
success on a careless read, and criterion 2 below is written to
catch it.

## Criteria for A6 (fixed now)

1. **All five held models open** through `read_workbook` after
   conversion, no refusal.
2. **Numeric fidelity: every disagreement is enumerated and
   hand-read at the cells.** Not a percentage bar — a conversion is
   not a heuristic, and a silently changed value is disqualifying.
   Any disagreement that cannot be explained **refuses the round**.
   A pattern of disagreement consistent with recalculation refuses
   it outright.
3. **Formula fidelity:** every formula the witness sees survives as
   a formula. A systematic loss refuses the round; isolated losses
   are enumerated and explained.
4. **Provenance:** a converted file must never be reported as the
   original. The engine-side field is mine; **surfacing it in the
   report is Atelier's** and is routed, not assumed.
5. **The golden-master gate is clean.** A tripwire only: the gate
   corpus is `.xlsx`/`.xlsm` and is not routed through conversion,
   so a clean gate certifies nothing here — it only shows I did not
   disturb what already worked.

## Prediction (written before the measurement)

- The four `.xlsb` conversions preserve values and formulas well,
  because LibreOffice's OOXML export writes real formulas.
- **The `.xls` case shows conversion recovering formulas
  `legacy.py` misses.** If it does, conversion is the *fix* for the
  routed reader defect rather than a reason to repair `legacy.py`,
  and I will say so.
- I am genuinely unsure whether LibreOffice recalculates on load
  here. That is why criterion 2 is written as a refusal and not as
  a threshold.

## What this round does not do

It does not touch what the engine reports about a file it can
already read. It does not repair `legacy.py`. It does not add a
product dependency. Each of those is its own decision, and two of
them are not mine.

---

## Results (computed after the registration)

**Engine at `01247413`.** Conversion by LibreOffice 24.2.7.2
headless, `--convert-to xlsx`, one file at a time. Instruments:
`scripts/a6_fidelity.py`, `a6_disagreements.py`,
`a6_missing_kinds.py`, `a6_boolean_probe.py`, `a6_biff_census.py`.

### All five convert; two will not open

| model | converts | opens through `read_workbook` |
|---|---|---|
| `barrhead_model.xlsb` | yes | **yes** — 54 sheets, 351,160 cells |
| `our_lady_st_patricks_model.xlsb` | yes | **yes** — 54 sheets |
| `inverclyde_model.xls` | yes | **yes** — 24 sheets, 119,549 cells |
| `largs_model.xlsb` | yes | **NO** |
| `dalbeattie_model.xlsb` | yes | **NO** |

The refusal is exact, not mysterious. From the `.xlsb` route
LibreOffice writes the reserved name `_xlnm.Print_Titles` with an
**empty body**; openpyxl hands that `None` to
`PrintTitles.from_string` and raises `TypeError`. `largs` and
`dalbeattie` carry Print_Titles (44 reserved names each);
`barrhead` and `our_lady` carry only `_xlnm.Print_Area` and so
survive. **Criterion 1 fails.**

### No value changed anywhere — the failure mode I feared did not happen

| model | witness numeric | matched | **changed** | missing | added |
|---|---|---|---|---|---|
| `barrhead` | 343,955 | 343,546 | **0** | 409 | 0 |
| `our_lady_st_patricks` | 343,945 | 343,516 | **0** | 429 | 0 |
| `inverclyde` | 111,602 | 111,602 | **0** | 0 | 0 |

**Not one numeric value was altered.** The registration named
recalculation-on-load as the outcome that would sink the route and
would look like success on a careless read; it did not occur, and
this table is the evidence.

Every « missing » cell is accounted for at the cell, as criterion 2
requires — none is absent:

| what happens | barrhead | our_lady |
|---|---|---|
| a zero on a time-formatted cell arrives as `datetime.time` | 397 | 417 |
| a numeric flag `1.0` arrives as a **boolean** | 12 | 12 |

The two are different in kind. The `time` case is openpyxl coercing
on number format — the stored value is unchanged. The **boolean
case is the conversion changing a cell's type**: the original record
is numeric, and LibreOffice writes `t="b"`. Both are invisible to
our engine all the same, because the reader elects only
numeric-or-formula cells, so ~409 cells per model silently leave
`Workbook.cells`.

### Formulas: fabricated, not lost

The prediction was formula *loss*. The measurement found the
opposite, and it is worse.

| model | formulas in the original | « formulas » after conversion |
|---|---|---|
| `barrhead` | **0** | 10,715 — every one `=TRUE()`/`=FALSE()` |
| `our_lady_st_patricks` | **0** | 10,716 — 10,715 boolean-shaped |
| `inverclyde` | **0** | 5,223 — 5,221 boolean-shaped, 2 the empty formula `=` |

**LibreOffice writes a formula for every boolean cell.** The counts
agree exactly with the boolean-cell counts in the originals, from
two independent witnesses on two different formats: pyxlsb's records
for `.xlsb` (10,715 boolean cells) and a raw BIFF census for `.xls`
(5,223 `BOOLERR` records, zero `FORMULA` records).

This nearly went into the record backwards. The counts fit a second
reading just as well — that pyxlsb mislabels a formula record, and
the conversion had faithfully preserved 10,715 real formulas, which
is the opposite verdict. `a6_boolean_probe.py` settles it at a named
cell: `Control!A3` is a boolean cell holding `True` in the original
and `=TRUE()` after conversion. **Criterion 3 fails.**

It matters because our structural checks are statements about
formulas. Feeding the audit layer 10,715 phantom formulas on a
value-only model is not a cosmetic defect.

**Still unmeasured:** `largs` (775 formulas) and `dalbeattie` (494)
are the only held models with genuine formulas, and they are the two
that will not open. **What conversion does to a real formula is
therefore not known**, and this round does not claim otherwise.

### Defined names: destroyed on the `.xlsb` route, kept on the `.xls` route

Not a criterion — found while diagnosing the refusal, and reported
because the engine reads defined names.

| converted from | defined names | with a target |
|---|---|---|
| `barrhead.xlsb` | 403 | **0** |
| `dalbeattie.xlsb` | 1,022 | **0** |
| `largs.xlsb` | 1,321 | **0** |
| `inverclyde.xls` | 805 | **805** |

Every name survives the `.xlsb` route as a **name with no
reference**. `_names_of` reads these, `broken_names` and
`foreign_names` are computed from them, and `references_of` resolves
named ranges in formulas through them. The `.xls` route keeps them
intact, so this is a property of LibreOffice's `.xlsb` import, not
of conversion as such.

## Verdict: REFUSED

Three of the five registered criteria fail.

1. **All five open — FAILS.** Two of five refuse.
2. **Numeric fidelity — PASSES.** No value changed; every
   disagreement is explained at the cell. The type changes are
   recorded as a known, quantified cost (~409 cells per model).
3. **Formula fidelity — FAILS.** Formulas are fabricated from
   boolean cells, in every file, on both routes.
4. **Provenance — not reached.** No engine change was made, so
   there is nothing to route to Atelier yet.
5. **Golden-master gate — not run, and not claimed.** No engine
   file was changed in this round, so there is nothing for it to
   certify. Running it would produce a green tick that means
   nothing, and this document does not collect those.

**Nothing was wired.** `read_workbook` is untouched, `legacy.py` is
untouched, no `.xlsb` route was added. A conversion that invents
10,715 formulas and drops every named reference is not intake; it is
a different file wearing the model's name, which is precisely what
the registration said had to be proven before it counted.

## What a next round should do, priced by what was measured

1. **A repair pass on the converted file, then re-measure.** Both
   named defects look mechanical: drop `definedName` elements with
   an empty body (which fixes the two refusals at a stroke), and
   rewrite `=TRUE()`/`=FALSE()` back to boolean literals. Neither
   touches a number. This is the cheapest path to a route that
   might pass, and it must go through this same measurement, not
   around it.
2. **Then measure what conversion does to a real formula** on
   `largs` and `dalbeattie`, which is the question this round could
   not reach and the one that decides whether conversion can ever
   serve the structural checks.
3. **Do not add a `.xlsb` reader as an alternative before (1) and
   (2).** `pyxlsb` reads these files today, but a second reader is
   a second surface for every rule downstream, and the conversion
   route is what the plan named.

**One operational fact for whoever ships this:** the conversion pass
needs **`libreoffice-calc`** in the image. This container had
`libreoffice-core` without it, which is why every previous note in
my record said LibreOffice could convert nothing here.
