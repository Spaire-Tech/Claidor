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
