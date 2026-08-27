# Dynamo — lane log (Track B, the recalculator)

Branch `swens/dynamo`, based on `claude/pierce-phase-6-writing-mjkaj6`
at `265bfeb`. This lane owns `server/polar/tieout/recalc/`,
`server/tests/tieout/test_recalc*`, `server/scripts/recalc_*`, and this
file — nothing else. The engine is a read-only library here.

## 25 August 2026 — the environment audit (first task, for the founder)

Every claim below was measured in this container today, with the
command that produced it. This is the container's state, not a promise
about any other machine.

### What B1 needs (per `ambre-toolbox.md` §2 and `swens-plan.md` B1)

1. **LibreOffice ≥ 25.8** (hard floor 25.2; 24.8 is where XLOOKUP,
   LET, FILTER and the array stack arrived — a model using any of
   them cannot recalculate on anything older), **with the Calc
   component**, headless.
2. **python-uno** matched to that LibreOffice, so a driver can open
   the UNO socket, push the file's own `calcPr` iteration settings,
   and call `calculateAll()` — the CLI convert path does not reliably
   recalc, so the socket path is not optional.
3. Room for a pool of long-lived soffice workers, one document per
   process, recycled every N files.

### What this container has

- **LibreOffice 24.2.7.2** (`soffice --version`) — below the floor,
  and **without Calc**: only `libreoffice-{core,common,style-colibre,
  uiconfig-common}` are installed (`dpkg -l`). Proof it cannot open a
  spreadsheet at all: `soffice --headless --convert-to xlsx` on a
  two-cell CSV fails with « Error: source file could not be loaded ».
- **python3-uno 24.2.7** for the *system* Python (3.11.15):
  `import uno` succeeds there.
- The project venv runs **Python 3.14.0rc2** (`requires-python
  >=3.14.0`), and `import uno` fails there. It always will:
  python-uno is not on PyPI — it ships with a LibreOffice build,
  compiled against one interpreter. The venv will never import uno
  directly, whatever gets installed.
- Resources: 4 CPUs, 15 GB RAM, ~30 GB free disk. Enough for a small
  worker pool; the standing rule that heavy workbook jobs run alone
  still applies.

### What it lacks, and the observed remedies (founder's decision — nothing installed)

- **Calc.** `apt-get install -s libreoffice-calc` resolves cleanly to
  4:24.2.7 and the Ubuntu archive answers (HTTP 200) — one command
  away, but it lands on **24.2**, below the floor: no XLOOKUP, no
  LET, so any modern model would fail its recalc for engine reasons,
  not model reasons. Good enough only for smoke-testing the wiring.
- **25.8 itself.** Ubuntu 24.04's archive tops out at 24.2.7 — no apt
  path to 25.x. `download.documentfoundation.org` is reachable from
  here (HTTP 200), so installing TDF's own 25.8 deb bundle into
  `/opt/libreoffice25.8` is feasible in principle; TDF builds bundle
  their own Python with uno, which sidesteps the distro python3-uno
  version lock. Not attempted: the lane rules route new dependencies
  through the log for approval first, and this container is
  ephemeral — the install that matters is on the machine B1 will
  actually live on.

### What the audit decides about the architecture

Because the venv can never import uno, the UNO client is
**out-of-process by construction**: a small driver script executed
under the LibreOffice-matched interpreter (system python3 today, the
TDF-bundled python under 25.8), speaking to the venv over
stdin/stdout. So the recalc package is built behind a `Calculator`
interface now, with a fake calculator for tests; when the machine
exists, the real UNO wiring is one adapter class plus one driver
script, and nothing above the interface changes.

### While blocked on the machine (charter work, no machine results)

- The fidelity gate's tolerance and denylist logic per
  `ambre-toolbox.md`, tested against synthetic stored-vs-computed
  fixtures.
- The worker pool behind the `Calculator` interface with a fake
  calculator.
- B4's planted-defect registrations — written and committed before
  any result is looked at.

**No fidelity number, match rate, or catch rate in this log is a
machine result until a LibreOffice ≥ 25.8 with Calc has actually run.
None exists yet.**

## 25 August 2026 — the while-blocked build

New package `server/polar/tieout/recalc/` (gate, denylist, pool,
laws), tests in `server/tests/tieout/test_recalc_*.py`, and
`server/scripts/recalc_probe.py`. No new Python dependency was added —
openpyxl's tokenizer is already the engine's, and everything else is
the standard library. Everything reads the frozen surfaces only
(`Workbook.cells`, `Cell.formula/.value/.precedents`); no engine file
was touched.

