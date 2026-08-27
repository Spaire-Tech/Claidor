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
| A3 c4 column typed (`a3-column-typed.md`) | **Adopted** (3 rounds). The island pass's left-formula guard is waived for interior islands that hold a substantive value. +12 corpus findings, baseline regenerated with it. No new rule — catalogue stays 19. |
| A3 c5 range vs block (`a3-range-block.md`) | **Adopted.** New rule `range-over-block`: a range swallowing a subtotal of its own rows. 13/13 planted caught, gate clean (zero corpus findings), baseline untouched. Catalogue **19 → 20**. Class 2 (range spanning a label) **withdrawn** — the reader does not elect text cells. |
| Tasi re-score (`tasi-benchmark.md`) | **Done**, no code changed. Coverage 13.2% of Tasi's 3,702 / 22.2% of CUSTODES's 1,974. Scorer `scripts/custodes_tasi.py` reproduces Tasi's published 82.9%/75.2% exactly. The label sets **nest** (99.4% of CUSTODES ⊂ Tasi). Serious-error coverage is *lower* than overall — the named next mining question. |

Both adoptions moved the rule catalogue 17 → 19 and broke an
Atelier test (routed). **Lesson the lead asked for: name any
catalogue-count change in the log the same day.**

## In flight

**Nothing.** Candidate 4 and the Tasi re-score are both finished
and pushed. The next turn starts a new round from a clean slate.

## Next, per orders (in this order)

1. A4 (coverage denominator) — report-JSON additions routed
   through the lead, since Atelier owns what the product reads.
2. The « dead assumption » reachability candidate
   (`swens-aha.md`): dependency-graph reachability, no
   recalculation, one-sentence finding. Coordinate the rule name
   with the lead before adoption (it needs Atelier's category map).

**Open question parked for the lead:** the typed fold's
four-adjacent threshold leaves three-cell typed rows unfolded
(surfaced by c4 round 3). Moving it would change findings already
in the baseline, so it needs its own registered round.

**Also parked:** the collapse fold's missing adjacency test (the
`C_Capex` diagnosis from c1), and the A1 range-expansion round.

**Needs the lead, not me:** candidate 5's class 2 (a range spanning
a label) requires `Workbook.cells` to carry text cells — frozen
interface #1, visible to every lane, findings-moving engine-wide.
A lead-approved interface bump and its own round.

**Best-funded open question in the record:** the Tasi
serious-error gap — 1,206 of their 1,308 serious cells fall outside
every finding we raise, with a ready-made sample to hand-read.

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
- **LibreOffice cannot convert the CUSTODES/Tasi `.xls` subjects
  here** — 24.2.7.2 is installed and launches, but every one fails
  « source file could not be loaded » (not profile, not
  permissions). Read legacy `.xls` directly: our own reader has an
  xlrd path, and xlrd's `cell_note_map` reads the comment-based
  ground truth. Doing so recovers the cell the CUSTODES round lost
  in conversion (1,974, the paper's figure).
- **The reader elects only numeric-or-formula cells.** A text cell
  mid-column is absent from `Workbook.cells` entirely — this killed
  candidate 5's class 2 and is pinned by a test in
  `test_audit_range_block.py`. Check this before designing anything
  that needs to see labels in a range.
- The Tasi clone lives in `scripts/custodes_work/tasi` (git-ignored,
  re-cloned on demand). **No licence in that repo** — internal
  benchmarking and citation only, never redistribute, never commit.
