# Building Tracelight: what we have, what we don't, what's hard

20 August 2026. The founder's decision: build Tracelight's feature
set first, then pick the vertical and add depth. The review engine
stays what it is — a fixed checklist that runs in seconds. This maps
their published onboarding guide, part by part, against what exists
in this repo. Three grades: **HAVE** (built, often measured),
**PART** (real pieces exist, product missing), **NO** (not built).

## The two foundations first

Nearly everything hard on their list reduces to two things we don't
have. Build these two and the rest becomes assembly:

1. **The write path.** Writing cells into a real workbook safely —
   formulas, values, formats preserved — plus a recorded changeset
   with undo. This unlocks: the agent, « Fix all », charts written
   into sheets, PDF-data-into-cells, exports. Seeds exist: the
   defect planter already does cached-value-preserving XML surgery,
   and the legal build shipped a round-trip-verified .docx engine —
   the same container format discipline.
2. **Recalculation.** Running the model after a change, without a
   human opening Excel. Their apps « calculate live » — they built or
   bought a spreadsheet calc engine. Our decision (in `plan.md`)
   stands: orchestrate **real Excel headless** instead of building a
   calc engine — it gives the agent's verify step, Compare's
   « computed changes », the scenario lattice, and Tracelight-style
   behavioural checking (flex an input, see what responds), all with
   numbers Excel itself computed.

## Their guide, part by part

### Surfaces

| Feature | Status | Notes |
|---|---|---|
| Web platform workspace | **HAVE** | The Antford workspace: models list, model page, check-a-model, settings, team, documents, chat. Being reshaped into the project-first shell now |
| Excel add-in | **HAVE** | Panel built against a real tenant: checks the open model, findings, open-the-cell, chat |
| Word add-in | **PART** | Forked and built in the legal phase; not yet re-pointed at this product |
| PowerPoint add-in | **NO** | The *engine* behind it exists (see Part 8) — the add-in shell doesn't |

### Part 1 — Chat that builds models

| Feature | Status | Difficulty | Notes |
|---|---|---|---|
| « Build me a model » from a prompt | **NO** | **HARD** | The agent. Needs write path + recalc + plan mode. Last on our ladder, deliberately |
| Chat that answers about a model | **HAVE** | — | Assistant tab with per-model / per-finding / per-file scopes |
| Agent / Plan modes | **NO** | Medium once agent exists | Plan-first is our entry condition anyway |
| Previous agent runs | **PART** | Easy | Agent trace persistence exists from the legal build |
| Web search in chat | **NO** | Easy | |
| Drag files into chat | **PART** | Easy–medium | Document ingestion + SharePoint browsing exist; the drag-into-chat wiring doesn't |

### Part 2 — Model Review

| Feature | Status | Difficulty | Notes |
|---|---|---|---|
| Model review, severity-graded, click-to-cell | **HAVE** | — | The moat. Measured: 80.1% useful on unseen models, 2.9% false, 3 seconds. Theirs fabricated a finding on our fixture; ours cannot |
| Changeset — every edit recorded, undoable | **NO** | Medium *after* write path | The trust feature; the agent is unshippable without it |
| « Fix all » | **NO** | Medium after write path | Some fixes are mechanical (dead names, anchoring); start there |
| Color cells by formula structure | **NO** | **EASY — quick win** | We already compute formula shapes for the mutation detector; coloring by shape is a direct application of code that exists today |
| Live checks while you work | **NO** | Medium | The engine is fast enough to re-run on save/change; the work is add-in event wiring |
| Compare from the review tab | see Part 6 | | |

### Part 3 — Trace

| Feature | Status | Difficulty | Notes |
|---|---|---|---|
| Precedent tree with keyboard navigation | **PART** | Medium | All internals exist: per-cell precedents, labels, the one-step evaluator, structure. The tree UI and shortcuts don't. Rung 3 of the plan |
| Range / values / labels display modes | **PART** | Easy on top of the tree | The three data kinds are already computed per cell |
| Formula explanation | **NO** | Easy | LLM over our labels and precedents |

