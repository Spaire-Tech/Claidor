# Prism — the Watch (Track C)

Lane log. Charter: `docs/pierce/lanes.md`; plan: `docs/pierce/swens-plan.md`
Track C, as amended 24 August 2026. I own `server/polar/tieout/watch/`,
`server/tests/tieout/test_watch*`, `server/scripts/watch_*`, and this
file. The engine is a read-only library to me;
`polar.tieout.audit._shape(cell, anchoring=True)` is a frozen
interface I align on and never change.

## 25 August 2026 — lane opened

**The branch.** The session was created from
`claude/prism-watch-alignment-ftfjx3`, whose tip is a merge commit of
an older state of `claude/pierce-phase-6-writing-mjkaj6` and carries
nothing of its own. `lanes.md` says lane branches are based on
`claude/pierce-phase-6-writing-mjkaj6`'s tip, and everything this
lane's first task depends on — `scripts/corpus_au_uk.py`, `notes.md`,
`lanes.md`, the A7-normalized shape hash — exists only there. So
`swens/prism` is based on that tip (`265bfeb`), and the deviation
from the prompt's literal « this branch's tip » is named here rather
than made silently.

**The corpus.** `uv run python -m scripts.corpus_au_uk` fetched all
27 files (the eleven ED2 versions among them) into
`server/scripts/corpus_au_uk/`, git-ignored, matching the manifest's
expected count. Nothing committed, per the corpus rule.

## C1 registration — the raw version diff, hand-checked (REGISTERED BEFORE RESULTS)

Committed before the differ under test has produced any number on
the pair. The rules below are fixed; if they prove wrong the change
is recorded here with a reason, never made silently.

**The pair.** `ofgem_ed2/v2_2023-07-14.xlsx` (old) →
`ofgem_ed2/v2_2023-07-31.xlsx` (new). Chosen on the manifest's
metadata alone — the two closest-dated adjacent versions, seventeen
days apart, same major version — before reading either file. If the
diff turns out enormous the pair still stands; only the eyes-on
sample sizes below are per-cell, so the check stays feasible at any
diff size.

**What C1 diffs.** The raw stored grid, not the engine's labelled
cell universe: every cell either file stores, compared on two axes —
*content* (the formula text, or the typed literal where there is no
formula) and *cached value* (what Excel last computed, exactly as
stored; no tolerance — a tolerance is an opinion, and the raw diff
has none). Kinds: `added`, `removed`, `changed` (with
formula-changed / value-changed flags, both allowed at once), plus
sheets added/removed. The raw diff is deliberately blind to row
shifts — one inserted row will read as hundreds of changed cells.
That blindness is C1's honest contract; repairing it is C2's job.

**The instrument.** Two independent readers of the same files:

1. The differ under test — `polar.tieout.watch` reading through
   `openpyxl` (the watch package's own read path; the engine is not
   touched).
2. The hand-check instrument — `server/scripts/watch_handcheck.py`,
   committed with this registration: Python **stdlib only**
   (`zipfile`, `xml.etree`, `re`), reading sheet XML, shared
   strings, and the workbook part directly. It shares no parsing
   code with the differ or with `openpyxl`.

**The check, in order.**

1. Both instruments produce, for the pair, the full set of
   (ref → status) over the union of populated cells:
   added / removed / formula-changed / value-changed / unchanged.
2. The two sets are compared **completely** — every ref, both
   directions. Every disagreement is adjudicated by me reading the
   raw XML of that cell in both files and writing the verdict here.
   A differ defect is fixed and the *whole* comparison re-run from
   scratch; an instrument defect likewise.
3. Because two instruments can be wrong the same way only through
   the file itself, a seeded sample is then read eyes-on in raw
   XML: 20 cells the instruments agree are changed, 10 agreed
   added-or-removed (or as many as exist, if fewer), 10 agreed
   unchanged, drawn with `random.Random(20260825)` from the sorted
   ref lists. Any eyes-on disagreement is a full stop and a re-run.
4. C1 passes when steps 2 and 3 close with zero unresolved
   disagreements. The verdict, the counts, and every adjudication
   land in this log.

**Exclusions, stated now.** The instruments compare worksheet cell
storage: defined names, VBA, charts, formats/styles, comments, and
data-validation are out of C1's scope (the Watch's later steps and
other lanes own those). Cached-value comparison is on the stored
lexical value (numbers compared as decimal text, not as re-parsed
floats, so no round-trip opinion enters). A formula stored with a
cached error value is compared like any other stored text.

## C1 results — the hand-check closed, zero disagreements

Run after the registration commit (`75e97d3`), rules unchanged.

**The verdict: PASS.** Both instruments, on the registered pair:

| | count |
|---|---|
| populated cells, old / new | 60,585 / 60,609 |
| added | 24 |
| removed | 0 |
| changed | 1,255 |
| — of which formula/content changed | 14 |
| — of which cached value changed | 1,255 |
| unchanged | 59,330 |
| sheets added / removed | 0 / 0 |

- **Step 2, complete comparison:** every status list identical, both
  directions, and the full populated-ref universes are set-equal —
  not just equal in count. Zero disagreements, so zero
  adjudications.
- **Step 3, seeded eyes-on sample** (`random.Random(20260825)`; 20
  changed, 10 added, 10 unchanged — no removed cells exist): all 40
  read in the raw XML of both files, all 40 confirm both
  instruments. Two things the sample showed worth recording: the
  « added » cells are `<c r=".." s="503"/>` in the old file — a
  style-only stub, correctly not populated under the registered
  definition — and nearly every cell's style index shifted between
  versions (`s="444"` → `s="441"`), which the registered scope
  rightly excludes; a diff that counted styles would have drowned
  the 1,279 real differences in sixty thousand false ones.

**What the pair actually says**, in review language ahead of C3: the
31 July file is the 14 July file with twelve months of monthly
inflation actuals typed into two columns (all 24 added cells are
`Monthly Inflation!H284:I295`), the annual assumption rows retyped
(all 14 content changes are literals on `Annual Inflation` rows
50/53 — no formula in the model was rewritten between these
versions), and 1,255 cached values downstream re-computed by Excel.
The raw diff cannot and does not say the retyped inputs *caused* the
recached values — that claim needs Track B's recalculation.

**Honesty notes.**
- Two post-registration edits to the committed instrument, both
  cosmetic (an ElementTree deprecation fix; `ruff format`
  whitespace). The instrument was re-run after each; output
  byte-identical both times.
- The differ takes ~40 s on the pair (openpyxl reads each file
  twice); the stdlib instrument takes ~2 s. Not a problem at C1's
  cadence; noted for when the Watch runs at product speed.
- `uv run mypy` on the watch package and both scripts is clean
  except two pre-existing errors inside the engine's `audit.py`,
  which is not mine to touch; recorded here for the lead.
- Nine unit tests pin the semantics on synthetic files (every kind
  in its bucket; TRUE ≠ 1 ≠ « 1 »; the two instruments agree on a
  synthetic pair where truth is known by construction; the
  shared-formula translator's anchors, strings and off-grid #REF!).
  They run conftest-free: `uv run pytest tests/tieout/test_watch_diff.py
  --noconftest` (the repo-level conftest needs the app stack, which
  this container's Python 3.14.0rc2 + pydantic cannot import — same
  workaround the tieout suite already uses).

**C1 stands: an adjacent ED2 pair diffs completely against
hand-check.** The plan's DONE line is met on this pair. Next: C2.
