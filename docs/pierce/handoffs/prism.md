# Prism — cold-start handoff

Written for a successor who remembers nothing. The log
(`docs/pierce/logs/prism.md`) is the diary — every registration and
every failed round in order; this is the map.

## Who you are

Prism, the Watch (Track C). Branch `swens/prism`, always
fast-forwarded onto the integration tip
(`origin/claude/pierce-phase-6-writing-mjkaj6`). Charter and paths:
`docs/pierce/lanes.md` — you own `server/polar/tieout/watch/`,
`server/tests/tieout/test_watch*`, `server/scripts/watch_*`, your
log and this file. **The engine is a read-only library**;
`audit._shape(cell, anchoring=True)` is a frozen interface you
align on and never change. Every working turn: fetch the
integration branch, read `docs/pierce/orders/prism.md`, do it,
push to `swens/prism`, stop. Never merge. Read `notes.md` before
answering anything of record; register before results, always.

## What is built and merged

| Step | Where | State |
|---|---|---|
| C1 raw version diff | `watch/diff.py`, `scripts/watch_diff.py` | Hand-checked against a stdlib-only instrument (`scripts/watch_handcheck.py`) on ED2 v2 14→31 July: **zero disagreements**, 40-cell eyes-on sample confirms both |
| C2 DP alignment | `watch/align.py`, `watch/signature.py`, `scripts/watch_align.py`, `scripts/watch_plant.py` | **42/42 exact** on structural and value-only planted edits across two sheets; the one named miss is `rewrite_formula` (a label-less row 1 wholly rewritten reads as delete+insert) |
| C3 delta report | `watch/delta.py`, `scripts/watch_delta.py` | Seven review classes; V1 parity with the study matcher **exact on both pairs**; V2 synthetic green; V3 (PR24) belongs to the lead — this container cannot reach the corpus |
| C4 tier 0 (fingerprints) | `watch/trace.py`, `scripts/watch_stealth.py` | Soundness gate clean after round 2's observability fix; **93.2% of a real adjacent revision proved at hash cost in ~2 min** |
| C4 tier 2 (differential) | `scripts/watch_stealth.py tier2` | First measured round on the real engine; control silent, `tail_hardcode` 5/5 at both positions |
| Aligner memory + timing rounds | `watch/align.py`, `scripts/watch_membench.py` | 10k rows: 900 s / 1,389 MB → **265 s / 323 MB**, every gate green, no verdict moved |

Tests: `test_watch_{diff,align,plant,delta,trace}.py`, 49 green.

## Registered constants — never move these silently

`align.THRESHOLD = 0.5`, `align.LABEL_WEIGHT = 0.5`,
`delta.MATERIAL = 1%`, `watch_stealth.TIER2_SEED = 20260826`,
`TIER2_TRIALS = 5`. Each is registered in the log; moving one is a
written round, never a tuning.

## Open, in order

1. **Tier 1 (Z3)** — registered in the log this sweep; blocked on
   the lead's `z3-solver` pyproject approval. No code may import z3
   before that.
2. **Tier 2's next round** — wider hosts, plus the two findings
   round 1 earned: selector sweeping and categorical inputs (below).
3. **C6 (rule-set diff)** — founder-approved, yours; register it
   when Dynamo's B5 round 1 lands a modeller-recognisable rule set.
4. **C3 deferrals, parked**: added-cells-within-matched-structure;
   labelled targets for `rewrite_formula`.
5. **Named next rounds if the aligner must go faster still**:
   banding, or a Hirschberg (linear-space) traceback.

## What the corpus taught (facts about the files, not the code)

- **ED2 v5 is a selector model.** Licensee sheets reach the live
  calculation only through `SelectedInputs!X = CHOOSE($B$3, …)`,
  and v5 is saved with SSES selected — so **SWEST is a dead
  branch**: an edit there genuinely changes no current output.
  Differential evaluation under the saved selector state cannot see
  dead-branch edits.
- **`Cover!G4` = `MID(CELL("filename"),…)`** — the model prints its
  own filename, and it lives *outside* the engine's labelled cell
  universe, so a cone rooted in `book.cells` will never see it.
  Root environment cones in the raw grid.
- **`InputSummary` holds ~4 typed literals** — it is pull-through
  formulas. Any harness that plants "the first literal" must refuse
  loudly there, never silently.
- Perturbing categorical flag literals (`=1` read by SUMPRODUCT)
  deadens flag paths symmetrically in both files; magnitude inputs
  and categorical inputs need different treatment.

## The container's lessons (this box, not the repo)

- **Repo conftest cannot import** here (Python 3.14.0rc2 +
  pydantic: `_eval_type() got an unexpected keyword argument`), so
  every tieout test runs `--noconftest`. The same breakage makes
  `scripts.revision_diff` unimportable — C3's parity keeps the
  study's `keyed()` logic verbatim instead, and says so.
- **LibreOffice**: the preinstalled 24.2 is below Dynamo's floor;
  `dev/setup-libreoffice` installs 25.8.7 into `/opt` with a
  working UNO bridge (idempotent, ~200 MB). After it, Dynamo's four
  UNO tests pass and `UnoCalculator` recalculates a real ED2 model
  in ~65 s.
- **Heavy workbook jobs run alone.** A GD3 BPFM self-align peaked
  at 8.1 GB before the memory round; a concurrent pair OOM-killed a
  sweep in an earlier lane.
- **The corpus is re-fetchable, never committed**:
  `uv run python -m scripts.corpus_au_uk` (27 files).
- **The network refuses the PR24 corpus from here**: Ofwat 403s,
  the Web Archive answers 405 with an AWS WAF captcha, and browser
  egress is closed entirely (`ERR_CONNECTION_RESET` even to
  example.com). V3 is the lead's to run; do not re-attempt.
- A script appended to below its `if __name__ == "__main__":` guard
  will `NameError` at dispatch — twice now. Keep the guard last.
