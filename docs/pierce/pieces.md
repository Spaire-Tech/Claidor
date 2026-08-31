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
| **Unit** | monthly used as annual, percent as decimal, pounds plus dollars, thousands vs millions | **BUILT AND SWITCHED OFF** — see Piece 3 in § 4 |
| **Behavioural** | run the model and see if it obeys its own arithmetic | **DONE AND MEASURED** — see § 2 below |
| *(the gate over all of them)* | § 5: on a workbook Excel does not keep current, every **value comparison refuses** instead of reporting a difference it cannot tell from a stale cache | **DONE 28 Aug** — see § 4a |

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
| **native execution engine that actually runs the workbook** | B1 — a pool of long-lived LibreOffice workers, UNO socket, `calculateAll()`, the file's own iteration settings pushed in explicitly, one document per process, recycled | **BUILT.** `recalc/pool.py`, `recalc/uno_driver.py`. **Correction 30 Aug: this container runs 25.8.7.3**, installed at `/opt/libreoffice25.8` by the committed `dev/setup-libreoffice`, and `find_install()` already prefers it over the system 24.2.7.2. The caveat this row used to carry is stale. **But the fidelity numbers below are still the 24.2 run and have not been repeated under 25.8**, so what the upgrade fixes is unknown rather than fixed |
| **the base-case reproduction check** | B2 — the fidelity gate. Recalculate every model *unchanged* and diff against what Excel itself stored, cell by cell. **No behavioural check ever runs on a file that failed its gate** | **BUILT AND RUN** on the 27-model corpus. Results in the next table |
| **mine behavioral invariants** — hand-written laws | B4 — zero-input (volume 0 ⇒ revenue exactly 0), proportionality, scale invariance, consolidation | **BUILT AND MEASURED: 37 plants, 37 catches, 0 false positives** across 26 control runs. The hardcode-in-the-tail class — the one static reading cannot see — stands at **24/24 across 13 host files** and three structural guises |
| **mine behavioral invariants** — laws *discovered*, not written | B5 — run the model blind under perturbations, keep the equations that never stop holding. Clean-room from the ICSME 2019 paper (the reference code is LGPL and has not been read) | **BUILT, NOT MEASURED.** `recalc/mine.py`. Piece 8 |
| **trace dynamic math execution / model-slicing for root cause** | B4's amendment — delta debugging (ddmin) plus a frontier walk over the dependency slice between the perturbed input and the broken output, so a violated law names **one** cell | **BUILT.** `recalc/narrow.py` |
| **Reiter's framework** specifically | B6 — Reiter minimal-diagnosis + spectrum-based fault localisation over broken mined rules | **NOT BUILT — MEASURED AS OVER-ENGINEERING, 31 Aug** (`b6-decision.md`, registered bars): on the rule sets the product produces, real-class regressions at B6's *best-case* sites break 2–3 rules (bar for « many »: ≥ 5), the rule sets can see only 2–5% of each model's cells (bar: 25%), and the plain cell diff named the culprit in 6 of 6. Blame-the-changed-cell wins. Reopens only if mining ever produces dense, modeller-recognisable rule sets, or the real PR24 run becomes possible (files need a human browser — Ofwat 403 + archive captcha, re-probed 31 Aug) |
| **behavioral version diffing** | C6 — mine v8's laws and v12's, then diff the law sets: « v12 obeys all 47 rules v8 obeyed, adds 2, broke 1 — cash closing no longer ties to its flows in periods 14–15 ». Compares behaviour, not positions, so it survives inserted rows and renamed sheets by construction | **NOT BUILT — GATED by the founder-relayed third amendment**, on two preconditions measured *before* any diff code exists: (1) **seed stability** — mine one unmodified model five times under five seeds; the rule sets must agree, or « v12 broke a rule » is seed noise. (2) **cosmetic invariance** — insert blank rows, rename a sheet, reformat a block; the mined sets must be identical, or the claimed advantage over positional diff is unproven. **BOTH WERE MEASURED 27 Aug and both passed** — five seeds (11/22/33/44/55) × 200 runs on gate-clean `h7_new_debt_indexation_fds.xlsx` gave identical rule sets, and three inserted rows plus a renamed sheet, compared by label rather than by cell reference, gave identical sets too (`logs/dynamo.md`). **This file said « neither has been measured » and that was wrong.** What is true is worse and more specific: both were measured under *hand* typing, when coverage reached 10 of 193 cells and the rules were « artifacts of the frozen remainder ». Automatic typing then took coverage to 144 of 144 and changed the rule sets outright — 36 stable rules became 11 on one model, 167 became 17 on the other. **The stability gates have never been run on the rule sets the product now produces**; that was predicted to still pass and, on the log's evidence, never tested. That is what C6 actually needs |
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
| ~~**1**~~ | ~~**The manual-calculation refusal** (§ 5)~~ | **DONE 28 Aug** — `polar/tieout/calculation.py`. See § 4a below | — |
| ~~**2**~~ | ~~**Chat judged** (G2)~~ | **MEASURED 28 Aug — 3 of 5, four defects closed, and NOT DONE.** See § 4b below | — |
| ~~**3**~~ | ~~**Units** (E2 → E3)~~ | **WIRED 30 Aug — and silent on every regulator model.** Four criteria met, gate clean 27/27, and it speaks on 0 of 27 here against 16 of 22 on close models. See § 4c below | — |
| ~~**4**~~ | ~~**C6's stability, re-measured**~~ | **BOTH GATES PASS 31 Aug** on the rules the product now makes — five sets identical (11 rules each, no flicker by label *or* by cell), and identical by label after three rows are inserted and a sheet renamed, where the by-cell match is **0.0000**. See `c6-stability.md`. **C6 is still not buildable**: the rules are not modeller-recognisable, and the label key cannot tell one year from another, so neither keying alone suffices | — |
| **5** | **The arbiter** (B3) | Four corpus files are refused and waiting. Check the LibreOffice 24.2 → 25.8 version gap first — part of the queue may be that | days |
| **6** | **The Chain's page geometry** (D3/D4) | Six failed rounds, and the diagnosis says it is document geometry, not matching | days |
| **7** | **The terms table** (§ 3d) | Missing from the plan entirely, and probably the real fix for the Chain's scale problem | days |
| ~~**8**~~ | ~~**B5 measured**, then B6 decided~~ | **B6 DECIDED 31 Aug: over-engineering on today's rule sets, stays unbuilt** — see `b6-decision.md` and § 2's B6 row. B5's half is partial: its rules catch planted real-class regressions 4/4 inside their field of view with 0 false alarms, but that field of view is 2–5% of a model's cells, and the registered Ofwat catch-rate round (both directions over the real 84) stays blocked on the PR24 files needing a human browser | — |
| **9** | The delta report's speed + its acceptance test | 3× over the line; the biggest cost is the engine throwing away work it just did | days |
| **10** | The unsourced-number finding (D5) | Depends on the Chain having a store to ask | days |
| **11** | The panel end to end (G3) | Exists, never verified | days |
| **12** | Determined corrections (F3) | The mechanism exists; the classes and their refusal cases do not | weeks |
| **13** | House rules proven + standards vocabulary (A5) | Built and wired, never demonstrated | days |
| **14** | Outward checks (D6/D7) | Four free integrations, none built | weeks |
| **15** | The four completion proofs | Proof 4 (design partners) is **deferred by the founder**, not failed | — |

