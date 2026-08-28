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
| Tier 1 part A (boundary, no solver) | `watch/fragment.py`, `scripts/watch_fragment.py` | **75.2%** of ED2's formula cells are inside the registered fragment; **31.5%** of the tier-1 rung. All 1,516 rung cells have identical formulas both sides, so this pair cannot exercise tier 1 at all — its value is on rewrites |
| The ED2 chain and the update profile | `watch/profile.py`, `scripts/watch_chain.py` | Ten transitions, 66–72 s each. **The founder's reforecast/routine split replicates on a regulator's model**: four transitions of 247–911 cells move 0–2 assumptions, six of 5,050–9,865 move 44–464, and **nothing lies between 911 and 5,050**. The profile flags in the model's own terms (« rewrote more formulas than this model usually does ») and **refuses on the four small ones** — 0–2 comparable priors |
| **The first external answer key** | `hickeng/financial`, commit « Fixes row skewed formula » (cloned to scratchpad, non-commercial, never committed) | C1 reports **99 content changes** where the author's labelling says 98 references + 1 formula. C3 folds them into 11 blocks and the line reads `R[+1]C[-17] → R[+0]C[-17]` — the author's « offset down by one row », from the files alone. A genuine version bump produces **one** line. |
| Two specimens from real commits | `tests/tieout/test_watch_specimens.py` | C3 already reports **both**: a vertical sum that became horizontal (same cell, same total — a value reader sees nothing) and one reference shifted inside a copied block, **with the other three rows silent**. The `methodology_change` line now carries both shapes, old → new |
| The array-formula phantom class | `tests/tieout/test_watch_diff.py` | Pinned at the lead's request: a CSE formula reads as its text, and a version-string bump moves exactly one cell (their run saw 202 of 203 « changes » false) |
| The tier table | `docs/pierce/tier-table.md` | The single published statement the orders asked for: each rung's claim at its exact strength, measured cost, closed refusal vocabulary, and the number it produced on the registered pair. Every figure from a run artifact |
| C3 on a known revision | `scripts/watch_delta.py` | Names the revision's substance in one line — `filled_cell: Monthly Inflation rows 284–295 (24 cells)` — and now reconciles with C1 **on the face of the report**: 7+7 = C1's 14 content changes, 24 = C1's 24 added |
| C4 tier 2, what the revision *is* | `scratchpad` probes + `domain` mode | The frontier of divergence is `AVERAGEIFS` over whole `Monthly Inflation` columns; the revision **replaces twelve months of forecast with published outturn** (`H284:H295`, new-version-only). Seven `Finance&Tax` cells are byte-identical in both files (stored **0**) and compute differently once exercised — **a difference no cell diff can see** |
| C4 tier 2, the domain round | `scripts/watch_tiers.py domain` | Perturbation bands narrowed against the file's own error count: ED2 tolerates **±1% and not ±5%** (1,379 errors at every wider band). Coverage of the disturbed cells **96 → 293 of 294**; seven divergences on `Finance&Tax` remain **unexplained**, five candidate causes eliminated |
| C4 tier 2, why cells freeze | `scripts/watch_tiers.py` (verdict dump) | The 198 frozen disturbed cells are on live sheets, not licensee branches (**no `CHOOSE` names any of them**); **198/198 reach a held categorical literal, 0/96 supported ones do**, with a median 527 perturbed literals in cone — so reach is not the problem, the zero-holding rule is |
| C4 tier 2, pair oracle | `scripts/watch_tiers.py oracle/control` | Control (file against itself) **0 diverged, 0 violations**. ED2 pair: **0 diverged** over 8,475 perturbed inputs, 172 supported, 1,344 `no_perturbable_input`. Coverage is the real story: of the **294** cells the revision disturbed, the trials reached **96** |
| C4 ladder (one verdict per cell) | `watch/tiers.py`, `scripts/watch_tiers.py` | ED2 v2 14→31 July: **93.19% proved · 3.11% changed · 3.69% refused, all five gates clean**, and the count reconciles with C1's raw diff to a single named cell (`Cover!G4`) |
| Aligner memory + timing rounds | `watch/align.py`, `scripts/watch_membench.py` | 10k rows: 900 s / 1,389 MB → **265 s / 323 MB**, every gate green, no verdict moved |

