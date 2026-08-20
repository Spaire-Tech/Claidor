# The platform: Cursor for financial projects

Decided 20 August 2026. This document records the change of direction,
the five products, the build order, and the rules we agreed for
building the platform shell ahead of the engine. The engine itself is
documented in `engine.md`; this is the company that gets built around
it.

## The pivot

Antford stops being « Vanta for financial models » (a checking tool
used at milestones) and becomes « **Cursor for financial projects** » —
the workspace and intelligence layer for project finance, with the
financial model as the core computational layer and the audit engine
as the technical foundation.

The correction that matters: the organising unit is the **project**,
not the model. A project holds every version of the model plus the
documents it draws from — term sheet, PPA/offtake, EPC contract,
concession agreement, yield report, information memorandum, and the
base case declared at financial close.

## Why project finance

- **The model does not die at close.** The Dumfries contract we tested
  against contractually defines a Pre-Adjustment and Post-Adjustment
  Financial Model and a Logic Adjustment process — the parties expect
  the model to be reopened and re-agreed across twenty-five years. The
  workspace is a subscription that exists **by contract**, not by
  invention.
- **Many parties, long life.** Sponsor, lender, model auditor, public
  authority, asset manager — across construction, operations,
  variations and refinancings, for decades. A valuation firm's DCF is
  finished and filed; a PF model is a workspace market.
- **A mandatory recurring deliverable.** The quarterly DSCR compliance
  certificate must be generated from the model and submitted to
  lenders for the life of the debt. That is retention that does not
  depend on anyone's enthusiasm.
- **Built-in distribution.** The lender receives Antford output every
  quarter for twenty years — the bank becomes the next customer
  without a sales call.

## The five products

1. **Platform** — the project workspace: versions + source documents +
   the grounding map between them. The system of record. (It is not a
   final product to build; it is what the ladder below accretes into —
   the minimal container arrives with Compare and Trace.)
2. **Excel agent** — not chat-with-Excel: size debt to the binding
   constraint, sculpt to a target DSCR, resolve IDC circularity, add a
   tranche, fund/release a DSRA, layer a tax-equity flip. **Plan mode
   is the default, not an option** — nobody lets software silently
   rewrite a debt schedule a bank is lending $150m against.
3. **PPT/Word deliverables** — lender presentation, credit paper,
   auditor response schedule, base case certificate, funds flow, and
   the quarterly compliance certificate.
4. **Spreadsheet apps** — live scenario tools for credit committees
   and lenders. The sharp pain: **sponsors hate sending the model
   file**. A working scenario tool without the workbook is the one
   product a buyer would call new rather than better.
5. **Model Review** — the wedge. Free, first, zero setup on a
   stranger's file. The entrance, not the building.

All five are queries or actions against the same understanding of the
project: audit (« is it wrong? »), diff (« what changed? »), trace
(« where did this number come from? »), agent (« change it »),
scenario (« what if? »), deliverables (« report it »), compliance
(« certify it »). One engine, progressively exposed. The LLM is not
the moat; the financial-model representation is.

## The build order (agreed with the mentor)

Each rung is sellable on its own and makes the next one cheaper:

1. **Review** — structurally near done (see the numbers below).
2. **Compare Workbooks** — which cells/formulas/values changed between
   v12 and v13, and what the changes broke (audit both, diff findings
   — `corpus_gate.py` repurposed). Nearest new product; weeks not
   months, on the existing reader.
3. **Trace** — model → formula → assumption → source document, with
   the document grounding built on the contract-to-model work.
4. **Project Finance brain** — DSCR, debt sizing, sculpting, DSRA,
   waterfalls, cash sweep, IDC, gearing, tax equity, refinancing,
   covenants. This is where Antford becomes a financial-model engine
   rather than an Excel analysis tool.
5. **Review v2** — the feedback edge: once the PF brain exists, Review
   is reopened as the world's best *project-finance* model reviewer —
   the one that catches a DSRA releasing a period early. (Today's
   Review is structural; that finding is semantic. Review must not be
   marked complete and filed.)
