# Claidor

Legal research platform for OHADA law (see README.md). Monorepo with Python/FastAPI backend and Next.js frontend. NOTE: the backend Python package keeps the internal name `polar` (inherited from upstream).

## Swens — archived (September 2026)

This repository carried the Swens build (a model review platform for finance). It is archived, switched off and kept as a record: the engine under `server/polar/tieout` (routes no longer mounted; tests not collected), the screens under `clients/apps/web/src/components/Workspace` (no longer rendered), the scripts under `server/scripts`, and the documents of record under `docs/pierce` (`swens.md`, `swens-plan.md`, `notes.md`). The last working state is the git tag `swens-final`. Do not extend it; answer questions about it from those documents, never from memory.

## desktop/ — untouched LobsterAI (13 September 2026)

`desktop/` is the LobsterAI desktop app (NetEase Youdao, MIT), vendored
with `git subtree` (squashed; upstream commit named in the vendoring
commit) and, as of 13 September, **exactly as upstream ships it** —
commit `b1ef0e3e`, to the byte. Keep the MIT notices.

Everything built on top of it between 9 and 13 September was removed at
the founder's word, after four days in which every real fault was found
by them opening the app and none by any test. That work is not lost — it
is this branch's history, and `3e1224d5` is its last state — but it is
not here, and it is not the starting point.

So the app at this commit has what upstream ships: Chinese services and
Chinese text, provider and API-key screens, NetEase's growth surfaces (a
sidebar ad slot, credit campaigns, a first-run tour), thirteen settings
tabs, and no connection to Claidor at all. That is expected here, not a
defect.

**Nothing in `server/` or `runner/` was removed.** Claidor still serves
the desktop account protocol under `/desktop` (browser login, tokens, the
metered model proxy for Anthropic and OpenAI, connections, speech, the
job queue), the cloud runner is untouched, `render.yaml` and the deployed
services are unchanged, and the API answers right now. All of it is live
and, at this commit, nothing in the app calls it.

**GPT models work.** OpenAI refuses `reasoning_effort` together with
function tools on `/v1/chat/completions`; the proxy now sends
`reasoning_effort: "none"` whenever an OpenAI model is holding tools, and
that is deployed and confirmed working by the founder. The cost is that
those models run without reasoning whenever tools are in play, which for
an agent is always; the proper fix is OpenAI's `/v1/responses`, and that
is a translation layer nobody has built.

That bug was found by one log line and not by reasoning about it. The
proxy records every provider refusal as `desktop.proxy.upstream_refused`
with the provider's own sentence in it. Two hours of my guessing —
including two confident wrong answers — were ended by reading it. When
something fails through the proxy, read that first.

**The browser: unverified, not broken.** It was the browser failing and
not GPT; I had the two the wrong way round until the founder corrected
me, and I gave three explanations for it, all wrong. Of the two faults
that were ever established, both were ours and both went with the reset:
plugin loading is all-or-nothing, so one extension that cannot load kills
the browser and every other plugin (12 September, self-inflicted by
un-pruning three extensions), and a startup-order change of ours. One
observation survives because it is upstream's: `browser` is in neither
`COWORK_SYNC_FIELDS` nor `COWORK_RESTART_FIELDS` in
`openclawConfigImpact.ts`, so a change of browser mode does not ask the
gateway to restart and the config file can say in-app while the running
engine drives its own Chromium. That was never proven to be the fault the
founder saw. Nobody has run the browser in this tree. Do not call it
broken and do not call it fixed — run it, and if it fails get the gateway
log before touching code.

**Why there is no machine registry, and what actually differs.** Grok Bot
needs registered computers because it lives in the cloud and has to reach
in. Maties runs on the machine, so there is no "which computer", only
this computer. Two laptops is a v2 problem, and by then we will know
whether anyone asks. The real difference is in how a file gets worked on:
Grok Bot copies it to its own machine and copies it back — its words, "my
computer ≠ your disk … we copy when needed". Maties opens the file where
it lives. That shows up in spreadsheet formulas, links between workbooks,
folder structure, and privacy.

The macOS installer builds on GitHub Actions
(`.github/workflows/desktop_mac.yml`), unsigned until an Apple
certificate exists.

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

See subdirectory CLAUDE.md files for detailed patterns:
- `server/CLAUDE.md` - Backend patterns
- `server/polar/backoffice/CLAUDE.md` - HTMX + DaisyUI patterns
- `clients/CLAUDE.md` - Frontend design system

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
