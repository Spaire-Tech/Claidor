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

- **26 Aug, seventh sweep — Dynamo's two open rules questions are
  parked for the next registered B2 rules round**, per its log: (1)
  a volatile prescan (TODAY/NOW/RAND family) reporting the volatile
  cone separately rather than as fidelity loss; (2) whether the
  absolute near-zero floor (1e-12) should widen for stored residue
  ~1.8e-12 against computed 0. Round-2 numbers stand as recorded
  under round-2 rules; neither changes without its own registration.
  The founder will be shown the tolerance question in plain words
  when that round is registered. **B3 (the arbiter) rises in
  priority**: four corpus files are now measured engine-gap files
  (SINGLE, `#ERR:502`) that only real Excel can certify.

- **26 Aug — the founder decided the team-screen question: HIDE.**
  Deal names come off the team screen — colleagues are listed
  without naming the deals they are on, closing the posture doc's
  § 3 metadata exception so « being at the firm grants nothing »
  holds without an asterisk. Routed to **Atelier** (its paths, its
  posture doc to update in the same change). The founder relays the
  word; this entry is the record.

- **26 Aug, eighth sweep — Atelier's deal-names part 1 is HELD**, on
  the posture doc's own covenant: the pushed doc change asserts the
  hidden-names behaviour as enforced (« reduces each membership list
  to a count before anything is sent », « the endpoint test
  asserts... ») while its commit message says the code and tests
  *follow*. A posture claim merges only beside the code that makes
  it true — part 2 lands, both merge together. Two mechanical notes
  of record: the commit was pushed through the GitHub API (the
  resumed container lost authenticated git), so it carries the
  founder's GitHub identity as author instead of the lane's usual
  authorship, and it cites a lane-log entry that is not in the push
  — both to be regularized in part 2.

- **26 Aug — standing orders become the channel** (founder: « i'd
  rather you make all the calls »): the lead now maintains
  `docs/pierce/orders/<name>.md` on the integration branch — each
  lane's current orders, updated at every sweep. A lane's working
  turn starts by fetching the integration branch and reading its
  orders file; the founder's whole message to any lane is « go ».
  The in-session messaging tools remain approval-blocked (retried
  today, refused before a prompt could render), so the founder
  stays the wake signal and nothing else.

- **26 Aug, eleventh sweep — ownership amendment for Scribe**: D2's
  fact store needed a database table, so Scribe's row gains its own
  chain migrations (`server/migrations/versions/*chain*`) and the
  two-line model registration in `polar/models/__init__.py` — the
  models themselves live in `chain/store.py`, Scribe's package; the
  shared file only imports them (plus one alphabetization fix).
  Any further shared-file need still routes through the lead first.

- **26 Aug — the design rule changes (founder's own words)**: any
  agent that needs a screen no founder design covers **designs it
  themselves, at full effort, in the product's existing style** —
  the founder reviews and may redesign anything, but « i want them
  to do their best. » This is not a licence for placeholders: a
  lane ships the screen it would defend, matching the established
  design system (`clients/CLAUDE.md`, the patterns in
  `docs/pierce/design-swens/` and the built workspace), and marks
  it in its log as agent-designed so the founder knows what to
  review. The old absolutes stand untouched: never delete or
  replace anything the founder drew; where a founder design
  *exists*, it is the spec; when a founder design can't work as
  drawn, stop and ask.

- **27 Aug, eighteenth sweep — Track E's first half moves to Dynamo,
  by force of evidence.** B5 round 1b's finding is that perturbation
  coverage, not mining, is the binding constraint, and coverage is
  governed by input typing — which is E1/E2's unit inference wearing
  another hat (the review's own ruling: build it once, never twice).
  So **Dynamo owns E1 (the hand-labelled ground truth) and E2 (the
  inference), as a standalone module with its own tests**, and
  Track B's remaining rounds wait behind it. **E3 — the unit
  *mismatch checks*, which are findings — remains Sentinel's** when
  the inference is measured accurate enough to arm them, per the
  plan's own condition. The one hard rule is untouched: the
  classifier reports nothing; only Sentinel wires findings.

- **28 Aug — the decision-latency rule, written after the lead let a
  lane wait nine sweeps.** Scribe reported « items for the lead » in
  five consecutive turns; the lead merged its work each time and
  answered none of them, and the lane — correctly — stopped
  manufacturing rounds to fill turns rather than pretending to be
  busy. That is the lane behaving well and the lead behaving badly.
  From now on: **an open decision is answered in the sweep it is
  raised, or the lead writes in that lane's orders why it is not and
  when it will be.** « Merged, noted » is not an answer. A lane with
  no answerable work says so and goes short; the cost of that lands
  on the lead, and the record says whose it is.
