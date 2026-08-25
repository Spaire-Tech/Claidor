# The lanes — five agents, one engine, no collisions

25 August 2026. The division of labour for parallel work, written
before any lane opens. Every agent reads `notes.md` first (the canon:
product = `swens.md`, plan = `swens-plan.md`), then this file. The
lead (the founder's principal session) integrates; the founder
decides. Where this file and `swens-plan.md` disagree, the plan wins;
where anything disagrees with `swens.md`, `swens.md` wins.

## The one hard rule

**Only Sentinel may change what the engine reports.** Every findings
change regenerates `docs/pierce/corpus-golden-master.json`, and that
baseline is a single answer sheet — two hands on it produce
unmergeable, unreviewable diffs. Every other lane treats the engine
as a read-only library. A lane that believes the engine *should* say
something different writes the case in its log and the lead routes it
to Sentinel as a registered round. No exceptions, including
« harmless » ones.

## Who owns what (paths; touching another lane's paths is a defect)

| Lane | Owns | Never touches |
|---|---|---|
| **Sentinel** — engine findings (Track A) | `server/polar/tieout/{audit,structure,analytics,workbook}.py`, `docs/pierce/corpus-golden-master.json`, `server/scripts/{corpus_gate,corpus_au_uk,custodes_*,model_corpus}.py`, new planting harnesses under `server/scripts/planting/`, `server/tests/tieout/test_audit*`, `test_shape*`, `test_structure*` | product code, other lanes' packages |
| **Dynamo** — recalculator (Track B) | new package `server/polar/tieout/recalc/`, `server/tests/tieout/test_recalc*`, `server/scripts/recalc_*` | everything else |
| **Prism** — the Watch (Track C) | new package `server/polar/tieout/watch/`, `server/tests/tieout/test_watch*`, `server/scripts/watch_*` | everything else |
| **Scribe** — the Chain (Track D) | new package `server/polar/tieout/chain/` (incl. its own router file, mounted at integration by the lead), `server/tests/tieout/test_chain*`, `server/scripts/{corpus_documents,corpus_extract_pdfs}*` | everything else |
| **Atelier** — product & delivery (G + H) | `clients/**`, `server/polar/tieout/{endpoints,schemas,service}.py`, `server/tests/tieout/test_routes*`, `server/scripts/demo_*`, the posture doc | engine modules, other lanes' packages |
| **Ledger** — the lead (this session) | `swens-plan.md`, `notes.md`, `worklog.md`, this file; merges; cross-lane arbitration | — |

Each lane writes its own running log at `docs/pierce/logs/<name>.md`
— never the shared worklog, which the lead maintains at integration.

## Frozen interfaces (changes only by a lead-approved bump, here)

1. `read_workbook(path) -> Workbook`, `Workbook.cells`
   (`"Sheet!Ref" -> Cell`) and `Cell`'s fields — the reader surface
   every lane stands on. Sentinel may optimize its interior; the
   surface is frozen.
2. `polar.tieout.audit._shape(cell, anchoring=True) -> str` — the
   formula-shape signature Prism aligns on. Its behaviour moves only
   through Sentinel's registered, gate-certified rounds.
3. `audit(book, axes) -> Audit` and `Finding`'s fields. New
   per-finding data travels in the `evidence` dict — that is the
   extension channel; it flows to the product untouched, so Sentinel
   never needs `service.py` and Atelier never needs `audit.py`.
4. The findings JSON the product reads (`FindingRead`) — Atelier's;
   engine-side additions are requested through the lead.
5. New Python dependencies: proposed in the lane's log, approved by
   the lead before install — one `pyproject` owner (the lead) so
   lockfiles never collide.

## Branches and merges

- One branch per lane: `swens/sentinel`, `swens/dynamo`,
  `swens/prism`, `swens/scribe`, `swens/atelier` — all based on
  `claude/pierce-phase-6-writing-mjkaj6`'s tip.
- A lane pushes only to its own branch. **No lane merges itself.**
- Integration is by the lead, one lane at a time, with the full
  golden-master gate and the conftest-free tieout tests run at every
  merge. A lane rebases onto the integrated tip only when the lead
  says the tip moved.

## Discipline every lane carries

- Read `docs/pierce/notes.md` before answering anything of record.
- Registration before results: the harness and the rules are written
  and committed before a number is looked at. Refusals are honest.
- Heavy workbook jobs run alone in the container (a concurrent pair
  OOM-killed a sweep here; the lesson is paid for).
- Corpora are rebuilt with the committed fetchers
  (`scripts.corpus_au_uk`, `scripts.model_corpus`), never committed.
- Plain-language reports to the founder; no model identifiers in any
  pushed artifact.

## Charters and first tasks

**Sentinel** — the checks and the answer sheet. First: the A3
candidates through the loop, in order, starting with totals-row
sibling disagreement (`custodes-mining.md` verdicts) — planted
defects on our corpora first, catch rate and false-positive price
measured, gate at every step. Then A4 (the coverage denominator on
every report). Then A1's next round (the reader's range-expansion
storm — `a1-performance.md` names it). Owns gate questions from
other lanes.

