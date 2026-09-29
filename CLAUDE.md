# Simeon

Simeon is a team of always-on agents on the person's Mac, each agent with a
cloud computer of its own. The company is Simeon Labs (`simeonlabs.com`); the
product people see is **Simeon** (spelled Simeon, never Simon).

## Where things are

| Folder | What it is |
|---|---|
| `desktop/` | The Mac app. `docs/architecture.md`, `docs/building-the-app.md`. |
| `server/` | The API at `api.simeonlabs.com` (FastAPI, PostgreSQL, Redis, Dramatiq). The Python package is still called `polar`. Patterns: `server/CLAUDE.md`. |
| `runner/` | The cloud runner (Node): queued work while the Mac is closed. |
| `clients/` | The web app at `app.simeonlabs.com` (sign-in pages, account dashboard). Patterns: `clients/CLAUDE.md`. |
| `sites/simeonlabs.com/` | The public website and its live demo. |
| `docs/` | Start at `docs/README.md`. |
| `render.yaml` | The Render services (API, worker, runner, Postgres, Redis). |

What the server does for the app, feature by feature, with the settings each
needs and the log line to read when it misbehaves: `docs/services-core.md`
(sign-in, models and spend, memory, the cloud computer) and
`docs/services-agents.md` (cloud agents, routines, sharing, channels, video,
skills, connectors, avatars, approvals). Running the box servers:
`docs/ops/box-host/`.

## Rules

- **Measure, don't guess.** Before saying something is missing, broken or
  fine, search the code (`desktop/source`, `server/simeon`) or run it, and say
  what you searched. Read the log line before reasoning about a failure.
- **Nothing is done until it has run in the packaged app on a Mac.** Tests
  and a green build are not that. Say plainly what was and was not verified.
- **Earlier names.** The product was built from other projects. Their names
  stay in the code only where `scripts/kept_names.json` keeps them, with a
  reason (`docs/kept-names.md`: wire contracts with code we do not build,
  stored data, and fallbacks that keep old installs working). Run
  `python3 scripts/check_names.py` before pushing; it fails on any other
  earlier name.
- **Renaming something stored or deployed needs a fallback.** Settings are
  read as `SIMEON_<NAME>` with `CLAIDOR_<NAME>` still read; tokens, cookies,
  the data folder (`~/.simeon`, moved once from the earlier folder) and the Docker
  labels all read their earlier name. Keep that pattern for any new rename.
- **The app's window** is the pinned upstream renderer (`desktop/NOTICE.md`).
  Change it only through `desktop/scripts/lib/router-renderer-patch.mjs`, whose
  record carries every touched file's hash.
- **Server code:** never call `session.commit()` in request code (the session
  commits at the end of the request; see `server/CLAUDE.md`).
- **Git:** no model names in commits or pull requests. PR bodies follow
  `.github/pull_request_template.md`.

## Commands

```sh
# Mac app (macOS arm64)
cd desktop && npm ci && npm run bootstrap && npm run check && npm run package && npm run verify
cd desktop && npm test                    # desktop tests (also run on Linux)

# Server
cd server && docker compose up -d && uv sync && uv run task api
cd server && uv run task test && uv run task lint && uv run task lint_types

# Web app
cd clients && pnpm install && pnpm dev
cd clients && pnpm typecheck && pnpm test && pnpm lint

# Runner
cd runner && npm test

# Earlier names
python3 scripts/check_names.py
```

## Known state

- Every person's agents run on the cloud computer. Docker on the Mac is for
  internal testing only (`SAND_BOX_RUNTIME=local-docker`).
- The server tests have failures that also fail on `main` (billing and
  subscription tests of the inherited shop code); compare against `main`
  before calling a failure new. Three desktop tests also fail on `main`.
- The shop code (checkout, subscriptions, payouts) is inherited and kept;
  Simeon does not sell through it today.
