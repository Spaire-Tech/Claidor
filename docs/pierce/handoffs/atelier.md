# Atelier — cold-start handoff

Written for a successor who remembers nothing. The log
(`docs/pierce/logs/atelier.md`) is the diary; this is the map.

## Who you are

Atelier, the product-and-delivery lane (Tracks G + H). Branch
`swens/atelier`, always based on the integration tip
(`origin/claude/pierce-phase-6-writing-mjkaj6`). Charter and path
ownership: `docs/pierce/lanes.md` (you own `clients/**`,
`server/polar/tieout/{endpoints,schemas,service}.py`,
`server/tests/tieout/test_routes*`, `server/scripts/demo_*`, the
posture doc, `swens-product-build.md`). Engine modules are
read-only libraries. Every working turn: fetch the integration
branch, read `docs/pierce/orders/atelier.md`, do it, push, stop.
Read `notes.md` before answering anything of record.

## DONE and merged (as of the twelfth sweep + this push)

- H2 posture doc (`docs/pierce/security-posture.md`) — §3's team
  exception closed (deal names hidden, founder's decision).
- Sales demo kit (`scripts/demo_deal.py`) — delta section is the
  Watch's own report.
- Marked-up download endpoint tests; version dropdown re-scoping
  (`GET /artifacts/{id}/audit`, read-only version audit).
- Deal names off the team screen (counts only, `deal_count`).
- Category map: `inconsistent-total`, `typed-over-edge` →
  « Probable formula defects » (`files.ts`).
- House-rules defaults test asserts the catalogue, not a count.

## In flight — the design-unlock queue (orders, founder's word)

The founder unlocked agent design at full effort (lanes.md, 26 Aug).
Three screens, in order, one shipped whole before the next:

1. **Watch delta view — SHIPPED in this push** (agent-designed):
   `GET /artifacts/{id}/delta[?against=]` (service
   `version_delta`, temp-files → `watch.delta_report`, persisted
   nowhere, FileNotKept → 404 sentence, first version → null);
   Versions tab on the project page (founder's vtCols columns:
   Version · What changed · Saved · By · Findings), dropdown gains
   « See all versions »; 4 endpoint tests
   (`TestTheVersionDelta`); screenshots beside the log in
   `logs/atelier/`. Route suite 73 green at push time.
2. **Source viewer — SHIPPED in this push** (agent-designed):
   `GET /artifacts/{id}/page/{page}` (PNG via pdfplumber's own
   rendering at 144dpi, fresh, honest 404s); DocPanel gains
   « Every number, cited to its page » for source PDFs — the
   Chain's facts as rows, click one → the page with the box ringed
   (percent coords off page points), « Read the document » for an
   unread store, refusals in words. 4 route tests
   (`TestTheSourcePage`); suite 77 green; screenshots in
   `logs/atelier/source-viewer-*.png`.
3. **Recalculation mark — SHIPPED in this push** (agent-designed):
   `POST /artifacts/{id}/recalculate` (service `recalculate`:
   stored bytes → prescan → UnoCalculator in a worker thread →
   `gate_file`; mark persisted in `artifact.counts["recalc"]`,
   refused files never touch the engine, engine-less machine → 503
   sentence, nothing stored). Model page gains the
   « Validated by recalculation » card (never-run + four verdict
   faces, deliberate Run button); the report speaks the mark in
   prose and lists a missing mark under « What could not be
   checked ». Five route tests (`TestTheRecalculation`, the
   real-engine one skips honestly without LibreOffice); suite 82
   green; screenshots in `logs/atelier/recalc-*.png`.

**All three are merged** (fourteenth sweep) and have been **swept
against their real states** — empty, loading, error, long-content —
in the browser: six defects found and fixed in that pass (a
paragraph printed in a summary column; a read pitched after it had
failed; a silently capped failure list; a PDF wearing a Word icon;
a dead-looking in-flight control; an unframed long list). The
sweep's evidence is `logs/atelier/states-*.png`, one shot per
state class, and the method is in the log — seed the state for
real (dropping `storage_path` is the honest « documents dropped »
lever) rather than mocking a refusal.

## G4 and G2 (seventeenth sweep)

**G4 — the report face: built.** Coverage on its face (it was on no
screen at all before), severity at a glance, every claim cited to a
cell *or* a document and page, the recalculation verdict with its
cells named on the page. Read hostilely against the repo's judged
real model (`example_preapp_model.xlsx`, in-sample — say so) and
seven of my own defects fixed, including a **false** « formulas
read » count. Shots: `logs/atelier/report-face-sheet{1,2,3}.png`.

**G4's deliverable, too.** A partner receives the PDF, not the
screen: the print path now carries the product's own @font-face
rules (it loaded none, so the file embedded Liberation/DejaVu),
`print-color-adjust: exact` (severity dots printed as nothing), and
four sheets so the footers stop lying. Verify a report change by
**printing it and reading the PDF back** (pdfplumber: embedded
fonts, page count, per-page text) — no screen test catches this.

**Read the report on a deal that has a deck**, not just a
model-only one: coverage with real numbers and the « document ·
p. N » citation only render there. Doing so found that the report
never declared a **stale** check (the deal page had a banner, the
PDF nothing), that the verdict enumerated fifteen findings instead
of grouping them, and that « Page N of 4 » lies whenever a section
runs past one page — footers now say « Section N of 4 ».

**The corpus is fetchable here**: `uv run python -m
scripts.corpus_sft_models` pulls eleven real SFT models (8 readable
`.xlsm`, 3 format-blocked) into `scripts/corpus_sft/`. Running one
through the demo kit found the report's worst case — a values-pasted
publication (224 formulas in 432,596 cells) reported « Nothing
failing », with the reason a page away. The verdict now qualifies
itself. **Intake refusals are derived from `SUFFIXES`** and name the
fix for `.xlsb`/`.csv`/`.numbers`; never re-pin that prose in a test.

**The values-only truth is said twice now** — on the report's
verdict and on the document panel where a person meets the file
(« Cells read / Formulas 224 of 432,596 / Named cells », plus the
notice). The panel's « Named cells » row had been showing the *cell*
count: invisible on the fixture, where named == cells, obvious on a
real model. Prefer a corpus model over a fixture when checking any
count a screen prints.

**A values-only copy is declared whether or not the checks found
something** — the « found nothing » half shipped first and the
« found something » half is the one that matters more, because a
reader handed findings trusts the check. Corpus models with
analytical findings (Kelso) are the only way to see the
statement-finding fields render at all; fixtures never produce them.

**Three surfaces say the values-only truth**: the deal Overview
(where a person lands — it used to say « Every check that applies to
this model ran to the end » under a green « Nothing failing »), the
document panel, and the report. Keep them in step; the Overview chip
itself still reads « Nothing failing » in green, a deliberate choice
left to the founder.

**The deals list dates a row by the last *completed* check of
either kind** — it used to use the tie-out alone, so a model-only
deal (most of the corpus) read « Not checked yet » beside its own
findings and could never go stale. A failed run carries a finish time
but is not a check. The row also says « Nothing failing · values
only » where that applies — the fourth surface in the honesty thread.

**G2 — the five questions, after the two tools.** Chat still cannot
run here — no `ANTHROPIC_API_KEY`, so `ask` answers 503 — so what is
measured is the tool surface, judged by hand against real models:
does the tool the assistant would reach for hand back the right
material with the right numbers. **3 (« where is this from ») and 5
(« what changed ») now answer**; 4 stands; **1 is parts only** (no
deal here has both a DSCR line and a second version); **2 is wrong on
a values-pasted copy** — see below. Full table in the log.

**The two tools (twenty-fifth sweep, lead routed `agent/model_tools.py`
to this lane for these only).** `sources` reports the document, page
and the sentence **as printed** for a grounded typed input, walks a
calculated cell to the typed inputs behind it, and never flattens
« nothing matched » into « nobody looked ». `versions` now speaks the
Watch's review language, keeping the stored-cell diff only for the one
thing the Watch cannot see — how many of this deal's deliverable
figures a change made stale.

**The Watch is read lazily, and that is load-bearing.**
`service.version_delta` was split into `delta_sides` (async, cheap,
resolves the two artifacts) and `delta_between` (sync, expensive,
reads both files). The agent loader hands the tool a `partial` of the
second; nothing reads a file until `versions` is asked. A workspace
loads before every question, so anything eager there is paid by all
five. There is a test whose only job is that guard — keep it.

**The values-only thread has a fifth surface: chat.** On a stripped
copy `trace_back` answers « typed value, 0 direct inputs » for *every*
line, including a blended equity IRR, and a reader takes it for a
finding about the model. `sources` now says « this copy carries values
only — 814 of 470,594 cells hold a formula — that is a fact about this
copy » (ingest's counts, the same 1% floor as the report and the
panel). **`trace_back` still does not**; it was outside the two tools
routed here, and it is with the lead.

**Which model a deal-scoped answer is about is now decided in one
place** — `service.subject_model`, the most recently uploaded. Three
callers used to write `next(one for one in current if one.kind is
model)` (deals list, marked-up download, the assistant's workspace) and
take whatever `current_artifacts` returned first, which follows
`list_artifacts`' ordering and promises nothing. Never add a fourth:
go through the helper, or the screens will disagree about which file a
deal means. The audit is the deliberate exception — it reads **every**
model.

**And the choice is stated, because chat answers in prose.** The
assistant's tools hold one model, so the prompt carries a scope line
naming what it reads and what it cannot see (without it, a question
about a line in the deal's *other* workbook gets « that is not in this
model »), and the reply carries `model` / `model_version` /
`other_models` off the artifacts so the screen can say it whatever the
prose says. The notice draws only where the deal holds more than one.
« Sweep — an unread source » in the demo database is the standing
two-model deal.

**The ruff failure this lane reported was its own mistake** — run at
the old tip, before rebasing. It passes at the tip. Run a cross-lane
claim *after* the rebase.

**What a revision did to the deliverables is served and drawn**
(`GET /artifacts/{id}/deck-delta`, `service.deck_delta`, the panel
under « What vN changed » on the Versions tab). The Watch's C5: the
same deck tied out against **both** versions. Four lists, four
sentences, **never summed** — `broken` is the revision's doing,
`still_drifting` is explicitly not, `coverage_changed` is « I lost
sight of it ». On a real pair that is 5 broken beside 101 no-longer-
checkable; summed it reads as a catastrophe. Where the Watch could
not attribute a break the row says so rather than naming the nearest
change. `version_delta` and `deck_delta` share one gate
(`_delta_pair`) so they can never disagree about which pairs may be
compared. Demo states: a deck on « Sweep — an unchanged re-upload »
(the exoneration face) and a v4 there that really moves figures.

**Rebuild the screenless-capabilities inventory by reading each
engine package's `__all__` against the product files** — the old
inventory's three entries have all shipped, and `deck_delta` was
sitting there unlisted the whole time. Still unsurfaced after this
turn: the Watch's `classify` / `build_ladder` / `align_lines` /
`Tier2Answer`, and `recalc.iterative_cells`.

**Only this lane measures the reader's load** — every other lane
tests its module against planted fixtures. `logs/atelier/reader_load.py`
runs the whole engine over the whole corpus and counts what a partner
receives. Eight of nine real models give **2–11 findings**: a page,
not a wall. The ninth (newbattle) gives **68, 62 material**, because
**53 of its 54 sheets are very hidden** and `hidden-sheet` emits one
error-severity finding per sheet — while `broken-name`, in the same
file, folds 338 names into one. One act by one person, reported
fifty-three times. Routed to Sentinel; **not masked in the report**,
because folding it on this side would print a tidy page over a
severity band still reading « Material 62 ».

**The report's material section numbers *places*, not findings.**
Kelso printed one check row failing in three columns as 01, 02, 03
with the same sentence three times and the cell printed twice each.
Findings are grouped by rule + sheet + row; the tally above is
untouched. A shared sentence is said once **only when every title in
the place is identical with its own reference removed** — checked, not
assumed — and the citation pill is suppressed when the sentence
already prints the reference. Cells are ordered down the columns, left
to right. Verify a change here **by printing the PDF and reading it
back**; the screen will not catch it.

**Before claiming a measurement is impossible, check every corpus in
the repo.** This lane said no two consecutive saves of one model
existed; the AU-UK corpus is built of them (eleven Ofgem ED2
revisions), and the lead used them to refute the CRC design 372/372.

**The category map has a fifth family: « Units that do not agree »**
(`currency-mismatch`, `scale-mismatch`). A currency or scale mismatch
is a **meaning** error — the formula is mechanically perfect and the
answer is nonsense — so it belongs beside neither the mechanical
defects nor the statement-level exceptions. The pattern that sets: a
later check about a *basis* rather than a unit earns its own family
rather than stretching this one. Neither rule is in `RULE_NAMES` or
`HEADLINES`, so **the family name is the only name a reader sees** for
the defect — the sixth rule outside the catalogue, and the first two
at error severity.

**Mapping ahead of a merge goes in `AHEAD_OF_THE_ENGINE`**, and a
paired test fails the moment the engine emits the rule, forcing the
entry out. Never widen the guard instead; an exemption that outlives
its reason is how a guard stops guarding.

**The abundant direction already works** — a memo quoting model
outputs produces « $235.3mm where the model says $228.9mm · paragraph
6 · Material » under « Documents against the model », because
`run_tieout` has read memos and messages beside decks all along. The
gap is the *format*: `.pdf` maps to `ArtifactKind.source` and
`_read_memo` takes `.docx` only, so a PDF cannot be checked against
the model however it is uploaded — and IC memos, board papers and
covenant certificates circulate as PDFs. Full survey in the log,
including the composition (`read_memo` + `tie_out_both` +
`compare_tieouts`) that would give memos a revision view without
touching the engine.

**Every upload carries a SHA-256 in `counts["sha256"]`, and two equal
digests are the whole answer to « what changed ».** The Versions tab
reads them off `VersionRead.counts` and never asks for a comparison it
can prove is empty — instant, where the Watch spends 158 s on a
432,596-cell model to reach the same conclusion. **Two absences are
not a match**: every version stored before 28 Aug has no digest, and
reading « both have none » as « both are the same » would call two
different files one. A test holds that.

Where the 158 s goes, measured (`logs/atelier/delta_split.py`): two
reads 58 s, two audits 5 s, the rest alignment — and the alignment is
**87% in two sheets of twenty-four**. That concentration is what makes
sheet-level pruning the highest-value unbuilt design; the file's own
zip entry CRCs identify byte-identical sheets exactly
(`logs/atelier/zip_sheet_crcs.py`), but the Watch takes no sheet
filter and **no two-Excel-save pair exists in this corpus** to say
whether the signal fires in practice.

**Sweep the screens against the corpus, not the fixtures.** Since the
intake fix real models produce real findings, so the states sweep can
finally run on them. Doing it found three things on the partner's page:
a `broken-name` finding drew an **empty pill** (no sheet, no ref, by
its nature — the endpoint now falls back to the engine's own word for
what it is about, « defined names »); the report printed `432596`
beside a sentence saying `432,596`; and the print path had never once
carried material findings — it does now, 4 pages with the product's
fonts embedded and both citations intact.

Kelso's `model-own-check` count moved 7→3 between audits. That was
Sentinel's own-check period restriction (old run 18:37, restriction
18:39), **not** the intake fix — check before assuming when the
product starts reporting fewer errors.

**The Versions delta costs 158 s on a real model** (432,596 cells;
3.1 s at 4,798; 0.1 s on the 313-cell fixture) and is computed in the
request every time the tab opens. The screen is honest about it now,
in the model's own numbers, but it is not fixed. **Do not "fix" it by
computing the delta from stored cells** — measured on every adjacent
pair in the demo database, five of six reports match and the sixth
loses an `unmatched_new`, which is exactly the case the Watch keeps
apart because it cannot be matched by name (a cell ingest never
stored). It is also only 19% faster: the alignment dominates, not the
file read. `logs/atelier/delta_stored.py` re-runs that check.

The real answers are the Watch's own comparison (Prism's) or moving
the computation out of the request — there is no `tasks.py` in
`polar/tieout/` and no background path for any check, so that is an
architectural call. **Persisting the delta is the other half**: it is a
pure function of two immutable artifacts, so keeping it makes every
later view instant *and* is the only way `watch/profile.py` becomes
reachable (its priors are N−1 transitions at 158 s each). That module
— the per-model, size-matched denominator for the panel's counts — is
built, honest, and has no product surface.

