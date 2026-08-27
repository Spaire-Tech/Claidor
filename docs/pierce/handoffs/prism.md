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
| C2 DP alignment | `watch/align.py`, `watch/signature.py`, `scripts/watch_align.py`, `scripts/watch_plant.py` | **24/24 on InputSummary, 22/24 on SWEST** after the rewrite class got labelled targets; SWEST's remaining two are the harness's label *proxy* wrapping back to a titled row 1 — registered for the next round |
| C3 delta report | `watch/delta.py`, `scripts/watch_delta.py` | Nine review classes (filled/emptied cells added at the sixteenth sweep); V1 parity with the study matcher **exact on both pairs**; V2 synthetic green; V3 (PR24) belongs to the lead — this container cannot reach the corpus |
| C4 tier 0 (fingerprints) | `watch/trace.py`, `scripts/watch_stealth.py` | Soundness gate clean after round 2's observability fix; **93.2% of a real adjacent revision proved at hash cost in ~2 min** |
| C4 tier 2 (differential) | `scripts/watch_stealth.py tier2` | Two hosts, **8 of 8 eligible on both, zero refusals, control silent**; `tail_hardcode` and `stealth_literal` 5/5 everywhere; the selector sweep closed the dead-branch case |
| C5 deck delta | `watch/document.py`, `scripts/watch_deck.py` | Measured on the Cascade deck: a planted input move breaks **8 figures, each attributed to the model change underneath it**, while the deck's **8 pre-existing drifts stay off the revision's account** |
| C4 ladder (one verdict per cell) | `watch/tiers.py`, `scripts/watch_tiers.py` | ED2 v2 14→31 July: **93.19% proved · 3.11% changed · 3.69% refused, all five gates clean**, and the count reconciles with C1's raw diff to a single named cell (`Cover!G4`) |
| Aligner memory + timing rounds | `watch/align.py`, `scripts/watch_membench.py` | 10k rows: 900 s / 1,389 MB → **265 s / 323 MB**, every gate green, no verdict moved |

Tests: `test_watch_{diff,align,plant,delta,trace,stealth,document,tiers}.py`,
80 green.
(Other lanes' tieout tests need the conftest and fail to collect here;
name your five files explicitly.)

## Registered constants — never move these silently

`align.THRESHOLD = 0.5`, `align.LABEL_WEIGHT = 0.5`,
`delta.MATERIAL = 1%`, `watch_stealth.TIER2_SEED = 20260826`,
`TIER2_TRIALS = 5`. Each is registered in the log; moving one is a
written round, never a tuning. The ladder's two closed vocabularies
(`tiers.REFUSALS`, `tiers.CHANGE_SOURCES`) are the same kind of
thing: a reason outside them fails gate G4 rather than appearing in
a report.

## Open, in order

1. **The pair oracle for tier 2** — the ladder's next round, and
   the one with real work in it: perturb the *matched* literals in
   both files, recalculate both, and answer the 1,516 cells now
   coming back `not_offered_to_tier2`. Cost is measured (15.5 min
   for `2 x (1 + 5)` recalculations) so nothing depends on an
   unmeasured number. **Its first question is registered: the UNO
   driver returns 21,007 cells where the ladder's universe is
   41,049 — find out which half before calling anything
   « supported ».**
2. **Tier 1 (Z3)** — registered in the log; blocked on the lead's
   `z3-solver` pyproject approval. No code may import z3 before
   that. Until it lands the ladder prints the hole's size every run
   as `tier1_would_have_been_asked` (1,516 on the ED2 pair).
3. **Tier 2's planted-edit side — closed.** All three named follow-ups measured:
   categorical inputs, conditional inputs, and the selector sweep
   (a dead branch is an *unselected* one; the harness reads the
   model's `CHOOSE`, forces the index, and stamps
   `selector_forced` on every instance it touches).
4. **C6 (rule-set diff)** — founder-approved, yours, and *not*
   ready: B5's stability gates pass but its rule sets are
   artifacts of low perturbation coverage, and the lead has put C6
   behind Dynamo's E1/E2. Register it when coverage is measurable,
   citing that number — not only the stability pair.
5. **C3 deferrals — done** (filled/emptied cells; labelled rewrite
   targets). Successor item: the C2 harness should take its
   labelled rows from the engine's own `Cell.row_label` rather than
   from its string proxy — registered, not yet run.
6. **Named next rounds if the aligner must go faster still**:
   banding, or a Hirschberg (linear-space) traceback.

## What the corpus taught (facts about the files, not the code)

- **ED2 v5 is a selector model.** Licensee sheets reach the live
  calculation only through `SelectedInputs!X = CHOOSE($B$3, …)`,
  `B3 = m_identity = 14`, and SWEST is argument **7** — so SWEST is
  not unreachable, it is *unselected*. Round D forces the index and
  the branch lights up (155–234 diverging cells against 1–12
  unforced). Dead means unselected; check before concluding.
- **SWEST carries no formula cells at all at or after row 203** —
  that sheet's tail is typed data, not calculation. A harness that
  assumes « there is always a formula here » manufactures results.
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
- **The engine's shape erases numeric literals** (`=B2*0.4` and
  `=B2*0.5` both hash as `#*R[-1]C[+0]`), so a verifying trace is
  blind to a coefficient edit — *unless* the file's cached value was
  refreshed, which is why the ladder puts raw evidence above the
  hash and counts `tier0_overruled_by_raw`. It was 0 on the ED2
  pair; do not assume that for a generated file.
- **The UNO driver reads about half the engine's cells** (21,007 of
  41,049 on ED2 v2). Anything that concludes from a recalculation
  must say which cells it could see.
- **openpyxl's save drops every cached value.** Any planted file
  handed to something that reads *values* (the tie-out, the
  linker, the audit's value rules) will mislead you: C4 round 1
  lost its soundness gate to this and C5 round 1 lost 90 of 111
  figures to it. Either re-inject the values
  (`watch_plant._reinject_values`) or, better, let LibreOffice
  save the file (`UnoCalculator.recalculate(path, store_to=…)`).