## 4a. Piece 1, closed — the manual-calculation refusal (28 August)

The first piece built under the one-at-a-time rule, and the record of
what « 100% » means here.

**What it does.** `polar/tieout/calculation.py` reads `calcPr@calcMode`,
`calcCompleted` and `calcOnSave`. Every check whose claim is « this
number disagrees with that number » refuses when Excel does not
maintain the values — the five analytical rules (the model's own check
rows, the balance identity, cash continuity, the debt terminal,
interest consistency) and the deck tie-out — each carrying a sentence
that names the setting and the four-second remedy.

**What it deliberately does not refuse.** The mechanical audit. A
typed-over formula, a skipped row, a hardcode in a tail, a frozen
reference: read from formulas, and a formula does not go stale.
Refusing them would be a false refusal, which costs trust in the other
direction just as badly.

**Measured before it was wired.** Read straight out of
`xl/workbook.xml` on the 27-model gate corpus, so no library default
could invent an answer:

| | |
| --- | --- |
| `calcPr` present | 27 of 27 |
| **`calcMode="manual"`** | **1** — RIIO GDT3 WACC Rates Model, draft |
| `calcCompleted="0"` | 0 |
| `calcOnSave="0"` | 1 — under *automatic* calculation, so **not** refused |

One file in twenty-seven. A check firing on 3.7% of real regulator
models is proportionate, so § 5's rule went in as the founder wrote
it, with nothing narrowed. That `calcOnSave="0"` file is the false
refusal a sloppier rule would have produced — under automatic
calculation Excel is current regardless — and it is now a test.