**Dynamo** — the recalculator. First: audit the environment and
write exactly what B1 needs and lacks (LibreOffice ≥ 25.8,
python-uno) in its log for the founder. While blocked: the fidelity
gate's tolerance and denylist logic per `ambre-toolbox.md`, tested
against synthetic stored-vs-computed fixtures; the worker pool
behind an interface with a fake calculator so the real UNO wiring is
one class when the machine exists; B4's planted-defect registrations
(no results without the machine, and none claimed).

**Prism** — the Watch. First: C1, the raw version diff, hand-check
registered against an adjacent ED2 pair (`scripts.corpus_au_uk`
fetches all eleven versions; `corpus_pairs/` holds more). Then C2:
the dynamic-programming alignment on label + formula-shape
signatures per the amended plan — planted-edit harness registered
first, the O(n⁴) cost measured on the biggest file before anything
depends on it.

**Scribe** — the Chain. First: survey what `docling` and
`pdfplumber` need and whether this network serves them (report,
don't fight); D1 citation-grade extraction over the document corpus
— every number with page and highlight box, scans refused in words;
D2 the fact-store contract (fact id → page + box) as a JSON schema
proposed in its log before any database work.

**Atelier** — the product and the door. First: the security posture
doc (H2 — closed-by-default deals, the answers written before they
are asked); the sales demo kit (task #18); the endpoint-level test
for the marked-up model download (document honestly if the container
cannot run the database fixtures); then the version dropdown's
re-scoping, listed in `swens-product-build.md` as undone.

## The lead's integration loop (operational, per merge)

1. Fetch the lane branch; read its `docs/pierce/logs/<name>.md` tail
   and diff against the integration tip — every touched path must be
   inside the lane's ownership row above. A path outside it stops the
   merge and goes back with a sentence.
2. Run the conftest-free tieout tests on the merged candidate.
3. Run the full golden-master gate. Only a Sentinel merge may show a
   diff, and only with its registered round and regenerated baseline
   in the same commits.
4. Merge to the integration branch alone — never two lanes in one
   pass — then tell the founder in plain words what landed and what
   it proved.
5. Announce the new tip; lanes rebase only on that word.

Lanes are separate cloud containers — peer messaging does not reach
them from here, so coordination is through git (their branches and
logs) and through the founder. The lead pulls `swens/*` branches to
check on progress; silence in a log is a question, not a comfort.

**When the gate re-runs** (amendment, 25 Aug, refined at the second
sweep): the golden-master gate certifies what `audit()` reports, so
it re-runs when a merge touches any module the engine imports at
audit time — the tieout engine files in Sentinel's ownership row,
`ingest.py`, or anything they import. For any other merge (docs, new
packages like `recalc/`/`watch/`/`chain/`, scripts, tests, product
code), the certification is byte-identity: the lead diffs the engine
modules against the pre-merge tip and records that the diff is
empty — identical bytes cannot report differently. The conftest-free
tests still run on every merged tip either way.

## Lead decisions (the record lanes rebase onto)

- **25 Aug — Scribe's dependency proposal**: `pdfplumber>=0.11` is
  approved and installed in `server/pyproject.toml` (lock updated;
  the only transitive movement was Pillow 12.1→12.3, tieout tests
  identical before and after). `docling` is **deferred as proposed**:
  the D1 core must not require it; if and when the chain needs table
  structure, it comes in as an optional extra on the CPU-only torch
  index, by a fresh proposal here.
- **25 Aug — Atelier's § 3 finding** (team screen shows deal *names*
  org-wide) is a founder decision, raised in the sweep report — no
  lane acts on it until the founder answers.
- **25 Aug — Dynamo's machine question** (LibreOffice 25.8 install
  target) is with the founder; Dynamo continues its blocked-state
  charter work meanwhile.
