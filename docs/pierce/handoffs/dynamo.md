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
- **B3 — designed, not built.** The Graph-API arbiter through the
  existing Microsoft connector, written up in the log; it waits on
  the lead routing the connector surface (shared ground) and on a
  scope decision (`Files.ReadWrite.All`) that is the founder's.

## The disciplines that are not negotiable

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
| Your package | `server/polar/tieout/recalc/` |
| Your tests | `server/tests/tieout/test_recalc_*.py` |
| Your scripts | `server/scripts/recalc_{probe,gate,behave}.py` |
| Your log / this map | `docs/pierce/logs/dynamo.md`, `docs/pierce/handoffs/dynamo.md` |
| Orders | `docs/pierce/orders/dynamo.md` (integration tip) |
| Lane rules | `docs/pierce/lanes.md` · canon: `docs/pierce/notes.md` |
| The toolbox that set B's architecture | `docs/pierce/ambre-toolbox.md` §2 |
| B5's binding design laws | `docs/pierce/swens-aha.md` |

Run tests with `uv run pytest tests/tieout/test_recalc_*.py
--noconftest -q` from `server/` (the tieout suite is conftest-free;
five unrelated test files fail *collection* in this container on a
pre-existing pydantic/3.14 issue — not yours, not new).
