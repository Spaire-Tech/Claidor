# Sentinel — checkpoint handoff (27 Aug 2026)

Written at the founder's stop-and-checkpoint order, mid-round. This
file says exactly where everything stands so any session — this one
resumed, or a fresh one — can pick up without guessing. The
authority on each round is its own document; this is the map.

## Where work stands, round by round

| Round | State |
|---|---|
| A3 c1 — sibling totals (`a3-sibling-totals.md`) | **Adopted**, merged by the lead. Rule `inconsistent-total`. |
| A3 c2 — family edge (`a3-family-edge.md`) | **Adopted**, merged. Rule `typed-over-edge`. |
| A3 c3 — beat families (`a3-beat-families.md`) | **Unmeasurable** on this corpus; implemented, tested, deliberately unwired. Merged. |
| A3 c4 — column typed (`a3-column-typed.md`) | **Mid-round-2, the only open work.** See below. |
| A3 c5 — range vs block | Not started. Next per orders after c4. |
| A4 — coverage denominator | Not started. After c5 per orders. |

## Candidate 4, exactly where it stopped

Round 1 (verification) is done and pushed: the island pass owns the
column direction except where the left-formula history guard
suppresses it — 3 of 4 no-left-formula plants missed, run to
ground. Round 2 (the interior-island waiver) is **implemented,
unit-tested (433 green) and pushed**; its measurement is
partially done:

- Precondition sweep: **gate clean** (pre-waiver engine — this is
  the formal certification the lead's twelfth-sweep note expects).
  `scratchpad/precondition-c4r2.json` on this container.
- Planted re-audit: **42/45**, `B151` recovered; `F294` still
  missed and the examination shows why — its family pins absolute
  rows, no shape repeats, the witness can never fire; **round 1
  misattributed that miss to the guard and the correction is
  recorded** in `a3-column-typed.md`. Criterion 3's letter
  therefore refuses; the examination is on record for the decision.
- Decisive sweep: **complete on disk, diff NOT yet run** —
  `scratchpad/after-sweep-c4r2.json` (27 files; `final_wacc`
  13 → 15 findings, so movement exists and every line must be
  hand-read against criteria 1–2 before any verdict).

## To resume (in order)

1. `cd server && uv run python -m scripts.corpus_gate diff
   ../docs/pierce/corpus-golden-master.json
   <scratchpad>/after-sweep-c4r2.json`
2. Hand-read every line against round 2's criteria 1–2 (only
   left-formula-waiver island findings or typed-fold growth; flood
   line 5; two-thirds worth showing).
3. Decide adopt/refuse with criterion 3's letter-refusal and the
   F294 examination weighed openly; on adoption regenerate
   `corpus-golden-master.json` **in the same commit**; write the
   verdict in `a3-column-typed.md`, the round paragraph in the
   log, and name any catalogue-count consequence for the lead.
4. Then c5, then A4, per the orders file.

## Container state worth knowing

Corpus rebuilt at `server/scripts/corpus_au_uk/` (27 files).
Planted files and truths for c1/c2/c4 under the session scratchpad
(`planted/`, `planted2/`, `planted4/`) — scratchpad dies with the
container; truths are reproducible from the committed harnesses and
registered seeds. The tieout tests run `--noconftest` here; six
schema-bound files fail collection on this Python 3.14 RC,
unmodified tree and modified alike.

## Not stuck

Nothing is blocked. The checkpoint landed between the sweep
finishing and its diff running; every step to the verdict is
mechanical from here.
