# The pieces — what is finished, what is half, what is untouched

Written 28 August 2026, at the founder's direction: « we are going to
kill the agents… re-piece everything that needs to be done and you and
I will do piece by piece. »

This file replaces the lane orders (`orders/`) as the working list.
It is a re-piecing of `swens-plan.md` — the plan of record — against
what is actually in the tree today, not against memory. Every row
below names **how I know**, so the founder can check any line without
taking my word for it.

## The operating model from today

- **No lane agents.** Sentinel, Dynamo, Prism, Scribe and Atelier are
  stood down. Their merged work stays; their branches stay in git
  history. Nothing is thrown away.
- **I build every piece**, one at a time, in the order below, and I do
  not open the next piece until the current one is green.
- **One verifier agent exists**, and it runs only when the founder
  asks for it: after a piece is complete, to hunt for bugs, gaps and
  things I missed. It never builds.
- **A piece is 100% when**: its DONE test from `swens-plan.md` passes,
  the golden-master gate is clean, `dev/verify` is green, and its
  number is written down in a doc of record. Three of four is not
  done.

## How to read the status column

| Status | Meaning |
| --- | --- |
| **DONE** | DONE test met and the number is recorded |
| **HALF** | code exists and is tested, but its DONE test is unmet, unarmed, or never run |
| **NONE** | nothing exists beyond the plan text |

Verification basis is given per row. Where I have not checked, the row
says **not verified** rather than guessing.

---

# Part 1 — finished (do not reopen)

| Item | What it is | Basis |
| --- | --- | --- |
| F1–F2 | Write path + changeset (byte-preserving edits, apply/undo, re-audit gate) | `write/`, `changeset.py`, `test_write*.py`, `test_changeset.py`; certified on the 27-file corpus |
| A2 (part) | CUSTODES scorer, validated against published figures | `custodes-benchmark.md`; ExceLint half still open — see Part 3 |
| A3 (mining) | Five candidate patterns mined, four refused with reasons | `custodes-mining.md` |
| A7 | Shape-hash normalization (commutativity, constant folding) | `a7-normalization-protocol.md`, `test_shape_normalization.py` |
| A6 (.xls) | Legacy `.xls` read directly for formulas | `legacy.py`, `test_legacy.py` |
| A6 (.xlsb) | `.xlsb` via LibreOffice conversion | `binary.py`, `test_binary.py` — **16 passed, 28 Aug** |
| Speed round | Median regulator model 23s → 6.9s, 384 MB → 155 MB; heaviest 6,290 MB → 1,255 MB, read 252s → 121s | cell-by-cell differential vs openpyxl (27 files, 0 differences), styles differential (27 files, 0 differences), golden master 27/27 identical |
| B1–B2 | Recalculator pool + fidelity gate, run on the 27-model corpus | `recalc/pool.py`, `recalc/gate.py`, `fidelity-report.md`, 43 recalc tests green |
| C1 | Raw version diff | `watch/diff.py`, `test_watch_diff.py` |
| C2 | DP row/column alignment on label+shape signatures | `watch/align.py`; anchor decomposition measured 10–73× on 11 of 12 real sheets |
| G1 | Findings API (severity, materiality, evidence, cell sets, accept/explain, house-rule filter) | `endpoints.py`, `service.py`; the Grid renders from it |
| G4 (first pass) | The report exists and is generated | `report-kelso.pdf` (224,553 bytes) built from the product |

---

# Part 2 — half done (the real queue)

Ordered by the founder's fourth amendment: **by hole, not by polish.**

## Piece 1 — E3, units mismatch: implemented, measured, and refused

**State.** `_unit_mismatch` exists in `audit.py:4677`, is unit-tested
(`test_audit_unit_mismatch.py`), and is **deliberately not called by
`audit()`** — the comment at `audit.py:816` records why: run against
the corpus it produced 103 findings and all 103 were false alarms.

**What is actually missing.** Not the check. The *inference* under it.
E2 (`units/inference.py`) has never had its accuracy measured per
dimension against E1's hand-labelled set — and the plan arms E3 « only
where inference is measured-accurate ». So the work is:

