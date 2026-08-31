# Dynamo — cold-start handoff

Written for a successor who remembers nothing. The log
(`docs/pierce/logs/dynamo.md`) is the diary — long, and worth
reading backwards from the end; this is the map.

## Who you are

Dynamo, the recalculator lane (Track B). Branch `swens/dynamo`,
always rebased on the integration tip
(`origin/claude/pierce-phase-6-writing-mjkaj6`). You own **only**
`server/polar/tieout/recalc/`, `server/tests/tieout/test_recalc*`,
`server/scripts/recalc_*`, and your own log and handoff. The engine
(`audit.py`, `workbook.py`, `structure.py`, …) is a **read-only
library** — only Sentinel may change what the engine reports; if you
believe it should say something different, write the case in your
log and let the lead route it.

Every working turn, without exception:

1. `git fetch origin claude/pierce-phase-6-writing-mjkaj6`
2. Read `docs/pierce/orders/dynamo.md` at that tip — those are your
   current orders, maintained by the lead at every sweep.
3. Do exactly that, push to `swens/dynamo`, stop. Never merge.

The founder's whole message is usually just « go », meaning: follow
your current orders. Read `docs/pierce/notes.md` before answering
anything of record — product is `swens.md`, plan is
`swens-plan.md`, and memory is never a source.

## The machine (this is the part that surprises people)

The recalculator needs **LibreOffice ≥ 25.8 with Calc**, and
python-uno, which exists only for the interpreter its LibreOffice
shipped with. The project venv (Python 3.14) can never import
`uno` — so the whole design is **out-of-process by construction**.

- `dev/setup-libreoffice` (shared ground, the lead's) installs
  TDF's 25.8.7 into `/opt/libreoffice25.8`. **Containers are
  ephemeral: run it once per fresh container**, then
  `uv run python -m scripts.recalc_probe` (yours) must print three
  `ok` lines and exit 0. The distro's own 24.2 on PATH is below the
  floor and lacks Calc — the probe deliberately looks past it.
- `recalc/uno_driver.py` runs under `/opt/libreoffice25.8/program/
  python` and speaks JSON lines over pipes. It pushes the file's own
  `calcPr` explicitly, calls `calculateAll()` on the socket (never
  the CLI convert path), never executes macros, never updates
  links, and carries a do-nothing `InteractionHandler` — without
  that, big `.xlsm` files silently fail to load.
- `recalc/uno_calc.py` (`UnoCalculator`) is one soffice + one
  driver per instance, own pipe, own profile, behind the frozen
  `Calculator` protocol in `recalc/pool.py`. The pool recycles
  workers (soffice leaks) and retries a dead document exactly once.

**Heavy workbook jobs run alone in the container** — a concurrent
pair OOM-killed a sweep here. Corpora are rebuilt with the
committed fetchers (`uv run python -m scripts.corpus_au_uk`, 27
files, git-ignored), never committed.

## What is built and merged

- **B1** — the worker pool and the real UNO adapter. Proven by
  `tests/tieout/test_recalc_uno.py` (skips honestly with no
  machine): uncached formulas genuinely computed, the file's
  iteration settings provably pushed, a planted stored-value lie
  caught by name, and B1's DONE sentence (changed input → changed
  downstream, unattended) through the pool.
- **B2 — the fidelity gate** (`recalc/gate.py`, sweep harness
  `scripts/recalc_gate.py`). Stored-vs-recalculated, formula cells
  only; relative 1e-9 with a 1e-12 floor on plain chains; the
  file's own `calcPr` convergence delta inside cycles (SCC over the
  reader's precedents); verdicts pass / fail / refused /
  nothing-compared. Volatile cones (TODAY/NOW/RAND-class roots plus
  transitive dependents, `recalc/volatile.py`) are reported in
  their own bucket and never counted as fidelity loss. Engine
  errors against a stored number get their own bucket too.
  **Result on the golden-master corpus: 27/27 files gated,
  3,862,412 comparisons, 99.88%; eighteen files at exactly 1.0.**