**Read cells with `cells_for_graph`, not `cells_of`, wherever a
caller only rebuilds the workbook.** Same 470,594 rows: **16.0 s as
entities, 4.0 s as columns** (medians of three, alternating). All of
the difference is the ORM instrumenting objects that `_workbook_of`
reads once and discards. `run_audit`, `audit_of_version` and the
assistant's loader take the light read; the assistant's whole
workspace load went **28.4 s → 9.0 s** on Kelso. `cells_of` stays for
grounding and the tie-out, which point at a *row* — the light read
carries no `id`, deliberately, and a test holds that. Measure before
naming a fix: this lane registered « cache the graph » last turn and
the answer was one query.

`repository.py` is in no lane's row; the change is additive
(`cells_of` untouched). Reassign if that reading is wrong.

**Format refusals need nothing until A6 lands.**
`_unreadable_format` derives its sentence from `ingest.SUFFIXES`, so
it narrows on its own when Sentinel widens the reader. Never re-pin
that prose in a test.

**Three findings routed to the lead**: the gate's 1e-12 absolute
floor fails a 4,798-cell model on two cells of 3e-07 balance dust;
`gapped-test`, `typed-over-beat` and `broken-name` fire while being
in neither rule catalogue, so no firm can see or switch them off;
and the big one below.

