# Agent Output Contract

Every AI agent that executes a playbook in this repository — regardless of platform (Claude Code, Cursor, Codex, GitHub Copilot, or any other tool) — **must follow this output contract**. It defines what the agent must communicate before, during, and after any code change.

---

## Why This Exists

Different agents have different internal reasoning styles and tool APIs. This contract is the platform-neutral interface: a shared vocabulary that makes agent behavior predictable, auditable, and reversible across all environments.

---

## Required Output Sections

Before and after any meaningful action, the agent must produce output in the following structure. Each section is mandatory unless explicitly marked optional.

---

### 1. Planned Changes (Before Writing — Mandatory)

Before creating or modifying any file, the agent must present a dry-run summary and **wait for explicit confirmation** before proceeding.

Format:
```
## Planned Changes

Files to create:
- path/to/new/file.ts — one-sentence description of what it does

Files to modify:
- path/to/existing/file.ts — one-sentence description of what changes

Proceed with these changes? [yes/no]
```

Never write a file before this confirmation is received.

---

### 2. Commands Run (During Execution — Mandatory)

Every shell command the agent runs must be reported with its result.

Format:
```
## Commands Run

$ git status --porcelain
[output]

$ pnpm add @spaire/sdk
[output or "success"]
```

---

### 3. Tests / Checks Run (After Changes — Mandatory)

After making changes, the agent must report what validation was performed.

Format:
```
## Checks Run

- [ ] Linter: pnpm lint — PASS / FAIL (error output if failed)
- [ ] Type check: pnpm tsc --noEmit — PASS / FAIL
- [ ] Tests: pnpm test — PASS / FAIL / SKIPPED (reason)
- [ ] Build: pnpm build — PASS / FAIL / SKIPPED (reason)
```

If the project has no tests or linting configured, report `SKIPPED — not configured`.

---

### 4. Dashboard Steps Completed / Pending (For Billing Playbooks — Mandatory)

When a playbook involves manual dashboard configuration, the agent must report the status of each step.

Format:
```
## Dashboard Steps

- [x] Product created in Spaire dashboard
- [x] Meter configured: llm-token-usage
- [ ] PENDING — Metered pricing: user must attach meter to product price
- [ ] PENDING — Webhook URL registered at Settings → Webhooks
```

---

### 5. Rollback Steps (After Completion — Mandatory)

After every implementation, the agent must provide explicit rollback instructions.

Format:
```
## Rollback Steps

1. Remove file: path/to/created/file.ts
2. Remove import added to: path/to/modified/file.ts — "import { X } from '@spaire/sdk'"
3. Remove code block in: path/to/modified/file.ts — lines 42-58 (the checkout handler)
4. Remove env vars: SPAIRE_ACCESS_TOKEN, SPAIRE_WEBHOOK_SECRET (from .env)
5. Uninstall packages: pnpm remove @spaire/sdk @spaire/nextjs
6. Dashboard: delete meter "llm-token-usage" in Spaire → Products → Meters
```

Be specific — list exact file paths and exact things to remove or undo.

---

## Package Manager Detection (Mandatory)

The agent must detect and use the project's existing package manager. **Never switch package managers unless explicitly instructed.**

Detection rules (check in this order):
1. `pnpm-lock.yaml` present → use `pnpm`
2. `yarn.lock` present → use `yarn`
3. `package-lock.json` present → use `npm`
4. `uv.lock` present → use `uv`
5. `poetry.lock` present → use `poetry`
6. `requirements.txt` with no lock file → use `pip`
7. `go.mod` → use `go get`
8. `Gemfile.lock` → use `bundle`

If detection is ambiguous, ask the user before installing anything.

---

## File Editing Primitives

This contract is tool-agnostic. The following terms map to different environments:

| Concept | Claude Code | Cursor | Codex | Copilot |
|---------|-------------|--------|-------|---------|
| Read a file | `Read` tool | open file in editor | `cat` / read | file context |
| Write a new file | `Write` tool | create file | write to disk | suggest file |
| Patch an existing file | `Edit` tool | in-editor edit | patch/sed | inline suggestion |
| Run a shell command | `Bash` tool | terminal | subprocess | terminal |

Regardless of tool name, the behavior requirements are the same: **show planned changes before writing, make surgical edits only, never rewrite entire files without confirmation.**

---

## Safety Rules (Non-Negotiable)

These rules apply on every platform, always:

1. **No secrets in code** — never hardcode tokens, keys, or passwords. Reference env var names only.
2. **No silent account mutations** — never programmatically create products, meters, or prices in a billing dashboard. Walk the user through it manually.
3. **No destructive refactors** — do not reorganize project structure, rename files, or replace routing systems.
4. **No untested assumptions** — if framework detection confidence is low, ask before proceeding.
5. **No production deployments** — warn the user if production indicators are detected (NODE_ENV=production, deploy branch, CI/CD configs).
6. **No over-installation** — only install stable SDK versions. Check existing dependency versions for compatibility.