- **The denylist** (`recalc/denylist.py`) — tokenized, never
  substring. LAMBDA family and CUBE* → arbiter; RTD, UDFs,
  external links → refusal; and a measured `engine-gap` category:
  **SINGLE** (`@`) and **OFFSET with a negative extent**, both
  probed on this machine, both routed to the arbiter. The function
  catalogue is deliberately incomplete — an unknown name refuses
  honestly, and grows through the log when a real file names it.
- **B4 — the behavioural laws** (`recalc/laws.py`, harness
  `scripts/recalc_behave.py`). Zero-input (exact), proportionality,
  scale invariance, consolidation. **37 plants, 37 catches, each
  naming its planted cell, 0 false positives across 26 control
  law-runs**, over 13 host files — hardcode-in-the-tail 24/24 in
  three structural guises.
- **Narrowing** (`recalc/narrow.py`, `scripts/recalc_narrow.py`) —
  ddmin (Zeller) plus a frontier walk, taking a violated law down to
  one cell. **43 narrowings, 32 exact (size 1), 11 hits on the one
  case predicted wide, 0 misses**; ddmin agreed on all 10 H7 runs.
- **B5 — mining a model's own laws** (`recalc/mine.py`,
  `scripts/recalc_mine.py`). Clean-room: the ICSME 2019 reference is
  LGPL, **has not been read and will not be**. Typed input
  perturbation (flags held, selectors stepped, nothing categorical
  scaled), signed-sum and ratio candidates, cleansing, and a
  two-independent-minings stability rule. Both stability gates pass.
  **The rule sets are not modeller-recognisable yet**, and the
  measured root cause is perturbation coverage, which is governed by
  input typing — hence E2. `coverage()` gates a round: low coverage
  is **reported as uninformative, never as a result**.
- **E1 — hand-labelled unit ground truth.** 100 rows, cost priced
  (31 self-declared, 69 needed reading, 2 abstained, ~100 rows/hour
  against tens of thousands per model). Sample committed
  *unlabelled first*, then the labels:
  `docs/pierce/logs/dynamo/e1-{sample-unlabelled,ground-truth}.json`.
- **E2's shippable verdict (28 Aug, revised the same day against a
  second corpus)**: **ARM WITH CARE** `rate_form` — and **nothing
  else**. `kind`, `currency` and `scale` were armed against the
  Ofgem key and fail on the closed-deal one (7.77%, 24.62%, 23.32%);
  `b5_type` and `period` never armed. Measured through the path `inferred_inputs`
  runs, taking the worse of two keys. The trap to inherit: the
  3,796-row author key holds **one value for `kind`** — every row in
  it declares £m or %, so it is continuous by construction, and its
  96.4% is not evidence about categorical rows. E1's hundred is the
  only key with the hard cases and it is self-graded. A second
  hand-labelled set drawn by someone else is the highest-value thing
  anyone could add to this lane.
- **E2 — unit inference** (`polar/tieout/units/`). Blind pass
  (formats, labels, headers, values) measured on **3,796
  Ofgem-authored rows**: `kind` 96.4% with 0% wrong, `rate_form`
  96.4%, `scale`/`currency` abstain rather than guess (2,363
  abstentions, **zero wrong**). **`period` is wrong on 24.9% / 64.1%
  and is not to be quoted** until it has a better answer key.
  Propagation (`propagate()`) carries *declared* units through the
  dependency graph — 63.8% of ED2's formula cells, 43.4% of GD3's —
  and its planted-mismatch control catches **38 of 38 observable
  plants**. It reports **0 conflicts on both models**; the first
  draft reported 216, and all 216 were bugs in the detector, each
  now a named test.
- **B3 — designed, not built.** The Graph-API arbiter through the
  existing Microsoft connector, written up in the log; it waits on
  the lead routing the connector surface (shared ground) and on a
  scope decision (`Files.ReadWrite.All`) that is the founder's.

## Running jobs: the three rules, and the one cause behind them

*Written after killing my own work three times in one session, in
three different ways. Not a lament — the rules are mechanical.*

1. **Never stop a process by pattern.** `pkill -f name` matches the
   shell running it; `pgrep … | xargs kill` takes out your own
   process group. The harness returns a **task ID** for every
   background job: stop it with `TaskStop`, which cannot match
   itself. There is no case where a pattern kill is the right tool
   here.
