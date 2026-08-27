# Swens — the product overview

*(Positioning document, written in the finished-product voice at the
founder's request, 27 August 2026. The founder's `swens.md` remains
the document of record for the build; where they disagree, `swens.md`
wins until the founder says otherwise. Numbers quoted here are real
measurements from the engineering record.)*

---

## Swens

Swens is the model review platform for finance. It is the only
review system that does not merely read the financial model behind a
deal — **it runs it**, natively, thousands of times, and lets the
model testify about itself.

## 1. The whole thing in one sentence

Every deal rests on a spreadsheet, and every way of checking that
spreadsheet today — a colleague's read-through, a £35,000 model
audit, every piece of software ever published on the problem —
inspects the file as a document. Swens executes it as a program:
reads its structure the way an auditor does, recalculates every cell
and proves the stored numbers are honest, runs the model under
thousands of perturbed scenarios to discover the laws it lives by,
finds where those laws break, ties every typed input back to the
contract page it came from, checks the decks built on top, and keeps
the whole picture current as versions change.

The key word is still review. Swens never builds the model and never
writes the deliverable. That is the point, not a limitation.

## 2. The limitation Swens removes

Thirty years of spreadsheet-error research produced a shelf of
checkers, and every one of them — like every human reviewer — has
the same ceiling: **they read the file.** They parse formulas, group
cells that look alike, and flag the odd one out. A formula can look
perfectly consistent and be wrong; a model can pass every visual
inspection and collapse the first time an input moves.

The evidence for that ceiling is now public and quantified. An
independent 2026 benchmark of AI systems on financial models, graded
by finance professionals, found the machines score 50–68% when asked
whether a formula *reads* correctly — and 15–37% when asked what
happens when the model *runs*. A thirty-point canyon between
inspection and execution, measured by people with no stake in us.
The defects that live in that canyon are the expensive ones: the row
that points one line too high and is perfectly self-consistent; the
tax rate frozen to period one; the constant buried in a formula's
tail; the branch that can never fire.

Moving from static inspection to live native execution removes the
most damning limitation of both human reviewers and existing
software. That is Swens's position, and it is defensible because the
prerequisite is brutal: before you may run a model in judgment, you
must prove your engine reproduces it. Swens's recalculation engine
was certified against the model's own stored results across **3.86
million cells of real regulator and infrastructure models — 99.88%
reproduced exactly, and every exception assigned to a named cause.**
A model the engine cannot reproduce is refused, in words — never
quietly judged.

## 3. What execution unlocks — the checks nothing else can run

**The behavioural laws.** Every model must obey laws of its own
arithmetic. Set volume to zero and revenue must be exactly zero.
Double every price and revenue must double. Restate pounds as cents
and every ratio must be unchanged. Segments must sum to their
consolidation. Swens perturbs the real file, recalculates it
natively, and convicts the cell that breaks the law. In measured
trials on real models — defects planted with the answer key written
first — the behavioural checks caught **37 of 37 planted frauds,
each catch naming its exact cell, with zero false alarms on the
clean copies.** This is how a hardcode invisible to any reading gets
caught, guaranteed, without Swens ever knowing what the right answer
was supposed to be.

**The model's own rulebook, discovered.** Run the model a few
hundred times with assumptions randomised — quantities scaled,
switches respected — and watch which relationships never break.
What survives is the model's own specification, written in its own
row labels: *Total costs = COGS + Opex + Maintenance. EBITDA =
Revenue − Total costs.* Forty or eighty lines for a real model,
discovered rather than typed, with nobody asked to specify anything.
Each mined law is then a standing check, and each break is a finding
with a receipt: *this identity held everywhere except period 10.*
When a law breaks, a diagnosis layer computes the smallest set of
cells that explains everything observed — one authoring decision,
one finding, as mathematics rather than craft.

**The dead and the inert.** Execution answers questions structure
cannot: the assumption that changes nothing anywhere in the model;
the reference that exists in a formula but never carries anything.
*"This input does nothing"* is a one-sentence finding no commercial
tool ships, and a category of quiet rot in long-lived models.

**Versions compared by behaviour, not position.** When version 12
arrives, Swens aligns it to version 8 row by row — surviving
inserted rows, moved blocks and renamed sheets (planted-edit
recovery: **42 of 42 structural and value edits recovered exactly**)
— and reports the delta in review language: which defects are new,
which were repaired, which assumptions moved, which methodology
changed, which line was quietly renamed, what moved materially. Then
it goes further than any diff can: it compares the two versions'
*discovered rulebooks*. The report reads: **"Version 12 obeys all 47
laws version 8 obeyed, adds 2, and broke 1: cash closing no longer
ties to its flows in periods 14 and 15."** Not "1,847 cells
changed" — a sentence a credit committee acts on, immune to
reshuffling by construction, because behaviour has no coordinates.

## 4. The product, part by part

Six parts: the Engine, the Chain, the Watch, the Grid, Chat, and the
Excel panel.

### a) The Engine

Reads the workbook the way an auditor does — time axis, sections,
carries, debt schedule, with cited evidence and honest silence where
it cannot tell — then runs four families of checks over that
structure:

- **Structural**: typed-over formulas, hardcodes in formula tails,
  sums that skip rows, frozen and broken references, totals that
  quietly disagree with their siblings, typed cells sitting on the
  edge of a formula family.
- **Financial**: the conservation laws — balance sheet balances,
  cash carries hold, debt amortises to zero where it claims to.
- **Unit**: what each number *measures* — monthly vs annual, percent
  vs decimal, thousands vs millions — read from the labels, checked
  through the formulas.
