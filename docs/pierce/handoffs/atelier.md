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
2. **Source viewer — NEXT**: click a typed number, see the page
   with the highlight box. `POST /v1/chain/extract` and the fact
   store are live (Scribe's D2, mounted at `/v1/chain`). Nothing
   started.
3. **Recalculation mark**: « validated by recalculation » on report
   and model page, with its honest refusal face.
   `polar.tieout.recalc.gate.gate_file` renders the verdict; no
   endpoint yet. Nothing started.

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
- If git dies at « could not read Username » after a container
  resume, the git-proxy sidecar was skipped; the GitHub MCP tools
  still work (push_files + blob-SHA verification against
  `git rev-parse` was the proven fallback — see the log, 26 Aug).
- One pre-existing repo gap the lead knows about: a fresh dev
  database needs `claidor_read` granted SELECT.
