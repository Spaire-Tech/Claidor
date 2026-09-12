# Claidor

Legal research platform for OHADA law (see README.md). Monorepo with Python/FastAPI backend and Next.js frontend. NOTE: the backend Python package keeps the internal name `polar` (inherited from upstream).

## Swens — archived (September 2026)

This repository carried the Swens build (a model review platform for finance). It is archived, switched off and kept as a record: the engine under `server/polar/tieout` (routes no longer mounted; tests not collected), the screens under `clients/apps/web/src/components/Workspace` (no longer rendered), the scripts under `server/scripts`, and the documents of record under `docs/pierce` (`swens.md`, `swens-plan.md`, `notes.md`). The last working state is the git tag `swens-final`. Do not extend it; answer questions about it from those documents, never from memory.

## desktop/ — LobsterAI, restarted from upstream (12 September 2026)

`desktop/` is the LobsterAI desktop app (NetEase Youdao, MIT), vendored
with `git subtree` (squashed; upstream commit named in the vendoring
commit) and, as of 12 September, **exactly as upstream ships it**. Keep the
MIT notices.

The first pass turned it into Maties — English only, Claidor sign-in, no
API-key screens, a new design, onboarding, connections, a voice. That pass
was reverted whole, by the founder's decision, after a week in which every
fault was found by them using the app and none by any test. It is not
lost: it is the history of this branch and of `main`, and its last state
is the commit before the revert. Read
`docs/maties/before-you-build.md` before starting again — it is what that
pass learned.

**Nothing in `server/` or `runner/` was reverted.** Claidor still serves
the desktop account protocol under `/desktop` (browser login, tokens, the
metered model proxy, connections, the speech routes, the job queue), the
cloud runner is untouched, and `render.yaml` and the deployed services are
unchanged. All of it is live and, for now, nothing in the app calls it:
the app at this commit is upstream LobsterAI and signs in to nobody.

So the app currently has what upstream ships and we had removed: Chinese
services and Chinese text, provider and API-key screens, NetEase's own
growth surfaces (a sidebar ad slot, credit campaigns, a first-run tour),
and thirteen settings tabs. That is expected at this commit, not a defect.

The plan of record is still `docs/maties/plan.md`, and the design rules
are still `docs/maties/design.md`; both describe where we are going, not
where the code is. Change them before changing direction. The macOS
installer builds on GitHub Actions (`.github/workflows/desktop_mac.yml`),
unsigned until an Apple certificate exists.

**The one rule the second pass exists to obey: run it, or say you did
not.** Tests, types and lint passed on every change of the first pass.
They never answered « does the product work ».

## Quick Start

```bash
# Backend (http://127.0.0.1:8000)
cd server
docker compose up -d          # Start PostgreSQL, Redis, Minio
uv sync && uv run task api    # Install deps & start API

# Frontend (http://127.0.0.1:3000)
cd clients
pnpm install && pnpm dev      # Install deps & start dev server

# Tests
uv run task test              # Backend tests
pnpm test                     # Frontend tests
```

## Documentation

- **Handbook**: https://handbook.polar.sh/engineering/
- **Design docs**: https://handbook.polar.sh/engineering/design-documents/
- **API guidelines**: https://handbook.polar.sh/engineering/rest-api-guidelines

## Custom Commands

- `/polar-code-review` - Comprehensive code review with 3 parallel agents (security, conventions, simplification)

## Architecture

```
polar/
├── server/polar/           # Backend modules (see server/CLAUDE.md)
│   ├── {module}/
│   │   ├── endpoints.py    # FastAPI routes
│   │   ├── service.py      # Business logic
│   │   ├── repository.py   # Database queries
│   │   ├── schemas.py      # Pydantic models
│   │   └── tasks.py        # Background jobs
│   └── backoffice/         # Admin UI (see server/polar/backoffice/CLAUDE.md)
├── clients/                # Frontend (see clients/CLAUDE.md)
│   ├── apps/web/           # Next.js dashboard
│   └── packages/ui/        # Shared components
└── .claude/                # Claude Code configuration
    ├── settings.json       # Hooks configuration
    ├── hooks/              # Pattern enforcement
    └── commands/           # Custom commands
```

## Core Rules

### Assume it is already built

This is a large, complete codebase. Before writing anything, ask whether
it exists already — and assume it does until the repository says
otherwise. Read `docs/maties/before-you-build.md` first: it is the
register of what we already have and of the traps that have cost real
time, and it is kept current by every session that finds one.

Two habits it exists to enforce:

- **Search before building.** The engine we bundle ships far more than we
  surface, and much of our own server and app is already written.
- **Before adding a name to any list, read what the list is protecting.**
  A change that looks additive is how the browser stopped working
  entirely on 12 September: plugin loading here is all-or-nothing, and
  one extension that could not load killed every other plugin.

When a session discovers something already built, or a trap, add it to
that note. A fact found twice is a note nobody wrote the first time.

See subdirectory CLAUDE.md files for detailed patterns:
- `server/CLAUDE.md` - Backend patterns
- `server/polar/backoffice/CLAUDE.md` - HTMX + DaisyUI patterns
- `clients/CLAUDE.md` - Frontend design system
- `docs/maties/before-you-build.md` - What already exists, and what breaks quietly

## Environment Setup

```bash
./dev/setup-environment     # Generate .env files

# For GitHub integration
./dev/setup-environment --setup-github-app --backend-external-url https://yourdomain.ngrok.dev
```

For Stripe, add to `server/.env`:
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Key Integrations

- **Stripe**: Payment processing
- **GitHub**: Authentication and repository features
- **S3/Minio**: File storage
- **Redis**: Cache and job queue
- **PostgreSQL**: Primary database
