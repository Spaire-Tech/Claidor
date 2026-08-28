# Where we stand — the one file

**There are two files. This is the second one.**

| File | What it is | Who owns it |
| --- | --- | --- |
| `swens.md` | **What we are building.** The product, in the founder's words. Wins over everything. | The founder |
| `pieces.md` (this) | **Where we stand and what is next.** Every part, its status, the number behind it, and the order of work. | Ledger |

Everything else under `docs/pierce/` is **evidence or archive** — the
protocols, the measurements, the lane logs, the research. You never
need to read them to know where we stand. They exist so that every
line in this file can be checked. `swens-plan.md` is the route that
was approved on 23 August; this file is that route with today's
position marked on it, and where the two disagree, `swens.md` wins and
this file says so.

Written 28 August 2026, after the founder said: « you keep confusing
me… I don't know which is which. I don't know where I stand, therefore
I can't give you tasks. »

---

# 1. The product in six parts, and where each one is

`swens.md` § 3 defines six parts. This is all of them, in plain
English, with what is built and what is not.

## a) The Engine — reading the model properly

Reads an Excel workbook the way a model auditor reads it: finds the
time axis, the sections, the balance carries, the debt schedule, then
runs four kinds of check over that structure.

| Check kind | What it catches | Status |
| --- | --- | --- |
| **Structural** | typed-over formulas, hardcodes in formula tails, sums skipping rows, broken/frozen refs, error values | **DONE** — 80.1% useful on unseen models, 2.9% false positives, golden-master gated |
| **Financial** | balance sheet balances, cash carries hold, debt repays to zero | **DONE** |
| **Unit** | monthly used as annual, percent as decimal, pounds plus dollars, thousands vs millions | **BUILT AND SWITCHED OFF** — see Piece 1 |
| **Behavioural** | run the model and see if it obeys its own arithmetic | **DONE AND MEASURED** — see § 2 below |

Speed: a median model now checks in **6.9 s at 155 MB** (was 23 s at
384 MB). The heaviest model in the corpus reads in **121 s at 1,255 MB**
(was 252 s at 6,290 MB). The spec's sentence — 600k cells under a
minute — is **not proven**, because this container swings ±30% and
cannot honestly measure it.

## b) The Chain — where every number comes from

| Direction | What it does | Status |
| --- | --- | --- |
| Typed number → the contract page it came from | propose links, a person confirms, then re-checking is arithmetic forever | **HALF** — six rounds, latest scored 0 correct of 15. Piece 2 |
| Model number → the deck/memo built on it | every printed figure matched back to its source cell | **DONE** — measured 100%/100% on planted errors |
| A typed number with **no** source | its own finding class — « a number nobody can defend » | **NOT BUILT.** Piece 9 |
| Outward — filings, rates, company records | « the model says 412, the filing says 409 » | **NOT BUILT.** Piece 14 |
| Terms into a structured table | test the model's inputs at scale, not one at a time | **NOT BUILT, and was missing from the plan.** Piece 10 |

## c) The Watch — what changed, and what it broke

| | Status |
| --- | --- |
| Raw version diff (cells added, removed, changed) | **DONE** |
| Shift detection — one inserted row reads as one change, not two hundred | **DONE** — anchor decomposition 10–73× on 11 of 12 real sheets |
| Delta report in review language (new defects, repaired, moved assumptions) | **HALF** — 3× too slow, and its acceptance test never run. Piece 5 |
| Proving what did **not** change — the three tiers | **BUILT, not measured** |
| The Watch on documents — model moved, deck did not | **DONE** |
| **Behavioural version diffing** — the laws v8 obeyed vs the laws v12 obeys | **NOT BUILT — deliberately.** See § 2 |

## d) The Grid — findings as a workspace

Findings with rule, sheet, cell, evidence, severity; sortable,
filterable; materiality and rounding tolerance as the firm's settings.
**DONE** — the Grid renders entirely from the findings API.

Two parts of § 3d and § 7 are **not** built: the terms table
(Piece 10) and findings mapped to the named modelling standards, so a
reviewer reads them in their own vocabulary (Piece 7).

## e) Chat — about this model, not about the world

Seven tools exist and are tested: locate, trace back, trace forward,
inventory, structure, versions, sources. Between them they cover all
five canonical questions. **Nobody has asked the five questions and
judged the answers.** Piece 3.

