# Agent Playbooks

Platform-neutral workflow documents for AI coding agents. Each playbook defines exactly what an agent should do — regardless of whether it's running in Claude Code, Cursor, Codex, GitHub Copilot, or any other environment.

## How This Works

```
docs/agent-playbooks/        ← Shared source of truth (neutral language)
    ├── agent-output-contract.md
    ├── setup-checkout.md
    └── setup-usage-billing.md

Platform adapters (thin wrappers that load the shared playbooks):
    .claude/commands/        ← Claude Code
    .cursor/rules/           ← Cursor
    AGENTS.md                ← Codex CLI (OpenAI)
    .github/copilot-instructions.md  ← GitHub Copilot
```

Shared playbooks contain all the logic. Platform adapters just point to them and add any environment-specific tool mappings.

## Playbooks

| Playbook | Purpose |
|----------|---------|
| [setup-checkout.md](./setup-checkout.md) | Add Spaire checkout to a user's project |
| [setup-usage-billing.md](./setup-usage-billing.md) | Implement metered usage-based billing |
| [agent-output-contract.md](./agent-output-contract.md) | What every agent must output (contract) |

## Agent Output Contract

Every agent on every platform must follow the [output contract](./agent-output-contract.md). It defines:

1. **Planned changes** — dry-run summary before any file is written
2. **Commands run** — all shell commands with results
3. **Tests/checks** — what was validated and whether it passed
4. **Dashboard steps** — manual steps completed vs pending
5. **Rollback steps** — exact instructions to undo everything

## Platform Adapter Locations

| Agent | Where to Invoke | Adapter File |
|-------|----------------|--------------|
| Claude Code | `/setup-checkout` slash command | `.claude/commands/setup-checkout.md` |
| Claude Code | `/setup-usage-billing` slash command | `.claude/commands/setup-usage-billing.md` |
| Cursor | Open chat, ask "run setup-checkout playbook" | `.cursor/rules/spaire.mdc` |
| Codex CLI | `codex` with repo context | `AGENTS.md` |
| GitHub Copilot | Copilot Chat with workspace context | `.github/copilot-instructions.md` |

## Adding a New Playbook

1. Create `docs/agent-playbooks/your-playbook.md` — write it in neutral language using capability-based wording (see below)
2. Update `.claude/commands/your-playbook.md` — thin wrapper for Claude Code
3. Update `AGENTS.md` — reference the new playbook for Codex
4. Update `.cursor/rules/spaire.mdc` — mention it for Cursor
5. Update `.github/copilot-instructions.md` — mention it for Copilot

## Neutral Language Guidelines

When writing playbooks, use capability-based wording instead of tool-specific wording:

| Instead of | Write |
|------------|-------|
| "Use the Write/Edit tool" | "Use your environment's file editing primitives" |
| "Use the Bash tool" | "Run this shell command" |
| "Use the Read tool" | "Read this file" |
| "No Claude API key needed" | "No extra LLM provider credentials needed" |
| "Launch agents with Task tool" | "Parallelize these checks if your environment supports it" |

Package manager detection must always follow the [output contract](./agent-output-contract.md#package-manager-detection-mandatory) — detect from lock files, never switch managers without explicit instruction.