- **26 Aug — the machine question is RESOLVED by the lead**, at the
  founder's « can't you do it? »: TDF's LibreOffice **25.8.7** deb
  bundle installs cleanly into `/opt/libreoffice25.8` in these
  containers, and the full B1 mechanism was proven here end to end —
  headless soffice on a UNO socket, `calculateAll()`, an *uncached*
  formula written by openpyxl read back correctly computed (50.0
  from `=SUM(A1:A2)*10` over 2 and 3). `dev/setup-libreoffice`
  (shared ground, lead's) makes the install one idempotent,
  self-verifying command per fresh container. **Dynamo is unblocked**:
  pull the integration tip, run the script, wire the real UNO
  adapter behind the `Calculator` interface, and B2's fidelity
  numbers become measurable. Caveats that stand: this box is the
  shared noisy 15GB class (timings are noise; match rates are not),
  and the production machine for customer-facing recalculation is a
  deployment decision that comes later, on the plan's schedule.
- **25 Aug, second sweep — ownership amendment**: Atelier's row
  gains `server/tests/tieout/test_routes*` — its charter already
  assigned the endpoint-level tests, the table just hadn't said so.
- **25 Aug, second sweep — Scribe's D2 contract**: the fact-store
  schema (log entry of that date) is **approved as proposed**,
  including the deliberate absence of a `label` field; D2 serving
  routes may proceed. The chain router is now mounted in
  `polar/api.py` by the lead, as the table always said it would be.
- **25 Aug, second sweep — Sentinel's merge is HELD**, at no fault:
  its A3 candidate 1 is implemented behind unit tests with the
  corpus verdict still owed. A findings change merges only with its
  verdict and regenerated baseline in the same push — exactly what
  Sentinel's own log says comes next. Its parked note for Atelier
  (`'inconsistent-total'` into the web category map's
  « Probable formula defects » family) is routed **when adoption
  lands**, not before.
- **25 Aug, third sweep — ownership note**: Atelier's remit covers
  `docs/pierce/swens-product-build.md` (the product build record it
  was already charged with keeping honest); its update there at this
  sweep is in-lane.
- **25 Aug, third sweep — a dev-environment defect Atelier reported,
  fixed by the lead in shared ground**: `dev/setup-environment`
  wrote the dev JWK with kid `polar_dev` while `config.py` defaults
  `CURRENT_JWK_KID` to `claidor_dev`, so a fresh environment's API
  refuses to boot until one moves. The generator now writes
  `claidor_dev`. (Atelier's second note — a fresh database needs
  `claidor_read` granted SELECT — is recorded as an open dev-setup
  gap, not yet addressed.)
- **25 Aug, second sweep — a shared-environment fix by the lead** (
  `pyproject`, its owner): locust's bundled pytest plugin defines a
  global `session` fixture; under `--noconftest` it can capture the
  DB-session fixture name and its lazy gevent import deadlocked a
  full suite run here for ten minutes. `addopts = "-p no:locust"`
  disables the plugin for this repo — no lane test should ever
  resolve `session` to an HTTP load-testing client silently.