**A lead for the arbiter round (Piece 5).** The manual file is one of
the two WACC models that already fail the recalculation fidelity gate:
~23k numeric divergences on their « Daily Data » sheets, recorded in
`fidelity-report.md` as « the one genuinely interesting class…
unexplained as yet ». A stale cache is exactly that shape.
**Hypothesis, not result** — it explains one of the two, and the other
is on automatic calculation, so something else is happening there too.

**Verified.** 22 tests; golden-master gate clean 27 of 27, finding for
finding; proven end to end on both real WACC models — the manual one
abstains across all five reconciling rules and still reports its 12
mechanical findings, the automatic one is untouched; ruff and format
clean; mypy clean on the changed files (the two errors it reports are
pre-existing in `audit.py`, which this did not touch). The UI needed
no change: the project page already renders « N checks could not
run: … ».

**One bug the real file caught that the unit tests did not.**
`str.capitalize()` lowercases the rest of the string, so the sentence
printed « excel does not maintain ». Unit tests asserted on the
substring and passed. Running it against an actual model showed it in
one line. Now pinned by its own test.

---

## 4b. Piece 2, measured — chat's five questions (28 August)

Full record: `g2-chat-protocol.md`, registered and committed before a
single question was asked.

**The stale claim was « 3 of 5 ». Measured, it was 2 of 5. After
fixing four defects it is 3 of 5 — the same number, for none of the
same reasons.** And G2 is **not DONE**: the bar is all five plus the
agent loop, and neither holds.

| # | Question | Verdict | Who owns the gap |
| --- | --- | --- | --- |
| Q1 | Why did the metric fall between versions? | ingredients, unjoined | the agent loop — **needs a model key** |
| Q2 | What feeds equity IRR? | **CORRECT** | — |
| Q3 | Where is this number from? | ABSTAINED, exemplary | **the Chain** (Piece 6) |
| Q4 | Hardcodes above materiality | **CORRECT** | — |
| Q5 | What changed? | **CORRECT** | — |

**The two remaining gaps are not chat's.** Q1 produces both halves of
its answer, correct and cited — the trace to `InputSummary!AR158` and
the version delta showing those very precedents moving 0.0313 → 0.0317
— and nothing joins them, which is what the loop does. Q3 needs one
confirmed document link to exist; the Chain's last round scored 0 of
15. **`ANTHROPIC_API_KEY` in the server environment unblocks Q1 and
the whole of Half B.**

