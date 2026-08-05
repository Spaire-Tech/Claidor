# Setup Checkout — Claude Code Adapter

This is the Claude Code adapter for the shared Setup Checkout playbook.

**Read and execute the full playbook at:**
> `docs/agent-playbooks/setup-checkout.md`

Read that file now using the Read tool and follow its instructions exactly.

---

## Claude Code Tool Mappings

The playbook uses capability-based language. In Claude Code, these map to:

| Playbook term | Claude Code tool |
|---------------|-----------------|
| "Read this file" | `Read` tool |
| "Use your environment's file editing primitives — write file" | `Write` tool |
| "Use your environment's file editing primitives — patch/edit" | `Edit` tool |
| "Run this shell command" | `Bash` tool |
| "Parallelize these checks if your environment supports it" | `Agent` tool with parallel subagents |

## Agent Output Contract

Before running the playbook, read `docs/agent-playbooks/agent-output-contract.md` using the Read tool.

You must produce all five required output sections:
1. Planned changes (before writing) — wait for explicit confirmation
2. Commands run
3. Tests/checks run + result
4. Dashboard steps completed / pending
5. Rollback steps
