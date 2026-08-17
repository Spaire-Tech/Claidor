# How Antford Checks a Model

The questions a diligent investor or customer will ask, answered the way
the engine actually works. Every claim on this page corresponds to code
in this repository and to measurements recorded in
`docs/pierce/analytical-checks-protocol.md` and the worklog; nothing
here is aspiration written in the present tense.

## Is an AI reading my model?

No — and in this market that is the design decision everything else
follows from. Every finding Antford shows is **deterministic
measurement**: arithmetic over the file's own contents, reproducible
bit-for-bit. The same file produces the same findings every time,
findings never vary with a model's mood, and no language model sits
anywhere in the path that produces them.

A language model exists in exactly one place: the chat that *explains*
findings after the engine has produced them. It is grounded — it reads
the engine's stored findings, chains and named cells through typed
tools, and it can only discuss what was already measured. It cannot
create a finding, change one, or touch a number. If the chat were
deleted tomorrow, every finding would be identical.

This is the answer to "LLM-based, heuristic, or hybrid?": the checking
is deterministic and cited; the explaining is an LLM constrained to the
engine's own output. Customer models train nothing and are dropped
after reading — the extracted rows are kept, the document is not.

## What does it actually read?

The reader opens the workbook the way Excel wrote it and keeps, for
every cell: the cached value Excel itself last calculated, the formula,
the row's own label and the column's own header, and the cell's
precedents — every reference expanded to individual cells, ranges
included. It also keeps what the workbook hides (hidden and
very-hidden sheets), whether iterative calculation is declared, and
dates as the serial numbers Excel stores them as. Legacy `.xls` files
go through a second reader to the same shape.

Two things follow from "precedents, expanded." The dependency graph is
**exact**, not inferred — so "this cell flows into Opex total → Net
cashflow → Equity IRR" is a walk over real edges, and the provenance
chain under a figure is the model's actual arithmetic. And inverting
the same edges gives exact dependents, which is how a finding can say
what a defect touches.

## What does "learns the model's conventions" mean?

Not machine learning. **Per-model measurement**: the engine derives
each model's own conventions from that file alone, at read time, and
judges the model against itself. Concretely:

- **Its vocabulary.** Findings speak the model's own row labels and
  period headers ("Opex FY2032", "Total Senior Debt Service") because
  the reader kept them — nothing is renamed into our taxonomy.
- **Its time axis.** Each sheet's period columns are found from its own
  headers; where a sheet has none, sentences fall back to coordinates
  rather than guessing years.
- **Its history boundary.** The boundary between typed actuals and
  calculated forecast is found per sheet from where the columns
  themselves switch. Typed history is never flagged as a hardcode —
  the false positive that would otherwise fire on every model on earth.
- **Its declared intentions.** Circular references are reported only
  when the workbook has *not* switched on iterative calculation — all
  four Damodaran valuation models we hand-read carry deliberate
  circularity and declare it in the file, and the engine respects that.
- **Its own checks outrank ours.** When a model carries its own check
  rows and one fires, our overlapping identity check yields to it —
  the model's own sentence is kept and ours is dropped, not stacked.
- **Its own scale.** Materiality is relative to the workbook's own
  median cell magnitude, so a rounding echo in a billions model is a
  smell, not a siren.
- **Its own conventions of pricing.** The interest self-consistency
  check derives the model's implied rate convention from the model's
  own tranches and only speaks on a factor-of-three departure from it.

## Where do the rules come from?

Every construction rule is stated in at least two published standards —
the FAST Standard, the ICAEW *Twenty Principles for Good Spreadsheet
Practice*, SMART, Operis's audit method, and the EuSpRIG disaster
catalogue — and every finding cites its source, so "says who?" never
answers "the tool." Where those standards prescribe something a machine
cannot verify (whether an assumption is commercially reasonable), the
rule is deliberately absent rather than approximated.

Findings are graded and never pooled: an **error** is wrong however the
model is used; a **smell** is a departure from standard that is often
deliberate. The two are never added into one scary number.

