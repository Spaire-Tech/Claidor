# The clone, step by step — the engine side

20 August 2026. The division of labour: the founder builds every
surface (workspace UI, Excel panel, trace tree, compare view, app
viewer). I build everything underneath, UI-less first, each piece
ending in an API the UI can bind to. The feature map against
Tracelight is `tracelight-parity.md`; this is the build order, step
by step, with a « done when » for every step. No step is done until
its « done when » test passes.

The two foundations come first — the **write path** (Track A) and
**recalculation** (Track B) — because five features queue behind the
first and four behind the second. Tracks C and D need neither and run
in parallel whenever a foundation step is blocked or slow.

---

## Track A — the write path

*Writing cells into a real workbook without breaking anything.
Unlocks: changeset, Fix all, agent, charts-into-sheets, styles,
PDF-into-cells.*

**A1. Cell replacement, honest and tested.** Grow the defect
planter's XML surgery into `polar/tieout/writer.py`: open the xlsx
zip, replace an existing cell's formula and/or cached value,
preserving its type attribute, style index, and everything around it.
Done when: a no-op rewrite is byte-identical to the original on all
27 lab files, and a one-cell edit changes only that cell's bytes.

**A2. Cell and row creation.** Write into a cell that does not exist
yet: insert `<c>` in column order inside its `<row>`, create the
`<row>` in order if missing, extend the sheet's dimension, inherit
the column/row style if one exists. Handle strings (inline or shared
table), numbers, booleans, dates (with a date number-format). Done
when: writing a small table into an empty region reads back correctly
in openpyxl AND opens clean in LibreOffice.

**A3. Shared formulas unshared safely.** Editing a member of a shared
formula group corrupts its siblings; the writer must expand the group
to plain formulas first (the master's formula re-offset per member —
`_offset` logic in reverse). Done when: editing one member of a
shared group leaves every sibling computing the same value, verified
by recalculation once B1 lands (until then: verified by formula-text
comparison).

**A4. The changeset.** A recorded list of edits: sheet, ref, before
(formula, value, style), after, when, why (free text), and which plan
produced it. Apply a changeset atomically (all or none), produce its
inverse for undo, store it beside the model version. Done when:
apply → undo round-trips to a byte-identical file, and the changeset
JSON is the contract the founder's « Changes » button renders.

**A5. Fix all — the first consumer.** Mechanical fixes generated
straight from findings: delete dead defined names, delete the empty
very-hidden sheet, add missing `$` anchors where the family pins.
Each fix is a changeset the user approves; nothing applies silently.
Done when: running Fix-all on the founder's test file removes the
fixable findings and the re-audit confirms nothing else changed.

**A6. calcChain and volatile hygiene.** Delete `calcChain.xml` on any
formula write (Excel rebuilds it), mark the workbook dirty for
recalc, keep defined names and prints untouched. Done when: an edited
file opens in Excel/LibreOffice with no repair dialog on every
corpus file we can test.

---

## Track B — recalculation

*Running the model after a change, headless. Unlocks: agent verify,
computed changes, scenario apps, behavioural checks.*

**B1. The headless runner.** LibreOffice headless in a container:
open a workbook, force a hard recalculation, save, read the new
cached values with our reader. One function:
`recalculate(path) -> path`. Done when: a workbook with a changed
input comes back with changed downstream cached values.

**B2. The fidelity harness — measure before trusting.** LibreOffice
is not Excel. Recalculate all 27 lab files *unchanged* and diff every
recalced value against Excel's own cached values. Per file: the
match rate and the functions that diverge. This is the golden-master
discipline applied to the calculator. Done when: the fidelity report
is committed and every later feature checks it — a file whose
fidelity is poor gets scenario/verify features disabled with an
honest message, never wrong numbers.

**B3. The flex pass — behavioural checking.** Tracelight's best
trick, built on B1: change one input, recalculate, record which
outputs moved. An input that moves nothing is a dead input (or a
hardcode shadowing it — the 240,000 class, caught behaviourally). An
output that moves is the input's true dependency set, cross-checkable
against the static graph (D1). Done when: on the founder's test file,
flexing monthly capacity exposes the 240,000 hardcode with no static
rule involved.

**B4. The lattice runner.** N chosen inputs × chosen ranges → run
the grid headless, collect chosen outputs into one JSON. Interpolation
is the viewer's job and must be labelled; every grid point is a real
recalculation. Done when: a 3-input × 5-step lattice on a corpus
model produces the JSON the founder's app viewer renders, unattended,
with a fidelity gate from B2.

---

## Track C — Compare (no foundations needed; runs in parallel)

**C1. The raw cell diff.** Two versions in, differences out: cells
added, removed, formula changed, value changed, sheets added/removed.
Done when: diffing two adjacent ED2 corpus versions returns a list a
human confirms complete against Excel's own compare.

**C2. Shift detection — the real product.** An inserted row must
read as « row inserted at 14 », not 4,000 changed cells below it.
Align rows per sheet by content hash (LCS), then diff within the
alignment; same for columns. Done when: a synthetic insert-one-row
test yields exactly one structural change, and the ED2 pair's diff
shrinks accordingly.

**C3. Fold and rank.** One fill edited across 40 columns is one
change; formula-logic changes rank above value changes above
cosmetics. Reuse the folding vocabulary from the audit. Done when: a
400-raw-change pair reads in one screen of grouped entries.

