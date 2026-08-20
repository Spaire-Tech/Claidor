# Pierce — the plan

> **Historical (preserved 20 Aug 2026).** This was `plan.md` from 10
> August — the pitchbook tie-out plan, with its measured Phase 0 and
> Phase 1 results. The current plan is `plan.md` (the 52-step platform
> plan); the direction it serves is `platform.md`. Kept because its
> measurements and design decisions (never link on a value; a link is
> confirmed once, then re-checked deterministically) remain true and
> may be wanted again — notably for the deliverables rungs.

Written 10 August 2026, on the decision to move from law to investment
banking. « Claidor » stays as the codename until there is a reason to
change it; nothing in the code needs renaming for that.

Estimates are **[estimate]** unless marked. The further down, the wider.

---

## The one-sentence version

A pitchbook is assembled from many places under a deadline, and the one
thing it has to be is right. Pierce holds the chain from source document to
model to deliverable and shows where it has broken.

Everything else in the product — the four Office surfaces, the workspace,
the drafting — is table stakes that several companies can build. **The
chain is the product.**

---

## What the legal build leaves behind

Not a restart. The Vesence clone was, underneath, document infrastructure
with about fifty lines of law in it.

| | State | Fits Pierce as |
|---|---|---|
| Word add-in (forked, Apache 2.0) | Built, unverified in Word | The Word surface, whole |
| Redline engine — 10 checks, 3,400 lines | Built, measured 43.6 → 20.3 findings/doc | Word's « defined terms, cross-references, house style » |
| `.docx` OOXML engine | Core built, round-trip verified | Same approach extends to `.xlsx` and `.pptx` — same container |
| Cross-document check | Built, measured against a real model | « The teaser, the CIM and the management presentation carrying the same figure differently » |
| Agent + four tools + persisted trace | Built, measured 3/3 on a real model | The deal agent, unchanged |
| Matter workspace, members, documents | Built | The deal workspace, renamed |
| Playbooks | Built | The house standards and brand book |
| Auth, tokens, tracked-change discipline | Built | Unchanged |

**Roughly 30–40% of everything in Pierce that is not the reconciliation
engine already exists.**

What is genuinely retired: the OHADA corpus and the librarian, which
belonged to the business before this one and were already outside the
Vesence build.

What needs re-tuning rather than rebuilding: the redline engine's
false-positive work was done against contracts. Banking documents — CIMs,
IC papers, engagement letters — will need the same treatment. It took days
the first time; it will be faster because the method and the harness exist.

---

## The chain, and how it gets built

This is the part that does not exist, and the part worth being precise
about, because the obvious design fails.

The obvious design is: ask a model whether the deck matches the model.
That produces confident prose about numbers, which is the worst possible
output for this product.

### Five stages

**1. Extract figures from the deliverable.** Every number in a `.pptx` —
text runs, tables, chart series — with where it sits and what label is near
it. Then normalised: `$42.6m` becomes 42,600,000 USD. Scales, currencies,
negatives in parentheses, percentages, ranges, basis-point conventions.
This is fiddly, entirely deterministic, and testable to death.

**2. Extract candidates from the model.** Cells, cached values, formulas,
named ranges, sheet names, row and column labels. Excel stores its last
computed values in the file, which is what makes this possible without a
calculation engine.

**3. Propose links.** Match a figure to a cell. Exact value first, then
transformations — a sum over a range, a margin, a growth rate, a unit
conversion. Ambiguity is the normal case: many cells hold 42.6. Narrow it
with the label beside the figure and the label beside the cell.

**4. A human confirms, once.** And this is the design decision the whole
product rests on.

> The link is proposed by a model and **confirmed by a banker**. After
> that it is *data*, not a guess. Re-checking is arithmetic: fetch the
> cell, apply the recorded transformation, compare. No model is involved,
> the answer is the same every time, and it is right or it is a bug.

That converts the product from « an AI that reviews your deck » — which
nobody should trust with a fairness opinion — into « a spreadsheet of
verified links that is checked deterministically ». The model's job is
proposal and disambiguation. It never gets to assert that two numbers
agree.

**5. Record the basis.** Pro forma, normalised, run-rate, pre-IFRS 16, and
the period. Held against the link, so a legitimate adjustment reads as an
adjustment and only an unexplained difference is raised. This is the detail
that decides whether bankers keep the product past week two.

### Where the false-positive war will be

Stages 1 and 3. Same shape as the defined-terms work: the first version
will flag everything, and the value is in the rules that stop it. Budget
for it explicitly rather than being surprised.

---

## Two problems in the spec, to settle before they are promised

**PowerPoint and Excel have no tracked changes.** Word has revision marks.
Excel's track-changes is a deprecated shared-workbook feature. PowerPoint
has never had one. So « everything is a tracked change, across Excel,
PowerPoint, Word and Outlook » is not a feature of Office and cannot be
turned on.

It is buildable — a proposal layer that shows before and after, applies on
accept, and is reversible — but it is a *build*, several weeks, and it is
load-bearing: it is the answer to « nothing leaves the firm without a
banker accepting it ». Costed in Phase 2 below.

