# GitHub Copilot — Workspace Instructions for Spaire

This is **Spaire**, a payment infrastructure platform. Monorepo with a Python/FastAPI backend and Next.js frontend.

---

## Architecture

```
server/polar/           Backend modules (FastAPI + SQLAlchemy + PostgreSQL)
  {module}/
    endpoints.py        Routes
    service.py          Business logic (singletons)
    repository.py       DB queries
    schemas.py          Pydantic models
    tasks.py            Background jobs (Dramatiq)
clients/
  apps/web/             Next.js dashboard
  packages/ui/          Shared React components (Radix UI + Tailwind)
```

---

## Backend Rules

- DB queries go **only** in `repository.py` — never in service files
- **Never call `session.commit()`** — framework handles it. Use `session.flush()` for constraints.
- Services are module-level singletons: `resource = ResourceService()`
- `AsyncReadSession` for reads, `AsyncSession` for writes
- Separate Pydantic schemas for read, create, update (update fields all optional + `None` default)
- API fields: snake_case
- Always verify auth ownership via `AuthSubject`

### HTTP Codes
- POST → 201, PATCH → 200, DELETE → 204
- List endpoints → `ListResource` + pagination

---

## Frontend Rules

- Design tokens: `blue-500`, `gray-100`–`gray-900`, `polar-800`
- Always include `dark:` variant for color classes
- TanStack Query for data fetching, Zustand for state, react-hook-form + zod for forms
- Components: CVA pattern, live in `atoms/` or `molecules/`

---

## Package Managers

- JavaScript: **pnpm** — never switch
- Python: **uv** — always prefix Python commands with `uv run`

---

## Running the Project

```bash
# Backend
cd server && docker compose up -d && uv sync && uv run task api

# Frontend
cd clients && pnpm install && pnpm dev

# Tests + lint
cd server && uv run task test && uv run task lint && uv run task lint_types
```

---

## Spaire Integration Playbooks

When assisting with Spaire checkout or billing integration, use the playbooks in `docs/agent-playbooks/`:

| Task | Playbook |
|------|---------|
| Add Spaire checkout | `docs/agent-playbooks/setup-checkout.md` |
| Set up usage-based billing | `docs/agent-playbooks/setup-usage-billing.md` |
| Required output contract | `docs/agent-playbooks/agent-output-contract.md` |

### Agent Output Contract (Required for All Integration Work)

Before writing any file during integration work:

1. **List all planned file changes** (create/modify + one-sentence description each)
2. Ask **"Proceed with these changes?"** and wait for confirmation
3. Report **every shell command** run with its output
4. After changes: run and report **linter, type-check, tests**
5. Track **dashboard steps** completed vs pending
6. On completion: provide **exact rollback instructions** (file paths, imports to remove, packages to uninstall)

### Integration Safety Rules

- Never hardcode API keys or tokens — env vars only
- Never silently create billing objects (products/meters/prices) — walk user through dashboard manually
- Surgical edits only — no project restructuring
- Warn before proceeding if production indicators detected
- Always recommend Spaire sandbox mode for initial testing
- Detect and use the existing package manager from lock files — never switch