1. Confirm E1's labelled set exists and covers enough rows.
2. Measure E2 per dimension (currency, scale, period, rate-vs-decimal)
   against it, registered before looking.
3. Arm E3 only on the dimensions that clear the bar; kill the flood
   the usual way — every false alarm names a principle.

**DONE test.** The flagship finding (« a monthly figure in an annual
line ») exists with a published per-class number — *or* units stays
out of the product and that is written down.

## Piece 2 — D3/D4, the Chain's linking

**State.** `chain/extract.py`, `store.py`, `propose.py`, `anchor.py`,
`repository.py`, `router.py` all exist with tests. Six matcher rounds
have run. The most recent (Kelso) scored **2 proposals, 13 abstentions
out of 15 scorable rows — zero correct**, and the diagnosis was
structural, not judgement: on 11 of 15 rows some non-truth line scores
strictly higher than the truth line, and 4 rows cite a continuation
page that carries **no labels at all** (a wide table printed as a
two-page spread).

**What is actually missing.** Document geometry, not matcher tuning.
The extractor has to carry a row's label across a page break before
the matcher can possibly be right. Then re-run the registered sample.

**DONE test.** D3: proposal quality measured on a real deal set,
judged from the documents. D4: a revised model re-checks its confirmed
links with no model call, and the map survives.

## Piece 3 — G2, chat's unanswerable questions

**State.** The tools exist and are tested: `locate`, `trace_back`,
`trace_forward`, `inventory`, `structure`, `versions`, `sources`
(`agent/model_tools.py`, `test_model_tools.py`, `test_agent_tools.py`).
Between them they cover all five canonical questions.

**What is actually missing.** The judgement. « Answers 3 of 5 » was a
stale lane assessment I repeated without checking, and the tool
inventory suggests both reported gaps may already be closed —
**nobody has re-tested.** So: run the five canonical questions against
a real model, judge the answers, publish which ones hold.

**DONE test.** All five answer correctly on a real model, judged, with
every number cited to a cell or a page and out-of-model questions
declined.

## Piece 4 — B3, the arbiter

**State.** The *routing* exists — `recalc/gate.py` marks a file an
arbiter candidate and `service.py` names the arbiter as where a
refused file goes. **No arbiter exists.** Four corpus files (2 WACC
models at 95.8–96.3%, 2 draft PCFMs) sit in that bucket today, plus
the GT3 file whose 1,294 `#NAME?` errors are LibreOffice 24.2 not
knowing the XLOOKUP/LET generation.

**Adjacent, and cheaper:** the container runs **LibreOffice 24.2.7.2**;
the plan calls for **≥ 25.8**. Some of the arbiter's queue may be a
version gap, not a real disagreement. Check that first.

**DONE test.** A gate failure produces an arbiter verdict, not a shrug.

## Piece 5 — C3/C4, the Watch's delta report and tiers

**State.** `watch/delta.py`, `watch/tiers.py`, `watch/trace.py`,
`watch/stealth` tests all exist. Version comparison measured **2.55×
faster** this week (1,119.6 s → 438.4 s on a 15 MB pair, items and
changed cells identical).

**What is actually missing.** Two things.
1. **Speed:** the test is « 12 MB in under two minutes ». A 15 MB pair
   costs 438 s today, ~350 s scaled to 12 MB — about **3× over the
   line**. The largest remaining item (210 s) is the engine clearing
   the shape cache the audit just computed; that is mine to fix, and
   it is a cache-lifetime change, not an algorithm change.
2. **The DONE test itself:** the PR24 revision pair reproducing its 84
   introduced defects through the delta report — **never run**.

**DONE test.** As written in the plan, both halves.

## Piece 6 — A1, the performance round

**State.** In flight and most of the way there. The speed round landed
(see Part 1). `a1-performance.md` is **stale** — it stops at rounds
1–2 and does not contain this week's numbers. That is a documentation
hole in a piece I am calling nearly done, which is exactly the kind of
thing that makes a status untrustworthy.