**« Not retained » and « the chain becomes the record » cannot both be
true as written.** You cannot answer « what was this number in March and
why did it change » having retained nothing.

The reconcilable position, and it is a good one: **retain the chain, not
the documents.** Figures, sources, transformations, versions and bases are
kept; the deck and the model are processed and dropped. That is defensible
to a bank and it is also, usefully, a smaller attack surface than holding
the files. It needs saying explicitly, because a security review will find
that sentence.

---

## Phases

### Phase 0 — The tie-out  *(3–4 weeks)*

One deck, one model, the links between them, and the drift.

No Office integration, no add-in, no workspace. A route that takes a
`.pptx` and an `.xlsx` and returns: every figure found, every proposed
link, every confirmed link that no longer matches.

**This is the whole value proposition on one screen** and it is the thing
that makes a banker lean forward. It also front-loads all the risk: if
figure extraction and linking do not work, nothing downstream matters.

Ends with a graded eval on a real deck and a real model, the way the
redline engine and the agent were measured. Recall, precision, and what it
invented.

### Phase 1 — The model audit  *(2–3 weeks)*

Hardcoded values in formula rows, broken and stale external links,
circular references, rows that break their own pattern, formulas that skip
a cell, balance checks that no longer balance.

Entirely deterministic — no model call anywhere in it. Cheap, high
signal, and it is the check a banker will run first because it finds real
errors in their own work.

### Phase 2 — PowerPoint  *(4–5 weeks)*

The panel, the findings, and the proposal layer that stands in for tracked
changes. Includes the `.pptx` splice engine, built the way `.docx` was:
byte-level, nothing re-serialised.

### Phase 3 — Word  *(1–2 weeks)*

Largely built. Re-tune the engine against banking documents, point the
panel at the deal workspace, adjust the vocabulary.

### Phase 4 — The deal workspace  *(2 weeks)*

Largely built. Rename matter to deal, add the model and deck as
first-class objects beside the documents, surface the chain.

### Phase 5 — Excel  *(3 weeks)*

The panel inside Excel: explain a model, run the audit in place, jump to
the cell behind a figure.

### Phase 6 — Outlook  *(3 weeks)*

House-style drafting and the pre-send check.

### Phase 7 — Connectors  *(3–5 weeks)*

SharePoint, OneDrive, Teams, the DMS, the data room. Slow for political
reasons rather than technical ones.

### Totals

| | |
|---|---|
| **Something that makes a banker lean forward** | **3–4 weeks** (Phase 0) |
| A usable product on two surfaces | ~3 months |
| All five surfaces | ~6 months |

The demo number is much shorter than the legal build's was, for one
reason: Phase 0 needs no Office integration at all, and Office integration
is what could not be verified for the whole of the last project.

---

## What is needed from you

| | When | Why |
|---|---|---|
| **A real deck and the model behind it** | Now | Phase 0 is unbuildable without one. Anonymised is fine; the numbers can be nonsense as long as the structure is real |
| **A banker, for one hour** | After Phase 0 | Same question as the lawyer, and it never got answered: is this useful or is it noise |
| **Which is worse: a missed drift or a false one** | Before Phase 0 ends | It sets every threshold in the matcher, and the answer is not obvious — a missed one embarrasses you in front of a client, a false one gets the product ignored |

The first is the blocker. Everything else can wait.

---

## Risks, ranked

**Figure extraction and linking do not work well enough.** First, by a
distance, and Phase 0 exists to find out inside a month rather than inside
a quarter. The mitigation is structural rather than hopeful: a human
confirms each link once, so the product degrades to « a bit more manual »
rather than to « wrong ».

**Bankers will not confirm links.** The design asks for a few minutes of
setup per deal. If that is refused, the whole model collapses back to
guessing. Worth testing in the same hour as the demo.

**PowerPoint's missing tracked changes.** Costed, and a real build.

**Nothing has run in Office.** Carried over from the legal build,
unchanged, and now partly sidestepped: Phase 0 does not touch Office.

**Scope by imitation.** Five surfaces, a workspace, connectors, ops and
invoicing is a large product. The phase order above is deliberately a
sequence of things useful on their own, and Phase 0 and Phase 1 are both
useful with no Office integration at all.

---

# Phase 0 — built and measured, 10 August 2026

`server/polar/tieout/` reconciles a PowerPoint deck against the model
behind it. Measured against Project Cascade: **zero findings on the clean
deck, every injected error on the broken one, nothing invented.**

| | Clean | Broken |
|---|---|---|
| Figures read | 100 | 100 |
| Reconciled | 34 | 34 |
| Findings | **0** | **6** |
| Output rows reached | 23 / 23 | — |
| Recall / precision | — | 100% / 100% |

Five modules, each one decision:

