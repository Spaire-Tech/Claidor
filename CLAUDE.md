# Claidor

Legal research platform for OHADA law (see README.md). Monorepo with Python/FastAPI backend and Next.js frontend. NOTE: the backend Python package keeps the internal name `polar` (inherited from upstream).

## Swens — archived (September 2026)

This repository carried the Swens build (a model review platform for finance). It is archived, switched off and kept as a record: the engine under `server/polar/tieout` (routes no longer mounted; tests not collected), the screens under `clients/apps/web/src/components/Workspace` (no longer rendered), the scripts under `server/scripts`, and the documents of record under `docs/pierce` (`swens.md`, `swens-plan.md`, `notes.md`). The last working state is the git tag `swens-final`. Do not extend it; answer questions about it from those documents, never from memory.

## desktop/ — LobsterAI, vendored

`desktop/` is the LobsterAI desktop app (NetEase Youdao, MIT), a window on top of the OpenClaw agent engine, vendored with `git subtree` (squashed; the upstream commit is named in the vendoring commit). It builds on its own with its own `package.json`; it is not part of the `clients/` pnpm workspace. Keep the MIT notices. See `desktop/CLAIDOR-NOTES.md`.

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