- **Behavioural**: the execution checks of § 3, gated by the
  fidelity proof.

The disciplines are non-negotiable and unchanged: one authoring
situation, one finding; never match on values; never guess between
close candidates — abstain and say so; always print the denominator
("102 checked, 26 not, here is why"). Findings speak like a banker:
what, where, why — and every claim in every report traces to a
measured, pre-registered number. The measurement culture is itself a
product feature: every detector's catch rate and false-alarm price
is published per defect class, measured on defects seeded into real
models with the criteria committed before the results were seen. No
firm in this industry publishes such a table.

### b) The Chain

Three kinds of number, three checks. Calculated numbers belong to
the Engine. **Typed numbers** are linked back to the page they came
from: ask where 4.35% comes from, and the answer is a page of the
credit agreement with the figure highlighted — extraction is
citation-grade, every number carrying its page and its exact
position on it, scanned pages refused in words rather than guessed.
Swens proposes links only where labels agree — never by matching the
value, which proves nothing — and a person confirms; a confirmed
link is arithmetic forever after, surviving revisions of both model
and document. The confirmed map is the compounding asset: keep the
chain, drop the documents. A typed number with *no* confirmable
source is its own finding class — a number nobody can defend, and a
growing class as machines draft more of the work. **Numbers in
documents** — decks, memos, credit papers — are tied back to their
source cells and re-verified on every version; rounding-only drift
is labelled as rounding and ranked last. And **outward**: filings,
regulator publications, and rate sources answer the question no
internal check can — does this model agree with the world?

### c) The Watch

Re-checks every material version and reports § 3's behavioural
delta. It also catches the defect that changes class — the typed-over
cell "repaired" by restoring its formula with a late adjustment
hardcoded into its tail — which only a cross-version comparison can
see. When a version breaks something, delta isolation binary-searches
the changes: *"of the 400 changes between v8 and v12, these two
broke the balance sheet."* The Watch extends to documents: the model
moved and the deck did not is a finding, not a formatting note.

### d) The Grid

Every finding with its rule, cell, evidence, severity and state —
filterable, sortable, and governed by the firm's own house rules:
materiality, rounding tolerance, checks on or off (never silently —
the record shows what was disabled and by whom). False positives are
treated as defects in Swens itself: a check that cannot be made
quiet does not ship, and the quietness is measured, not asserted.

### e) Chat

Anchored to the model in front of you, answering from the structure
map, the graph, the chain and the watch: why did DSCR fall between
versions; what feeds equity IRR; where does this number come from;
every hardcode in the debt schedule above materiality. Every number
in an answer cites a cell or a page. Questions outside the model are
declined — a chat that ignores the file is a worse version of free
tools.

### f) The Excel panel and determined corrections

Findings appear beside the cell, in Excel, with accept/explain on
the record. Corrections follow one rule: **determined, never
inferred.** Swens proposes a fix only when the model itself already
states the answer — the deck figure that must equal the model's
number, the formula the surrounding block declares, the sum range
the structure defines, the unit conversion the labels determine, the
stale figure whose confirmed source moved. Every proposed correction
produces a real new version of the file — byte-surgical, reversible,
re-audited by a hard gate before it is offered, held in Swens's
custody, released only on a person's acceptance. And the review
itself travels: Swens hands back a **marked-up copy of the model** —
findings painted into the cells, severities coloured, notes signed —
that opens in Excel like any other file.

## 5. Why the findings can be trusted

The four commitments, unchanged and load-bearing: Swens never
re-derives a number to judge it (the engine that recalculates must
first reproduce, and refuses what it cannot); judgement is never
summed with arithmetic; every refusal names what was missing; every
claim carries a measured, per-class, pre-registered number. The
engineering record behind this document is public discipline turned
inward — protocols committed before results are looked at, rounds
refused by their own criteria on the record, and an answer sheet
(the golden master) that no change may silently move.

## 6. Independence is the product

Swens never authors the thing it reviews. No model building, no deck
writing, no memo drafting — because the moment it writes a model it
can no longer be the check on one. Determined corrections do not
cross the line: they carry a value from where the model states it to
where the model contradicts it; authoring is choosing what the
answer should be. As machine-drafted models multiply, the
independent reviewer that provably cannot mark its own homework is
not a philosophical stance. It is the reason the product is
purchasable.

## 7. How Swens is sold

The demo is the product: a prospect's own two versions in, the demo
out within a day, hands off — the flagship findings first (the
balance sheet that does not balance; the law their own revision
broke; the number traced to page 187), routine findings never the
opening. Priced per deal, on the transaction budget, approvable by
the person with today's problem; packs bridge to firm-wide; land on
the deal, expand to the firm, never the other order. Deals are
closed by default — being at the firm grants nothing, not even the
deal's name; being on the deal grants everything. Where Swens reads
a firm's store, it writes to nothing.

## 8. The moat, restated

1. **Reading models properly** — years of structure recognition,
   collapse discipline, and flood-killing across real regulator and
   infrastructure corpora. This was always the moat.
2. **The proven executor** — the certified recalculation engine and
   its fidelity gate. Every mined law, every behavioural conviction,
   every equivalence claim stands on it, and it does not exist
   anywhere else in this industry.
3. **The chain through transformation** — contract page to typed
   cell to formula to slide, surviving revision on both ends.
4. **The measurement culture** — per-class catch rates, published
   false-alarm prices, pre-registered protocols. Trust, engineered.

The sentence under all of it:

> Thirty years of spreadsheet-error research, and every published
> tool reads the file. Swens is the only one that can run it.
