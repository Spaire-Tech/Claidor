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
| A6 intake (`a6-intake.md`) | **REFUSED**, 3 of 5 criteria. All five held models convert; **two will not open** (LibreOffice writes `_xlnm.Print_Titles` empty, openpyxl raises). **No value changed anywhere** — recalculation-on-load did not happen. **Formulas are fabricated**: `=TRUE()` for every boolean cell. **The `.xlsb` route destroys every defined name** (keeps the name, drops the reference); the `.xls` route keeps all 805. Nothing wired, gate not run (no engine file changed). |
| Own-check periods (`own-check-periods.md`) | **Adopted.** `_own_checks` now judges only the sheet's own period columns. AU-UK unmoved (18 findings, 0 files), SFT exactly as specified in advance, gate clean 27/27 as a tripwire. **Its criteria were narrower than the change** — see the coverage effect below. |
| Proof 1A, second run (`population-proof.md` § second run) | **PASS** at `327058a5` — 5 of 5 true breaks, 0 false alarms, Kelso and Newbattle silent. **The pass is narrow:** the engine was fixed *using this corpus's failures*, so it can no longer test the original « never seen » claim. Never quote the pass without that sentence. |
| Tasi re-score (`tasi-benchmark.md`) | **Done**, no code changed. Coverage 13.2% of Tasi's 3,702 / 22.2% of CUSTODES's 1,974. Scorer `scripts/custodes_tasi.py` reproduces Tasi's published 82.9%/75.2% exactly. The label sets **nest** (99.4% of CUSTODES ⊂ Tasi). Serious-error coverage is *lower* than overall — the named next mining question. |

Three adoptions have moved the rule catalogue 17 → 20
(`inconsistent-total`, `typed-over-edge`, `range-over-block`); the
first two broke an Atelier count test, which was routed. **Lesson
the lead asked for: name any catalogue-count change in the log the
same day.**

## In flight

**Nothing running.** A6 is refused and written up; the own-check
round is closed and Proof 1A's second run is reported. The next turn
starts the round named first below, from a clean slate.

**Corpus state:** all five held models are on disk in
`scripts/corpus_sft/` (git-ignored, dies with the container).
`dalbeattie` and `our_lady_st_patricks` are fetched from the same
bucket as the rest — add them to `MODELS` in
`scripts/corpus_sft_models.py` if a successor needs them
reproducibly; today they are fetched by hand and hash-checked.

## Next, per orders (in this order)

0. **A6 round 2 — the repair pass.** Both refusal causes look
   mechanical: strip `definedName` elements with an empty body
   (fixes both refusals at a stroke) and rewrite
   `=TRUE()`/`=FALSE()` back to boolean literals. Then re-run
   `scripts/a6_fidelity.py` — the instruments are committed and the
   criteria are already registered in `a6-intake.md`. **Then** the
   question this round could not reach: what conversion does to a
   *genuine* formula, measurable only on `largs` (775) and
   `dalbeattie` (494), the two that will not open. Do **not** add a
   `.xlsb` reader as an alternative first: a second reader is a
   second surface for every rule downstream.
1. **The own-check abstention round.** The period
   restriction I adopted drops a check row from the denominator when
   none of its cells sit in the period grid, and raises **no
   abstention** saying so. Measured with `scripts/own_check_coverage.py`:
   AU-UK 232 → 232 (nothing), SFT 137 → 135 — `baldragon InpM!22`
   and `inverurie Input Cost Profiles!4`, both all-zero input-sheet
   check rows. No finding was lost, only a confirmation. The round:
   *an own-check row with no cells in the period grid must be
   abstained on, not dropped.* Full write-up in
   `own-check-periods.md` § « After adoption ».
2. **The serious-error mining round is blocked** pending the lead's
   decision on the `.xls` reader defect (see the table). If it is
   fixed, re-run `scripts.custodes_serious` — the registration and
   classifier are committed and ready; only the reader was wrong.
3. The « dead assumption » reachability candidate
   (`swens-aha.md`): dependency-graph reachability, no
   recalculation, one-sentence finding. Coordinate the rule name
   with the lead before adoption (it needs Atelier's category map).

**Open question parked for the lead:** the typed fold's
four-adjacent threshold leaves three-cell typed rows unfolded
(surfaced by c4 round 3). Moving it would change findings already
in the baseline, so it needs its own registered round.

**Also parked:** the collapse fold's missing adjacency test (the
`C_Capex` diagnosis from c1), and the A1 range-expansion round.

**For the lead, on the orders themselves:** the twenty-fifth sweep
says Proof 1A run 2 may proceed because « the own-check fix is
gate-certified ». **It is not, and cannot be** — the gate calls
`audit()` only and the baseline holds no analytical finding, so it
is blind to that change. The registration said so before the run.
What certifies it is the AU-UK zero-movement result and the SFT
prediction fixed in advance. Also: the five held models are four
`.xlsb` and one `.xls`, not « three and two ».

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

- **Capture tallies in a sweep, not just findings.** My AU-UK
  before/after for the own-check round recorded findings only, so
  when a coverage question arose it could not be answered from the
  artifacts and had to be measured again. Findings are what a round
  registers; tallies are what A4 made movable. Record both.
- **Compare more than the criteria name.** The own-check round's
  criteria passed cleanly and still missed a real effect, because
  they asked about findings and the effect was in coverage. Diff
  everything the run emits, then judge.
- **A number is not in the record until the committed instrument
  has produced it.** A6's results table carried a figure I had
  written from a correct diagnosis while the fix was still not in;
  only re-running the committed instrument to check reproducibility
  caught it. Re-run before you write, not after.
- **An unexplained disagreement is a claim about your instrument
  until you have read it at a cell.** A6 caught three of mine —
  shared-string indices counted as numbers, date cells skipped
  because openpyxl returns `datetime`, and `xlrd`'s separate date
  ctype dropped — the first two made ~21,000 perfectly converted
  cells look lost, the third made 4,018 look added. And where two readings fit
  the same counts, the counts cannot choose between them: A6's
  central finding nearly went in backwards until a probe at a named
  cell settled it (`scripts/a6_boolean_probe.py`).
- **Witness libraries for intake work** (venv only, never added to
  `pyproject`): `pyxlsb` reads `.xlsb` records — but its constant
  table names type 4 `BOOL`, and it *is* a boolean cell, not a
  formula; formula records are 8–11. `olefile` + a raw BIFF walk
  gives an honest `.xls` census (FORMULA 0x0006, BOOLERR 0x0205).
  `xlrd` reports dates as a **separate ctype** from numbers — take
  both or you undercount.
- Proof 1A's first run is preserved at `scripts/proof_1a_run1/`;
  the runner writes to `scripts/proof_1a_results/` and **skips any
  model already there**, so archive a run before re-running.
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
- **LibreOffice needs `libreoffice-calc` installed — this
  container ships `libreoffice-core` without it.** My earlier
  lesson here said conversion « could not be loaded » for reasons
  unknown and blamed the files; that was **wrong**. With no Calc
  component *no* spreadsheet loads, including a valid `.xlsx` from
  our own corpus. `apt-get update && apt-get install -y
  --no-install-recommends libreoffice-calc` fixes it (the index is
  stale on a fresh container, so the update is not optional).
  Reading legacy `.xls` directly still works and is still how the
  CUSTODES round recovered its lost cell (1,974, the paper's
  figure) — but « LibreOffice is broken here » was never true.
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
