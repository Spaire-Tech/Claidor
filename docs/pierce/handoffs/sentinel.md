# Sentinel — cold-start handoff

For a successor who remembers nothing. The map, not the diary —
history lives in `logs/sentinel.md`; each round's authority is its
own document.

## Who you are

Sentinel, the engine-findings lane (Track A). Branch
**`swens/sentinel`**, based on `claude/pierce-phase-6-writing-mjkaj6`.
Read `notes.md`, then `lanes.md` (charter, paths, the one hard
rule), then `orders/sentinel.md` (the lead's tasking, refreshed
every integration sweep). **You are the only lane that may change
what the engine reports**, which makes you custodian of
`corpus-golden-master.json`: every findings change runs the full
gate and regenerates the baseline *in the same commit*.

The loop, non-negotiable: registration committed **before** any
result → planted recall on our own corpora → false-positive price
hand-read at the cells → full gate → verdict written whichever way
it falls.

## Done and merged

| Round | Outcome |
|---|---|
| A3 c1 sibling totals (`a3-sibling-totals.md`) | Adopted. Rule `inconsistent-total`. Round 1 refused on a designed depreciation triangle; round 2's consequence guard fixed it. |
| A3 c2 family edge (`a3-family-edge.md`) | Adopted. Rule `typed-over-edge`. Round 1 refused on typed index-base 1s; round 2's identity + horizontal-seed guards fixed it. |
| A3 c3 beat families (`a3-beat-families.md`) | **Unmeasurable** — zero plantable lattices in all 27 files. Implemented, tested, deliberately **unwired**, catalogue untouched. Revisit if the MCC ERR or Tasi corpora bring strided layouts. |

Both adoptions moved the rule catalogue 17 → 19 and broke an
Atelier test (routed). **Lesson the lead asked for: name any
catalogue-count change in the log the same day.**

## In flight — A3 c4, column typed-over (`a3-column-typed.md`)

Round 1 (verification, no code): 45 plants, 41 caught; the island
pass owns the column direction except where its **left-formula
history guard** suppresses it. Round 2 (waive that guard for
*interior* islands): implemented, tested, measured — **REFUSED**
three ways (31% worth showing; a file gained 6; a letter-refusal on
a plant that was never recoverable). Round 3 is **registered and
being implemented now**: the waiver additionally requires the typed
value to be neither 0 nor ±1, because 16 of the 26 new findings
were typed-zero template rows — the class `custodes-mining.md`
rejected by name.

**Next step, precisely:** implement the round-3 condition in
`_island_findings`, add the zero test, re-audit the three planted
files, run the full sweep, diff, and adopt only if the diff is
exactly the eight worth-showing findings named in the round-3
registration.

## Then, per orders

1. **The Tasi re-score** (high priority, ahead of c5) —
   `china-os-findings.md` §1; shallow-clone `tcse-iscas/Tasi`;
   registration first; never redistribute (no licence).
2. A3 c5 (range vs block), then A4 (coverage denominator, report
   JSON routed through the lead), then the « dead assumption »
   reachability candidate (`swens-aha.md`).

## What this container taught me

- Run everything from `server/`. `uv run python -m scripts.x` —
  bare script paths fail to import `polar`.
- **Tests: `--noconftest`.** The root conftest can't load on this
  Python 3.14 RC (pydantic `_eval_type`), and six schema-bound
  tieout files fail *collection* for the same reason — on the
  unmodified tree too. The ~433 engine tests all pass; verify by
  stashing before blaming your change.
- `mypy polar/tieout/audit.py` reports **2 pre-existing errors**
  (`Decimal | None` into `float`). Two is clean; three is yours.
- Heavy workbook jobs **run alone** — a concurrent pair OOM-killed
  a sweep here. A full 27-file sweep is ~45–70 min; big BPFM files
  are 400–700s each.
- Rebuild the corpus with `uv run python -m scripts.corpus_au_uk`
  (27 files, git-ignored). Planted files live in the session
  scratchpad and die with the container — they are reproducible
  from the committed harnesses under `server/scripts/planting/`
  plus the registered seeds.
- Background a long job and wait on its PID; a killed *waiter* does
  not kill the job — check the log before assuming loss.
- Beware `cmd | tail -1` masking a `ruff format --check` verdict.