Tests: `test_watch_{diff,align,plant,delta,trace,stealth,document,
tiers,fragment,specimens,profile}.py`, **123 green**.
(Other lanes' tieout tests need the conftest and fail to collect here;
name your five files explicitly.)

## Registered constants — never move these silently

`align.THRESHOLD = 0.5`, `align.LABEL_WEIGHT = 0.5`,
`delta.MATERIAL = 1%`, `profile.COMPARABLE_FACTOR = 2.0`,
`profile.MINIMUM_PRIORS = 3`, `watch_stealth.TIER2_SEED = 20260826`,
`TIER2_TRIALS = 5`. Each is registered in the log; moving one is a
written round, never a tuning. **`CATEGORICAL_LIMIT` has a known
defect**: it holds zero, which in the pair oracle freezes any cone a
zero quantity multiplies — see « the zero round ». The constant was
imported from the planted-edit harness, where its justification was
a different one (not deadening a plant symmetrically), and it was
not re-derived for the pair oracle. Re-derive a constant when it
crosses harnesses. The ladder's two closed vocabularies
(`tiers.REFUSALS`, `tiers.CHANGE_SOURCES`) are the same kind of
thing: a reason outside them fails gate G4 rather than appearing in
a report.

## Open, in order

0. **Tier 1 is the only thing between Track C and complete**, and it
   needs one line: `z3-solver` in `server/pyproject.toml`, the
   lead's to add. **The ask now carries a number**: tier 1's
   fragment covers **75.2%** of ED2's 20,623 formula cells
   (`watch/fragment.py`, no solver involved) and 31.5% of the cells
   that reach its rung. Part A — the classifier and the refusal
   boundary — is built and measured; part B is the solver and the
   planted-rewrite harness. The orders (twenty-fifth sweep) now ask for the
   tier; the registration forbids importing z3 before that line
   exists. Re-raise it every turn until it lands, and do not
   silently start.
1. **The profile is NOT ready to ship, and the measurement that
   says so is out-of-sample.** On `hickeng/financial`'s fifteen
   transitions it refuses on **ten** and is silent on the one
   transition the author labelled a defect. Cause, measured: a
   *multiplicative* comparability band degenerates at small sizes —
   « within a factor of two » of a 1-cell transition means « 0.5 to
   2 cells ». ED2's refusals were the rule, not thin history.
   **Registered successor, deliberately not built**: compare by rank
   within the chain, no multiplicative constant. It cannot be
   validated on either chain this lane has now seen — it needs a
   third, and the founder's 70-transition equity model is the one.
   The sentence the module produces is sound; the verdict is off and
   stays off.
2. **The older note, still true:** A profile built from priors outside the
   comparable band answers *and discloses the size ratio in the
   line*; it never refuses when the model has history. But it also
   **never flags**: measured on the chain, the two quietest
   transitions in ED2's history came back « unusual » because their
   nearest priors by size were version steps, not other quiet
   updates. The sentence stays, the boolean is off. **Do not
   re-enable `unusual()` for qualified profiles** without a second
   chain to test it on.
   **Not in this corpus** — `ofgem_riio3` is draft-versus-final of
   four *different* models and `caa_h7` is two unrelated pairs. The
   second chain came from the answer key: `hickeng/financial` keeps
   sixteen versions of one workbook, fifteen transitions, cloned to
   the scratchpad and never committed.
2. **Enron E08/E09** — a genuine version pair (45,274 identical
   formulas, 920 differing) arriving behind Sentinel's A6. The
   orders say **do not wait and register nothing yet**. When it
   lands it is the first honest external answer key for C2/C3.