**The product audits the same workbook the engine does — keep it that
way.** It never audits a *file*: `_workbook_of` rebuilds one from
stored rows, so every fact the reader fills at open time has to be
carried on the artifact and put back. `ingest.py` keeps them under
`counts["workbook"]`; `service._restore_file_facts` restores them.
**Any new `Workbook` field the audit reads needs a line in both** —
`hidden_sheets` was fixed alone once and the six siblings it left
behind cost 41 of 116 findings across the corpus and took four models
to « nothing failing ». Restoring them closes that gap *exactly*
(nothing missing, nothing invented, all nine models —
`logs/atelier/restore_gap.py` measures it).

`row_words` is kept although it buys nothing on this corpus: it is the
audit's **suppression** input, so a model where it matters gets false
positives without it. 254 KB against the 99 MB Kelso's cells already
occupy. Two traps: `errors` in `counts` is the audit's error *count*,
so the workbook's error cells are `error_cells`; and JSON has no
integer keys, so `row_words`' rows go out as strings and come back as
ints. **No migration** — a model ingested before the key reads as it
did, and re-uploading is what teaches it.

**Check the category map against what the engine *emits*, never
against the catalogues.** A rule missing from `RULE_NAMES` /
`ANALYTIC_RULE_NAMES` is the rule most likely to be missing from the
map, and reading the catalogues finds nothing wrong with it. That
mistake was made twice here. `TestTheCategoryMap` (route suite) now
reads the engine's `rule="…"` literals and the frontend's
`CATEGORY_OF` and fails with the offending rule named.

