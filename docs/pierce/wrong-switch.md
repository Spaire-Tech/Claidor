# A row anchored on another row's switch — registration, before any code

3 September 2026. The truth-set round's one independent cell-level
defect (`truth-set.md`, measure 2, row 8): in Ofgem's final GD3
business-plan model the « RIIO-2 legacy Adjustment Factor phasing »
row computes `=IF($I$474=1,$AU$471/5,AT10*$AU$471)` — it reads the
phasing switch of the row two below (« K Correction Factor phasing »,
whose own switch is `$I$474`) while its own switch sits in `$I$472`,
populated and unread. The ET3 twin reads its own. The engine flagged
the cell for the `/5` and never saw the anchor; a person did. This
round writes the rule.

## The claim, fixed now

A formula row reads, through an absolute anchor (`$C$R`, both
halves fixed), a cell in the sheet's left-hand columns — where
switches, flags and per-row parameters live — on a **different row**,
while:

1. the row has its own populated cell in that same column, and
2. another row on the sheet with the **same formula shape** reads its
   own row's cell in that column.

Then the row is anchored on its sibling's switch. The finding names
the row, the switch it reads, the switch it owns, and the sibling that
does it the other way. It is an error-tier finding: a wrong reference
that produces a plausible number is exactly the class a reviewer
cannot see by eye and the engine exists for.

The shape is the audit's own relative shape (references made
relative, numbers erased) with the anchored reference replaced by a
placeholder, so two rows compare equal when they differ only in
which switch they read. « Left-hand columns » is the reader's
`LABEL_COLUMNS` band, the same band the row tags are read from.

What it is not: a global switch every row reads (`$I$3` on all of
them) — no sibling reads its own, so nothing fires; a row that reads
another row's cell without owning one in that column — a lookup, not
a switch; a row with no like-shaped sibling — one row cannot be the
odd one out.

## Where it runs

An audit rule, `anchored-elsewhere`, folded one finding per row with
the cells as the roster, in the « Probable formula defects » family.
The golden master will change wherever the corpus carries the shape;
every change is read.

## Measures, fixed now

1. **The case**: GD3 `MainInputs!AU472:AY472` found; ET3's twin
   (`AU619`, which reads `$I$619`) not found.
2. **The golden master**: the 27-file corpus swept; every new finding
   read by hand — genuine (a sibling's switch), deliberate (the rows
   share a switch on purpose and one row happens to own a cell), or a
   reader artefact — up to thirty, seed 20260903 beyond that.
3. **The PR24 drafts** (16 files, one template): findings per file and
   the same reading on a sample of ten.
4. **The two project-finance models and the founder's model**:
   findings, all read.
5. **Cost**: the rule's time on the FHWA tool.

## Predictions, registered

- Measure 1: found and not found, as stated.
- Golden master: between 1 and 12 files gain findings; of the
  findings read, at least half genuine — a regulator's template
  copies rows and the anchor stays where the copy came from.
- PR24: under 5 findings per file; the sixteen copies agree on the
  count within ±2 (one template).
- Project-finance and founder: under 3 findings across the three.
- Cost: under two seconds on the FHWA tool.

---

# Results

*(appended after the round; nothing above this line changes)*

## Result — 3 September 2026

**Two deviations from the registration, both made while the rule was
being built against the registered case and named here.**

1. *The band.* The registration said « the reader's `LABEL_COLUMNS`
   band »; that band is eight columns wide and the GD3 switch sits
   in column I, the ninth. A second attempt took « every column left
   of the period axis » and lost the case again, because the GD3
   header row carries a date in column I. The band is now a fixed
   twelve columns (`SWITCH_COLUMNS`), and the sibling search reaches
   twelve rows either side (`SIBLING_REACH`). Both are constants a
   later round may have to move; neither was tuned on anything but
   the one case.
2. *The comparison.* The registration said « the audit's own relative
   shape with the anchored reference replaced by a placeholder ». The
   audit's shape keeps an absolute anchor absolute, so the GD3 row
   (`$AU$471`) and its sibling two rows down (`$AU$473`) never shared
   a shape. The rule compares the two formulas piece by piece
   instead: every reference in the sibling must be the same text, or
   the same column and anchoring with the row moved by the distance
   between the two rows — a copy, in the sense Excel's fill-down
   makes one. The claim in « The claim, fixed now » is unchanged; the
   test of « same shape » is what moved.

### Measure 1 — the case

| | Found | Cells | Tier |
| --- | --- | --- | --- |
| GD3 final `MainInputs!AU472` « RIIO-2 legacy Adjustment Factor phasing » | **yes** | AU472:AY472 (5) | error, weight 0.9 |
| ET3 final `MainInputs!AU619`, which reads its own `$I$619` | no | — | — |

The finding reads: « RIIO-2 legacy Adjustment Factor phasing » reads
the switch at I474, which belongs to « RIIO-2 legacy K Correction
Factor phasing », while its own switch at I472 is populated and
unread; the sibling row that does it the other way is named as the
evidence. The GD3 *draft* has no finding: the row is new at final,
as the truth-set round recorded.

### Measure 2 — the golden master

27 files swept under the rule and diffed against the baseline of
3 September (label-column cut). **One file changes**: the GD3 final
gains the one finding above. The other 26 report identically,
finding for finding. Findings to read: one; genuine: one. The
baseline is recut with this round (`corpus-golden-master.md`,
regenerations).

### Measure 3 — the PR24 drafts

16 files, **0 findings each**. Nothing to sample. The Ofwat template
keeps its switches on the inputs sheet as single cells that whole
blocks read, and no row owns a switch in the band that a sibling
reads instead.

### Measure 4 — the two project-finance models and the founder's

| Model | Findings |
| --- | --- |
| FHWA P3-VALUE 2.3 (782,093 formulas) | 0 |
| Packt companion model (2,973 formulas) | 0 |
| The founder's model | 0 |

### Measure 5 — cost

| Model | The rule alone |
| --- | --- |
| FHWA tool (registered) | 0.4 s (three runs: 0.46, 0.40, 0.39) |
| GD3 final, for reference | 2.3 s |

### Predictions, scored

- Measure 1 found / not found — holds.
- Golden master: 1–12 files gain findings — holds, at the floor (1);
  at least half of the findings read genuine — holds on one of one.
  The prediction's reasoning (« a regulator's template copies rows
  and the anchor stays where the copy came from ») was not borne out
  anywhere else in the corpus: the rule saw no second case in 27
  regulator files.
- PR24 under 5 per file, agreeing within ±2 — holds (0 everywhere).
- Project-finance and founder under 3 — holds (0).
- Cost under two seconds on the FHWA tool — holds (0.4 s).

### What the round decides

1. **The one independent cell-level defect the engine missed, it now
   finds**, in the error tier, with the sibling as evidence. Recall
   on that label is one of one and the number is that small.
2. **The rule's precision has one data point.** Across 27 regulator
   files, 16 Ofwat drafts, two project-finance models and the
   founder's model it fires once, on the case a person found. It is
   quiet, which is the right way for an error-tier rule to be wrong
   if it is wrong; whether it is *too* quiet — whether other models
   anchor on a sibling's switch in a way the copy test does not
   accept — cannot be told from a corpus in which the class occurs
   once. The registry line `riio3-gd3-maininputs-au472-switch` is
   its test, and any second case found by hand is the next.
3. **The constants are named, not proven.** A twelve-column band and
   a twelve-row reach hold the one case; a model whose switches sit
   further right, or whose like-shaped sibling sits further away, is
   outside them by construction.
