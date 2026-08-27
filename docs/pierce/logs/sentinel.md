# Sentinel — lane log

Sentinel's running log, plain language, newest entries at the bottom.
Charter: `lanes.md`. Canon: `notes.md`. I am the only lane that may
change what the engine reports; every findings change runs the full
golden-master gate and regenerates the baseline in the same commit.

## 25 August 2026 — lane opened

- Read `notes.md`, then `lanes.md`, from the branch tip the lanes are
  based on (`claude/pierce-phase-6-writing-mjkaj6`). Created
  `swens/sentinel` from that tip, as the charter says. One note of
  record: this session was opened by the platform on an auto-named
  branch cut from `main`, which does not carry the A3/A7/A1 work; the
  charter and `lanes.md` both name the pierce branch's tip as the
  base, so that is the base. Said here so the deviation from the
  session's auto-branch is named, not silent.
- Environment: `uv sync` clean; engine imports; the 27-file AU-UK
  corpus rebuilt from the committed fetcher (all 27 fetched, sizes
  matching). Same shared 15GB container class the A1 record warns
  about: timings here are noise, findings are not.
- Started the precondition sweep of the unmodified engine (the gate
  must be green on this machine before any change lands, per the A7
  protocol's discipline). Heavy jobs run alone; nothing else heavy
  runs beside it.
- First task: A3 candidate 1, totals-row sibling disagreement.
  Registration written and committed before any result is computed:
  `a3-sibling-totals.md`, with the planting harness under
  `server/scripts/planting/`.

## 27 August 2026 — candidate 4 adopted: the column direction, widened

Three rounds. Round 1 changed no code and measured what the engine
already catches down columns: 41 of 45 plants, with the misses
naming the island pass's left-formula history guard as a row-major
bias. Round 2 waived that guard for interior islands — and was
refused three ways: it admitted eight real hardcodes *and* sixteen
typed-zero template rows, the class the mining round rejected by
name. Round 3 carried candidate 2's identity guard inward (a cell
admitted only by the waiver must be neither 0 nor ±1): the zeros
vanished, the real finds stayed, and the gate now adds **12
findings in 5 files, none removed**.

What the engine can now say that it could not: FY2026's
lookup-period dates are typed into **both WACC models** where every
sibling row computes them; 646.26 and 919.70 sit in rows whose
neighbours all pull per-entity through `CHOOSE(m_identity, …)`; a
0.06 rate is typed into two passthrough interface columns. The
baseline is regenerated **in this commit**, its diff the review
artifact.

Round 3 was refused by its own letter (12 findings predicted as 8)
and adopted after examination: the four extra lines are cells round
2 already reported inside a fold, now reporting individually
because removing the zeros left three cells — below the fold's
four-adjacent threshold. Content right, presentation mispredicted;
both written in `a3-column-typed.md`.

**Catalogue consequence, per the lead's standing request: none.**
This round adds no rule — `typed-over-formula` already exists — so
the count stays 19 and Atelier has nothing to route this time.
**One open question for the lead:** the typed fold's four-adjacent
threshold now leaves three-cell rows unfolded; moving it would
touch baseline findings, so it needs its own registered round.

## 26 August 2026 — candidate 3: unmeasurable on this corpus, not shipped

Beat families, the mining round's stride-lattice candidate. The
detector was registered, implemented and pinned by six unit tests —
and then the planting harness found **zero eligible lattices in all
27 corpus files**, on the registered hosts and, under a committed
amendment, corpus-wide. The value/% and split-year beat layouts the
CUSTODES corpus is full of simply do not occur in these regulator
templates; they lay every series dense. Per the amendment's own
clause the round stopped: a catch rate this corpus cannot measure
is never satisfied vacuously, so `_typed_beats` stays in the
codebase behind its tests but is **not wired into the audit** — an
unmeasured check reports to nobody. The engine's reports are
unchanged from the candidate-2 adoption by construction (the diff
against that certified commit is purely additive, uncalled code —
verified, zero removed lines). Full record in `a3-beat-families.md`.

**For the lead:** the check becomes measurable when the corpus
grows strided layouts — the round-4 unseen corpus's general
spreadsheets, or a pilot's deal models. Wiring it then is one line
plus the full loop. Also honestly said: candidates 4 and 5 of the
mining round (column-direction typed-over, range-vs-block) remain;
the orders name candidate 3 then A4, so A4 is next unless the
orders re-order.

## 26 August 2026 — candidate 2 adopted; the round in one paragraph