**What is actually missing.**
1. Append the speed round to `a1-performance.md` with its method.
2. The spec's sentence — 600k cells read in under a minute — is still
   **owed to a quiet machine**. This box swings ±30% and cannot honestly
   measure it. Heaviest file reads in 121 s here; « under a minute »
   is not proven and I will not claim it.

**DONE test.** The spec's sentence is true on the biggest corpus file,
measured — on a machine that can measure it.

## Piece 7 — A5, house rules as configuration

**State.** `house_rule` exists across `models/tieout.py`,
`repository.py`, `service.py`, `endpoints.py`, and the Settings screen
is wired. **Not verified**: whether two different firm configurations
actually produce two correctly different reports from one model, and
whether the record shows what was disabled and by whom.

**DONE test.** Two firm configs, one model, two correctly different
reports, with the disabling recorded.

## Piece 8 — B5/B6, relation mining and diagnosis

**State.** `recalc/mine.py`, `recalc/laws.py`, `recalc/narrow.py`
exist with tests (43 recalc tests green). **B6 is HELD by the
founder-relayed amendment**, pending evidence from the Ofwat run about
whether real regressions break one rule or many.

**What is actually missing.** B5's registered measurement in both
directions: overlap with the 84 static-found regressions, *and* the
set B5 flags that the static engine missed, hand-verified. The second
set is where the thesis lives or dies, and it has not been run.

**DONE test.** Mined laws stable across two mining runs; planted
law-breaking edits caught at a measured rate with a per-class table;
zero false law-violations on the unedited model.

---

# Part 3 — not started

| Item | What it is | Why it is not started |
| --- | --- | --- |
| **A2 remainder** | ExceLint scored on CUSTODES with our scorer | Blocked: the ExceLint repo was never approved into the session |
| **A3 candidates** | The five mined checks through the normal loop | Queued behind the holes; four of five were already refused with reasons |
| **A4** | Coverage on the face of the report (« 102 checked, 26 not ») | `test_audit_coverage.py` exists — **status not verified**, listed here rather than claimed done |
| **C6** | The rule-set diff over mined laws | Gated on two stability preconditions (seed stability, cosmetic invariance) that have not been measured. Correctly gated — not a delay |
| **D6** | Deck tie-out re-pointed at the Chain's store | Depends on Piece 2 |
| **D7** | Outward checks — EDGAR, Companies House, rate sources | **Confirmed absent**: no `edgar` or `companies_house` anywhere in the tree |
| **F3** | Determined-fix classes with the « determined, not inferred » test each | `write/edit.py` has the mechanism (`replacement_for`); the classes and their refusal cases do not exist |
| **F4** | Custody — corrections held by Swens, never written to customer stores | Enforced-by-construction test not written |
| **H1–H2** | Files-only engagement end to end; closed-by-default posture | `security-posture.md` exists; the end-to-end run has not happened |
| **H3** | Connection mode | Explicitly not on the critical path |
| **The four proofs** | Population, units, catch-rate, delivery | None started. Proof 4 (design partners) is **deferred by the founder**, not failed |

---

# Part 4 — the debts I am carrying, named

Things that are nobody's plan item but will bite if left:

1. **`a1-performance.md` is stale** (Piece 6 covers it).
2. **~40 research documents under `docs/pierce/` are cited by nothing.**
   `a6-xls-routes.md` (329 lines on reading `.xls`) is the proof of
   cost: I rediscovered its contents by hand this week. Each document
   gets an owner or gets archived.
3. **The lane orders under `orders/` are dead** as of today and should
   say so at the top rather than read as live instructions.
4. **Sentinel's units done-test was written wrong by me** — it assumed
   a check that E2's accuracy does not yet permit arming. Piece 1
   restates it correctly.
5. **My prose-to-code ratio was 83 lines of code to 2,079 lines of
   documents over two days.** That is the measured version of « running
   around in circles », and it is the reason this file is short and
   the next thing I do is code.