**C4. « What the change broke ».** Audit both versions, diff the
findings — introduced / fixed / unchanged. This is `corpus_gate.py`
promoted from script to service, with the same order-insensitive
matching. Done when: the PR24 revision pair reproduces its 84
introduced defects through the service API.

**C5. Computed changes.** Qualitative now: input diffs propagated
through the dependency graph (D1) name which outputs are affected.
Quantitative after B1: recalculate both versions, report output
deltas. Done when: the ED2 pair shows « these 3 inputs changed →
these 12 outputs moved, by this much ».

**C6. The Compare API.** One endpoint: two file ids in, the full
graded diff JSON out (structure changes, grouped edits, broken/fixed
findings, computed changes when available). Done when: the founder's
compare view renders from it with no further backend work.

---

## Track D — the graph and Trace (parallel)

**D1. The dependency graph as a stored object.** Per model version:
every cell, its precedents (we compute them today per formula), and
the reverse index (dependents). Ranges folded, INDEX/lookup reads
kept as their own edge kind. Budget: a 400k-formula BPFM must build
in minutes and answer « what depends on X » instantly. Done when: the
graph for the biggest corpus file persists, loads, and both
directions answer in under a second.

**D2. The Trace API.** From any cell: the precedent tree (depth-N,
ranges folded, labels attached from `structure.py`, value and formula
per node) and the dependent tree. JSON shaped for the founder's tree
UI with keyboard navigation. Done when: DSCR-style walks on corpus
files return labelled chains matching hand-checks.

**D3. Formula explanation.** One endpoint: cell in, plain-words
explanation out — the LLM writes over our labels, precedents and
values, never inventing numbers (every figure in the text must come
from the payload). Done when: explanations for 20 sampled corpus
formulas contain zero numbers not present in their cells.

---

## Track E — documents and PDF citations

**E1. Figure extraction with coordinates.** PDF in → every number
with its page, position, and nearby words. The Dumfries grounding
work generalized past contracts. Done when: a yield-report-style PDF
yields « P50 = X, page 22 » with coordinates.

**E2. The fact store.** Extracted figures stored per project with
their citations; the source-viewer contract is « fact id → page +
highlight box ». Done when: the founder's right-hand source panel
renders from it.

**E3. Write-with-citation.** Drop data into the sheet (via Track A)
with each written cell carrying its fact id in the changeset
metadata — the chain from cell to page survives forever. Done when: a
written cell can answer « where is this from? » through the Trace
API.

**E4. The grounding map.** Model inputs matched to document facts;
unmatched inputs become the « no document supports this number »
finding class. Done when: measured on a real model + document set
with a registered sample, like everything else.

---

## Track F — the agent (last, on top of everything)

**F1. Revive the agent harness.** The legal build's agent (tools +
persisted runs) re-pointed at this product. Tools, all read-only at
first: read cells, search labels, run audit, walk the graph, read
facts. Done when: it answers model questions through the same APIs
the UI uses, with its run persisted.

**F2. Plan mode.** A requested change becomes: a plain-words plan,
the exact proposed changeset (Track A format), and the blast radius
from the graph (Track D). Nothing executes. Done when: « change the
loan rate to 8% everywhere it applies » produces a correct reviewable
changeset on a corpus file.

**F3. Execute and verify.** Apply the approved changeset (A4),
recalculate (B1), then the machine checks its own work: Compare
confirms only the planned cells changed (C1), the audit confirms no
new findings (C4), computed changes report what moved (C5). The
verify strip is the product. Done when: the loop runs end-to-end on
a corpus file and a deliberately-sabotaged changeset is caught by
its own verify.

**F4. Skills and instructions.** Stored per firm: conventions,
naming, layout habits — injected into plan generation; « / » menu
content is just this store listed. Done when: the same request under
two skills yields two convention-correct plans.

**F5. Web search, charts, exports.** Search as an agent tool; tables
and charts written into sheets via A; deck/doc export through the
existing pptx and docx writers. Each one done when its output opens
clean in the target application.

---

## The order I work, restated as one list

1. A1 → A2 (write path core)
2. C1 → C2 (compare core — while write-path tests run on the corpus)
3. A3 → A4 (shared formulas, changeset)
4. D1 → D2 (graph, trace API)
5. A5 → A6 (fix-all, file hygiene)
6. B1 → B2 (runner, fidelity harness — the gate for everything after)
7. C3 → C4 → C6 (compare finished, API out)
8. B3 (behavioural flex) → C5 (computed changes)
9. D3, E1 → E4 (explanations, documents)
10. F1 → F2 → F3 (agent: read-only → plan → execute-verify)
11. B4 (lattice) + F4/F5 (skills, search, charts, exports)

Each numbered pair is roughly a week of focused work; the honest
total is a quarter-plus, front-loaded so that every fortnight ships
something the UI can bind: changeset JSON, compare JSON, trace JSON,
fidelity report, verify strip.

## The standing rules, unchanged

Every track gets the same discipline the audit engine got: a harness
before a feature (byte-round-trip for A, fidelity for B, the ED2
pair for C), registered measurement before any claimed number, and
no silent capability — anything the machine cannot do, it says so.