2. **Time one unit before running N.** Run the single file with a
   timer, multiply, then launch the sweep. I killed a draw twice
   believing it hung, having never measured what *not* hung looks
   like — it was 12s per file in `read_workbook` and fine.
3. **Diagnose before optimising.** I rewrote the units-column scan
   certain it was the bottleneck; measured, it was 4% of the cost.
4. **Every scripted edit asserts its anchor, and is verified by
   running the code — never by lint.** Three of my edits to one file
   silently did nothing because the `str.replace` anchor no longer
   matched after a reformat. **Lint passed on all three broken
   versions**, because the names existed and only the bodies were
   stale, so I committed a claim that a fix was applied when it was
   not, and then diagnosed a second problem on top of that false
   belief. `assert old in s` before every replace; run the function
   afterwards.

**The one cause**: acting on a guess about a running system instead
of measuring it. That is the same failure this lane exists to
prevent — a number published without its protocol — pointed at my
own tools rather than at a model. The discipline was already
written; it just was not being applied inward.

## The disciplines that are not negotiable

- **A dimension whose key cannot contain its failure case must not
  be armed.** Not « flag the limitation and arm anyway » — that is
  what I did on 28 Aug, and the first key that could contain the
  case put `kind` at 7.77% wrong against 0.05%, 74% of it reading
  rows their author declared `Flag` as continuous quantities.
- **Measure the shape of a key before quoting its accuracy.** Twice
  on 28 Aug a number of mine measured something narrower than its
  name: the 3,796-row author key holds **one value for `kind`**
  (every row in it declares £m or %, so all are continuous), and the
  whole corpus holds **one of the two real percent conventions**
  (183,987 percent-formatted cells in `final_wacc.xlsx`, none above
  1.5 — `scripts/recalc_units_convention.py` re-runs this anywhere).
  Count the distinct values a key can hold, per dimension, before
  publishing accuracy against it.
- **Commit every result file the moment it is produced.** Learned the
  hard way on 28 Aug: the container restarted, the repo was
  re-cloned, and the raw output of every round before that session —
  B2's fidelity sweeps, B4's plants, the narrowings, B5 round 1b —
  was untracked and is gone. The numbers survive in the log's tables;
  the evidence behind them does not. Containers are ephemeral and an
  uncommitted file is not a record.

- **Registration before results.** The harness, the selector map,
  the plants and the *predictions* are committed before a number is
  looked at. Every round in the log follows this; keep it.
- **Never mislead the founder.** If it did not work, say so with the
  output. « I haven't checked » is allowed; a guess is not.
- **Controls exist to catch you.** The widening round's false-
  positive controls caught *my own* selector defect (the ED2
  licence-fee input rows drift by version and I had assumed them).
  I scored that run's affected half invalid and re-ran. Do the
  same: chase every input row through the model's own formulas,
  per file, never by assumption.
- **No behavioural check ever runs on a file that failed its gate**
  — a violated law on an ungated file indicts the engine, not the
  model.
- Plain language to the founder; no model identifiers in anything
  pushed.

## Where things live

| Thing | Path |
| --- | --- |
| Your packages | `server/polar/tieout/recalc/`, `server/polar/tieout/units/` |
| Your tests | `server/tests/tieout/test_recalc_*.py`, `test_units_inference.py` |
| Your scripts | `server/scripts/recalc_*.py` |
| Your measured runs | `docs/pierce/logs/dynamo/*.json` |
| Your log / this map | `docs/pierce/logs/dynamo.md`, `docs/pierce/handoffs/dynamo.md` |
| Orders | `docs/pierce/orders/dynamo.md` (integration tip) |
| Lane rules | `docs/pierce/lanes.md` · canon: `docs/pierce/notes.md` |
| The toolbox that set B's architecture | `docs/pierce/ambre-toolbox.md` §2 |
| B5's binding design laws | `docs/pierce/swens-aha.md` |

Run tests with `uv run pytest tests/tieout/test_recalc_*.py
tests/tieout/test_units_inference.py --noconftest -q` from `server/` (the tieout suite is conftest-free;
seven unrelated test files fail *collection* in this container on a
pre-existing pydantic/3.14 issue — not yours, not new).
