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
| Serious-error mining (`serious-mining.md`) | **BLOCKED**, no candidate. Universe confirmed (1,206) but the classifier bucketed 100% into one bucket — the engine's legacy `.xls` reader misses formulas (19/144, 10/40, 0/349 by subject). Routed to the lead: `legacy.py` is outside my paths. |
| Proof 1A (`population-proof.md` § Results) | **FAIL**, run cold at `c6ff9a4e`. 10 of 11 models, 0 refusals, 5 silent. 8 of 13 findings are one false-alarm class: `_own_checks` reads a parameter column as a period. **Not fixed** — cold-run conditions; it is the next registered round. `hwcbsb_model.xlsm` unavailable. |
| A4 coverage (`a4-coverage.md`) | **Adopted.** `Audit.tallies` + `Audit.abstentions`, same shapes as analytics'. Gate clean, baseline untouched, catalogue unchanged. **Product side routed to the lead** — Atelier owns the report JSON. |
| Tasi re-score (`tasi-benchmark.md`) | **Done**, no code changed. Coverage 13.2% of Tasi's 3,702 / 22.2% of CUSTODES's 1,974. Scorer `scripts/custodes_tasi.py` reproduces Tasi's published 82.9%/75.2% exactly. The label sets **nest** (99.4% of CUSTODES ⊂ Tasi). Serious-error coverage is *lower* than overall — the named next mining question. |

Three adoptions have moved the rule catalogue 17 → 20
(`inconsistent-total`, `typed-over-edge`, `range-over-block`); the
first two broke an Atelier count test, which was routed. **Lesson
the lead asked for: name any catalogue-count change in the log the
same day.**

## In flight

**Nothing.** A4 is adopted and pushed; the serious-error mining
round is blocked on the lead (see below). The next turn starts a
new round from a clean slate.

## Next, per orders (in this order)

0. **The serious-error mining round is blocked** pending the lead's
   decision on the `.xls` reader defect (see the table). If it is
   fixed, re-run `scripts.custodes_serious` — the registration and
   classifier are committed and ready; only the reader was wrong.
1. **The own-check period defect** — Proof 1A's cause, now the
   best-evidenced fix in the record: `_own_checks` in `analytics.py`
   scans every numeric cell of a check row and ignores the period
   axes it is already handed. Register it, plant against Kelso and
   Newbattle (known false alarms), gate, and re-run 1A after.
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

**Needs the lead, not me (1):** the legacy `.xls` reader misses
formulas — proven arithmetically, quantified per subject. Fixing it
changes findings on every `.xls` file, which the golden-master gate
(all `.xlsx`/`.xlsm`) does not cover. Every `.xls`-route measurement
we hold understates the engine until then.

**Needs the lead, not me (2):** candidate 5's class 2 (a range spanning
a label) requires `Workbook.cells` to carry text cells — frozen
interface #1, visible to every lane, findings-moving engine-wide.
A lead-approved interface bump and its own round.

**Waiting on the lead:** A4's product surfacing (see
`a4-coverage.md` § Routed to the lead) — small, the schema shape
already exists.

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
- **Do not audit two 500k-cell workbooks in one process** — the
  second gets OOM-killed and can take the container with it. One
  heavy file per process, or read the small ones.
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
- **The legacy `.xls` reader misses some formulas** (`legacy.py`
  decompiles BIFF records; some cells fall through). Verify with a
  raw `FORMULA` (0x0006) record count before trusting any `.xls`
  measurement. A 100%-one-bucket classification is the symptom that
  found it.
- **The reader elects only numeric-or-formula cells.** A text cell
  mid-column is absent from `Workbook.cells` entirely — this killed
  candidate 5's class 2 and is pinned by a test in
  `test_audit_range_block.py`. Check this before designing anything
  that needs to see labels in a range.
- The Tasi clone lives in `scripts/custodes_work/tasi` (git-ignored,
  re-cloned on demand). **No licence in that repo** — internal
  benchmarking and citation only, never redistribute, never commit.