**Holding for the founder's review of the three screens.** The
build record (`swens-product-build.md`, yours) carries them as
Phase 7, with the four gaps they left open (no arbiter run;
recalculation manual and per-version; no home for the differing
cells beyond the twelve named; the delta is model-only).

Mark every agent-designed screen in the log; the founder reviews.

## The container's lessons (this box, not the repo)

- Local test/dev needs `CLAIDOR_CURRENT_JWK_KID=polar_dev` (this
  container's `.jwks.json` predates the generator fix). Fresh
  containers with a regenerated env don't.
- Services die between turns on this box (shared 15GB class):
  before tests, restart `pg_ctlcluster 16 main start`,
  `redis-server --daemonize yes`, and minio
  (`MINIO_ROOT_USER=claidor MINIO_ROOT_PASSWORD=claidorclaidor
  minio server /var/minio-data --address :9000`), then wait for
  `http://127.0.0.1:9000/minio/health/live` = 200. Minio takes a
  few seconds to answer.
- LibreOffice 25.8.7 is installed in this container
  (`dev/setup-libreoffice`, lead's, idempotent — retry on a
  transient download reset). The demo DB now also holds the
  repaired cascade v3 (validated), the doctored v2's honest fail
  mark, and « Project Live Feed Demo » (an RTD model, the standing
  refusal-face subject), plus four « Sweep — … » deals carrying the
  awkward states (an unchanged re-upload, documents dropped, an
  unread source, a model the engine could not reproduce).
- Dev-stack proof rig: API
  `CLAIDOR_CURRENT_JWK_KID=polar_dev uv run uvicorn polar.app:app
  --port 8000`, web `pnpm dev`, Chromium at `/opt/pw-browsers/
  chromium` via `/opt/node22/lib/node_modules/playwright/index.mjs`;
  a browser session cookie (`claidor_session`) can be minted with a
  scratch script inserting a `UserSession` row (hash via
  `generate_token_hash_pair`); demo deals seeded with
  `scripts.demo_deal`. The dev DB `claidor` holds
  « Project Cascade Watch Demo » (cascade v1 + a v2 with a
  typed-over F16 + the broken deck) — the standing demo subject.
- To verify against a **production build**: `pnpm build`, then
  `pnpm start` on **port 3000** (stop the dev server first). The
  dev API's `CLAIDOR_CORS_ORIGINS` allows that origin only, so a
  build served on any other port fails every API call with
  `net::ERR_FAILED` — CORS, not the app.
- If git dies at « could not read Username » after a container
  resume, the git-proxy sidecar was skipped; the GitHub MCP tools
  still work (push_files + blob-SHA verification against
  `git rev-parse` was the proven fallback — see the log, 26 Aug).
- One pre-existing repo gap the lead knows about: a fresh dev
  database needs `claidor_read` granted SELECT.