3. **The seven — resolved, and the next round is the reproducibility
   fix.** The frontier probe traced them to the revision itself: it
   types twelve months of published outturn into `Monthly
   Inflation!H284:H295`, cells that exist in one version only and
   that no perturbation can neutralise, feeding whole-column
   `AVERAGEIFS` aggregates. All seven are byte-identical in both
   files — same formula, stored value **zero** — so they agree at the
   operating point and compute differently once exercised; they now
   report as `tier2_divergence_latent`, and plain divergences are 0.
   **Next**: the domain round's acceptance loop consumes the shared
   RNG on rejected draws, so it is not reproducible across a change
   in rejection history. Registered fix: one stream per (trial,
   band).
4. **Superseded — the pairing round** ran and killed its own
   candidate. The
   domain round (±1% band, error-ceilinged) took tier 2's coverage
   of the disturbed cells from 96 of 294 to **293**, and surfaced
   **seven cells on `Finance&Tax` that compute differently in the
   two versions under identical inputs**. Five explanations are
   eliminated by measurement (held inputs, unperturbed literals,
   iteration, out-of-universe precedents, class changes — all zero).
   The registered next test is whether C2's alignment pairs some
   literal to the wrong old cell. **Do not report the seven as a
   finding about the revision until that is settled.**
5. **The zero round — done, and a negative.** Waking 10,732 held
   zeros moved none of the 198; the correlation that motivated it
   was not the cause. What was: the perturbation drove those cells
   into `#DIV/0!`/`""`, which the harness misnamed
   `no_perturbable_input` for a round. The forced-selector round answered why 198 disturbed cells
   never moved, and the answer is a rule of mine: `_is_categorical`
   is true of **zero** (integral, magnitude ≤ 12), so every zero
   literal is held as though it were a flag, and a zero *quantity*
   (« RPI index-linked debt = 0% of net debt ») pins its whole
   branch. 198 of 198 frozen cells reach a held categorical; 0 of 96
   supported ones do. The round: stop holding zeros, keep holding
   non-zero small integers, and report a divergence found on a
   branch that only wakes when a zero is woken as
   `tier2_divergence_latent` — never as the revision's `changed`.
6. **Tier 1 (Z3)** — the rung that would speak where the trials
   cannot (1,344 frozen cells on the ED2 pair). Registered; blocked on the lead's
   `z3-solver` pyproject approval. No code may import z3 before
   that. Until it lands the ladder prints the hole's size every run
   as `tier1_would_have_been_asked` (1,516 on the ED2 pair).
7. **Tier 2's planted-edit side — closed.** All three named follow-ups measured:
   categorical inputs, conditional inputs, and the selector sweep
   (a dead branch is an *unselected* one; the harness reads the
   model's `CHOOSE`, forces the index, and stamps
   `selector_forced` on every instance it touches).
8. **C6 (rule-set diff)** — founder-approved, yours, and *not*
   ready: B5's stability gates pass but its rule sets are
   artifacts of low perturbation coverage, and the lead has put C6
   behind Dynamo's E1/E2. Register it when coverage is measurable,
   citing that number — not only the stability pair.
9. **C3 deferrals — done** (filled/emptied cells; labelled rewrite
   targets). Successor item: the C2 harness should take its
   labelled rows from the engine's own `Cell.row_label` rather than
   from its string proxy — registered, not yet run.
10. **Named next rounds if the aligner must go faster still**:
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
- **An openpyxl workbook with images can be saved once.** The
  handles to the embedded images are closed by the first `save()`,
  and the second dies inside PIL with « I/O operation on closed
  file ». Reload the workbook for every write; it cost the pair
  oracle its first attempt.
- **openpyxl's save drops every cached value.** Any planted file
  handed to something that reads *values* (the tie-out, the
  linker, the audit's value rules) will mislead you: C4 round 1
  lost its soundness gate to this and C5 round 1 lost 90 of 111
  figures to it. Either re-inject the values
  (`watch_plant._reinject_values`) or, better, let LibreOffice
  save the file (`UnoCalculator.recalculate(path, store_to=…)`).
