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