6. **Scenario apps** — v1 is a **precomputed scenario lattice**: real
   Excel computes the grid offline across chosen slider ranges; the
   app is a viewer over Excel-computed numbers. No home-built
   calculation engine, no guessed numbers, and the sponsor still never
   sends the file. Live recalc is a company-sized project deferred
   until the lattice stops being enough.
7. **Excel agent** — last, Plan-mode-only, on models it also audits,
   with Antford underneath it so it is not guessing what the
   spreadsheet means.

### Three standing refinements

- **The door opens at rung 1, not rung 7.** The teardown piece («
  sixteen published regulator models, one revision cycle, 84 new
  mechanical defects » — our own PR24 measurement) plus a free upload
  ship while Compare is being built. Every rung produces both a
  feature and a piece of writing that brings the next customer in.
- **The PF corpus is the long pole for rung 4 — start collecting
  during rungs 2–3.** The engine's grammar was earned one judged
  false positive at a time on real files; the PF brain must be built
  the same way: real PPP/PFI disclosures, public-authority models,
  Dumfries-family documents — with the same gate, registered
  measurements, and verdict discipline. Never from a textbook list of
  terms.
- **Measurement culture transfers.** « Did the agent's edit break
  anything » is the corpus gate run on before/after. Nobody else will
  publish agent-edit safety numbers, because nobody else built the
  discipline. That moat moves with us.

## Where the engine honestly stands against the five products

| Product | Distance | The gap |
|---|---|---|
| Model Review | shipping | Structural checks measured at 80.1% A+B on unseen models, 2.9% FP; **zero PF-semantic checks yet** (no DSCR/sculpt/DSRA/waterfall) |
| Compare Workbooks | weeks | Reader parses both files today; diff is small; « what broke » is the gate |
| Trace | a quarter | `references_of` + `structure.py` labels give the precedent walk; document grounding extends the contract work |
| Excel agent | long | Needs a write path (the planter's cached-value-preserving XML surgery is a seed) and trust: sculpting to 1.35x means computing over the model |
| Scenario apps | the mountain, deferred | Live out-of-Excel recalc of arbitrary models = building a spreadsheet calc engine (IDC circularity, arrays, 400k cells). Hence the lattice v1. |

The demo story (the « Maya » journey — free upload finds a DSRA
releasing early, then trace, then diff, then the workspace) is the
**destination**, not the current product. Until rung 5, the wedge is
sold on what it demonstrably finds: torn references, overwrites,
hand-keyed values in calculated series, buried assumptions.

## The platform shell — agreed way of working

The founder builds the whole platform UI first — all five surfaces,
with placeholders and empty states — and the engine fills it in rung
by rung. Agreed rules so the shell stays an asset and never becomes a
fiction:

1. **Real and placeholder are labelled, ruthlessly** — in the code, in
   the UI, and in any demo. A placeholder shown to an outsider as
   working product is the kind of misleading we don't do to customers
   any more than to each other.
2. **Review is first-class and real from day one** — it is the only
   surface that works on a stranger's file with zero setup, and the
   free door hangs off it.
3. **The shell follows the graph, not the other way round.** The
   project graph (documents → model versions → changes → decisions →
   deliverables → scenarios → monitoring) is the architecture; the UI
   is a view of it. When shell and engine disagree about shape, the
   engine's representation wins.
4. **Each rung replaces its placeholder the week it lands** — the
   shell is a contract for integration, not a museum of empty states.
5. **Empty states are written as product copy** — a good empty state
   says what will live there and why it matters (« every quarter, the
   compliance certificate for lenders is generated here »), which
   makes the shell itself a sales artifact.

## Division of labour, next

- Founder: the platform shell (all surfaces, placeholders, empty
  states), per the rules above.
- Engine: rung 2 — Compare Workbooks on the existing reader — and, in
  parallel, the PF corpus hunt for rung 4, plus the teardown draft
  from the PR24 measurement.