- **`gate.py` (B2's rules).** Stored-vs-recalculated comparison,
  formula cells only: relative 1e-9 on plain chains with an absolute
  floor of 1e-12 at zero; inside iterative cycles, the file's own
  `calcPr` delta (Excel's default 0.001 when the file iterates
  silently) — the bound is the file's declared convergence threshold,
  never our invention. Cycle membership by strongly-connected
  components over the cells' own precedents. Verdicts: `refused` /
  `pass` / `fail` / `nothing-compared` (a generator-written file with
  no stored values cannot be certified). A formula cell the engine
  returned nothing for fails the gate — a gate cannot pass around a
  hole.
- **`denylist.py` (B2's routing).** Tokenized prescan (never
  substring — a sheet named « RTD data » must not trip it): LAMBDA
  and its helper family → arbiter; CUBE* → arbiter; RTD, UDFs,
  external references → refusal. Routing policy is data, movable by
  the lead. UDFs are detected by `_xludf.` stubs and by absence from
  a curated function catalogue, which errs the honest way: an
  unknown genuine function refuses rather than passing silently, and
  the catalogue grows through this log when real corpus files name
  the gaps.
- **`pool.py` (B1's mechanics, no machine).** `WorkerPool` behind a
  `Calculator` protocol: one document per worker, workers recycled
  after N documents (soffice leaks), a dead calculator replaced and
  its document retried exactly once on a fresh one. Proven against
  fakes only — every fake result carries an `engine` label naming it
  fake, so nothing can be mistaken for a recalculation. The real UNO
  adapter is one class plus one driver script under the
  LibreOffice-matched interpreter, per the audit above.
- **`scripts/recalc_probe.py`.** The audit, repeatable: run on any
  machine, it prints ok/LACK per prerequisite and exits 0 only when
  B1 could be wired there. On this container today:
  `LACK soffice (24.2 < 25.8)`, `LACK calc`,
  `ok uno via /usr/bin/python3` — exit 1, as expected.

Validation, run here: the 38 new tests pass; the standing tieout
suite still passes beside them (`uv run pytest tests/tieout/
--noconftest`: 447 passed, 4 skipped, excluding five files —
test_agent_tools, test_corrections, test_routes, test_source,
test_spine — whose *collection* fails identically with and without
this lane's changes; a pre-existing pydantic-vs-Python-3.14.0rc2
issue in this container, reported here, not fixed, not mine to fix).
Ruff format/check and mypy are clean on every lane file; mypy also
reports two pre-existing errors in `polar/tieout/audit.py` (lines
2367, 2993) — Sentinel's file, noted for the lead, untouched.

## 25 August 2026 — B4 registrations, before any result

Registered now, while no machine can produce a number, so the rules
cannot bend to results. The laws' arithmetic is `recalc/laws.py`,
pinned by hand-worked tests; the selectors (which cells are volume,
price, revenue, ratio, segment) will come from the engine's labelled
reading plus per-model configuration, and are argued separately from
the rules below, which are frozen by this entry.

1. **Zero input.** Perturbation: every volume-class input set to 0.
   Pass rule: every revenue-class output reads **exactly** 0 — the
   plan's word, no tolerance. Predicted catch: the
   hardcode-in-the-tail class (a constant pasted into a chain),
   invisible to static reading.
2. **Proportionality.** Perturbation: every price-class input ×2.
   Pass rule: every revenue-class output ×2 within same-engine
   tolerance (relative 1e-9, floor 1e-12 — both runs come from the
   same calculator, only float dust is forgiven). Predicted catch:
   the same hardcode class, plus caps/overrides wired into revenue
   lines without being declared inputs.
3. **Scale invariance.** Perturbation: every monetary input ×100
   (cents for pounds). Pass rule: every ratio-class output unchanged
   within same-engine tolerance. Predicted catch: a hardcoded leg
   inside a ratio (a pasted denominator), and mixed-unit chains.
4. **Consolidation.** No perturbation: one run; each declared total
   equals the sum of its declared segments within same-engine
   tolerance. Predicted catch: the omitted or double-counted segment.

Measurement protocol, fixed now: laws run **only** on files that
passed their fidelity gate (a violated law on an ungated file indicts
the engine, not the model). Defects are planted per class on gated
corpus files before any check runs; catch rate and false-positive
price are measured per class against the planted truth; a violated
law is a symptom, and the narrowing to one responsible cell (delta
debugging over the dependency slice) is registered as future work —
its absence today is a recorded gap. **No catch rate exists yet, and
none is claimed.**

## 26 August 2026 — the machine, and the real adapter

The lead resolved the machine question (`lanes.md`, lead decisions):
`dev/setup-libreoffice` puts TDF's 25.8.7 in `/opt` per fresh
container. Ran it here; `scripts.recalc_probe` (now taught to look in
`/opt` past the distro 24.2 that shadows it on PATH, and to prefer
the interpreter *matched* to the chosen install) reports three oks
and exit 0 on this container.

The UNO wiring landed exactly as designed — one adapter class, one
driver script, nothing above the `Calculator` interface changed:

- `recalc/uno_driver.py` — stdlib + uno only, runs under
  `/opt/libreoffice25.8/program/python`, JSON lines over pipes. The
  toolbox's hard-won rules encoded: the file's own `calcPr` pushed
  explicitly, `calculateAll()` on the socket (never the convert
  path), macros never execute, links never update. Cell errors come
  back as `#ERR:<code>` — a different kind, as the gate treats them.
- `recalc/uno_calc.py` — `UnoCalculator`: per instance one headless
  soffice on its own named pipe with its own user profile, plus one
  driver process. Timeouts kill the pair and raise; the pool
  replaces and retries once, per its registered discipline.

**Machine results now exist, and these are the first:** the four
integration tests in `tests/tieout/test_recalc_uno.py` passed on this
container (skipped honestly anywhere without the machine):

1. an openpyxl-written workbook with **no stored answers** came back
   computed (`SUM(2,3)*10 = 50`, an error cell as `#ERR:`, a string
   result as itself) — reproducing the lead's proof inside the suite;
2. a circular pair converged to 4/3 and 2/3 **only because** the
   file's own iteration settings were pushed — LibreOffice's default
   would have errored both cells;
3. the full B2 round trip: recalculate-and-store gave a file with
   stored values, the gate passed it at match rate 1.0 against a
   fresh recalculation, then a one-cell lie planted in the stored
   values (formula intact) was caught and named (`M!B4`), verdict
   fail;
4. B1's DONE sentence verbatim — a changed input produced changed
   downstream values through the worker pool, unattended (price 2 →
   50, price 5 → 80).

## 26 August 2026 — B2 sweep registration, committed before the numbers

The harness is `scripts/recalc_gate.py`, committed with this entry
**before any corpus number has been looked at**. Registered:

- **Scope, this round:** the golden-master corpus — the 27 files
  `scripts.corpus_au_uk` rebuilds (fetched fresh here today; 27/27
  present). The model corpus (`scripts.model_corpus`) and the
  archived CUSTODES `.xls` (which need one-time conversion) are
  later, separately registered rounds.
- **Procedure, per file, strictly one at a time (the heavy-job
  rule):** engine reader for cells → denylist prescan (a routed file
  is never gated by LibreOffice; its hits and route are the record)
  → fresh `UnoCalculator` per file (recycle at its most
  conservative, N=1) → registered tolerance rules with the file's
  own `calcPr`.
- **What will be claimed:** per file — verdict (`pass` / `fail` /
  `refused` / `nothing-compared` / `reader-failed` /
  `recalc-failed`), formula cells compared, matched, match rate,
  mismatching refs with both values and the allowed tolerance,
  uncached and unreturned counts. Timings are noise on this shared
  box and are recorded only as coarse context.
- **What a `fail` means:** a symptom, not a verdict on anyone. The
  registered reading order for mismatches: (1) our reader mis-read
  the stored value, (2) LibreOffice computed differently than Excel
  (engine gap → arbiter's jurisdiction, B3), (3) the file's stored
  values were genuinely stale in Excel itself. Deciding among them
  is the round *after* this one; this sweep only measures.
- The raw JSON stays uncommitted (like the corpus); the per-file
  table lands in this log.

## 26 August 2026 — amendment to the denylist, registered before round 2

Round 1 (running as this is written; 19 of 27 files recorded when the
amendment was drafted) exposed two defects in **the scan, not the
engine**, and one timeout. The round-1 records stand as taken; this
amendment is committed before the affected files are re-run, and the
re-run is round 2, reported separately.

1. **Range-combinator false positive.** `AA116:INDEX(...)` — a range
   whose end is computed by INDEX — is tokenized as one function
   token `AA116:INDEX(`, which the scan read as an unknown function
   and refused as a UDF (both H7 PCM files, 504 cells each, every
   hit of this shape). The canonicalizer now takes the name after
   the last range colon. Regression test committed.
2. **Catalogue growth, evidenced:** `SINGLE` — Excel's own implicit-
   intersection wrapper (`@`, stored `_xlfn.SINGLE`), met in Ofgem's
   GT3 draft PCFM — added to the known catalogue per this log's
   stated procedure. If LibreOffice cannot in fact compute it, the
   gate will say so as mismatches or `#ERR` cells in round 2 — the
   addition cannot hide a failure, only route the file to a
   measurement.
3. **Timeout, not a verdict:** the RIIO ET3 draft BPFM produced no
   answer in 1800 s. The harness now takes a per-document timeout
   argument and accepts a single file; round 2 re-runs the BPFMs at
   7200 s. If it still produces nothing, that is recorded as its
   outcome. Reader-side: the BPFM files also take the engine reader
   tens of minutes — Sentinel's A1 territory (the range-expansion
   storm), noted here for the lead, engine untouched.

Round 2 scope, fixed now: the two H7 PCM files, the GT3 draft PCFM,
and any BPFM whose round-1 outcome was `recalc-failed`, at 7200 s.
Nothing else is re-run; round 1's numbers are not revised.

## 26 August 2026 — B2 round 1: the fidelity report, golden-master corpus

Sweep of all 27 files, machine: LibreOffice 25.8 (UNO) on this
container, rules exactly as registered. **Zero mismatching cells.**

**Summary: 18 pass · 0 fail · 6 refused · 3 recalc-failed —
723,192 formula cells compared, 723,192 matched (100%, relative
1e-9).** No file that was gated showed even one cell LibreOffice
could not reproduce.

| File | Outcome | Compared | Match rate |
|---|---|---|---|
| h7_new_debt_indexation_fds.xlsx | pass | 2,233 | 1.000000 |
| h7_new_debt_indexation_fp.xlsx | pass | 2,772 | 1.000000 |
| h7_pcm_v2-10_final_proposals.xlsm | refused (504 range-INDEX hits — scan artifact, amendment above) | — | — |
| h7_pcm_v2-11_final_determination.xlsm | refused (ditto) | — | — |
| ofgem_ed2 v1 2023-02 | pass | 19,513 | 1.000000 |
| ofgem_ed2 v2 2023-07-14 | pass | 19,398 | 1.000000 |
| ofgem_ed2 v2 2023-07-31 | pass | 19,398 | 1.000000 |
| ofgem_ed2 v3 2023-10 | pass | 19,298 | 1.000000 |
| ofgem_ed2 v3 2023-11 | pass | 19,298 | 1.000000 |
| ofgem_ed2 v3 2024-01 (.xlsm) | pass | 19,264 | 1.000000 |
| ofgem_ed2 v4 2024-07 | pass | 19,261 | 1.000000 |
| ofgem_ed2 v4 2025-01 | pass | 19,261 | 1.000000 |
| ofgem_ed2 v4 2025-07 | pass | 19,261 | 1.000000 |
| ofgem_ed2 v4 2026-01 | pass | 19,261 | 1.000000 |
| ofgem_ed2 v5 2026-06 | pass | 19,261 | 1.000000 |
| DRAFT ET3 PCFM Jun25 | pass | 13,878 | 1.000000 |
| DRAFT GD3 PCFM Jun25 | pass | 8,185 | 1.000000 |
| DRAFT GT3 PCFM Jun25 | refused (29 SINGLE hits — catalogue gap, amendment above) | — | — |
| RIIO ET3 BPFM draft (.xlsm) | recalc-failed (no answer in 1800 s) | — | — |
| RIIO GD3 BPFM draft (.xlsm) | recalc-failed (no answer in 1800 s) | — | — |
| RIIO GDT3 RoE Summary | pass | 304 | 1.000000 |
| RIIO GDT3 WACC Rates Model | pass | **243,285** | 1.000000 |
| RIIO GT3 BPFM draft (.xlsm) | recalc-failed (no answer in 1800 s) | — | — |
| final_et3_bpfm.xlsm | refused (10 SINGLE hits) | — | — |
| final_gd3_bpfm.xlsm | refused (10 SINGLE hits) | — | — |
| final_gt3_bpfm.xlsm | refused (10 SINGLE hits) | — | — |
| final_wacc.xlsx | pass | 240,061 | 1.000000 |

Honest margins on the claim: uncached formula cells (present in the
file with no stored value — a generator or a saved-without-recalc
tab) are counted per file in the raw record and were not comparable
(ED2 carries ~1,224 per version; the PCFM drafts 6–10k); the two
quarter-million-cell WACC models each took ~19 coarse minutes
end-to-end on this shared box (timings are noise; the match rates
are the result). The refusals and timeouts are exactly the amendment's
three cases; every one of the six refusals' recorded hits is a scan
artifact shape (the H7 lists are truncated at 25 in the record, so
round 2's re-prescan under the fixed scan is the decider — anything
genuine will refuse again and be recorded as such).

**Round 2 scope addendum, registered before it runs** (extending the
amendment's scope line, since four more files finished after it was
written): round 2 re-runs, at 7200 s per document, with the amended
scan — the two H7 PCMs, the GT3 draft PCFM, the three final BPFMs
(refused solely on SINGLE), and the three draft BPFMs
(`recalc-failed` at 1800 s). Round 1's numbers stand as recorded
above.

## 26 August 2026 — SINGLE is a measured engine gap, not a catalogue entry

Round 2's first record answered the SINGLE question exactly as the
amendment said it would: the GT3 draft PCFM **failed** its gate with
976 mismatches, every one `#ERR:525` — LibreOffice's #NAME?. A
five-cell probe then settled it beyond the corpus: LibreOffice 25.8
returns #NAME? for `SINGLE(...)` and `_xlfn.SINGLE(...)` alike. So
the toolbox's « no LAMBDA » gap has a sibling: **no implicit
intersection**. The catalogue addition is reverted; SINGLE now has
its own denylist category, `engine-gap` — a genuine Excel function
LibreOffice measurably cannot compute — routed to the **arbiter**
(real Excel settles it), never a silent fail. Regression test
updated; the probe and the 976-cell fail are the evidence, both on
this machine, today.

Consequence for the corpus: the GT3 draft PCFM and the three final
BPFMs are *arbiter files* until B3 exists — their fidelity is real
Excel's to certify, and LibreOffice's verdict on them is recorded as
« engine gap », not as a model defect. The gate's discipline held:
no behavioural check will run on them here.

## 26 August 2026 — B2 round 2 recorded, and what the mismatches are

Nine files, amended scan, 7200 s per document. Totals: 6 gated (all
fail, as measurement — see classes below), 3 recalc-failed;
**1,821,772 further cells compared, 1,818,698 matched (99.83%)**.

| File | Outcome | Compared | Match rate | The mismatches are |
|---|---|---|---|---|
| DRAFT GT3 PCFM | fail | 15,182 | 0.935713 | 976 × `#ERR:525` — the SINGLE gap and its downstream cone |
| RIIO ET3 BPFM draft | recalc-failed | — | — | UNO load returned nothing (see below — the file itself loads) |
| RIIO GD3 BPFM draft | recalc-failed | — | — | ditto |
| RIIO GT3 BPFM draft | recalc-failed | — | — | ditto |
| final_et3_bpfm.xlsm | fail | 444,530 | 0.998396 | sample: `#ERR:502` (invalid argument — a construct to identify) + near-zero dust (stored ~1.8e-12 vs computed 0, just over the registered 1e-12 floor) |
| final_gd3_bpfm.xlsm | fail | 454,281 | 0.998508 | sample: all `#ERR:502` |
| final_gt3_bpfm.xlsm | fail | 453,007 | 0.998616 | sample: all `#ERR:502` |
| h7_pcm_v2-10 (range-INDEX fix proved: it gates now) | fail | 227,367 | 0.999784 | 49 cells, all numeric: `TODAY()`-class volatiles (stored date serial 44741 vs today's 46259) + a few ~1e-8-relative real differences |
| h7_pcm_v2-11 | fail | 227,405 | 0.999864 | 31 cells, same two classes |

Readings, in the registered order (reader wrong / engine gap / file
stale), plus one class the registration did not anticipate:

- **Volatile functions are a fourth reading.** A stored `TODAY()`
  result is the authoring day's; a recalculation's is today's. Both
  are right. The H7 « Version log » cells are this class, and
  counting them as mismatches is a rules gap: the next registered
  rules round should prescan volatiles (TODAY, NOW, RAND,
  RANDBETWEEN, RANDARRAY) and report their downstream cone
  separately, not as fidelity loss. Not changed now — round 2's
  numbers stand under round 2's rules.
- **`#ERR:502` on the final BPFMs** is an unidentified engine gap
  (LibreOffice computes an argument invalid where Excel stored a
  number). Naming the construct (pull the erroring cells' formulas)
  is the next diagnostic; those files stay arbiter-bound meanwhile.
- **The near-zero dust** (|stored| ≈ 1.8e-12 against computed 0) sits
  just over the registered absolute floor of 1e-12. Whether the floor
  should widen for near-zero residue is a tolerance-registration
  question for the lead/founder — flagged, not changed.
- **The three draft BPFMs load fine through the CLI convert path**
  (measured: ET3 draft converts in minutes) — so « could not load »
  indicts the UNO load call, not the files. Cause consistent with an
  unanswered load-time interaction request; the driver now passes a
  do-nothing `InteractionHandler` (it can only decline prompts:
  macros stay off, links stay stale, repair is never accepted). The
  four UNO integration tests still pass with it.

**Round 3, registered before it runs:** the three draft BPFMs only,
same harness, same rules, 7200 s, with the interaction-handler
driver. Anything still failing is recorded as its outcome.

## 26 August 2026 — B2 round 3, and the corpus fidelity report is whole

The interaction handler was the whole story: all three draft BPFMs
loaded, calculated, and gated.

| File | Compared | Match rate | Sample classes |
|---|---|---|---|
| RIIO ET3 BPFM draft | 432,940 | 0.998725 | `#ERR:502` + a little numeric |
| RIIO GD3 BPFM draft | 436,275 | 0.998735 | same |
| RIIO GT3 BPFM draft | 448,233 | 0.998842 | same |

**The B2 fidelity report now covers every file of the golden-master
corpus — 27 of 27 gated.** Across the three rounds:
**3,862,412 stored-vs-recalculated cell comparisons; 3,857,715
matched — 99.88% overall.** Eighteen files match at exactly 1.0
(zero mismatching cells, ~723k comparisons); the other nine sit
between 0.9357 and 0.9999 with **every mismatch in a named class**:
the SINGLE `#NAME?` cone (GT3 draft PCFM and the three finals —
arbiter files until B3), the unidentified `#ERR:502` construct on
all six BPFMs (next diagnostic), TODAY/NOW volatiles (a registered
rules gap, not a fidelity loss), near-floor dust (~1.8e-12 vs 0),
and a residue of ~1e-8-relative real differences.

What this does and does not claim, per the plan's B2 sentence:

- It **does**: the fidelity report exists for the golden-master
  corpus and gates everything downstream — the 18 clean-pass files
  are eligible for B4's behavioural laws; the nine others are not,
  until the arbiter (B3) or the named engine gaps resolve them.
- It does **not**: cover the model corpus (`scripts.model_corpus`)
  or the archived CUSTODES `.xls` — each is its own later,
  separately-registered round, as the round-1 registration said.
- Timings stayed noise throughout (shared box); the coarse context:
  a draft BPFM runs ~35–45 min end to end, dominated by the engine
  reader (Sentinel's A1 storm, noted for the lead) and LibreOffice's
  own load of a ~40MB xlsm.

Next in the lane, in order: name the `#ERR:502` construct from the
erroring cells' formulas; the volatile-functions rules round
(registered before any number moves); then B4's laws on the 18
gated files — planted defects first, per the standing registration.

## 26 August 2026 — standing orders acknowledged

The lead's standing arrangement is in force for this lane: at the
start of every working turn, fetch the integration branch and read
`docs/pierce/orders/dynamo.md` — the current orders, maintained at
every sweep. Do what they say, push to `swens/dynamo`, stop. The
founder's « go » means exactly that. This entry is the requested
confirmation; the tenth-sweep orders (name the 502; the volatile
rules round; then B4 on the 18; a B3 design note) are the work now
in progress, in that order.

## 26 August 2026 — the volatile rules, registered before any number moves

Per orders item 2, the rules first, committed before any re-derived
number is looked at:

- **The volatile set**, exactly as ordered: TODAY, NOW, RAND,
  RANDBETWEEN, RANDARRAY. A stored value under any of these is the
  authoring moment's answer; a recalculation's is this moment's.
  Both are right, so their disagreement is **not fidelity loss** and
  must never be counted as such — nor silently dropped.
- **The cone**: a volatile *root* is a formula cell whose own
  formula calls a volatile function (tokenized, same scanner
  discipline as the denylist — never substring). The *cone* is the
  roots plus every formula cell whose precedent chain reaches a
  root (transitive dependents over the reader's own precedents).
- **The gate's arithmetic changes thus**: cone cells are excluded
  from compared/matched/mismatch counts and reported in their own
  bucket — count of roots, count of cone cells, and the roots
  named. A mismatch outside the cone still fails the file exactly
  as before. Verdict logic is otherwise unchanged.
- **What gets re-derived**: the two H7 PCM match rates, as a
  separate table beside (never replacing) the round-2 numbers.
  Expected under the new rules: the `Version log`/`O_FinStats`
  TODAY-class mismatches move to the volatile bucket; whatever
  numeric residue remains is the honest open question.

## 26 August 2026 — the `#ERR:502` construct named: OFFSET with a negative extent

Orders item 1, done with the SINGLE discipline — trace, then probe,
then category. The trace: a diagnostic recalc of `final_et3_bpfm`
dumped every error cell (2,423; codes 532/502/524/525/32767 — most
match stored errors and are not mismatches); the 502 cone roots — 60
cells whose own precedents are clean — are all one shape, in
`RatingSimulator`:

    =AVERAGE( OFFSET(AP64, 0, 0, 1, MAX((YEAR($AP$4)-1) - YEAR(AP$4), -$G$55)))

The width argument goes **negative**. Excel reads a negative
height/width as extending backward from the anchor; LibreOffice
returns Err:502. The probe (five cells, this machine):
`OFFSET(A10,0,0,-3,1)` and `OFFSET(E10,0,0,1,-3)` → `#ERR:502`,
computed-negative `MAX(-1,-3)` width → `#ERR:502`, positive control →
computes. Everything else 502-flagged in the BPFMs is this cone
propagating (plain references through `OutputSummary` and
`ScenarioRun_AllOutputData`).

The mechanism, in two honest halves:

1. **Statically knowable** — a negative *literal* height/width — is
   now a denylist `engine-gap` hit (`OFFSET(negative-extent)`,
   arbiter route), exactly detected by walking OFFSET's argument
   list; a computed extent or a negative *row/column offset* (which
   both engines accept) never trips it. Regression tests committed.
2. **Only measurable** — a computed extent that goes negative, like
   the BPFMs' `MAX(..., -$G$55)` — cannot be statically denied
   without refusing dynamic-OFFSET files that measurably pass at
   1.0. So the gate grew an **engine-errors bucket**: a computed
   `#ERR:*` against a stored number is recorded per cell as the
   engine's inability, still fails the file, and marks it an
   arbiter candidate. The six BPFMs' 502 mismatches are exactly
   this bucket under the new reporting.

So the toolbox's LibreOffice gap list, measured on this corpus, now
reads: no LAMBDA (documented), no implicit intersection (SINGLE,
probed), no negative OFFSET extents (probed). All three route to the
arbiter; none can silently pass.

## 26 August 2026 — B3, the arbiter: a design for the lead (orders item 4)

Four corpus files wait on real Excel (the SINGLE cone), and every
gate fail needs an adjudicator. The design, for review — no code
until the lead approves:

- **Shape: an `ArbiterCalculator` behind the same frozen
  `Calculator` protocol.** `start` = ensure a token (the existing
  delegated flow in `polar/connector/graph.py` — its `GraphClient`
  already does exchange/refresh/drives/download); `recalculate` =
  upload the file to a dedicated arbiter folder in the connected
  drive (resumable upload session — the BPFMs are ~40 MB),
  `workbook/createSession` with `persistChanges: false`, POST
  `workbook/application/calculate` with `calculationType:
  FullRebuild` (the arbiter's whole point is Excel's own fresh
  answer), then per worksheet read `usedRange` values+formulas in
  row blocks (the API's ~4 MB payload cap makes chunking
  non-optional), map to `Sheet!Ref`, close the session, delete the
  upload. Same protocol ⇒ `gate_file` and the sweep harness run
  unchanged with real Excel as the engine string.
- **Two uses, kept distinct in reports:** (1) *certification* of a
  file LibreOffice cannot honestly compute (engine-gap routes) —
  the arbiter's stored-vs-Excel-recalc diff is that file's fidelity
  report; (2) *adjudication* of a LibreOffice mismatch — a
  three-way read (stored / LibreOffice / Excel-now) that names
  whose number moved.
- **What it needs that we lack, for the lead/founder to decide:**
  the connector's scopes are read-only today (`Files.Read.All`);
  the arbiter needs `Files.ReadWrite.All` (upload + workbook
  session), which is a consent-screen change on the connected
  account, and a designated Microsoft 365 account/drive to host the
  arbiter folder. No new Python dependency (httpx is present).
- **Honest limits, from the toolbox and kept:** 5-minute sessions,
  one workbook at a time, undocumented throttling — the arbiter
  adjudicates and certifies the few; it is never the batch engine.
  Every arbiter result names real Excel as its engine; none exists
  until the scopes and account exist.

## 26 August 2026 — the H7 rates re-derived under the volatile rules (orders item 2)

The registered prediction held exactly. Beside the round-2 numbers
(which stand):

| File | Round 2 (old rules) | Under volatile rules | Volatile bucket |
|---|---|---|---|
| h7_pcm_v2-10 | 227,318/227,367 = 0.999784, mm 49 | 227,318/227,365 = **0.999793**, mm 47 | roots 2, cone 2 |
| h7_pcm_v2-11 | 227,374/227,405 = 0.999864, mm 29* | 227,374/227,403 = **0.999872**, mm 29 | roots 2, cone 2 |

*Round 2 recorded 31 for v2-11; two were the volatile roots. The
roots are the same pair in both files — `Version log!F10` (TODAY)
and `O_FinStats!G3` (NOW-class) — and they feed nothing (cone =
roots), so exactly two comparisons moved per file, as predicted.

What honestly remains, all of it now visible:

- **Near-floor dust**: `O_FinStats!*186` cells, |stored| ≈ 5e-12
  against computed 0 (or −1.8e-11) — the standing tolerance-floor
  question, unchanged, still flagged for the lead/founder.
- **A small genuine cluster**: `Macros!Y98` / `C_Revenue!Y369` /
  `C_Fin_Summ!F253` differ at ~2e-8–5e-8 relative — a real
  engine-difference residue above the 1e-9 line, a handful of cells
  per file, honest and open. Adjudication is the arbiter's (B3).
- Engine errors: none in either file under the new bucket.

## 26 August 2026 — B4 measurement protocol, registered (orders item 3)

The laws are registered (25 Aug); this registers **how they will be
measured**, before any harness runs. Committed before any catch rate
exists; none exists as this is written.

- **Pilot first, then scale.** Selector curation (which cells are
  volume/price/revenue/ratio/segments) is per-model, from the
  model's own labels, and honest curation cannot be rushed across
  eighteen files at once. Round 1 is a pilot on **one** gated file
  — `ofgem_ed2/v5_2026-06.xlsx`, the flagship of the passing set —
  with its selector map written into the harness config and quoted
  in this log before any planting. Subsequent rounds extend
  file-by-file; each file's selector map is committed before its
  defects are planted.
- **Planting.** Defects are planted by rewriting one formula (or
  one input) per planted copy with openpyxl — the planted file's
  stored values are discarded, which is irrelevant: B4 compares a
  LibreOffice baseline against a LibreOffice perturbation of the
  same planted file, so stored values never enter. One defect per
  copy, class and target cell recorded at planting time.
- **The classes, from the standing registration:**
  hardcode-in-the-tail (constant added into a revenue chain — the
  class static reading cannot see), the hardcoded ratio leg, the
  omitted segment, the cap/override wired in without being a
  declared input. Per class: N planted copies (N registered per
  round before planting), catch = the law names the planted cell's
  output cone; false positive = a violation reported on the
  unplanted baseline pair.
- **Procedure per planted copy:** baseline copy (inputs untouched)
  and perturbed copy (the law's perturbation applied to the
  selector-named inputs), both recalculated by `UnoCalculator`,
  gate discipline inherited (a planted file that fails its own
  baseline recalc is recorded, not measured), law checkers from
  `recalc/laws.py` applied verbatim. Heavy jobs alone, one file at
  a time, as ever.
- **What will be claimed:** catch rate per class per law,
  false-positive price per law, each catch naming its cell. The
  ddmin narrowing to one responsible cell stays registered future
  work.

## 26 August 2026 — the ED2 v5 selector map, quoted before planting

Curated from the model's own labels (`AR`, `Legacy`,
`SelectedInputs`, the 14 licensee sheets), and committed in
`scripts/recalc_behave.py` before any planting run:

- **An honest narrowing first**: the ED2 PCFM makes **no
  volume-times-price promise** — it computes allowed revenue from
  expenditure, indices and adjustments. Mapping proportionality or
  scale invariance onto it would invent promises the model never
  made, so the pilot measures the two laws it *does* promise;
  proportionality and scale invariance will be measured on a model
  whose structure carries them (the H7 debt-indexation pair is the
  named candidate for the next selector round).
- **Zero-input**, on the licence-fee adjustment:
  `(AP83/AP13 − AP84) × …` (`Legacy!AR85`) is exactly 0 when both
  licence-fee inputs are 0. Inputs: `<DNO>!AP384` (payments) and
  `<DNO>!AP385` (allowance) across all 14 licensee sheets (the true
  constants behind `SelectedInputs`' CHOOSE — all 28 verified
  constants). Must-be-zero: `Legacy!AR85` and `AR!AR33` (the
  Licence Fee adjustment line, FY2024).
- **Consolidation**, three instances on `AR`, FY2024 column:
  `AR!AR45 = SUM(AR22:AR44)` (Legacy AR over its 23 components),
  `AR!AR53 = SUM(AR49:AR52)` (Allowed revenue over Calculated
  revenue + Correction term + Forecasting penalty + Legacy AR),
  `AR!AR58 = AR57 + AR53` (combined RIIO-1 + RIIO-2).
- **Plants, one per copy**: omitted-segment (`AR!AR53 =
  SUM(AR49:AR51)`, dropping Legacy AR ≈ 18.3), hardcode-in-the-tail
  on the combined total (`AR!AR58 = AR57 + AR53 + 3.12`), and
  hardcode-in-the-tail on the zero-input path (`AR!AR33 =
  Legacy!AR85 + 1.2`).
- Predictions, registered: plant 1 → consolidation flags `AR!AR53`;
  plant 2 → consolidation flags `AR!AR58`; plant 3 → zero-input
  flags `AR!AR33`; the unplanted control is clean on all measured
  laws. **No result exists as this is written.**

## 26 August 2026 — B4 pilot result: three plants, three catches, zero noise

Run on this machine (eight LibreOffice recalculations, one at a
time, ~10 coarse minutes end to end). Against the registered
predictions, exactly:

| Copy | Planted | Law verdicts |
|---|---|---|
| control | — | zero-input clean, consolidation clean |
| plant 0 | omitted segment at `AR!AR53` | consolidation flags **`AR!AR53`**: expected 720.0939, actual 701.7959 — the dropped Legacy AR (≈18.3), to the penny |
| plant 1 | `+3.12` in the tail of `AR!AR58` | consolidation flags **`AR!AR58`**: actual 723.2139 vs expected 720.0939 — the 3.12, exactly |
| plant 2 | `+1.2` in the tail of `AR!AR33` | zero-input flags **`AR!AR33`**: 1.2 where exactly 0 was required |

**Catch rate 3/3 (each catch naming its planted cell), false
positives 0** on the control's two law runs, and no cross-law noise
(every plant was flagged only by its predicted law). Plant 2 is the
class that matters most: a constant pasted into an adjustment chain
is invisible to static reading, and the zero-input law caught it by
recalculating — the first measured instance of B4's founding claim,
on a real regulator model.

Honest bounds on this number: it is a **pilot** — one file, three
plants, two laws; a 3/3 on three plants is a mechanism proof, not a
catch-rate estimate. Next per the registered protocol: N plants per
class registered before the next run; the H7 debt-indexation pair
for proportionality and scale invariance (the two laws ED2 does not
promise); then file-by-file extension across the 18 gated files,
each selector map committed before its plants. ddmin narrowing
stays registered future work.

## 26 August 2026 — the H7 debt-pair selector round, quoted before any run

Eleventh-sweep orders, item 1. Both files
(`h7_new_debt_indexation_{fds,fp}.xlsx`) share the layout
ref-for-ref (verified); one map serves both, committed in
`scripts/recalc_behave.py` before this round runs.

- **The structure, from the model's own cells**: `Average RAB`
  (row 26, I:M — verified inputs) feeds *only*
  `Notional new debt (in year)` (row 72 = RAB × gearing × share),
  which feeds `Variance (£)` (row 73 = Variance(%) × notional),
  compounded through the WACC factors into `Total adjustment`
  (`F86`). The rate rows — `Variance (%)` (69) and `Nominal,
  pre-tax WACC` (77) — do not reference row 26 (checked: rows 72
  I–M are its only dependents).
- **Proportionality**: RAB ×2 ⇒ rows 72, 73 and `F86` exactly ×2
  (binary-exact doubling; same-engine tolerance applies).
- **Scale invariance**: RAB ×100 (cents for pounds) ⇒ rows 69 and
  77 unchanged. In the clean file this holds trivially — which is
  exactly why the planted contamination is the measurement.
- **Plants, one per copy, both files**: hardcode-in-the-tail on the
  money chain (`J73 = J69 * J72 + 0.5`) and a hardcoded-ratio-leg
  (`J69 = J65 - J7 + J72/20000` — absolute money pasted inside a
  rate).
- **Predictions, registered**: plant 1 → proportionality flags
  `J73` and `F86` (the additive 0.5 breaks exact doubling through
  the compound); plant 2 → scale invariance flags `J69` (the
  money leg moves ×100); cross-law flags on a planted copy's own
  downstream are possible and are noted, not scored; the unplanted
  control is clean on both laws in both files. **No result exists
  as this is written.**

## 26 August 2026 — H7 debt-pair result: 4/4, both files, zero noise

Run on this machine (~2 coarse minutes per file), against the
registered predictions, exactly:

| File | Control | Money hardcode (`J73 + 0.5`) | Contaminated ratio (`J69 + J72/20000`) |
|---|---|---|---|
| fds | both laws clean | proportionality flags **J73, F86** | scale invariance flags **J69** (0.0294 → 2.9874 under cents) |
| fp | both laws clean | proportionality flags **J73, F86** (6.6243 expected vs 6.1243 — the 0.5, exactly) | scale invariance flags **J69** (0.0243 → 1.4796) |

**Catches 4/4 (each naming its planted cell), false positives 0**
across four control law-runs. The cross-law flags on plant 2's own
downstream (`J73`/`F86` under proportionality) appeared exactly as
the registration noted and are not scored. Scale invariance stayed
correctly silent on the money hardcode — the laws separate the
classes, not just detect them.

With this round, **all four registered laws have caught their
planted class on real corpus files**: zero-input and consolidation
on ED2 v5, proportionality and scale invariance on the H7 pair —
seven catches, seven named cells, zero false positives in total.
Still mechanism proofs, not catch-rate estimates. Next (orders item
2): widen file-by-file across the remaining gated files, N plants
per class registered before each run, toward the plan's B4 DONE —
the hardcode-in-the-tail class measured across hosts.

## 26 August 2026 — twelfth-sweep orders: the widening round, registered

Orders note first: **item 2 (the volatile rules round, H7 folded
in) was completed under the eleventh-sweep work and is in the
integration tip** — the registration, the implementation behind
tests, and the H7 re-derivation table all merged; nothing is redone
here. Item 3 complied with: B3 stays design-only.

**Item 1, the widening — ED2 family round, registered before any
run.** Every other ED2 version was verified against the v5 anchors
by formula shape, not assumption: `AR!AR33 = Legacy!AR85`,
`AR!AR45 = SUM(AR22:AR44)`, `AR!AR53 = SUM(AR49:AR52)`,
`AR!AR58 = AR57+AR53`, `Legacy!AR85` on AP83/AP84, and all 28
licence-fee inputs constants. **All ten MATCH** (v1 through
v4_2026-01, the .xlsm included), so the v5 selector map and the
same three plants carry verbatim to each; v5 itself re-runs as a
repeat measurement. Predictions per file, identical to the pilot's:
omitted segment → consolidation flags `AR!AR53`; tail hardcode →
consolidation flags `AR!AR58`; zero-input tail hardcode →
zero-input flags `AR!AR33`; control clean. Eleven files, 33 plants,
22 control law-runs. **No result from this round exists as this is
written.**

## 26 August 2026 — ED2 family run 1: 33/33 catches, and a selector
defect of my own, caught by its control

The run (eleven files, ~9.5 coarse minutes each): **all 33 planted
defects were caught at their named cells**, and all eleven
consolidation control runs were clean. But the six v1–v3 files
showed zero-input **control violations** — `Legacy!AR85`/`AR!AR33`
read 1.2356 with the supposed inputs zeroed — and the trace shows
the defect is **mine, not the models'**: the DNO-sheet licence-fee
input rows drift by version (v1: AP382/383, v2–v3: AP385/386,
v4–v5: AP384/385, each found by chasing `Legacy!AP83/84` through
`SelectedInputs` per file). My anchor verification checked that
`Legacy!AR85` computes from AP83/AP84 but assumed the input rows —
so on v1–v3 I zeroed the wrong constants (on v2–v3, the payments
row but not the allowance). The residual was the un-zeroed genuine
input.

Scored honestly, run 1 therefore reads:

- **Valid — v4/v5 quintet**: 15/15 catches at named cells, 0 false
  positives across 10 control law-runs.
- **Valid — consolidation on all eleven files** (it uses no input
  map): 22/22 catches (`AR!AR53`, `AR!AR58` per file), 11/11
  controls clean.
- **Invalid — zero-input on v1–v3** (6 files): the law executed
  correctly on wrong inputs; its catches there are contaminated and
  are not counted. This is the control doing its registered job —
  the false-positive check caught the harness, which is exactly the
  kind of error it exists to catch.

The verification standard is upgraded in the harness: input rows
are chased through the model's own formulas per file, never carried
by assumption. **Corrected re-run registered now**: the six v1–v3
files, corrected input rows (v1: 382/383; v2–v3: 385/386), same
plants, same predictions, controls expected clean. No result from
the re-run exists as this is written.

## 26 August 2026 — corrected re-run clean, and the B4 per-class table

The six corrected files: **18/18 catches at named cells, all
controls clean, no extra flags.** The residual that run 1's controls
caught was, as diagnosed, only my mis-mapping.

**The per-class table across every valid measured round** (ED2
pilot + family with corrections, H7 debt pair — 13 of the 18 gated
files):

| Planted class | Law that owns it | Host files | Plants | Catches | Control FPs |
|---|---|---|---|---|---|
| hardcode-in-the-tail, additive adjustment chain | zero-input | 11 ED2 | 11 | **11** | 0 |
| hardcode-in-the-tail, total line | consolidation | 11 ED2 | 11 | **11** | 0 |
| hardcode-in-the-tail, multiplicative money chain | proportionality | 2 H7 | 2 | **2** | 0 |
| omitted segment | consolidation | 11 ED2 | 11 | **11** | 0 |
| hardcoded ratio leg | scale invariance | 2 H7 | 2 | **2** | 0 |

**Totals: 37 plants, 37 catches — every catch naming its planted
cell — and 0 false positives across 26 valid control law-runs.**
The hardcode-in-the-tail class, the one static reading cannot see,
now stands at 24/24 across 13 host files and three structural
guises — the plan's B4 DONE sentence measured in the direction it
asks, across hosts.

Honest bounds, standing: one plant per class per file (single-digit
Ns per class per host); the five remaining gated files (the RIIO-3
set: two draft PCFMs, the RoE summary, both WACC models) await
their own selector curation — the WACC pair at ~19 min per
recalculation makes theirs the expensive round. And run 1's v1–v3
zero-input results remain recorded as invalid; nothing from them is
counted anywhere.

## 27 August 2026 — the narrowing round, registered before it runs

Fourteenth-sweep orders, item 1: the plan's B4 sentence — *a
violated law is a symptom; delta debugging over the dependency
slice narrows it to the one responsible cell*. Registered here,
committed before any narrowing number is looked at. (Orders item 2,
the fidelity gate's volatile rules round, was registered,
implemented and measured under the tenth/eleventh sweeps and is in
the integration tip — not redone. Item 3: B3 stays design-only.)

**Two methods, and they answer different questions.**

1. **The frontier walk** (`recalc/narrow.py::frontier`), no extra
   recalculation. Under a law-perturbation every cell in the broken
   output's precedent cone may legitimately be *zeroed*,
   *unchanged*, or *scaled by the law's factor*; anything else is
   **anomalous**. The culprit frontier is the anomalous cells whose
   own in-cone precedents are all clean — the shallowest place the
   model stopped obeying its own law. A cell that is anomalous only
   because something upstream is never appears.
2. **ddmin** (`recalc/narrow.py::ddmin`), Zeller's minimizing delta
   debugging with a real oracle: pin a candidate subset to the
   values the law predicts, **recalculate**, ask whether the law
   holds; return a 1-minimal set. One recalculation per test, so it
   runs on a registered subsample — the H7 pair, whose files are
   fast. This is what makes the narrowing an algorithm rather than
   an artifact of simple plants: the frontier proposes, ddmin
   proves minimality against the engine.

**Consolidation is deliberately outside both** and says so: it is a
one-run identity with no perturbation to walk, and pinning the
total trivially « restores » it. Its narrowing is structural —
which declared segment the total's own formula never reaches.

**Scoring, fixed now**: *exact* = the answer is the planted cell
alone; *hit* = the planted cell is inside a larger set; *miss* =
not there. The set's size is recorded either way, because a
narrowing that names forty cells has narrowed nothing.

**Scope**: every plant already registered — the eleven ED2 files
(3 each) and the H7 pair (2 each), 37 in total, the same population
the per-class table was measured on. ddmin on the H7 four.

**Predictions, per plant class:**

- zero-input tail hardcode (`AR!AR33 = Legacy!AR85 + 1.2`) →
  frontier **exact** at `AR!AR33`.
- proportionality tail hardcode (`J73 = J69*J72 + 0.5`) → frontier
  **exact** at `J73` for both violated outputs (`J73`, `F86`), and
  ddmin 1-minimal on the same cell.
- contaminated ratio (`J69 = J65-J7+J72/20000`) → frontier
  **exact** at `J69` under scale invariance; its cross-law
  proportionality breaks should also narrow to `J69`.
- omitted segment (`AR53 = SUM(AR49:AR51)`) → structural, **exact**
  at `AR!AR53`, naming `AR!AR52` as the unreached segment.
- consolidation tail hardcode (`AR58 = AR57+AR53+3.12`) →
  **predicted wide**: the total still reaches both declared
  segments, so the structural method cannot say where the identity
  broke and must answer with the whole set (`AR58`, `AR57`, `AR53`)
  — a *hit* of size 3, not an exact. This limit is predicted, not
  discovered afterwards: a pasted constant inside a total is
  exactly the case where one run cannot localize, and honest
  reporting is the point. **No narrowing result exists as this is
  written.**

## 27 August 2026 — the narrowing result: 43 narrowings, 0 misses

Every registered prediction held, including the one predicted to
fail. Across all 37 plants (each violated output is one narrowing,
so 43 in total):

| Planted class | Law violated | Narrowings | Exact | Hit | Miss |
|---|---|---|---|---|---|
| omitted segment | consolidation (structural) | 11 | **11** | — | 0 |
| hardcode-in-the-tail (adjustment chain) | zero-input | 11 | **11** | — | 0 |
| hardcode-in-the-tail (total line) | consolidation (structural) | 11 | — | 11 | 0 |
| hardcode-in-the-tail (money chain) | proportionality | 4 | **4** | — | 0 |
| hardcoded ratio leg | proportionality (cross-law) | 4 | **4** | — | 0 |
| hardcoded ratio leg | scale invariance | 2 | **2** | — | 0 |
| **Total** | | **43** | **32** | **11** | **0** |

Every exact answer is a set of size **one** — the planted cell and
nothing else. Every hit is a set of size **three**, and all eleven
are the single predicted case: a constant pasted inside a total
that still reaches every declared segment, where one run cannot
localize and the method says so instead of guessing. Nothing landed
outside its prediction; there were no misses and no unmeasurable
plants.

**ddmin agreed with the frontier on every one of the ten H7
narrowings** (one confirmation test each): pinning the frontier's
single cell to its law-predicted value and recalculating restored
the law, and there is no proper subset of a singleton. That is a
real check — the engine, not the algorithm, says the cell is
responsible — but an honest reading is that ddmin's *search* value
was never exercised here, because the frontier never proposed a
wide candidate set. Its worth will show on a defect the frontier
cannot resolve alone; that case has not been measured yet.

The cross-law rows are the most interesting result. When the
contaminated ratio broke **proportionality** two cells downstream
(`J73`, `F86`), the frontier still named `J69` — the planted cell —
rather than the cells that visibly moved. That is the whole point
of the plan's sentence: one authoring decision, one finding, even
when the symptom appears somewhere else.

Bounds, stated: 37 plants is single-digit N per class per host; the
frontier walk depends on the reader's precedent lists, which cap
range expansion at 200 cells, so a defect reached only through a
larger range could hide from the cone (not yet observed, recorded
as a known edge); and consolidation's structural limit is now
measured rather than predicted — closing it needs either a second
run under perturbation or B6's diagnosis layer, which is exactly
what B6 is for.

## 27 August 2026 — B5 registered: relation mining, the Monday experiment

Founder-approved (`swens-plan.md` B5, 27 Aug); the binding design
laws are `swens-aha.md`'s, adopted verbatim below. Registered
before any mining code runs; **no mined rule and no score exists as
this is written.**

### Clean-room declaration

This implementation derives from three sources and no others: the
plan's own B5 paragraph, `swens-aha.md`, and standard published
mathematics (integer-relation detection; least-squares residuals).
**The ICSME 2019 reference implementation is LGPL-3.0 and has not
been read, fetched, or consulted, and will not be** — its licence
is incompatible with in-tenant delivery, which is the whole reason
the plan says clean-room. Nothing in this lane is a port.

### 1. The input typing policy (where the engineering lives)

The AHA's first law: a confident false rule came from a model run
in a mode it never occupies. So inputs are **typed before they are
perturbed**, by hand for round 1 (to price the typing honestly),
and each type has one perturbation policy:

| Type | Policy |
| --- | --- |
| money / continuous quantity | sampled log-uniform around the file's own value (×[0.5, 2] by default), the workhorse |
| rate / ratio / percentage | sampled within its own plausible band, never scaled by a money factor |
| count / volume | sampled non-negative, integers kept integral |
| flag / boolean | **held**, or stepped through both states as separate strata — never scaled |
| selector / enum / scenario index | **held**, or stepped through its real states — never interpolated |
| date / period | held for round 1 (period arithmetic is its own round) |
| formula-driven | not an input; never written |

A cell whose type cannot be decided is **not perturbed** and is
recorded as untyped — an honest gap, never a guess.

### 2. Run protocol

- **Gate precondition (standing rule, restated)**: only files that
  pass their fidelity gate at 1.0 are mined. A gate-refused or
  gate-failed file is never mined, and the refusal is the report.
- Each run: sample the typed inputs, recalculate through
  `UnoCalculator`, capture every formula cell's value.
- **Non-converged or errored runs are dropped, never data** — a run
  that returns an engine error in a watched cell, or that fails to
  converge in an iterative file, is discarded with its reason
  counted. If drops exceed 10% of runs the round is reported as
  unreliable rather than scored.
- Heavy jobs alone, as ever; this is the overnight pass, never the
  interactive path.

### 3. The candidate engine, and the measurement that chooses it

Round 1 mines **signed-sum relations** — Σ ±xᵢ = 0 over small cell
subsets — because accounting identities are exactly ±1-coefficient
cancellations. Two engines:

- **Naive enumeration** (pure Python, no dependency): the baseline,
  built and run first.
- **PSLQ** (integer-relation detection, `mpmath.pslq` — one call).

The AHA's law is that PSLQ is *measured against* naive enumeration
before adoption: same runs, same cells, compare rules found and
wall-clock. **`mpmath` is not installed here and I have not
installed it** — new dependencies are the lead's (`lanes.md`,
frozen interface 5). **Proposed to the lead: `mpmath>=1.3`** (BSD,
pure Python, no transitive dependencies). Round 1 therefore runs on
the naive engine alone and reports what it costs; the PSLQ half
follows approval. `numpy` (SVD) and `z3` are **not** proposed yet —
Z3 belongs with Prism's tier-1 proposal so the dependency lands
once, and round 1's rule family does not need either.

### 4. Cleansing and stability

- A candidate becomes a **rule** only if it holds across every kept
  run within same-engine tolerance (relative 1e-9, floor 1e-12).
- **Subsumption**: a rule implied by a smaller rule already in the
  set is dropped (a 4-term identity that is two 3-term ones).
- **Triviality**: relations among cells that are constant across
  all runs are dropped — they are arithmetic about frozen numbers,
  not laws of the model.
- **Stability criterion (the plan's DONE)**: the whole mining is
  run **twice with independent samples**; a rule counts only if
  both runs find it. Agreement between the two sets is reported as
  a number.

### 5. Round 1 — the Monday experiment, exactly as the AHA names it

- **Three gate-clean models**: `h7_new_debt_indexation_fds.xlsx`,
  `h7_new_debt_indexation_fp.xlsx` (both 1.000000 on the fidelity
  gate) and `DRAFT_GD3 PCFM_Jun25.xlsx` (1.000000, 8,185 cells) —
  two rate models and one price-control model, so the rule sets are
  not all one shape.
- Inputs typed **by hand**, and the typing effort recorded (that
  cost is a result: it is what productizing this would need).
- **200 runs** per model, twice for stability.
- **Print the rule set and read it before anything is scored.** The
  test of round 1 is whether a modeller recognises the model in its
  own discovered laws — not a number. Round 1 reports: the rule
  set, the typing cost, the drop rate, the naive engine's
  wall-clock, and my honest reading of whether the rules are
  recognisable.
- **No catch rate in round 1.** Catch-rate plants come in round 2,
  and per the AHA they are drawn from the **PR24 draft→final real
  diffs** (regressions nobody designed for us) as well as designed
  plants — the designer-knows-the-detector bias, named.
- **Detectors**: mined-rule violation, plus the **inert-reference
  check** (a named edge the graph sees live that recalculation
  shows dead) joins B5's list per the AHA.

### 6. What gates what

C6 (Prism's) and B6 (mine — diagnosis over broken rules) both
consume B5's output, and the AHA is explicit that round 1's
rule-set quality gates all three. **Nothing downstream registers
until a modeller-recognisable rule set exists**, and if round 1's
rules are not recognisable I will say so plainly and that is the
result.

## 27 August 2026 — the review's gates, registered before they run

The plan's third amendment is binding on B5 and this entry answers
all four of its points. Registered before any of these numbers
exist; **no stability result exists as this is written.**

### The engineering that made these cheap, and its own check

A mining round re-solves one model hundreds of times while changing
a handful of input cells. Reloading the workbook each time cost
**8.8 s per run**; holding the document open, writing only the named
input cells, and reading back only the watched sheet costs
**0.38 s** — 23× — which is the difference between these gates being
a two-hour job and a five-minute one.

Because it is my own optimization, it was checked before it was
used: three draws through both paths, **9,828 cell-values compared,
zero differences**. The in-place path writes only cells the caller
names, so no formula is ever overwritten and every untouched
constant keeps its value.

### 1. Seed stability (gate on C6)

One unmodified model (`h7_new_debt_indexation_fds.xlsx`, gate-clean
at 1.000000), mined **five times under five seeds** (11, 22, 33, 44,
55), 200 runs each. Registered claim shape: the five rule sets, how
many rules appear in all five, and whether the five sets are
**identical**. Prediction: identical, or the difference is named
rule by rule. If they are not identical, « v12 broke a rule » is
seed noise and I will say so — that is the point of the gate.

### 2. Cosmetic invariance (gate on C6)

A variant of the same model with **three blank rows inserted above
the modelled block and the sheet renamed** — made by LibreOffice
itself, so every formula and reference moves with them. Mined with
the same seed and run count.

**The comparison is by label, never by cell reference.** That is the
test's whole substance: inserting rows moves every watched cell, so
a reference-keyed comparison would report total disagreement for a
model that behaves identically — exactly the failure of positional
diffing that behavioural mining exists to escape. A rule's identity
is the (sign, row label, column label) triples of its terms.
Registered claim: identical by label, or the differences counted in
both directions.

### 3. The input-typing classifier as a shared component (interface
proposed for the lead)

The amendment is right that this is E2's unit inference wearing
another hat, and it should be built once. What exists today is
`polar/tieout/recalc/mine.py`'s `InputType` / `TypedInput` /
`sample` — a policy, hand-fed. **Proposed interface**, for the lead
to place and for Track E to consume:

```
classify_inputs(cells: Mapping[str, Cell]) -> dict[str, TypedInput]
    # one typed input per constant cell, from number format,
    # row/column labels, value range and neighbours

class TypedInput: ref, type, base, states, band, confidence, why
    # `why` is the evidence sentence; `confidence` gates auto-use
InputType: MONEY | RATE | COUNT | FLAG | SELECTOR | DATE | UNTYPED
```

Three properties I would hold it to, from what the hand-typing
taught: an undecidable cell returns **UNTYPED and is never
perturbed** (a guess is worse than a gap); every type carries its
evidence in words; and **constrained families are declared, not
inferred cell by cell** — the H7 weight rows sum to one, and typing
them independently would licence runs in a capital structure the
model never occupies. Where this module should live is the lead's
call, not mine; I have not built it deep pending that word.

### 4. The catch-rate protocol, both directions (B5 round 2)

Registered now so neither number can be chosen later:

- **Direction A — overlap**: of the 84 static-found PR24
  draft→final regressions, how many break at least one mined rule.
- **Direction B — the half that matters**: everything B5 flags on
  those pairs that the static engine did **not**, hand-verified as a
  registered sample, each classified as a real defect, a legitimate
  change, or a false alarm.

**The two numbers are reported separately and never blended**, and
Direction B's sample size and selection rule are registered before
the verification begins.

### 5. Rules broken per real regression (decides B6)

While the PR24 pairs run, the count of **mined rules broken per real
regression** is recorded as its own distribution. Per the amendment
this decides B6: if real regressions typically break one or two
rules, blame-the-changed-cell wins and Reiter's minimal diagnosis is
over-engineering; if they break many, B6 is exactly right. I have no
prediction to register here — the honest position is that I do not
know, which is why it is being measured.

## 27 August 2026 — the two gates: both pass, and the rule set read

### Seed stability — **PASSES**

`h7_new_debt_indexation_fds.xlsx` (gate-clean at 1.000000), mined
five times under seeds 11/22/33/44/55, 200 runs each, **zero dropped
runs in all five**. Each mining found 36 raw signed-sum relations
which cleanse to **8 distinct rules by label**, and the five sets
are **identical**. Repeated across three separate executions of the
whole gate, identical every time. So a rule that breaks between two
versions is not seed noise — the precondition C6 was waiting on.

### Cosmetic invariance — **PASSES, under a stated caveat**

A variant with **three blank rows inserted above the modelled block
and the sheet renamed**, made by LibreOffice so every formula moved
with its cells. Mined with the same seed and run count: **8 rules
versus 8, identical by label, zero in either direction only, zero
drops.** Every watched cell has a different address in the variant,
and the mined laws are the same laws — which is the property
positional diffing cannot have.

**The caveat, because it weakens what this proves**: the comparison
key is (sign, row label, column label), and on this sheet the reader
finds **no header row at all** — 144 formula cells carry 32 distinct
row labels and only 2 distinct column labels. So the key cannot tell
`I52` from `J52`, and « identical by label » is coarser here than
« identical laws ». The pass is real but weaker than the words
suggest, and strengthening the key — the period header read from the
sheet's own layout, or the column's position in the modelled block —
is registered as work before this gate is quoted as decisive.

### Two harness defects of my own, both found by implausibly clean results

Neither was a finding about the model; both were mine, and the run
that exposed each is recorded rather than quietly re-run:

1. **The un-shifted typing** — the variant's typed inputs were
   shifted three rows down without un-shifting the lookup, so
   nothing was perturbed, every watched cell was frozen, and a model
   with no varying cells has no laws: 0 rules, reported as an
   invariance failure that was not one. Fixed by typing once on the
   original and translating the typing to the variant's coordinates.
2. **The truncated sheet name** — Excel caps a sheet name at 31
   characters and truncates on save, so `… (renamed)` landed as a
   name the harness never addressed and **all 200 variant runs
   failed**. The cosmetic edit itself had been correct all along.
   Fixed by reading the new name back from the stored file.

### The rule set, printed and read — **not yet modeller-recognisable**

The AHA's test for round 1 is not a number: it is whether a modeller
recognises the model in its own discovered laws. I printed the eight
and read them. **They are not recognisable, and I am not going to
present them as if they were.** They are pairwise equalities of the
form « Nominal cost of fixed-rate debt (in-year) − Nominal cost of
new index-linked debt (in-year) = 0 » — true across every run, and
uninformative. Why, from the model itself:

- The watched sheet is **144 formula cells**, mostly rate rows that
  are equal to each other by construction in years where a weight is
  zero. The signed-sum family over such a sheet finds equalities,
  not accounting identities.
- **The money chain is one row deep.** The identities a modeller
  would recognise (« notional new debt × variance = the £ figure »)
  are **products, not signed sums** — outside round 1's rule family
  by design.
- Cleansing works as registered and makes this visible rather than
  hiding it: three-term shadows are subsumed, leaving the bare
  two-term equalities.

**What this gates.** Per the AHA, round 1's rule-set quality gates
C6 and B6, so on this model the answer is: **not yet**. What changes
for round 2, proposed here and not yet run:

1. **Mine a model whose sheet carries real additive structure** —
   the ED2 `AR` sheet, where allowed revenue is a sum of named
   components, is the obvious candidate and is gate-clean.
2. **Widen the rule family beyond signed sums** to ratio relations
   (`a / b` constant across runs), which is where a rate model's
   laws actually live. Registered as a family before it runs.
3. **Fix the labels first** — an unrecognisable sentence is a
   product defect even when the mathematics is right.

The seed and cosmetic gates stand on their own: they are about the
mining's *stability*, and both pass. What does not yet stand is the
claim that mined rules read as a model's own laws.

## 27 August 2026 — round 1b registered: what the ED2 typing cost, and what changes

Round 1's reading said the rules were not recognisable and named
three fixes. Two of them are registered here, before running; the
third produced a measurement worth more than the round.

### The ED2 typing was priced, and it is not hand-typeable

The obvious answer to « mine a sheet with real additive structure »
was ED2's `AR` sheet, where allowed revenue is a sum of named
components. Measured before attempting it: the AR sheet's 408
formula cells have a precedent cone of **39,865 cells containing
21,638 constants across 3,279 distinct (sheet, label) groups**, and
the largest groups carry **no row label at all**.

Hand-typing that is not a long job, it is the wrong job. So the
honest conclusion, and it strengthens the amendment's own point:
**the input-typing classifier is not a convenience for Track E, it
is the gate on B5 running against real price-control models.** Until
it exists, B5's models are the small ones. This is now the concrete
argument behind the interface I proposed for the lead.

### The third model: the RIIO GDT3 Allowed Return on Equity summary

Gate-clean at 1.000000 (B2 round 1), 304 compared cells, and its
`One-Off Wedge` sheet is a rate model laid out plainly: years down
column A, `RPI` and `CPI` across, a « % of legacy RPI » share, and
193 formula cells carrying 32 row labels and 6 column labels — a
sheet whose sentences can actually be read.

Hand-typed, and the typing is quoted so it can be argued with:
`C6:C14` (RPI) and `D6:D14` (CPI) are RATE in band; `E6:E13`, the
legacy share, is RATE **bounded at 1.0** — a proportion above 100%
is a state the model never occupies; **column A is the year index
and is HELD**, because a date index is not a quantity and stepping
it would rewrite the model's periods; `J3`, `K3`, `Q22`, `R22` and
the whole `P` column carry no labels and are therefore **UNTYPED and
never perturbed**, recorded as gaps rather than guessed at.

### The ratio family, registered before it runs

Round 1's finding was that a rate model's laws are proportions, not
cancellations, so signed sums can only find equalities. Added:
**`mine_ratios` — pairs whose ratio never moves across runs**,
`numerator = k × denominator`, with `k` taken from the first run and
then **tested against every other run**, so a pair that lined up
once is discarded. `k = 1` is kept: « these two are always the same
number » is a real law and often the interesting one. Three tests
pin it, including the discard case.

**Predictions for round 1b**, registered: on the RoE model I expect
ratio rules that a modeller would recognise (a CPI/RPI wedge
relation, and shares that hold their proportion across periods), and
I expect signed sums to remain thin there. On the H7 pair I expect
the ratio family to surface the weight-and-premium proportions that
round 1's equalities were shadows of. **If the sentences are still
not recognisable I will say so again** — the gate on C6 and B6 does
not move because a second family was tried.

## 27 August 2026 — round 1b: still not recognisable, and now I know why

Three gate-clean models, both rule families, 200 runs under each of
two seeds, zero dropped runs anywhere. The predictions I registered
were wrong in a way worth more than being right.

| Model | Typed inputs | Watched cells | Signed sums | Ratios |
|---|---|---|---|---|
| RoE `One-Off Wedge` | 57 | 193 | **0** | **0** |
| H7 fds | 65 | 144 | 36 | 36 |
| H7 fp | 55 | 161 | 167 | 167 |

### The zero is not « this model has no laws »

That is what it would have been easy to write. I measured instead:
on the RoE model, **10 of 193 watched cells moved at all** across
the runs — 183 sat frozen. The typed inputs (RPI, CPI, the legacy
share) feed one small block; everything else on that sheet is driven
by inputs I deliberately left UNTYPED because they carry no labels.
So « 0 rules » says nothing about the model and everything about the
perturbation.

### And the H7 rules are the same artifact wearing a different face

Read the sentences and they are not accounting identities:

    Nominal cost of fixed-rate debt (in-year) [J52]
        = Nominal cost of fixed-rate debt (in-year) [K52]
    Nominal cost of fixed-rate debt (in-year) [J52]
        = Nominal cost of new index-linked debt (in-year) [J58]

Whole rows equal across every year, and two different cost rows
equal to each other. They are true, stable under five seeds, and
invariant to cosmetic edits — and they are **consequences of how
little I let vary**. With few inputs moving, many outputs are
functionally identical, so the mining finds equalities. The ratio
family found exactly the same relations at k = 1, which is itself
the proof: there were no proportions to find, only sameness.

### The finding: coverage is the binding constraint, and typing governs it

Three measurements from three directions now say one thing:

- ED2's `AR` sheet: **21,638 constants across 3,279 label groups**
  in its cone — not hand-typeable at all.
- RoE: hand-typed honestly, and the typing reached **10 of 193**
  cells.
- H7: hand-typed honestly, and the rules are artifacts of the
  frozen remainder.

**B5's next step is not a third rule family.** It is the input-typing
classifier — the shared component the amendment already identified
and asked me to propose. Round 1b is the evidence for it: without
automatic typing, perturbation coverage stays low, and at low
coverage a rule set is not a finding about the model.

Adopted now, and cheap: **`coverage(runs, refs)` is reported beside
every rule set**, and a round whose coverage is low is **reported as
uninformative rather than as a result** — the same discipline that
makes the gate refuse a file rather than guess at it.

### What this does and does not change

- **The two stability gates still stand.** They are about the
  mining's determinism, not its richness: identical rule sets under
  five seeds, identical under inserted rows and a renamed sheet.
  Those properties hold whatever the coverage.
- **C6 and B6 remain gated**, exactly as the AHA requires: no
  modeller-recognisable rule set exists yet, on any of the three
  models, and I am not going to claim one because the mathematics
  behaved.
- **The honest summary for the founder**: the recalculator can run
  these models thousands of times and the mining is stable and
  clean — but until the typing is automatic, we are only perturbing
  the corner of the model we could label by hand, and laws found in
  a corner are not the model's laws.

## 27 August 2026 — E1 registered: the ground truth, before any inference

The lane is redirected by its own evidence: coverage is the binding
constraint on B5, coverage is governed by input typing, and typing
is E1/E2's unit inference wearing another hat. So Track E's first
half is mine. **This entry is committed before a single row is
drawn, and the sample is committed unlabelled before a single label
is written** — a ground truth chosen after seeing what would be easy
to label is not a ground truth.

### The population and the sample

- **Population**: every *input row* — a (sheet, row) that holds at
  least one constant numeric cell and no formula in that cell — on
  gate-clean corpus models. **Unlabelled rows are eligible.** They
  are the hard cases (ED2's largest constant groups carry no row
  label at all), and a truth set without them would flatter any
  inference that guesses.
- **Five models, registered, spanning shapes** — all gate-clean at
  1.000000 in B2 round 1: `ofgem_ed2/v5_2026-06.xlsx` (price
  control), `caa_h7/h7_new_debt_indexation_fds.xlsx` (rates),
  `ofgem_riio3/draft/…Allowed Return on Equity Summary…xlsx`
  (rates), `ofgem_riio3/draft/DRAFT_GD3 PCFM_Jun25.xlsx` (price
  control), `ofgem_riio3/final_wacc.xlsx` (WACC).
- **20 rows per model, 100 in total**, drawn uniformly at random
  from each model's population with **seed 1727** — registered here
  so the draw cannot be re-rolled. Twenty per model is chosen to be
  large enough that a per-dimension accuracy has a real denominator
  and small enough that every row can be labelled carefully by
  hand; E1 is a protocol, not a census.

### The dimensions, and who needs them

| Dimension | Values | Consumer |
|---|---|---|
| `kind` | continuous · categorical · unknown | B5 (perturb or hold) |
| `b5_type` | money · rate · count · flag · selector · date · untyped | B5 (the perturbation policy) |
| `currency` | GBP · USD · EUR · none · unknown | E2/E3 |
| `scale` | units · thousands · millions · unknown | E2/E3 |
| `period` | none · annual · quarterly · monthly · point-in-time · unknown | E2/E3 |
| `rate_form` | percent · decimal · not-a-rate · unknown | E2/E3 |

### The labelling rules

1. **Evidence allowed**: the row's own label text, the column
   headers above it, the cells' number formats, the values
   themselves, and the labels of neighbouring rows in the same
   block. Nothing else — no reading of the formulas that consume the
   row, because E2 gets that as *propagation* and E1 must not be
   contaminated by it.
2. **`unknown` is a real label, not a failure.** Where the evidence
   above does not decide, the answer is `unknown`, and E2 abstaining
   on that row will count as **correct**. An inference that guesses
   where a careful human abstains is worse than one that says
   nothing.
3. **A percent format decides `rate_form`**: `0.0%` means the stored
   value is a decimal displayed as percent → `decimal`. A value near
   5.8 labelled « RPI » with a plain format is `percent`.
4. **Scale comes from the label or the header**, never from the
   magnitude alone — « £m » says millions; a big number does not.
5. **Categorical** covers flags, scenario selectors, indices and
   year numbers: anything whose values name a state rather than
   measure a quantity.
6. Every row's label carries a **one-line reason**, so the truth set
   can be argued with rather than trusted.

### What gets reported as cost

The AHA asks the typing cost to be priced. E1 reports: rows
labelled, how many were decidable from label and format alone, how
many needed the surrounding block, how many stayed `unknown`, and
how long the pass took. That number is the argument for E2 existing.

## 27 August 2026 — E1 done: the ground truth, its cost, and two findings

100 rows labelled across the five registered models, seed 1727, the
sample committed unlabelled first. The truth set is
`docs/pierce/logs/dynamo/e1-ground-truth.json`; the labelling
decisions and their evidence sentences are
`server/scripts/recalc_units_label.py`, written out so the set can
be argued with rather than trusted.

| Dimension | Distribution |
|---|---|
| `kind` | continuous 69 · categorical 16 · **mixed 13** · unknown 2 |
| `b5_type` | rate 51 · money 18 · date 16 · untyped 15 |
| `currency` | none 67 · GBP 18 · unknown 15 |
| `scale` | units 67 · millions 18 · unknown 15 |
| `period` | annual 50 · point-in-time 20 · none 15 · unknown 15 |
| `rate_form` | not-a-rate 43 · decimal 36 · percent 6 · unknown 15 |

### The cost, since the AHA asked for it priced

**31 of 100 rows were decided by the model telling me** — ED2 and
GD3 carry a `Units` column of their own (« £m 20/21 prices », « £m
nominal », « annual real % »), and those rows label themselves. The
other 69 needed the column headers, the number format, the values
and the sheet's own top matter, read together. **Two rows I could
not decide and abstained on**; 13 more turned out not to be single
quantities at all (below). One pass over 100 rows, with two rounds
of correction, inside a single working session — so the honest
figure is that a careful human can label of the order of a hundred
rows an hour on models like these, and a real model has tens of
thousands of input rows. That ratio is E2's whole justification.

### Finding 1 — the models that declare their units are a different problem

A third of the sample is self-describing: the sheet says « £m 20/21
prices » beside the row. E2 will be nearly perfect there and the
number will mean little. The other two thirds — H7, the RoE summary,
the WACC model — **declare nothing anywhere**, and that is where
inference is actually tested. **Registered now: E2's accuracy is
reported split by whether the model declares units**, never as one
blended figure, for the same reason B5's two catch-rate directions
are never blended.

### Finding 2 — a row is not always a quantity, and E2 must detect orientation

I labelled the WACC model's curve sheets as rates and then re-read
them: a row of `SONIA_Fwd_Curve` is **a record** — `Date | Maturity
| rate` side by side — so calling the row « a rate » is simply
false. **13 rows are now labelled `mixed`**, meaning the quantities
live in the columns and the row has no single unit.

This is a finding about the whole approach, not a labelling
detail. A financial model sheet reads down the side and across the
top; a data table reads the other way. **E2 must decide a sheet's
orientation before it types anything**, and B5's perturbation
inherits the same requirement. I would rather have found this in a
hundred hand-labelled rows than in a rule set six weeks from now.

### E2's interface, proposed for the lead (unchanged in shape, sharper now)

Still proposed rather than built, per the amendment:

```
polar/tieout/units/          # the module name I propose
    classify(cells) -> dict[str, TypedInput]   # per constant cell
    orientation(cells, sheet) -> Orientation   # row-wise | column-wise
```

with the three properties the hand pass confirmed: **abstention is a
first-class outcome** (2 rows here, and E2 abstaining where I
abstained counts as correct); **every label carries its evidence in
words**; **constrained families are declared, not inferred**. Added
by finding 2: **orientation is decided before typing, and reported**.

## 28 August 2026 — E2 registered: the blind rule, and an external truth set

Building E2 as `polar/tieout/units/` (the name the orders offered,
the interface proposed in my log on the 27th and unchanged since).
Registered before the inference is measured.

### The circularity I have to answer

E1's 100 labels and E2's inference have the same author. If E2
reproduces my labelling rules, agreement measures nothing except
that I re-implemented myself. Naming it is not enough, so:

**The primary measurement is against an external truth set I did not
write.** ED2 and GD3 declare units in a `Units` column of their own,
authored by Ofgem's modellers — « £m 20/21 prices », « £m nominal »,
« annual real % », « % ». Every input row on those models carries
one. So:

- **E2 is forbidden to read the Units column.** It infers from
  number formats, row labels, column headers, values and
  propagation only. The Units column is held back as the answer key
  and parsed only by the scorer.
- That gives thousands of externally-authored labelled rows instead
  of my hundred, and the accuracy on them is not self-graded.

The E1 set stays as the **secondary** measurement — it is the only
truth available for the three models that declare nothing (H7, the
RoE summary, the WACC model), and it carries the human judgement my
decision table alone did not have (the `mixed` record rows, the
LIBOR curve). Its numbers are reported **with the shared-author
caveat stated every time**, never as independent validation.

### What is measured, per dimension

Accuracy, abstention rate and error rate — separately, because an
inference that abstains is not wrong in the way a confident mistake
is wrong. **Reported split by declared/undeclared**, as registered
on the 27th. A dimension where E2 is right 60% of the time and
abstains 35% is a different (and better) instrument than one that is
right 60% and wrong 40%, and the report must show the difference.

### The predictions I am registering before running

- **`scale` and `currency` on ED2/GD3 will be the hard ones blind.**
  The £m is declared in the Units column and nowhere else — not in
  the number format (`#,##0.0_);(#,##0.0)` says nothing about
  millions), not in the row label. My honest expectation is that
  E2 will abstain on most of them, and that abstention is the
  correct behaviour, not a failure. If it guesses « units » and
  scores well by luck, I will say so.
- **`rate_form` will be the easy one**: a percent number format
  decides it, and it is the dimension E3's « percent as decimal »
  check needs most.
- **`kind` (continuous vs categorical) — B5's need — should be
  reachable**: dates, year indices and flags have formats and value
  ranges that give them away.

## 28 August 2026 — E2 built and measured: 3,796 externally-authored rows

`polar/tieout/units/` exists, with 11 tests on hand-built evidence
whose right answer is known — including the cases where the right
answer is « nothing ». Measured blind, exactly as registered.

### Primary: against Ofgem's own Units column (E2 never reads it)

| Dimension | ED2 v5 (3,431 rows) | GD3 PCFM (365 rows) |
|---|---|---|
| `kind` (B5's need) | **96.4% right, 0.0% wrong**, 3.6% abstained | **96.2% right, 0.5% wrong**, 3.3% abstained |
| `rate_form` | **96.4% right, 0.0% wrong** | **96.4% right, 0.3% wrong** |
| `b5_type` / `currency` / `scale` | 31.1% right, **0.0% wrong**, 68.9% abstained | 66.6% right, 0.5% wrong, 32.9% abstained |
| `period` | 71.5% right, **24.9% wrong** | 32.6% right, **64.1% wrong** |

**3,796 rows whose answer key was written by the models' own
authors, not by me.** The two predictions I registered both held:
`rate_form` is the easy one, and blind inference **abstains rather
than guesses on scale and currency** — 2,363 abstentions on ED2 and
**not one wrong answer** among them. The £m lives in a column E2 was
forbidden to read and nowhere else; abstaining is the correct
behaviour and the number says so.

`kind` at 96% with essentially no errors is the result B5 needed:
the thing that governs perturbation coverage is now inferable.

### The one bad number, and I am not explaining it away

`period` is wrong on a quarter of ED2's rows and two thirds of
GD3's. The confusion is one shape — **« said annual, was none »,
828 of 856 on ED2 and 232 of 234 on GD3** — and it lands on rows the
Units column describes only as « % ». My inference calls a rate
under `FY2024` headers annual; my answer key calls it `none` because
the model's own text does not say « annual ».

I think the key is the weaker of the two, not the inference. But
**that is an argument, not a measurement**, so the number stands as
measured and `period` is **not to be quoted** until it has a key
worth grading against — which means reading how the model uses the
row, not how it labels it. Registered as the next E2 round.

### Secondary: against E1's hundred, with the caveat restated

E1 and E2 share an author, so this is **not independent
validation** — it is a check that the inference reproduces careful
human reading at scale.

| | `kind` | `rate_form` | `b5_type`/`currency`/`scale` | `period` |
|---|---|---|---|---|
| Declares units (31 rows) | 96.8% / 0% wrong | 96.8% / 0% | 41.9% right, 0% wrong, 58% abstained | 67.7% / 29% wrong |
| Declares nothing (69 rows) | 97.1% / 0% wrong | 72.5% / 5.8% | 59.4% right, 0% wrong, 41% abstained | 72.5% / 5.8% |

The split I registered was worth having: the undeclared models are
where the instrument is actually tested, and `rate_form` drops from
96.8% to 72.5% there — the WACC model's curve sheets, where 13 of
the 20 rows are records and E2 correctly refuses to type them.

### What this unlocks, and what it does not

- **B5 round 2 can now type automatically**: `kind` is 96% accurate
  with near-zero confident errors, which is what decides hold vs
  perturb. Coverage will be reported beside the rule set, per
  standing practice.
- **E3 stays unarmed.** The plan says the mismatch checks are armed
  only where inference is measured accurate; `period` is not, and
  `scale` is an abstention rather than an answer on two thirds of
  ED2. A « monthly figure in an annual line » check cannot be built
  on a period dimension that is wrong a quarter of the time — and
  that is Sentinel's call to make with these numbers, not mine to
  pre-empt.
- **The propagation half is not built yet.** E2 today reads formats,
  labels, headers and values; inheriting units through the
  dependency graph is the Williams-2020 half still owed, and it is
  the obvious way to rescue `scale` — a cell that sums £m rows is in
  £m whether or not anyone wrote it down.

---

## E2's second half — propagation, and the bugs it took to report a zero honestly

*28 Aug. Standing arrangement confirmed: I fetch
`origin/claude/pierce-phase-6-writing-mjkaj6` and read
`docs/pierce/orders/dynamo.md` at the start of every working turn,
do what it says, push to `swens/dynamo`, and stop.*

### The hypothesis I wrote down last time was wrong, and I measured
### it before building on it

I ended the last entry with « a cell that sums £m rows is in £m
whether or not anyone wrote it down », and said propagation was the
obvious way to rescue `scale`. The first thing I did was count the
anchors a *blind* propagation would have.

**Zero.** Not one currency-bearing number format on ED2 (43,178
cells) or GD3 (16,656). The « £m » exists in the Units column and
nowhere else in either file. So blind propagation has nothing to
spread: it cannot rescue `scale`, and the sentence I wrote last time
was a guess that the file disproves.

What propagation *can* do is carry the **declared** units — the ones
in that column — from the input rows into the tens of thousands of
formula cells that consume them. That is what E3 would need and what
B5 needs to read its watched cells, so that is what I built, with
the seeds supplied by the caller rather than inferred.

### The rules, and the reach

`propagate(cells, seeds)` in `polar/tieout/units/inference.py`. A
sum carries the unit of its terms. A formula that is *nothing but*
one amount over another of the same currency is dimensionless. An
amount times a dimensionless factor keeps the amount's unit. Where
the terms do not settle it, **nothing is claimed** — a conclusion
drawn from part of a formula is a guess about the rest.

| | seeds | formula cells | reached | reach |
|---|---|---|---|---|
| ED2 v5 | 15,140 | 20,485 | 13,065 | **63.8%** |
| GD3 PCFM | 1,837 | 14,399 | 6,250 | **43.4%** |

`docs/pierce/logs/dynamo/propagate3.json`.

### The part worth reading: five bugs, all mine

The first run reported **216 « unit conflicts » on ED2**. I did not
report them. I hand-read one — `InputSummary!AR124`,
`= -SUMPRODUCT($I$117:$I$119,AR117:AR119)`, whose six precedents all
declare « £m 20/21 prices » — and it was my detector's fault, not the
model's. Then I kept going, because one artifact means the rest are
suspect too. Every one of the following was found by reading a
conflict the workbooks produced, and each is now a test carrying the
formula that caught it:

1. **`SUMPRODUCT` read as additive.** It contains no `*` character
   and is a product all the same. Fixed → and the count went *up*,
   to 276, which is the reason I kept reading rather than shipping.
2. **A `SUM` leading a product read as a sum.**
   `=SUM(AP65:AP67) * AP$16 * AQ$16 * AR$13` opens with SUM. 240 of
   the 276.
3. **A product taking the unit of its first *known* factor rather
   than its first *moneyed* one.** « rate × £m » came out
   dimensionless whenever the rate came first, and every sum below
   it then read as a conflict.
4. **A product with an unlabelled factor claiming
   « dimensionless ».** `-(SUM($AI101:AQ101))*AR98` — the amounts
   row is blank in this file and only the rate is labelled. It is
   money × rate whose money happens to be zero.
5. **« there is a `/` in here » read as a ratio.**
   `(AP83/AP$13 - AP84) * AP$16 * AQ$16 * AR$13` is £m over an
   inflation index, less £m, times factors. It is money. This one
   alone was the last 18.

After all five: **0 conflicts on ED2, 0 on GD3.**

### A zero is worth nothing without a control, so here is the control

« The detector found no unit mismatches » and « the detector cannot
find a unit mismatch » produce the same number. So, registered
before the run and then run: take each model's own declared units,
corrupt **one row's scale** — a « £ » row summed into a « £m »
column, the mistake a modeller actually makes — and ask whether
propagation names the sum that adds them. A plant counts as caught
only when the conflict is reported **at the planted formula's own
ref**. Predicted ≥ 90%.

| | plants | caught at the sum | unobservable | missed | from the declared row |
|---|---|---|---|---|---|
| ED2 v5 | 20 of 837 candidate sums | 20 | 0 | 0 | 13 of 13 |
| GD3 PCFM | 20 of 797 | 18 | 2 | 0 | 14 of 14 |

`docs/pierce/logs/dynamo/units-control.json`.

**« Unobservable » is measured, not argued.** Both GD3 cases are
sums whose *other* term is computed from the planted one
(`=SUM(AN36:AN37)` where `AN37 = ((AN28+AN29)/PCf-AN36)*RIIO3`): the
corruption reaches both sides, they agree, and there is no
disagreement left to see. The script tests for that by walking the
precedent graph rather than taking my word for it.

The control also found a sixth bug, and the worst one: the first
version of it caught **6 of 20**. A sum is reached before some of
its own terms in a 20k-cell walk, and a conclusion drawn from two of
five terms was never revisited. Propagation now **revises** a
conclusion when more of its terms arrive. That went to 38 of 40.

### What I am handing over, and what I am not

- **The reach numbers and the control are results.** 63.8% and
  43.4% of formula cells carry a declared unit; the instrument
  catches a planted mismatch 38 times out of 38 observable.
- **The zero is a result about these two files**: no unit mismatch
  survives propagation from their own declared units. It is a
  negative finding and it is Sentinel's to use or not — E3's
  mismatch findings cannot be sourced from these two models.
- **I am handing Sentinel nothing that looks like a finding**,
  because there is nothing. Had I pushed the first run, I would have
  handed over 216 of them, and all 216 were mine.
- **`period` is still not to be quoted**, unchanged from last entry.
- **Abstention got more expensive and I am keeping it**: GD3's reach
  is 43.4% where the guessing version reached 47.4%. Four points of
  reach is the price of not making things up.

Next, per orders item 3: B5 round 2 with typing driven by E2's
`kind`, coverage reported beside the rule set.

---

## B5 round 2 — registration, before the machine is touched

*28 Aug, orders item 3. Nothing below is a result. The typing map,
the coverage threshold and the predictions are committed first, and
the numbers land in the entry after this one.*

Round 1b's finding was that a rule set is an artifact of which
inputs were allowed to move, and that hand-typing reached **10 of
193 watched cells** on the H7 pair and is not attemptable on a model
with 21,638 constants. E2 exists to remove that constraint. This
round replaces the hand-written `H7_MONEY_ROWS`/`H7_RATE_ROWS`
tables with typing driven by inference.

### The typing map

E2's vocabulary is not B5's, so the translation is written down
here rather than buried in the runner. `b5_type` decides first,
`kind` decides what is left:

| E2 says | B5 perturbs it as |
|---|---|
| `b5_type=money` | `MONEY` — multiplicative band |
| `b5_type=rate` | `RATE` — its own band, never a money factor |
| `b5_type=date`, or `kind=categorical` with date evidence | `DATE` — **held** |
| `kind=categorical`, ≤ 4 distinct values in the row | `SELECTOR` — **stepped through the row's own observed values** |
| `kind=categorical`, more than 4 | `FLAG` with no states — **held** |
| `kind=mixed` or `unknown`, `b5_type` untyped | `UNTYPED` — **held, and counted as a gap** |

Two things in that table are load-bearing and both come from the
AHA's typing law. **A selector's states are the values that row
actually takes in the file** — never invented, never scaled; a
categorical row with many distinct values is not a selector I
understand, so it is held. And **`unknown` still means held**: E2
abstaining is not a licence to guess, it is the same refusal
arriving automatically instead of by hand.

The hand-typed tables stay in the runner as `--hand`, because the
comparison between hand and inferred typing is the point of the
round.

### The coverage threshold, fixed now

A round is **informative only at coverage ≥ 50%** of watched cells.
Below that the rule set is reported as uninformative and no rule
from it is quoted — the standing practice from round 1b, given a
number now so it cannot be negotiated after seeing the output.

### Predictions

1. **Automatic typing types more input cells than the hand tables
   did** on the H7 pair — more than 10 of 193 watched cells move.
2. **It clears the 50% bar on at least one of the three models.** I
   am genuinely unsure of this one: H7's inputs are mostly rates,
   and a rate model's watched cells may move on very few of them.
3. **The stability gates still pass** — five seeds identical, two
   independent minings agreeing above 0.5 — because nothing about
   the mining changed, only which cells move.
4. **The rule sets get bigger and mostly worse.** More movement
   means more true relations *and* more three-term coincidences;
   I expect the stability filter to carry most of that weight, and
   I expect to still be unable to say the rule set is
   modeller-recognisable. Recording that in advance so that a
   recognisable set is a real surprise and not a story told
   afterwards.
5. **At least one rule will name a cell E2 typed wrongly.** `kind`
   is 96.4% accurate, which on 193 cells is several errors, and a
   money row perturbed as a rate is exactly the failure the typing
   law exists to prevent. If I cannot find such a rule I will say
   so.

Judging recognisability is a judgement and is recorded as one: I
print the rule set, read it, and write what I think — no metric is
being invented for it.

---

## E2 generalisation onto the closed-deal corpus — registration

*28 Aug, nineteenth-sweep addendum item 2. The lead asked me to
judge whether the value-only corpus is worth E2's time. It is, and
here is the round, registered before a single one of those files is
opened.*

### Why it is worth it

E2's 96.4% was measured on **two files written by one organisation**
under one house convention. Ofgem puts a `Units` column on nearly
every sheet and writes « £m » in it; that convention is the answer
key, and it may also be most of the reason the inference works.
Sixteen Scottish Futures Trust closed-deal models are a different
idiom entirely — different authors, different decades, private
sector, no shared style guide — and E2 has never seen any of them.
(The *engine* was tuned against six of them in another lane's
rounds; E2 is not the engine and has never read them. Stating that
because « unseen » is a claim, not a mood.)

The hostility the lead names is the point: **value-only files cannot
be propagated through**, so this round measures the label-and-format
half alone. I will not report a reach number for these files, and
the propagation half stays measured on ED2 and GD3.

### The order of measurement — the key first, always

The last two rounds both turned on measuring the anchor before
building on it (zero currency-bearing formats on ED2 killed a
hypothesis I had already written down). So, in order:

1. **Count the answer key.** How many rows across the sixteen models
   carry a declared unit E2 can be graded against — a `Units`
   column, or a currency in the number format. This number is
   reported whatever it is.
2. **Only then, accuracy.** Per dimension, blind, exactly as on
   ED2/GD3.

**The bar, fixed now: no per-dimension accuracy is quoted on fewer
than 100 keyed rows.** Below that the round is reported as
unmeasurable — « the corpus has no key » is a finding about the
corpus, and inventing one by reading titles and calling it truth
would be the same mistake as grading myself.

Independent of any key, three things are measurable and will be
reported: **how often E2 declines**, whether **orientation** still
decides correctly on these layouts, and whether `kind` — the one
dimension B5 actually consumes — survives the change of idiom.

### Predictions

1. **The key is much thinner here.** Ofgem's Units column is a
   regulatory artifact; a project-finance model more often puts
   « £000s » in a sheet title or a header and nothing on the row. I
   expect **fewer than 100 keyed rows on most of the sixteen**, and
   I think there is a real chance the whole round comes back
   unmeasurable on currency and scale.
2. **Abstention rises.** Whatever the key says, E2 will decline more
   often here than on ED2, because it was built where the evidence
   was rich.
3. **Orientation holds.** These are financial models laid out the
   usual way — periods across, labels down — so `row-wise` on the
   large majority of sheets. If this fails, the sheet-level
   machinery is wrong and not just the dimensions.
4. **At least one systematic failure Ofgem's convention hid.** I
   expect to name it and I expect it to be embarrassing; the last
   two rounds each produced one.
5. `kind` **degrades but stays usable** — above 85%, against
   whatever key exists. This is the prediction I would least like to
   be wrong about, because B5 round 2's typing rests on it.

Cold-run conditions, borrowed from the population proof because they
are right: **E2 is frozen at the commit named when the run starts**,
no detector change between the first file and the last, and anything
the run exposes becomes a later round rather than a fix mid-flight.

---

## E2 on the closed-deal corpus — the round came back unmeasurable, and that is the result

*28 Aug. E2 frozen at `c6430687` for the whole run, per the
registration; nothing in the module changed between the first file
and the last, and the two failures named below are a **later**
round, not a fix made mid-flight.*

Eight readable Scottish Futures Trust models rebuilt with
`scripts/corpus_sft_models.py` (three more are format-blocked
`.xlsb`/`.xls`, and the founder-supplied trio is not fetchable from
this container — so eight, not sixteen, and I am not going to round
that up).

### Step 1: count the key. It is zero.

| model | rows with a `Units` column | cells with a currency-bearing format |
|---|---|---|
| baldragon | **0** | 836 of 406,942 |
| forfar | **0** | 1,591 of 383,497 |
| glasgow_college | **0** | 4,793 of 321,227 |
| inverurie_foresterhill | **0** | 64 of 105,953 |
| kelso | **0** | 507 of 502,587 |
| levenmouth | **0** | 8 of 446,663 |
| newbattle | **0** | 505 of 503,754 |
| oban_campbeltown | **0** | 316 of 99,227 |

`docs/pierce/logs/dynamo/units-key-sft.json`. Not one of the eight
declares its units in a column. **Zero gradeable rows against a
100-row bar, so no per-dimension accuracy is quoted for this
corpus** — and prediction 5, that `kind` would hold above 85%, is
**unresolvable rather than confirmed**. There is nothing to score it
against, and inventing a key by reading titles would be grading
myself.

Prediction 1 said the key would be thinner here. It is not thinner;
it is absent.

**The complementary finding is the one worth keeping.** ED2 and GD3
declare units in text and have **zero** currency-bearing number
formats. These eight have currency formats and **zero**
declarations. The two corpora anchor opposite halves of E2's
evidence and neither has both — which argues for keeping both halves
far better than a good score on one would have.

### Step 2: what is measurable without a key

53,832 input rows across 295 sheets.

| | measured |
|---|---|
| orientation | **248 row-wise, 32 column-wise, 15 unknown** (84% row-wise) |
| abstained on `kind` | 17.2% |
| abstained on `b5_type` | 32.5% |
| abstained on `currency` / `scale` | **77.4% / 81.3%** |
| **rows B5 could perturb** (money or rate) | **8,484 of 53,832 — 15.8%** |

`docs/pierce/logs/dynamo/units-sft.json`. Prediction 3 (orientation
holds) confirmed at 84%. Prediction 2 (abstention rises) confirmed:
currency and scale abstained on 62% of ED2's rows and on ~79% here.

**The 15.8% is the number Track B has to live with.** On the H7
regulator file automatic typing typed 3,203 of 3,210 input *cells*
and moved 144 of 144 watched cells; on a project-finance model only
**15.8% of input rows** are typed as perturbable. Different
denominators — rows against cells — so it is a contrast, not a
ratio, and the honest reading is: B5 leaving the regulator corpus
means mining a model where five sixths of the inputs are held.

### Step 3: prediction 4, and it is as embarrassing as promised

I predicted at least one systematic failure that Ofgem's house style
had hidden. There are two, both found by reading twelve rows of
`glasgow_college_model.xlsm`
(`scripts/recalc_units_spot.py`, seed 11):

**(A) A record table whose headers avoid six particular words reads
as row-wise.** `Swap profile!81` has the row label `FY2028` and the
headers `Period end · Balance b/f · Drawdown · Capitalised
Interest`. That is a record table — a row is one period, and its
cells are a date serial (47208), a balance (25,131) and a drawdown
(−691), three different units. `orientation` looks for
`date|maturity|tenor|ticker|code|id` and finds none of them, so it
returns row-wise and E2 then asserts one `period` for the whole row.
This is the exact thing orientation exists to prevent, and **B5
would perturb that row as one quantity** — the typing law broken by
an orientation error rather than by a typing error.

**(B) One percent format among a row's several decides the row.**
`Outputs!36`, `Project IRR, pre-tax`, holds `0.0776, 0.0515, 1.15,
1.2302, 1.2295` under three different formats. One of the three is a
percent format, so E2 says `rate_form=decimal` for all of it — but
1.23 is a cover ratio, not an IRR. Ofgem writes one format per row;
this corpus does not, and `number_formats` being a *set* of up to
four with « any percent wins » is a confident wrong answer waiting
for a mixed row.

Both are hidden by uniformity. Neither would ever have appeared on
ED2 or GD3, which is precisely why the lead was right that this
corpus is worth the time.

### What I am not doing

Not fixing either of them in this entry. The run was registered
frozen and it stays frozen; **the fix is the next round**, with the
usual shape — register the change and the prediction, then measure.
The two fixes I will propose are: orientation reading a *record
table* from the shape of its headers rather than from a word list,
and a mixed-format row being an **abstention** rather than a vote.

Registered as the next E2 round. `period` remains not to be quoted.

---

## B5 round 2 — coverage 100%, and the typing broke the law it was built to keep

*28 Aug, orders addendum item 1: coverage first.*

### Coverage, first, as the addendum asks

| | round 1b (hand-typed) | round 2 (typed by E2) |
|---|---|---|
| typed inputs, whole workbook | 65 | **3,210** (3,203 rate, 7 held) |
| watched formula cells | 144 | 144 |
| **coverage** | artifacts of the frozen remainder | **144 of 144 — 100.0%** |
| runs kept | 200 + 200, zero drops | 200 + 200, **zero drops** |
| stable signed sums | 36 | **11 — 3 distinct sentences** |

`docs/pierce/logs/dynamo/round2-h7fds.json`. Predictions 1 and 2
hold: automatic typing types far more than the hand tables did, and
it clears the registered 50% bar outright.

**Prediction 4 was wrong, and wrong in the good direction.** I
registered that the rule sets would get *bigger and mostly worse*.
They got **smaller and better**: 36 stable rules became 11. Round
1b's rules were equalities among cells that never moved
(`J52 = K52`, whole rows equal across years); with everything
moving, those coincidences die. That is the coverage argument
working exactly as round 1b predicted it would, and I did not
predict the direction.

### What the three surviving sentences actually are

I read them against the formulas rather than admiring them:

    Nominal cost of fixed-rate debt (incl. HAL adj.) [42]
      = Nominal cost of index-linked debt (excl. IL premium) [46]
        I42: = SUM( I$9, $G$10 )
        I46: = SUM( I$9, $G$10 )

    Nominal cost of fixed-rate debt (in-year) [52]
      = Nominal cost of new index-linked debt (in-year, excl. IL premium) [58]
        J52: = SUM( J37, $G$12 )
        J58: = SUM( J37, $G$12 )

They are **identical formulas under different names**. The mining is
right, the rules are true, and they are not accounting identities —
they are duplicate calculations. Whether « these two differently
named cost rows are the same calculation » is worth a reviewer's
time is a real question and not mine to answer; it is at least a
*checkable statement about the file*, which round 1b's set was not.
The third sentence, `Real cost (in-year) = Real cost (cumulative)`
in the first year only, is a boundary condition.

So: still **not modeller-recognisable as accounting law**, but for a
different and better reason than last time.

### Prediction 5, and it is the finding of the round

I registered that at least one rule would name a cell E2 typed
wrongly. What happened is worse and more useful.

**The weight rows were perturbed independently, and they are a
constrained family.** Rows 15–20 are « Weight on embedded debt »,
« Weight on new debt », « Weight on index linked debt », « Weight on
fixed-rate debt ». The hand typing **held** them, for the reason
written into `mine.py` in round 1: embedded + new = 1. E2 sees
`0.00%` and says `rate`, correctly — a weight *is* a rate — and the
typing map then perturbs each one on its own.

Measured, not argued:

| | I | J | K | L | M |
|---|---|---|---|---|---|
| the file: embedded + new | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |

    one draw under the inferred typing:
      I: embedded 1.1333 + new 0.0058 = 1.1391
      J: embedded 1.4452 + new 0.0634 = 1.5085

**An embedded-debt weight of 113%.** The model was run in a capital
structure that cannot exist — precisely the failure the AHA's typing
law exists to prevent, and the failure the hand typing was written
to avoid. 100% coverage is partly *because* of it.

And the mirror error: **`Average RAB` (row 26), the sheet's only
money row, came back `untyped` and was held.** E2 abstained — no
decisive format, no currency in the label — so automatic typing
loses the one MONEY input the hand typing had. It over-perturbs the
weights and under-perturbs the money.

### What this means, and the gap it names

The three sentences survive: they are provable from the formulas and
do not depend on the perturbation being legal. **What does not
survive is any claim of completeness.** At illegal capital
structures a true law that holds only on the simplex is broken and
therefore never found, so « these are the model's laws » is exactly
what round 2 may **not** say — the same sentence my own registration
reserved for a round that earns it.

The gap has a name now, and it is not a units gap:
**constraint membership**. E1 and E2 label a row's *dimension* —
this is a rate, in percent, per year. Nothing in that vocabulary can
say **« rows 15 and 16 sum to 1 »**. A units classifier cannot
express a simplex, and B5's typing needs both. That is a new
dimension for Track E, or a separate detector for Track B, and it is
the lead's call which; I will register whichever is chosen before
building it.

Registered as the next B5 round: **detect constrained families from
the file itself** — rows that sum to a constant across every year
column are the obvious first shape — and sample them jointly on
their simplex rather than holding them, which is what round 1
promised « when it comes ».

`roe` is running under the same typing, because the question round
1b left open — does a 0-rule model produce rules once coverage
rises? — is worth answering even under a typing I have just shown to
be unconstrained. Its result will carry the same caveat.

---

## A loss to declare: the earlier rounds' raw run files are gone

*28 Aug. This is my mistake and it is worth stating plainly rather
than leaving for a successor to discover.*

The container restarted mid-session and the repository was re-cloned.
Everything committed survived; everything untracked did not. And the
raw output of **every round before this session was untracked**:

- `fidelity-au-uk*.json` — B2's fidelity sweeps over the golden-master
  corpus (27 files, 3,862,412 comparisons)
- `b4-*.json` — the behavioural-law plants and controls
- `narrow-*.json` — the 43 ddmin narrowings
- `stability-h7*.json` — B5's five-seed and cosmetic-invariance runs
- `round1b.json` — the round this week's redirection was based on

I wrote them into `docs/pierce/logs/dynamo/` and treated them as
records without ever committing them. They were not in `.gitignore`;
they were simply never added, and each sweep's numbers went into this
log's tables instead.

**What survives**: every number, in the tables written when the runs
finished, in this log. The log cites no file path that no longer
resolves — I checked — so nothing here is a dangling reference.

**What does not**: the ability to re-derive those tables without
re-running the machine. Anyone who wants to check B2's 99.88% must
re-run the sweep; my word and my table are all that stand behind it
today.

Neither of those is good enough for numbers this lane asks other
people to rely on, so:

- **Every result file is committed the moment it is produced**, from
  the propagation round onward. The eight JSONs now in
  `docs/pierce/logs/dynamo/` are all tracked.
- The re-runs are hours of machine time each and I am not going to
  spend them on my own initiative while the orders point elsewhere.
  **B2's fidelity sweep is the one worth re-running** — it is the
  lane's headline number and the one most likely to be quoted — and
  I will do it on the lead's word, or when the machine is otherwise
  idle.
- The 6-run smoke file `round2-smoke.json` is deleted rather than
  left beside a 400-run result to be mistaken for one.

### RoE under the same typing: coverage went **down**, 10 of 193 → 0 of 193

The question round 1b left open was whether a model that produced
zero rules would produce some once coverage rose. It did not,
because coverage did not rise — it collapsed.

    coverage: 0 of 193 watched cells moved (0.0%)
      — UNINFORMATIVE — not a result
    0 stable rules

`docs/pierce/logs/dynamo/round2-roe.json`. 400 runs, zero drops, and
**not one watched cell moved in any of them**. Hand typing reached
10 of 193; automatic typing reached none. Reported as uninformative
per the registered bar, which is the whole point of having fixed the
bar in advance.

**The cause, measured.** Every one of the 26 cells the hand typing
perturbed — `C6:C14` (RPI), `D6:D14` (CPI), `E6:E13` (the legacy
share) — came back typed `date` and was held:

| | hand | inferred |
|---|---|---|
| `C6`…`C14`, `D6`…`D14`, `E6`…`E13` (26 cells) | rate | **date** |

E2's reason is sound in isolation: « the row is a year (« 2025/26 »)
holding its own year number ». Row 6 *is* labelled `2021/22` and
*does* hold 2022.0 in column A. It also holds RPI 5.8, CPI 4.0 and a
share of 1.0 in the next three columns, under headers `RPI · CPI ·
% of 'legacy' RPI`. **It is a record row: one period, several
fields, several units.** E2 gives the row one label, the year wins,
and three real rates are typed as a date and frozen.

### The same bug twice, from two different corpora

This is failure (A) from the closed-deal round — `Swap profile!81`,
a record table read as a model row — arriving again on a regulator
file, and it is now the most load-bearing defect I have found:
**row-level labelling cannot represent a row whose cells carry
different units.**

And there is a second, sharper part that is **my** fault, not E2's.
`orientation` returned **`unknown`** for this sheet. E2's own
contract says an unknown orientation means the caller must not treat
a row as a quantity. My typing map is that caller, and it keys on
`b5_type` and `kind` alone — it never asks the orientation. Had it
asked, it would have refused the sheet honestly instead of freezing
it by accident.

On a record sheet the unit lives in the **column** — the RPI column
is the rate, which is exactly what the hand typing perturbed. E2
labels rows only; there is no column-wise path in either the
inference or my map.

### Registered as the next round, in this order

1. **The typing map reads the orientation.** A sheet whose
   orientation is `unknown` or `column-wise` is refused, loudly, as
   an untyped sheet — not silently frozen. Cheap, and it turns this
   accident into a stated refusal.
2. **A column-wise path**: on a record sheet, classify the column
   and let B5 perturb it. This is what makes the RoE model
   mineable at all, and it is the same fix that keeps
   `Swap profile!81` from being perturbed as one quantity.
3. **Constrained families** (from the H7 round above), which is
   independent of both.

Round 2's verdict across the three models, stated plainly: **on H7
the typing works and over-reaches; on RoE it fails closed.** Neither
result may be called the model's laws, and the reasons are now
specific enough to fix.

---

## The record-table round — registration

*28 Aug. The two fixes the RoE collapse and `Swap profile!81` both
point at, registered with predictions before either is written. E2's
reported numbers stand as measured at `c6430687`; this changes E2
after that run, not during it.*

### What is being built

1. **The typing map reads the orientation.** `type_from_units` is
   given the sheet's orientation. A sheet that is `unknown` is
   **refused as untyped and the refusal is counted**, instead of
   being frozen by accident because every row happened to look like
   a date. A stated refusal and a silent freeze produce the same
   coverage number and are not the same thing.

2. **A column-wise path, by transposition.** On a record sheet the
   unit lives in the column: `RPI` is the rate, `2021/22` is the
   record. So the evidence is transposed — the **column header
   becomes the label**, the row labels become the headers, the
   column's cells become the values and formats — and the existing
   `classify_row` is run on that. No second classifier: if the
   inference is right about what evidence decides a unit, it should
   work equally well down a column, and if it does not, that is
   worth knowing too.

### Predictions

1. **RoE's rate columns come back as rates.** `C6:C14`, `D6:D14`,
   `E6:E13` — 26 cells the hand typing perturbed and automatic
   typing froze — are typed `rate` again on at least **24 of 26**.
2. **RoE's coverage clears round 1b's 10 of 193.** I will not
   predict it clears the 50% bar; the sheet has 193 watched cells
   and only three input columns, and round 1b's evidence says the
   rest are driven from elsewhere.
3. **H7 is untouched.** Its sheet is row-wise, so the orientation
   gate does not fire and `h7-fds` returns the same 144 of 144 and
   the same 11 stable rules. If it does not, the change has a
   side-effect I did not intend and the round stops there.
4. **The transposition finds at least one new systematic problem.**
   Registered in advance for the third time; the last two rounds
   each produced one and I would be surprised if reading a model
   sideways did not.
5. **Constrained families stay unfixed** and the H7 weights stay
   illegal — that is the round after this one, and no number from
   this round may be read as though it were solved.

### `h7-fp` under round 2's typing: 167 stable rules became 17

| | round 1b (hand) | round 2 (inferred) |
|---|---|---|
| typed inputs | 55 | **3,978** (3,971 rate, 7 held) |
| watched cells | 161 | 161 |
| coverage | artifacts of the frozen remainder | **161 of 161 — 100.0%** |
| runs kept | 200 + 200 | 200 + 200, **zero drops** |
| stable signed sums | **167** | **17 — 7 distinct sentences** |

`docs/pierce/logs/dynamo/round2-h7fp.json`. The same movement as on
`h7-fds`, and the same direction: **the rule set shrank by a factor
of ten.** Round 1b's 167 were overwhelmingly equalities among cells
that never moved; at full coverage they die. Prediction 4 of the
round-2 registration — bigger and worse — is wrong on both models,
and wrong the good way.

The seven survivors are the same shape as `h7-fds`'s three:
duplicate calculations under different names, plus first-year
boundary conditions (`in-year = cumulative` in column I only). The
weights are still perturbed illegally on this file too, so the
completeness caveat stands unchanged: **these are true sentences
about the file, not the model's laws.**

---

## The record-table round — measured, and the prediction I got wrong

*28 Aug, against the registration two entries above.*

### Prediction 1 — **failed, twice, and the second failure is the finding**

Registered: 24 of the 26 RoE rate cells come back as rates.

**First failure — the design was wrong.** As registered, an
`unknown`-orientation sheet is refused. RoE's `One-Off Wedge` *is*
`unknown` — its headers are `RPI · CPI · % of 'legacy' RPI`, none in
the record-header word list, and its row labels are years — so the
refusal fired and the column path never ran on the one sheet it was
built for. **0 of 26.** Amended: an undecidable sheet is transposed
and asked again, and if the sideways view is decisive it is read
column-wise. Recorded here rather than quietly corrected.

**Second failure — the measurement.** With the amendment the sheet
is read column-wise, and the recovery is **8 of 26, not 24**:

| column | label | format | E2 |
|---|---|---|---|
| E6:E13 | `% of 'legacy' RPI in the RPI Figure` | `0%` | **rate** ✓ |
| C6:C14 | `RPI` | `0.00` | `unknown-quantity` — held |
| D6:D14 | `CPI` | `0.00` | `unknown-quantity` — held |

RPI is stored as `5.8` under a plain `0.00` format with a
three-letter label. There is no percent format to key on, and `RPI`
means nothing to the inference. **My hand typing knew RPI is an
inflation rate; E2 has no vocabulary of named rates**, and that —
not the orientation — is what holds two of the three input columns.
The column path was necessary and is not sufficient.

### Prediction 3 — **confirmed, and settled without the machine**

Registered: H7 is untouched. Verified by comparing the old and new
typing directly rather than by re-running an hour of mining: on
`h7-fds` the typed-input list is **identical in order and in value**
(3,210 inputs, 3,203 rate, 7 held; no sheet refused, none read
column-wise), and `h7-fp` likewise. The perturbation is
`random.Random(seed)` walked over that exact list, so identical
inputs in identical order give identical runs. The argument is only
valid because the order matched too, which is why I checked it.

### Prediction 4 — **confirmed, on the real file as well as a fixture**

The registered surprise arrived: read sideways, the year column
comes back `unknown-quantity`, **not** `date`. The year-index rule
reads a *row label*, and a transposed column's label is its header —
blank, here. B5 holds an `unknown-quantity`, so it costs no
coverage: the right outcome for the wrong reason. Registered for the
next round rather than patched inside this one.

### What this names for Track E

A third gap, beside constraint membership: **a vocabulary of named
rates.** `RPI`, `CPI`, `WACC`, `gearing`, `IRR`, `yield` — a
modeller reads the label and knows; E2 reads `0.00` and abstains,
correctly by its own rules and uselessly for B5. This is cheap to
build and easy to get wrong (a list of words is exactly the kind of
thing that quietly becomes a guess), so it is registered as its own
round with its own answer key rather than added to this one.
