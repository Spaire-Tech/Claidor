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

**G2 — the five questions: measurable only in part.** Chat cannot
run here — no `ANTHROPIC_API_KEY`, so `ask` answers 503. What was
measured is the tool surface: 1, 2 and 4 have their material
reachable; **3 (« where is this from ») is unreachable** — no tool
touches the Chain; **5 answers in raw cell moves**, not the Watch's
review language. Two tools in `agent/model_tools.py` (not our lane)
would close both. Full table in the log.

**Two findings routed to the lead**: the gate's 1e-12 absolute floor
fails a 4,798-cell model on two cells of 3e-07 balance dust; and
`gapped-test` fires **material** findings while being in neither
rule catalogue, so no firm can see or switch it off.

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