### Part 4 — Charts, export, apps

| Feature | Status | Difficulty | Notes |
|---|---|---|---|
| Charts and tables on request | **NO** | Medium | Generation into HTML is easy; writing charts into the workbook needs the write path |
| Export to PPT / Word / CSV / PDF | **PART** | Medium | A pptx writer and the docx engine exist; CSV/PDF trivial. Assembly work |
| Spreadsheet apps, live-calculating | **NO** | **HARD** (live) / Medium (lattice) | The one place we deliberately diverge: precomputed lattice from real Excel first, live recalc only if sales demand it |

### Part 5 — Skills, instructions, style

| Feature | Status | Difficulty | Notes |
|---|---|---|---|
| Skills via « / » | **NO** | Medium | Prompt/config layer + menu; no deep engineering |
| Custom instructions | **NO** | Easy | |
| Style guide generated from a reference file | **NO** | Medium | Reading a model's formats is easy; mapping to Excel's native styles and applying them needs the write path |

### Part 6 — Compare Workbooks

| Feature | Status | Difficulty | Notes |
|---|---|---|---|
| Cell-level diff of two versions | **PART** | Medium — **weeks, rung 2, next** | The reader parses both; the real work is shift detection (an inserted row must read as one change, not 4,000) |
| AI summary of impact | **NO** | Easy on top | |
| « What the change broke » | **PART** | Easy | Audit both + diff findings = our corpus gate, repurposed. Nobody else has this |
| Computed changes (input → downstream effect) | **NO** | Medium (qualitative, via the dependency graph) / needs recalc (quantitative) | |

### Part 7 — PDF citations & projects

| Feature | Status | Difficulty | Notes |
|---|---|---|---|
| PDF → data in cells, cited to page, source viewer | **PART** | Medium | Contract-to-model grounding was built and tested (Dumfries); facts-with-page-references exist. Writing into the sheet + the highlight viewer are the missing halves |
| Projects (files, chats, artifacts in one place) | **HAVE** | — | The deal workspace, being renamed |

### Part 8 — PowerPoint

| Feature | Status | Difficulty | Notes |
|---|---|---|---|
| PPT ↔ model consistency check | **HAVE — ahead of them** | — | Built and measured in Phase 0: 100 figures read, zero false findings on the clean deck, every planted error caught. They market this; we measured it |
| Build decks from Excel + reference style | **NO** | Medium–hard | Generation is taste; our plan checks documents before generating them |
| PPT citations to model cells | **PART** | Medium | The figure-to-cell link engine exists; the add-in surface doesn't |

## The honest scoreboard

- **HAVE, often measured**: model review (better), PPT consistency
  check (ahead), platform workspace, Excel add-in, projects, chat.
- **PART — assembly, weeks each**: Compare, Trace UI, PDF citations,
  exports, Word add-in revival, drag-import, agent-run history.
- **NO but easy**: color-by-structure (days — the shapes are already
  computed), web search, instructions, formula explanation, AI diff
  summaries.
- **NO and hard, in order of leverage**: **write path + changeset**
  (unlocks five features), **headless recalculation** (unlocks four),
  then the **agent** on top of both, then live-calc apps (lattice
  first).

## What this means for the order

The clone is not eight products; it is two foundations plus assembly.
The plan's ladder already points the right way — Compare next, Trace
after — with one addition from this mapping: start the **write path**
earlier than Part H implied, because changeset, fix-all, style
application, charts and PDF-into-cells all queue behind it, and it
can be built and verified file-by-file (the same round-trip
discipline the docx engine already proved) long before the agent
that uses it exists.

And one thing not to clone: their review invents findings (a
fabricated formula quote, duplicated findings, a nonsense error
count — documented in `round6-tracelight-exam.md`). The clone gets
their surfaces; the engine underneath stays ours.
