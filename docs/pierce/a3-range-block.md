# A3 candidate 5 — aggregation range vs block extent: the registered round

The mining round's last adopted candidate (`custodes-mining.md`,
verdict 5): « does the range match the data block the structure
layer sees (including text/void cells inside ranges) — an extension
of gapped-test/ED2-sum, not a new philosophy. » Registered before
the detector is implemented, before any plant is made, before any
result is looked at.

## The gap, located in the code before designing anything

`_skipped_cells` asks one question: what did the total leave **out**
above it. Nothing in the engine asks the opposite question — what
did the range wrongly take **in**. Every mention of double counting
in `audit.py` today is an *exemption* protecting the skipped-cell
check from accusing a correct total; not one is a detection. So the
range-versus-block question is genuinely unasked, and this round
asks the half of it that carries arithmetic consequence.

## The claim the check makes

**Class 1 — the double count.** A bare aggregation whose own-column
range contains a cell that is *itself* a bare aggregation over a
strict subrange of that same range, in the same column. Then the
subrange's members are added twice: once directly, once through the
subtotal. `=SUM(B5:B12)` where `B10` holds `=SUM(B5:B9)` is wrong
arithmetic however the model is used — an error, not a smell, and
the witness is entirely structural.

**Class 2 — the range that crossed a label.** An aggregation whose
own-column range spans a cell holding **text**. A numeric range
that reaches over a label has left its data block: either the block
boundary moved and the range did not, or the range was dragged too
far. Text only in this round — **blanks are deliberately excluded**,
because a blank inside a range is ordinary layout in every model we
have, and flagging it is the flood the mining round's own rejections
warn against. Named as the round's boundary, not an oversight.

## The detector (fixed now, implemented after)

Rule `range-over-block`, severity **error** for class 1 (wrong
arithmetic) and **smell** for class 2 (a departure that can be
deliberate). Membership: the aggregation is a single bare call —
`SUM`, `AVERAGE`, `COUNT`, `COUNTA`, `MIN`, `MAX`, `PRODUCT` — whose
arguments are same-sheet references, with at least one own-column
range spanning two or more rows.

**Guards, each registered before any measurement:**

1. *Class 1 needs a strict subrange.* The inner aggregation's rows
   must be a **proper non-empty subset** of the outer's, in the
   same column, and the inner cell must itself lie inside the outer
   range. An inner total whose range reaches outside is a different
   claim and stays silent.
2. *Class 1 ignores a self-referencing outer* — a cell inside its
   own range is the circularity check's business, not this one.
3. *Class 2 requires the text cell to sit strictly between two live
   numeric cells of the same range*, so a range whose head or tail
   merely touches a header is silent; and the text must not be a
   number stored as text (those are data).
4. *No values are read* — occupancy and formula structure only. The
   never-match-on-values rule holds.
5. *No double claim*: a cell already reported by `skipped-cell` or
   `inconsistent-total` at the same ref keeps that finding.

**The finding.** Detail names the outer formula, the inner subtotal
(class 1) or the text cell (class 2), and what the consequence is.
Catalogue entries in `RULE_NAMES` and `HEADLINES`, a `plain_words`
sentence, elevation confidence **0.9** for class 1 (the arithmetic
is visible in the two formulas) and the default smell grade for
class 2.

**Catalogue consequence, named now** per the lead's standing
request: this round adds **one** rule, taking the catalogue 19 → 20,
which Atelier's count-sensitive test will need — flagged the day it
adopts, not after.

## The measurement (fixed now)

**Precondition.** The full 27-file gate on the unmodified engine
must be clean before the change lands; it runs first and is the
formal certification for this round.

**Planted recall.** Harness `server/scripts/planting/range_block.py`,
committed with this registration, `--scan` built in. Seed
**20260829**. Same three hosts by the reuse rule, replaced by a
corpus-wide scan if they are unplantable — and if the corpus cannot
host either class, the candidate-3 precedent applies: implemented,
tested, unwired, written.

- *Class 1 plants:* rewrite a bare own-column aggregation's range so
  that it swallows a sibling subtotal that already covers part of
  it — the defect made, not simulated.
- *Class 2 plants:* extend a bare aggregation's range by one row so
  that it spans a cell holding text.
- Up to 5 sites per class per host, one plant per aggregation, no
  two plants sharing a row or column on a sheet; truth written
  before the engine sees the file; caught = ref or roster.

**False-positive price.** The full sweep with the detector live,
diffed against the baseline, every line hand-read at the cells with
a worth-showing / noise verdict.

## Adoption criteria (fixed now)

1. The gate diff contains only `range-over-block` additions; any
   existing finding that moves refuses the round.
2. Every new finding hand-read; at least two-thirds worth showing;
   no file gains more than 5.
3. Of the planted defects **no other rule catches**, the new rule
   must catch the majority — the marginal denominator, registered
   up front as candidate 2's lesson requires. Per-class numbers
   reported either way.
4. Tieout tests green. On adoption the baseline regenerates **in
   the same commit**, and the catalogue change is named in the log
   the same day.

## Prediction (written before running)

Class 1 catches its plants wherever the outer aggregation survives
as a bare call. On the unplanted corpus class 1 is **rare or
absent** — these are disciplined regulator templates, and a real
double count would be a live defect in a published model, which
would be a notable find rather than a routine one. Class 2 is the
riskier half: I expect it to fire more often, and the hand reading
decides whether « the range spans a label » is a defect or a layout
habit on real models. If class 2 floods, the round is refused and
class 1 is re-registered alone — the split is anticipated here so
that outcome is a planned branch, not an improvised rescue.

---

## Amendment (27 Aug, before any result): class 2 is not implementable

Class 2 cannot be built as registered, and the reason is structural
rather than a detail of my design: **the reader does not elect text
cells**. A cell holding « Second section » is absent from
`Workbook.cells` entirely — the reader elects a cell only when it
holds a number or a formula — so a detector standing on that
surface cannot tell « the range spans a label » from « the range
spans a blank », and blanks are excluded by this registration's own
words. Verified at the cells: a fixture with a text cell mid-range
returns `MISSING` for that reference.

Making it implementable means putting text cells into
`Workbook.cells`, which is **frozen interface #1** in `lanes.md`
and visible to every lane — a change that would move findings
across the whole engine. That is not this round's to make, and not
mine to make quietly.

So, per the branch this registration anticipated: **class 1
proceeds alone**, and class 2 is **withdrawn, not refused** — no
result was computed for it, and the distinction matters. The case
is routed to the lead in the log: class 2 becomes possible only
behind a reader change, which is its own registered round and, by
`lanes.md`, a lead-approved interface bump.

Everything else in the registration stands unchanged: the criteria,
the seed, the hosts rule, the marginal denominator. The catalogue
consequence is unchanged too — one rule, 19 → 20.