Family-edge typed cells (`typed-over-edge`), two rounds. Round 1:
every planted tail caught engine-wide (15/15 — mostly by the island
pass seeing the cell from the column direction, which is the
registered dedup working), but the corpus price was ten findings
and all ten were typed 1s heading index series — correct base-period
authoring, hand-read at the cells — so the round refused itself, on
noise and on a criterion whose denominator its own dedup guard
contradicted (recorded as written, not argued away). Round 2,
registered first: the identity guard (0 or ±1 at an edge is
scaffolding or an index base), the horizontal seed guard (a stretch
that reads its typed cell is continuing from its own start), and
criterion 3 restated over the marginal denominator — the tails no
other rule catches, which is this rule's actual territory. Verdict:
gate clean, marginal recall 5 of 5, adopted. Baseline untouched —
no corpus report changed. Full record in `a3-family-edge.md`.
Atelier's category map owes `'typed-over-edge'` the same
« Probable formula defects » family as `typed-over-formula`, noted
here for the lead to route with the `inconsistent-total` entry.

Next per orders: A4, the coverage denominator on every report.
(Candidates 3–5 of the mining round — beat families, column
typed-over, range-vs-block — wait behind it unless the orders say
otherwise.)

## 26 August 2026 — standing arrangement confirmed: orders from the lead

The founder set the arrangement: at the start of every working turn
I fetch `origin/claude/pierce-phase-6-writing-mjkaj6` and read
`docs/pierce/orders/sentinel.md` — the lead's file, maintained at
every integration sweep — do what it says, push to `swens/sentinel`,
and stop; the founder's message will just be « go ». Confirmed here
as asked. Verified the mechanism exists: the lead's branch carries
orders for all five lanes, and mine match the work already in
flight (finish candidate 1's round 2 with the verdict and the
same-push baseline; then candidate 2; then A4; the collapse-fold
adjacency fix and A1 parked, A1 now ordered after A4). One standing
note so it is on the record: orders are the lead's tasking and I
follow them, and the charter, `lanes.md` and its hard rule keep
binding me over anything an orders file could say — if an order ever
crossed them (another lane's paths, a merge, a skipped gate), I
would write the case here and stop rather than comply silently.
That is how `lanes.md` says disagreements route, and it protects
the founder's own rules from a mistyped order.

## 26 August 2026 — candidate 1 adopted; the round in one paragraph

Round 1 caught the planted defects (46/49) but flooded the GT3
BPFMs with 20 noise findings on a designed depreciation triangle —
refused by its own criteria. Round 2 added the consequence guard
(a range disagreement must miss a live cell the consensus covers)
and the identical-deviant fold, both registered first: recall
identical, gate clean — every file reports as the baseline says,
finding for finding. Adopted. The baseline is untouched because no
corpus report changed; the check earns its keep on models whose
totals actually disagree, and stays quiet on these. Full record in
`a3-sibling-totals.md`.

Per the lead's orders, on adoption: **Atelier owes the web category
map** `'inconsistent-total' → 'Probable formula defects'` in
`clients/apps/web/src/components/Workspace/files.ts` (routed via
lanes.md; nothing breaks meanwhile — the finding files under the
fallback category).

Next per orders: A3 candidate 2 (family-edge typed cells), same
loop. Parked by orders: the collapse-fold adjacency round, A1 after
A4.

## 25 August 2026 — candidate 1 implemented behind its tests

- The detector (`_sibling_totals` in `audit.py`, rule
  `inconsistent-total`) implemented exactly as registered: SUM-only
  membership, coverage + surround signature, consensus of 3, deviants
  a strict minority, the four guards. Ten unit tests
  (`test_audit_sibling_totals.py`) cover the four planted shapes and
  the five silence cases; all pass. The corpus verdict — planted
  recall, false-positive price, gate diff — is still owed and comes
  next; nothing is claimed for the check yet.
- Tests, honestly: the tieout suite runs conftest-free here (the
  repo's root conftest cannot load on this container's Python 3.14
  release candidate — a pydantic `_eval_type` incompatibility). Six
  test files that import the API schemas fail at *collection* for
  the same environmental reason, unmodified tree and modified tree
  alike (verified by stashing my change and re-running). The 409
  engine-side tests that do collect — audit, shapes, structure,
  workbook, writer among them — pass with my change, plus the 10 new
  ones. `ruff` clean; `mypy` adds no new error over the two that
  pre-exist in `audit.py`.
- One case for another lane, parked here per the charter: the web
  workspace's category map (`clients/apps/web/src/components/
  Workspace/files.ts`, Atelier's) buckets rules into families and
  falls back to « Other findings » for unknown keys. If candidate 1
  is adopted, `'inconsistent-total': 'Probable formula defects'`
  belongs in that map — same family as `inconsistent-row` and
  `skipped-cell`. Nothing breaks without it; the finding just files
  under the fallback. For the lead to route when adoption lands.