| | What it decides |
|---|---|
| `figures.py` | What counts as a figure, and at what precision its claim is made |
| `deck.py` | Which words name which number — tiles, table cells, clauses |
| `model.py` | The Outputs tab, one row per published figure, with its basis |
| `link.py` | Whether a figure and an output row are the same thing at all |
| `check.py` | Whether the linked pair agrees, at the precision the deck chose |

## The design decision the rest hangs on

**Never link on a value.** Slide 6's peer table prints `10.4x` for Kestrel
Valve Group and `9.9x` for the median; slide 2 prints $41.2mm reported and
$48.9mm adjusted. Any checker that matches numbers reconciles the first of
each pair against the second's cell and reports a drift on a deck that is
correct. Linking on words means those figures are never candidates for one
another.

The consequence is that **an unmatched figure is never a finding.** 66 of
the 100 figures on the clean deck are reconciled against nothing — peer
multiples, a sensitivity grid, timetable weeks — and the checker says
nothing about any of them. Silence is the correct output for a number the
model does not publish.

## What this does not yet do

- **No surface.** No endpoint, no persistence, no panel. It is a library.
- **Assumes an Outputs tab.** Cascade has one because it was built well.
  Most models in the wild do not, and inferring the interface rather than
  reading it is a larger problem than everything above.
- **Charts are read and not linked.** Their numbers live in embedded
  workbook parts and usually restate the table beside them; linking both
  would report every drift twice.
- **One deck, one model.** Nothing yet reconciles two decks against each
  other, or a deck against last week's version of itself.

## The open question, still open

*Which is worse: a missed drift or a false one?* Phase 0 answered it by
assumption — a false positive is much worse, and every gate is set that
way. On Cascade that cost nothing, because all 23 output rows were reached
anyway. On a deck whose model names things differently it will cost
recall, and how much is tolerable is a banker's judgement, not mine.

---

# Phase 1 — the model audit, built and measured, 10 August 2026

`server/polar/tieout/audit.py`. Checks a model against itself: no deck, no
linking, no judgement about what a figure is called. The check a banker
runs first, because it finds errors in their own work.

Nine rules, each drawn from at least two of the FAST Standard, the ICAEW
*Twenty Principles*, SMART and Operis, and each finding cites its source.

| Rule | Grade | What it catches |
|---|---|---|
| `inconsistent-row` | error | One cell in a series unlike the rest |
| `typed-over-formula` | error | A constant typed over a calculation |
| `skipped-cell` | error | A total that leaves out the row above it |
| `circular` | error | A loop, when iteration is not switched on |
| `external-link` | error | A reference into a workbook that is not here |
| `error-value` | error / smell | `#REF!` and `#NAME?` / `#N/A` and `#DIV/0!` |
| `hardcode-in-formula` | smell | An assumption buried where nobody will change it |
| `inconsistent-anchoring` | smell | Right answer today, wrong the moment it is copied |
| `volatile`, `long-formula` | smell | `OFFSET`, `INDIRECT`; formulas nobody can read |

**Measured: 9 of 9 planted defects, 0 false positives**, against a fixture
whose defects are at known addresses and whose eight *innocent* structures
were each a false positive on a real model first.

On four real Damodaran valuation models — 2,000 to 9,200 cells each — 0 to
3 errors per model, under half a per cent of formulas. **Precision there is
not measured.** They carry no labelled ground truth, and the code says so
rather than quoting a number it cannot support.

## What would change the picture

The only hand-labelled corpus is CUSTODES: seventy sheets from EUSES,
marked by its authors, and the place the published baselines live —
CUSTODES at 20.3% mean per-workbook precision, ExceLint at a median of 1.0
on the same data. It is outside this environment's egress allowlist and
is legacy binary `.xls` besides, which nothing here can read.

Two things unblock it, and they are the highest-value hour available:
**allowlist `sccpu2.cse.ust.hk`**, and **a legacy `.xls` reader** — which
also unlocks the other sixty-nine Damodaran models, all of EUSES, and the
Enron corpus. That is the difference between « the rate is low » and « the
precision is X ».

## Still not built

- **Cross-foot and three-statement articulation.** Does the balance sheet
  balance, do the flows tie. Needs the statement structure recognised, not
  just the grid.
- **Deliverable-to-source.** The corpus for it exists and is free: 8-K
  Exhibit 99.1 investor decks against the 10-K or 10-Q whose figures they
  quote. Those decks are PDFs, so it needs a PDF figure extractor before
  it needs anything else.

---

# Superseded for scope — 10 August 2026

The phase list above described the route to a working product. Two
documents now carry it forward with measurements attached:

- **`complete-product.md`** — what the whole product is, layer by layer,
  what exists of each, the order, and what « complete » means stated as
  tests rather than as a feeling.
- **`accuracy-backlog.md`** — the engine's measured recall and precision,
  where the misses come from, and the two ideas that should move them.
  Parked deliberately, with the numbers written down.

The plan's central design decision survives intact and is now load-bearing
for a reason it was not written for: the engine finds 56% of what it is
shown. That rules out promising to catch errors, and it makes « a link is
confirmed once, then re-checked deterministically » the only honest
promise — and one that holds at 100%.
