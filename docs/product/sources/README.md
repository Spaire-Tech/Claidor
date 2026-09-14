# Sources

Documents the founder hands over as **source of truth**. They are kept
verbatim. Nothing in this folder is mine.

| File | What it is | Given |
|---|---|---|
| `grok-bot.md` | Grok Bot's full product contract, builder-facing | 15 Sep 2026 |

The founder's instruction with the first one: *"keep it in our repo as a
source of truth. we building exactly that."*

This README is the only editorial layer: what each source maps onto in
our tree, and where a source disagrees with something else the founder
has already decided. Disagreements are written down, never resolved
quietly.

---

## grok-bot.md — read against our tree

Checked on 15 September by listing the modules, not from memory. **A
module existing is not a claim that it works**; every "have" below means
the code is in the tree, nothing more.

### Already ours, and the doc confirms the shape

| Grok Bot | Ours |
|---|---|
| Settings: General / Computer / Usage & Billing / Updates | the same four, shipped — `design/settings/rows.ts` |
| Settings opened from the account button, no gear icon | the same — `design/shell/AccountMenu.tsx` |
| Choice cards, multi-select, custom free text | `design/thread/fromEngine.ts` → `ChoiceItem` |
| Attachments, images inline | `userAttachment` tab + thread parts |
| Auto-review on risky calls | our three exec policies — *ask / check-then-ask / allow* |
| Per-agent info pane: computer preview, routines, channels, members | the five agent tabs, behind the computer icon |
| Live preview of the agent's computer | `AgentBrowserInAppPanel.tsx` |
| Subagents (executor, computerUse) | `openclaw/src/agents/tools/subagents-tool.ts`, `subagents` panel tab |
| SendToAgent, CreateAgent, channels | `sessions-send-tool.ts`, `sessions-spawn-tool.ts`, `agents-list-tool.ts`, `openclaw/src/channels/` |
| Routines: cron + event listeners | `openclaw/src/cron/`, `cron-tool.ts`, `desktop/src/scheduledTask/` |
| Memory tiers and scopes | `openclaw/src/memory/`, our memory-bundle sync |
| Skills as a global library; demonstration → skill | `openclaw/src/skills/`, `skill-workshop-tool.ts` |
| Connectors as MCP plugins with a catalogue | `server/polar/connectors/` (Pipedream), `main/mcp/mcpStore.ts` |
| Secret requests — masked capture, never in chat | `openclaw/src/secrets/` |
| Voice memos | `openclaw/src/tts/`, `tts-tool.ts` |
| Reactions (tapbacks) | `openclaw/src/channels/ack-reactions.ts` |
| Image generation on request | `image-generate-tool.ts` |
| Web search / fetch, SSRF-guarded | `web-search.ts`, `web-fetch.ts` |

The read: **this document describes, feature for feature, an engine we
already vendor.** Most of what Grok Bot sells is sitting in
`openclaw/src/` unused. That is the most valuable thing in the file — it
is a map of what to surface, not a list of what to write.

### Genuinely new to us

- **Chief of Staff** — a fleet-managing agent that creates teammates and
  escalates to the person. We have the tools; nothing plays that role.
- **Group rooms with seated members** and room-specific turn rules.
- **Threaded replies** for bulk, key results kept in the main chat.
- **Reference chips** linking back to earlier messages.
- **Deep links into settings rows**, so the agent can point at a control.
- **Projects** as a memory and collaboration scope.
- **The escalation order**, written down:
  context → connector → web → signed-in browser → desktop GUI → ask.
  We have every step and no stated order.
- **Event listeners** for routines (Slack, GitHub, Linear, Sentry,
  PagerDuty, webhooks). Ours are cron only.

### Where it contradicts the founder's own direction

**`grok-bot.md` §4.1 — the box.** A persistent Linux machine the agent
owns, per-agent desktops on it, `/workspace`, packages installed,
`CopyToBox` / `CopyFromBox`, Update and Reset.

`docs/product/direction.md` §10 strikes exactly this, in the founder's
own words — *"there is no 'which computer' — that was a design mistake
by me. same for the cloud computer"* — and names Grok Bot as the thing
we differ **from**:

> Grok Bot copies your file to its own disk and copies it back — its
> words, "my computer ≠ your disk … we copy when needed" — and we open
> the file where it lives. […] Anything that reintroduces a machine the
> agent owns takes that sentence away from us.

Both are the founder's. They cannot both be built. Until this is
settled, **nothing here builds a box, a machine registry, or a
copy-to/copy-from**, and the line held is the one in `direction.md`.

Two smaller ones, same standing:

- **§4.2 registered user computers with `machineId`** — struck by the
  same section of `direction.md`.
- **§10 "repository work goes to a Cursor cloud agent"** — Cursor's
  product, not a capability we have or can borrow.
- **§2.1 "Sign In with Cursor"** — ours is the Claidor account.