**The four defects closed**, each found by asking a real model rather
than by reading code: a filename is not a name for a number (a Model
Log of 797 filenames was eating ten of `locate`'s twelve slots); a walk
that cannot happen now says why and what would answer; `inventory`
takes a materiality threshold and always states it or its absence; and
`versions` names which two versions it compared instead of « v? → v? ».

**A finding that outlives this piece.** Three of the founder's four
project-finance close copies are **values-pasted** — RHSC holds 608,191
cells and zero formulas, Bertha Park 113, Dumfries 328. Every question
resting on the precedent graph is unanswerable on such a file by
nature. The product now says so in words, including what would answer
(the version it was pasted from). This is a market fact worth knowing
before any demo.

**Verified:** 8 new tests, 45 in the tool suite, 1,126 passed across
tieout; golden-master gate clean; every claim re-runnable via
`scripts/g2_questions.py`.

---

## 4c. Piece 3, in flight — the flagship finding (28 August)

Full record: `e3c-flow-stock.md`, registered before any code.

**What I found on opening the canon, and it corrected this file.**
`pieces.md` said E2's accuracy had « never been measured ». That was
wrong: it was measured twice, and the second measurement is why units
is stuck. Currency and scale were armed on one key (« answered on
34.6%, wrong on none ») and then **failed a second, harder key at
24.62% wrong**. The rule that follows was already on the record: *a
dimension whose key cannot contain its failure case must not be armed.*
So E3a is refused, correctly, and no amount of work on it ships
anything.

**The way through is not the inference at all.** « A monthly figure in
an annual line » cannot even be *said* in the units vocabulary — the
word « month » does not appear in `units/inference.py`. The flagship
check reads periodicity out of the model's own arithmetic instead:
count columns, span dates, and see how many fine cells a coarse one
consumes. It owes the blocked inference nothing.

**Two attempts died before this one**, and both post-mortems are the
design. The last failed its own coincidence control at **77%** —
shuffle the labels and 503 of 655 rows still « aggregated », because
most rows are mostly zeros and zero sums with zero.

**Where it stands after the research round:**

| criterion | bar | result |
| --- | --- | --- |
| 1 — coincidence control | ≤ 5% | **0.376%** (30 of 10,827, exact bound) — **PASS** |
| 2 — defects on clean models | 0 | **1 finding** across 16 models (27 reports → 1) |
| 3 — planted recall | vs scope | running; 42 sites on Kelso alone |
| 4 — no finding moves, full gate | — | not reached; **nothing wired** |

**Criterion 1 passed only after the founder's research round proved my
own criterion incoherent** — I wrote a permutation test and computed a
ratio, and scored sixteen tiny samples separately when one breach of a
5% bar is the *expected* outcome of doing that. The three models I
reported as failures measure 0.70%, 2.5% and 0.33%. Corrected in the
direction that makes the claim **harder** (59 clean pairs required),
and stated before the number was computed.

**Criterion 2 is one finding, and the bar says zero.** All 27 reports
were hand-read at the cells; five of the six findings were **calendar
rows** — day counts breaking by one day in 182 — and the sixth is
kelso's `cash bank`, off by 70%, which is the shape the check exists to
find. The correction (a break must depart materially from what the
row's own pattern predicts) was registered before it was written, and
the prediction it made held exactly.

**Whether one unresolvable finding across sixteen clean models clears a
bar written as « zero » is the founder's call, not mine.** Two criteria
have already been corrected this round, both for arithmetic reasons; a
third correction on a judgement call is how a bar quietly becomes
whatever the result needed.

Ten defects, every one hand-read at the cells, **all ten false**, with
three causes — each a category error rather than a threshold: zero
periods voted for every reading; the defect test matched zero against
zero; and opening balances were judged as closing ones. Then the two
survivors turned out to be one number published on two rows, which the
collapse now folds into one finding.

**I also found the control lying against me** — a block-pair sharing
one label cannot be shuffled, so 16 of 28 « shuffled » rows were the
real pairing. Excluded from **both** sides, never just the failing one.

**Not adopted, nothing wired, golden master untouched.** Remaining:
the corpus sweep across all 22 closed-deal models (running — Kelso is
one file and one file is not the number), planted recall, then the
gate. Early coverage signal: some real models produce **no patterned
rows at all**, so the denominator is part of the verdict.

### Wired — 30 August, and what it is worth

The founder said « turn on and on to the next piece ». It is on:
`_broken_aggregation` runs inside `audit()`, the rule is in
`RULE_NAMES` and `HEADLINES` so a firm can switch it off and a reader
gets a name for it, it routes to a family in the workspace map, and it
ranks on its own evidence rather than the generic fallback.

**All four criteria met, and the golden master did not have to move.**

| criterion | result |
| --- | --- |
| 1 — coincidence control | **0.33%** at the exact 95% bound |
| 2 — false alarms | **0** on 22 close models, **0** on 27 regulator models |
| 3 — planted recall | **92.7%** (165 of 178), unchanged by the dust fix |
| 4 — no finding moves, full gate | **clean, 27 of 27** — baseline untouched |

**And the number that matters more than any of those: it speaks on 0
of the 27 regulator models.** Zero findings there was silence, not a
clean bill. Every silence was traced to a cause and all three are the
check being right — 19 models carry fewer than two date axes, 2 carry
only annual grids so no comparable pair can exist, and 6 pair a
monthly sheet that turns out to be a per-instrument dataset table with
no named line to match. The cells are in `e3c-flow-stock.md`.

**So the flagship earns its keep on project-finance close models and
nothing else so far.** On those it speaks on 16 of 22. Any sentence
quoting 92.7% or 0.33% without that is selling reach the check does
not have. It stays wired because it raises nothing false, prints its
reason rather than passing silence off as a clean bill, and moved no
existing finding — none of which is the same as reach.

**Three defects the wiring itself surfaced**, each fixed and recorded:
the date-axis constants were rewritten wrong on the move out of
`scripts/` and would have silently broken reproduction of every number
above; the A4 coverage invariant caught that the new rule took part in
coverage while belonging to no denominator set, which is now a named
constant in the engine with a second test holding the behaviour the
widened assertion cannot; and a sheet whose only date row is its
header row hands this check no axis, because the reader keeps header
cells out of the audit.

---

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
