# Round 6, opened by a rival: the Tracelight exam

20 August 2026. The founder ran Tracelight's Model Review over
`scripts/cascade/example_preapp_model.xlsx` — the semiconductor-fab
example model that has been this repo's judged fixture since the
« defensible seven » curation — and handed us their report. We treated
it as a free exam paper: verify every claim against the raw cells,
convict or acquit, and turn every real miss into a general fix with a
regression test, gated on both corpora. This document is the record.

## Full disclosure, first

The exam file is **in-sample for us**: it is a committed fixture
(`test_the_example_preapp_model_reports_the_defensible_seven`), and an
earlier round explicitly pruned its noise from sixteen findings to
seven. Tracelight presumably saw it cold. That cuts both ways: their
findings on it are the more impressive for being cold — and our misses
are the more damning for being warm. Four real defects sat in a file
we had already judged, and the engine could not see them. That is
exactly the « catastrophic blind spot » class the mentor's bars
require us to know about.

## The verification: their claims against the cells

| Their claim | Verdict | Evidence |
|---|---|---|
| Sub debt interest uses senior rate from year 2 (`F50` reads `$C$51` where seed `E50` reads `$D$51`) | **REAL** — we missed | Cells confirm the lost column lock |
| Inventory days driver drifts (`E13` walks `F86`… where `D13` pins `$C$86`) | **REAL** — we missed | Cells confirm; the family walks into empty cells |
| Negative-cash warning skips periods 13–19 (`OR(D10…O10,W10)`) | **REAL** — we missed twice over: the banner sits on the header row our reader skipped entirely | `Balance Sheet!D7` confirms |
| Broken external links + `#REF!` defined names | **REAL** — we missed | 50 `#REF!` names, 39 foreign-workbook names; our external-link pass reads formulas only, and no formula uses them |
| Total Debt Service rows exclude interest | REAL — **both found it** | Our tier-1 lead finding |
| 240,000 capacity hardcoded in the production ramp | REAL — **both found it** | Our tier-2 finding |
| CADS includes equity and debt draws (61x year-1 cover) | REAL — semantic; **ours only after Part D** | `D42=D35` confirms the mechanics |
| Inventory change sign not flipped vs receivables | REAL — semantic sign check we don't have | `D10` negated, `D11` not |
| CHIPS/state incentive rows mislinked to the equity row | **FABRICATED** | `E56`/`E57` reference rows 65/66 correctly; the quoted formula does not exist in the file |
| (their list) | — | Three findings appear twice verbatim; a banner reads « Errors found: 3107 » above fifteen items |

The remaining claims (retained-earnings policy, ITC on ongoing capex,
NOL carryforward, senior-debt label, no IRR row, balance-check
netting) are semantic/accounting observations — plausible, unverified
one by one, and out of scope for a static structural engine today.
They are filed as seed material for the Part D (project-finance /
accounting semantics) spec in `plan.md`.

## The four named fixes (each general, each with a regression test)

1. **Sheet-qualified references were never references.** The mutation
   detector classified a token as a reference by « starts with R »,
   which `'Control Panel'!R51CC` fails (and `ROUND(` passes). Shape
   tokens now carry an `@` mark for reference operands. This single
   classifier bug hid *both* reference defects.
2. **The edge rule replaces the seed exemption.** A run's edges are
   where designs live — first cell reads the chain's anchor, last cell
   reads the totals column. An edge deviation now stands only on
   strong evidence: both variants pinned (`$C$51` vs `$D$51` — a fill
   preserves pins, so no seed story explains it); a family walking
   into empty cells beside a pinned edge cell (the inventory drag); a
   relative edge cell resolving to the family's own pinned target (an
   anchoring hazard); or an own-column window displaced within its own
   column (the family's own grammar). Windows grown or shrunk to
   exactly the live data of their own column are design.
3. **The reader admits header-row formulas that reach other rows.**
   The whole header row used to be skipped; the alarm banner lived
   there. A year-walker (`=C7+1`) is still part of the header.
   And a new check: a formula that walks a line five-plus cells in
   single steps under one comparison and then jumps (`gapped-test`)
   names the live cells it never reads. The walk must be a *test* —
   the same comparison on every walked cell — because a tax-allowance
   formula walking adjacent line items in plain arithmetic is
   composition, not coverage (judged on the NZCC BBAR sheet).
4. **The names table is audited.** `#REF!` names and names pointing
   into other workbooks are folded findings (`broken-name`), even when
   no live formula reads them.

## The exam file, after

7 findings → **12**, all verified against cells: the original seven,
plus the sub-rate anchor flip (T1), the inventory drift (T1), the
banner's coverage gap (T1), and the two names-table events (T3). The
fixture test now pins all twelve.

## The gate on the unseen 11 (four sweeps to get here)

Round 6's first cut sprayed — and every judged spray became one of the
refinements above, live on this corpus:

- +26 diff lines at first: Thames' twelve « inconsistent-row » flags
  were one totals-column design (output rows walk five year-columns
  and end on the source's total) — the **edge rule**; NZCC BBAR's five
  gapped-tests were arithmetic composition — the **same-test rule**;
  Financeability's three were pinned anchors heading walking output
  rows — the **live-family evidence**.
- The gate then caught the edge rule deleting `Outputs!R86` — judged
  **A/ACT in Round 5** — which forced the own-line keep. A blunt
  exemption would have silently traded a real defect for silence.
- The final unseen diff vs Round 5 is exactly: four `broken-name`
  events (facts of the files, incl. CA101's astonishing 7,817 dead
  names), `capstru B53` (a real anchoring hazard, kept), and
  `OBXValues!M689` (kept, logged as marginal: its displaced window
  reads the « (Source) » twin rows one section up — label-aware
  windows are Part D work).

## The lab 27

Swept with the final engine; diff against the golden master traced
line by line (see worklog for the trace). Baseline updated in the same
commit as the engine change, per the gate protocol.

## What this exam changes about the comparison

Tracelight's strengths, honestly: a behavioural pass (they
recalculate under ~20 single-driver scenarios — that is how a
hardcode shows up as « revenue does not respond »), semantic
accounting checks, and an audit-grade report format (scope, coverage,
verified-sound, not-checked). Their weakness is the fatal one for
this market: a fabricated finding quoting a formula that is not in
the file, plus duplicated findings and a nonsense error count — the
failure mode our architecture cannot produce, because every quote
comes from the parsed cell.

Ours, after Round 6: the two structural misses are closed as general
rules with regression tests; the names table is no longer a blind
spot; the reader no longer skips header-row content. The semantic
classes (CADS, sign conventions, NOL, RE policy, label-vs-content)
remain named, unbuilt, and assigned to Part D — and the behavioural
pass is exactly the scenario-lattice machinery `plan.md` already
schedules (Part G), now with evidence it doubles as a detector.

Time to run: **2.8 seconds** for the engine on this file; their
report took ~10 minutes. Their extra time is spent thinking; ours is
a fixed set of checks. The way to spend more time usefully is to know
more checks — which is what this round added.