## Why won't it cry wolf?

Because false positives, not recall, are what we measured against real
models — and every exemption in the engine was bought with a hand-read.

- **The traps are tested.** Our ground-truth fixture plants nine known
  defects *and eight structures that look like defects and are not* —
  a typed history, an anchored series start, a terminal year that
  computes differently. The test suite requires all nine found and all
  eight left alone; loosening any rule breaks the build.
- **One decision, one finding.** A formula filled across a grid fires
  once per cell it touched. On a real base-cost model from the 2024
  water price review, one 625-character formula produced 7,752 of the
  file's 8,017 raw findings. The engine collapses fill-copied breaks to
  one finding carrying its span ("filled across FY2014–FY2033"): on our
  founder-tested file, 214 raw hits became ten authoring decisions.
- **Innocent numbers are innocent.** Sign flips, percentage conversions,
  month counts and unit constants are never "hardcoded assumptions."
- **Below-scale echoes stay quiet**, per the materiality rule above.

## What happens when it can't tell — or gets structure wrong?

It abstains, visibly, instead of guessing. This is the answer to "what
happens when structure detection fails," and it is a ladder:

- A file it cannot read is kept with a sentence saying why and what to
  do — never "extraction failed."
- A sheet without a recognisable period axis gets findings in
  coordinates; no year is ever invented.
- The one-step evaluator computes "what the row would calculate" only
  inside a whitelist of forms it provably handles; outside it, the
  finding keeps its structural sentence and claims no number.
- A values-pasted model (formulas stripped) is detected and said out
  loud; the construction rules that are blind there are listed as
  **checks that did not run**, with reasons — silence is always
  distinguishable from "checked and clean."
- Every finding ships its evidence underneath — the formula, the cell's
  neighbours in a real grid, the flow — so a person can overrule it in
  seconds. Dismissals persist across re-checks; accepting requires a
  note that stays with the model.
- The one write we make into a workbook (restoring a row's own formula
  over a typed value) re-reads the corrected copy and compares **every
  cell** against the original; one cell changed exactly as asked, or
  the write is refused whole and the original stands.

## What is actually measured?

| What | Result | Method |
| --- | --- | --- |
| Evaluator agreement with Excel | **99.9985%** of 6,076,269 formula cells (worst model 99.995%) | Every formula cell with a cached value in the corpus is a test case; acceptance bar (99.5%) registered *before* results; disagreements hand-read and their one cause named in the protocol |
| Evaluator coverage | 91.4% claimed, the rest abstained | Abstentions counted, never inflated into claims |
| Ground-truth fixture | 9/9 planted defects found · 0/8 traps flagged | Fixture and assertions live in the test suite; they cannot drift apart without a failing build |
| Workbook writer | Cell-by-cell verification on every fix | Corrected copy re-read by the same reader; any drift beyond the target refuses the write |
| Corpus | 16 regulated-water-company models (Ofwat PR24 draft determinations), 6 UK PFI/PPP project models (Scottish Futures Trust), 4 Damodaran valuation models hand-read | Real files, third-party authors, wildly different conventions |

All 427 engine tests run on every change.

## What we do not claim yet

Diligence should push here, so here is where pushing lands:

- **No external labelled benchmark.** The academic corpus (EUSES /
  CUSTODES) is not reachable from our build environment; our precision
  evidence is seeded defects plus recorded hand-reads, not an
  independent benchmark. This is the top of the measurement backlog.
- **Recall is demonstrated on seeded defects**, not proven on an
  exhaustive labelled set — no honest tool in this category can claim
  the latter today.
- **Values-pasted models** limit the construction rules to what values
  can show; the statement-level checks still run, and the product says
  exactly which checks did not.
- **The interest check is armed but conservative**: on the current
  corpus it judged zero tranches rather than lower its gates — every
  abstention is named. It needs a lender-case model in the corpus.
- **Numbers in images** (scanned tables in PDFs) are not read.

One sentence to keep: **the engine never asserts what it cannot show,
and everything it shows, you can reproduce.**