## f) The Excel panel — findings beside the cell, corrections that follow

The panel exists: 3,420 lines, Excel/Word/PowerPoint/Outlook hosts,
wired to the API. **Never verified end to end.** Piece 11.

The write path underneath it — byte-preserving edits, apply/undo,
re-audit gate, custody — is **DONE**. The *classes* of determined fix
(restore the formula the block declares, widen the sum the structure
defines, replace the deck figure with the model's number) are **NOT
BUILT**. Piece 15.

---

# 2. The execution engine — the founder's question, answered part by part

The founder asked, 28 August: *« We've upgraded the technical core
from static formula parsing to a native execution engine that actually
runs the workbook to mine behavioral invariants, trace dynamic math
execution, and run model-slicing (Reiter's framework) for root-cause
diagnosis. Did you account for this dynamic trace pipeline, behavioral
version diffing, and the base-case reproduction check? »*

**Yes — all six are in the plan, four are built, and the two that are
not were deliberately held by the founder's own amendments.** Each row
below was checked in the tree before it was written.

| The founder's words | What it is here | Status |
| --- | --- | --- |
| **native execution engine that actually runs the workbook** | B1 — a pool of long-lived LibreOffice workers, UNO socket, `calculateAll()`, the file's own iteration settings pushed in explicitly, one document per process, recycled | **BUILT.** `recalc/pool.py`, `recalc/uno_driver.py`. Caveat: this container runs LibreOffice **24.2.7.2**; the researched architecture calls for **≥ 25.8** |
| **the base-case reproduction check** | B2 — the fidelity gate. Recalculate every model *unchanged* and diff against what Excel itself stored, cell by cell. **No behavioural check ever runs on a file that failed its gate** | **BUILT AND RUN** on the 27-model corpus. Results in the next table |
| **mine behavioral invariants** — hand-written laws | B4 — zero-input (volume 0 ⇒ revenue exactly 0), proportionality, scale invariance, consolidation | **BUILT AND MEASURED: 37 plants, 37 catches, 0 false positives** across 26 control runs. The hardcode-in-the-tail class — the one static reading cannot see — stands at **24/24 across 13 host files** and three structural guises |
| **mine behavioral invariants** — laws *discovered*, not written | B5 — run the model blind under perturbations, keep the equations that never stop holding. Clean-room from the ICSME 2019 paper (the reference code is LGPL and has not been read) | **BUILT, NOT MEASURED.** `recalc/mine.py`. Piece 8 |
| **trace dynamic math execution / model-slicing for root cause** | B4's amendment — delta debugging (ddmin) plus a frontier walk over the dependency slice between the perturbed input and the broken output, so a violated law names **one** cell | **BUILT.** `recalc/narrow.py` |
| **Reiter's framework** specifically | B6 — Reiter minimal-diagnosis + spectrum-based fault localisation over broken mined rules | **NOT BUILT — HELD by the founder-relayed amendment of 27 August**, pending evidence: if real regressions break one or two rules, blame-the-changed-cell wins and Reiter is over-engineering; if they break many, B6 is exactly right. The Ofwat run decides |
| **behavioral version diffing** | C6 — mine v8's laws and v12's, then diff the law sets: « v12 obeys all 47 rules v8 obeyed, adds 2, broke 1 — cash closing no longer ties to its flows in periods 14–15 ». Compares behaviour, not positions, so it survives inserted rows and renamed sheets by construction | **NOT BUILT — GATED by the founder-relayed third amendment**, on two preconditions measured *before* any diff code exists: (1) **seed stability** — mine one unmodified model five times under five seeds; the rule sets must agree, or « v12 broke a rule » is seed noise. (2) **cosmetic invariance** — insert blank rows, rename a sheet, reformat a block; the mined sets must be identical, or the claimed advantage over positional diff is unproven. **Neither has been measured.** That is the next thing C6 needs, and it is cheap |
| *(also relevant, not asked)* | C4 — verifying-trace fingerprints: hash each cell's formula shape and its inputs' values, so matching fingerprints prove a cell could not have changed at hash cost, no evaluation | **BUILT.** `watch/trace.py` |

## What the base-case reproduction check actually found

The fidelity gate is not a formality — it is the reason the
behavioural numbers can be trusted, and it currently refuses four
files. First run, 27 models, LibreOffice 24.2:

| Files | Match | What it is |
| --- | --- | --- |
| 3 | **100%** | perfect |
| 9 (ED2) | 99.998% | one cell each, `Cover!G4` — a filename cell truthfully reporting its new filename. **Environment-volatile, never a fidelity failure** |
| 2 (H7) | 99.98% | 66 cells each, same class: per-sheet titles rebuilt from the filename |
| 2 (draft PCFM) | 99.2–99.4% | `#VALUE!` around text operations — under investigation |
| 1 (GT3) | 96.1% | **1,294 `#NAME?`** — LibreOffice 24.2 does not know the XLOOKUP/LET generation. This is the version gap, and **the gate caught it, which is the gate working** |
| 2 (WACC) | 95.8–96.3% | ~23k numeric divergences on daily rate series (Excel stored 0.02075…, LibreOffice computes 0.02). Not errors, not volatiles — **unexplained. These files fail the gate and are refused behavioural checks today** |
| 8 | — | recalculated but not diffed: the *differ* failed on the six big models, not the recalculator |

Those last two rows are what the arbiter (Piece 4) is for: when
LibreOffice and a file disagree, real Excel decides.

**So the honest one-line answer to the founder's question:** the
execution core is real and measured — 37/37 on planted behavioural
frauds, behind a gate that refuses four files rather than guessing.
What is *not* there is the layer on top: discovered laws are unmeasured
(Piece 8), behavioural version diffing is gated on two cheap stability
runs nobody has done, and Reiter is held by the founder's own decision.

---

# 3. The open sources — are they all accounted for?

**Yes, and there is a document per haul.** Neither is a wish list;
every entry carries a verdict — **OURS / ADOPT / TRIAL / LEARN-FROM /
SKIP** — and the SKIPs carry their reason.

- **`ambre-toolbox.md`** — the main survey (calculation engines, the
  spreadsheet-QA research field, document extraction, public data,
  equivalence proving), mapped onto the six parts. Its headline still
  stands: **for shift-aware version diff and automated behavioural
  testing of workbooks, no open implementation exists.** Those are
  ours by default, not by choice.
- **`china-os-findings.md`** — the Chinese spreadsheet-science haul the
  founder's researcher produced, with the load-bearing claims verified
  from this container before grading.

**What was actually done with them:**

| Source | Verdict | Where it went |
| --- | --- | --- |
| LibreOffice UNO | ADOPT | B1, built — including every hard-won specific (UNO socket not CLI convert, `calcPr` pushed by hand, pool recycled because it leaks) |
| Microsoft Graph Excel API | TRIAL as arbiter | **Not wired.** Piece 4 — and we already own the OAuth/tenant plumbing |
| CUSTODES benchmark (1,974 labelled cells) | BENCHMARK | Archived to `docs/pierce/custodes/` and scored |
| Enron / EUSES corpora | BENCHMARK | Archived; drove the `.xls` reader |
| XLParser grammar | ADOPT | Ported into the fault-tolerant reader as cases arise |
| ExceLint | LEARN-FROM + head-to-head | **Blocked** — the repo was never approved into a session |
| SheetDiff | LEARN-FROM then own | Superseded on purpose: the 24 Aug amendment replaced its greedy algorithm with dynamic-programming alignment, because the greedy one misaligns and can loop |
| Z3 / VeriEQL / EqDAC / SQLSolver | encoding pattern | Tier-1 equivalence — built, unmeasured |
| docling + pdfplumber | ADOPT | The Chain's extraction with page and box |
| EDGAR, Companies House + arelle, FRED / NY Fed / BoE / ECB | four free integrations | **Not built.** Piece 14 |
| Williams 2020 (units) | the blueprint | `units/inference.py` — built, **never measured**. Piece 1 |
| AutoMR (ICSME 2019) | plan amendment, approved 27 Aug | B5, clean-room. Built, unmeasured |
| Tasi (ISSTA 2021) | second independent labelling of the same 70 files, **including an ExceLint column** | Ordered, **not run** — it largely settles what the blocked ExceLint run was for. Piece 16 |
| PaddleOCR, Univer, TableSense, WARDER, Auto-Formula | filed, low priority | Named with their slot, not started |
| HyperFormula, pycel, xlcalculator, EPPlus, SpreadJS, PyMuPDF, marker/surya, unstructured.io, ForTaP/TUTA, GNN anomaly scoring | **SKIP** | Each with its reason on file — licence, dead, or « unexplainable suspicion is the opposite of defensible findings » |

**The one gap I will not paper over:** I cannot prove this covers
*everything* the founder ever sent, because there is no single intake
log of what was handed over and when. Two haul documents exist; a
source that arrived outside them may not be in either. **Piece 17
fixes that** — one list, every source, its verdict, and the date.

---

# 4. The order of work

Set by the founder's fourth amendment: **by hole, not by polish** — a
part of § 3 that does not exist outranks a part that exists and could
be better. Nothing here is started until the one before it is green,
and green means: DONE test passed, golden master clean, `dev/verify`
green, number written down.

| # | Piece | Why here | Size |
| --- | --- | --- | --- |
| **1** | **The manual-calculation refusal** (§ 5) | We are breaking a stated promise *today*: a workbook saved on manual calculation is reconciled silently against numbers Excel does not believe. `calcMode` appears nowhere in the tree | hours |
| **2** | **Chat judged** (G2) | Closes a claim I made badly. All seven tools exist; nobody has asked the five questions | a day |
| **3** | **Units** (E2 → E3) | The flagship finding, and the check is built and switched off because the inference under it was never measured | days |
| **4** | **C6's two stability runs** | Behavioural version diffing is gated on two cheap measurements nobody has done. Until they run, C6 cannot start and B6 cannot be decided | a day |
| **5** | **The arbiter** (B3) | Four corpus files are refused and waiting. Check the LibreOffice 24.2 → 25.8 version gap first — part of the queue may be that | days |
| **6** | **The Chain's page geometry** (D3/D4) | Six failed rounds, and the diagnosis says it is document geometry, not matching | days |
| **7** | **The terms table** (§ 3d) | Missing from the plan entirely, and probably the real fix for the Chain's scale problem | days |
| **8** | **B5 measured**, then B6 decided | The measurement decides whether Reiter is right or over-engineering | days |
| **9** | The delta report's speed + its acceptance test | 3× over the line; the biggest cost is the engine throwing away work it just did | days |
| **10** | The unsourced-number finding (D5) | Depends on the Chain having a store to ask | days |
| **11** | The panel end to end (G3) | Exists, never verified | days |
| **12** | Determined corrections (F3) | The mechanism exists; the classes and their refusal cases do not | weeks |
| **13** | House rules proven + standards vocabulary (A5) | Built and wired, never demonstrated | days |
| **14** | Outward checks (D6/D7) | Four free integrations, none built | weeks |
| **15** | The four completion proofs | Proof 4 (design partners) is **deferred by the founder**, not failed | — |

**Housekeeping, folded into whichever piece touches them:** Tasi
re-score (Piece 16), the source intake log (Piece 17), triage of the
~40 uncited research documents, A1's stopwatch claim on a quiet
machine, the ExceLint repo approval.

---

# 5. What is finished — so you know what not to worry about

Write path and changeset · the golden-master gate · the static engine
(80.1% useful, 2.9% false positives) · financial checks · behavioural
checks (37/37) · the recalculator and its fidelity gate · legacy
`.xls` and `.xlsb` reading · the speed round · version diff and shift
detection · verifying-trace fingerprints · the Watch on documents ·
the findings API and the Grid · the deck tie-out (100%/100%) · the
report · the CUSTODES benchmark and scorer · shape normalization ·
custody by construction.

---

# 6. Debts I am carrying, named

1. **Two documents were three too many.** This file replaces the split
   between the plan, the status and the orders. `orders/` is stood
   down and says so at the top.
2. **The lane orders and lane logs are history now**, not instructions.
3. **My prose-to-code ratio was 83 lines of code to 2,079 lines of
   documents over two days.** That is the measured version of « running
   around in circles ». This file is the last long document before the
   next piece of code.
4. **`a1-performance.md` was stale for three days** while I quoted its
   conclusions. Fixed 28 Aug; the lesson is that a document of record
   that trails the work is worse than no document.
5. **No intake log for the founder's sources** (Piece 17).
