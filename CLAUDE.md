# Simeon

Simeon is a team of always-on agents on the person's Mac, each agent with a
cloud computer of its own. The company is Simeon Labs (`simeonlabs.com`); the
product people see is **Simeon** (spelled Simeon, never Simon).

The legal company is **Spaire, Inc.** until the founder renames it (11 October
2026). Every place that names the legal company says Spaire, Inc.: the
copyright and About lines in each app, `NOTICE`, the Privacy Policy and Terms,
the website's footer and the invoices (`INVOICES_NAME`). The brand
(SimeonLabs, `simeonlabs.com`) stays. At the rename, search for "Spaire, Inc"
(`scripts/kept_names.json` lists every file).

## Where things are

| Folder | What it is |
|---|---|
| `desktop/` | **Retired** Electron Mac app (11 October 2026). Kept only to build the agents' engine (`source/host`, `source/box-exec-daemon`, published through `npm run package` and `npm run publish:host-bundle` on a Mac) and the web app (`web/`). `desktop/README.md`. |
| `server/` | The API at `api.simeonlabs.com` (FastAPI, PostgreSQL, Redis, Dramatiq). The Python package is `simeon`. Patterns: `server/CLAUDE.md`. |
| `runner/` | The cloud runner (Node): queued work while the Mac is closed. |
| `brain/` | The brain: the agents' engine off the cloud computer, as a Render private service (`docs/agents-on-the-server/README.md`). Its image and start script; making it on Render is in `brain/README.md`. |
| `box/` | The cloud computer image (Dockerfile, supervisor, desktop scripts). `box/README.md`. |
| `clients/` | The web app at `app.simeonlabs.com` (sign-in pages, account dashboard). Patterns: `clients/CLAUDE.md`. |
| `ios/` | **The iPhone app** (SwiftUI), the phone design in Apple's own parts. `ios/README.md`. |
| `mac/` | **The Mac app** (SwiftUI): a copy of the Electron Mac app with Apple's controls, which replaced it on 11 October 2026 (bundle id `com.simeonlabs.simeon`, scheme `simeon`). It shares `ios/SimeonCore` (no screens). `mac/README.md`, `mac/STEPS.md`. |
| `windows/` | **The Windows app** (Electron): the web app's committed build (`clients/apps/web/public/app-next`) in a window of its own, with Windows' own parts (step 7 of `docs/web-app/README.md`). Its main process is Simeon Labs' own, nothing from `desktop/`. `windows/README.md`. |
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
- **Nothing is done until it has run in the app on a Mac or an iPhone.**
  Tests and a green build are not that. Say plainly what was and was not
  verified.
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
- **The web app's window** (and the retired Electron app's) is the pinned
  upstream renderer (`desktop/NOTICE.md`). Change it only through
  `desktop/scripts/lib/router-renderer-patch.mjs`, whose record carries every
  touched file's hash.
- **A new connector is named in the chat in its colour, with its logo.** With
  its catalogue entry (`desktop/source/shared/node/vendor-mcp/catalog.ts`),
  add a line to `ios/scripts/connector-mentions.json` (name, key, logo,
  colour) and run `node ios/scripts/make-assets.mjs`; keep only its new
  `Brands/<key>` logos and the `GeneratedBrands.swift` rows from the run.
  `desktop/tests/connector-chat-colours.test.mjs` fails otherwise.
- **Languages.** English is the source language in the code; French (and each
  later language) is a translation, in one place per platform, in the
  familiar "you" ("tu", "du"…; `docs/localization.md`). The person's language travels to the server
  (`Accept-Language`, `users.language`) and the agents (`userLanguage`). Run
  `python3 scripts/check_translations.py` with `check_names.py`.
- **The web and Windows app** (from 1 November 2026) is the Mac app
  translated into our own web code, wrapped in Electron for Windows. The
  plan and the checklist are `docs/web-app/README.md`, read from the code
  by `python3 scripts/web_app_inventory.py` (run it again when the Mac app
  or the shared core changes). It reads the Mac's two String Catalogs, so
  when one changes, run `pnpm words && pnpm build` in `clients/apps/app`
  and commit the result (`check_translations.py` fails until then). Every
  change to it updates
  `docs/web-app/PROGRESS.md` in the same pull request: what was done, what
  was and was not checked, decisions and who made them, what comes next.
  Read both before any work on it; nothing about it is kept in memory.
- **Server code:** never call `session.commit()` in request code (the session
  commits at the end of the request; see `server/CLAUDE.md`).
- **Git:** no model names in commits or pull requests. PR bodies follow
  `.github/pull_request_template.md`.

## Commands

```sh
# The agents' engine, built through the retired Electron app (macOS arm64)
cd desktop && npm ci && npm run bootstrap && npm run check && npm run package && npm run publish:host-bundle
cd desktop && npm test                    # engine and web app tests (also run on Linux)

# Server
cd server && docker compose up -d && uv sync && uv run task api
cd server && uv run task test && uv run task lint && uv run task lint_types

# Web app
cd clients && pnpm install && pnpm dev
cd clients && pnpm typecheck && pnpm test && pnpm lint

# Runner
cd runner && npm test

# The brain (brain/README.md)
cd brain && npm test
docker build -f brain/Dockerfile -t simeon-brain .   # from the repository root

# iPhone app (ios/README.md; the core's tests run on Linux too)
cd ios/SimeonCore && swift test
cd ios && xcodegen generate && open Simeon.xcodeproj

# Mac app (mac/README.md, mac/STEPS.md); a release, signed and notarized (--publish: on the website)
mac/scripts/build.sh
mac/scripts/release.sh
cd mac && xcodegen generate && open SimeonMac.xcodeproj

# Windows app (windows/README.md; runs on Linux too, the smoke check under xvfb-run)
cd windows && npm ci && npm run electron:install && npm test && npm run typecheck
cd windows && npm run smoke               # the app run for real against a stand-in server
cd windows && npm run package             # the installer (on Linux: needs Wine)

# Earlier names, and every string translated (docs/localization.md)
python3 scripts/check_names.py
python3 scripts/check_translations.py
```

## Known state

- Every person's agents run on the cloud computer. Docker on the Mac is for
  internal testing only (`SAND_BOX_RUNTIME=local-docker`).
- The server tests have failures that also fail on `main` (billing and
  subscription tests of the inherited shop code); compare against `main`
  before calling a failure new. The desktop suite passes on `main` and gates
  `npm run package`; a red suite means no engine is built.
- The shop code (checkout, subscriptions, payouts) is inherited and kept;
  Simeon does not sell through it today.
