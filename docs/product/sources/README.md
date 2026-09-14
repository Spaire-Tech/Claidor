# Sources

Documents the founder hands over as **source of truth**. They are kept
verbatim. Nothing in this folder is mine.

| File | What it is | Given |
|---|---|---|
| `grok-bot.md` | Grok Bot's full product contract, builder-facing | 15 Sep 2026 |
| `grok-bot-chat.md` | How the bot is built (prompt stack, guardrails) and how chat is configured | 15 Sep 2026 |

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

Both are the founder's. They cannot both be built. Put to them the same
day, and **settled**:

> *"no box. keep direction.md's line."*

So `direction.md` §10 stands and `grok-bot.md` §4.1 is read as
background on a competitor, not as a specification. Nothing builds a
box, a machine registry, or a copy-to/copy-from. The sentence that
survives is the differentiator: **we open the file where it lives.**

Two smaller ones, same standing:

- **§4.2 registered user computers with `machineId`** — struck by the
  same section of `direction.md`.
- **§10 "repository work goes to a Cursor cloud agent"** — Cursor's
  product, not a capability we have or can borrow.
- **§2.1 "Sign In with Cursor"** — ours is the Claidor account.

---

## grok-bot-chat.md — read against our tree

The second source. Where the first was a feature map, this one is a
**behaviour contract**: what the agent is told, in what order, and what
chat is allowed to contain. Checked against our files on 15 September.

### The message vocabulary agrees with the founder's, exactly

`direction.md` §2 fixes five kinds and calls the closed list "the
discipline that makes the app feel unlike an AI app". Grok Bot's
delivery primitives are the same set, arrived at independently:

| `direction.md` §2 | `grok-bot-chat.md` §10 |
|---|---|
| `text` | `type: text` (with `images[]`) |
| `choice` | `type: widget` — *"ends the turn"* |
| `auth` | Auto-review / local-execution approval card |
| `system` | the centred grey line |
| `status` | progress beats between ack and result |

Ours are already built and typed — `design/thread/types.ts:19–25`. Two
additions the doc has and we do not: `type: attachment` as a message in
its own right, and `type: secret-request`.

And §2.2 — *"prefer multiple short bubbles over one dense memo"* — is
the founder's *"the text come like texts. not ai"* (`direction.md` §3),
which we ship as at most three parts, 420 ms apart.

### The real find: our managed prompt is a third of this

`desktop/src/main/libs/openclawConfigSync.ts` is where we tell the agent
how to behave. It currently has three sections and no more:

- `MANAGED_WEB_SEARCH_POLICY_PROMPT`
- `MANAGED_BROWSER_POLICY_PROMPT`
- `MANAGED_EXEC_SAFETY_PROMPT` (delete ops, question cards, commands)

`grok-bot-chat.md` Part I is, almost section for section, the part we
never wrote:

| Missing from our prompt | Source |
|---|---|
| Reply-first on a person-opened turn | §2.1 |
| Ack ≠ delivery — the result must still be sent | §2.1, §6 |
| Progress beats at meaningful moments, not per command | §2.1, §6 |
| Tone: contractions, lead with the result, 1–2 sentences, no "Certainly" | §2.2 |
| Autonomy default — decide and proceed; state assumptions | §2.3 |
| Subagent opacity — never say "executor", speak in first person | §2.8 |
| Fabrication ban — no invented metrics, menus or click-paths | §3.7 |
| Stay silent on stale or duplicate background results | §2.5, §6 |
| A routine that finds nothing ends with no message at all | §6 |

This is the cheapest work in either document: the file is a list of
strings, the sections are written, and the behaviour the founder has
complained about most — the agent going quiet, or narrating every
command, or inventing an explanation — is what they address.

Our §2.4 equivalent already exists and is already fixed: the question
card was rewritten on 15 September so it is *"how you ask the user
anything that has a small set of answers … it is not a fallback"*, which
is this document's rule in our words.

### Already ours

Confirmed by file, not memory.

| Contract | Ours |
|---|---|
| Choice cards: 1–6 options, multiSelect, free text, ends the turn | `design/thread/fromEngine.ts` — `AskUserQuestion` → `ChoiceItem` |
| Never use a widget to confirm a tool with its own review UI | already in `MANAGED_EXEC_SAFETY_PROMPT` |
| Auto-review / approval card, one at a time | our exec policy + the auth card |
| Untrusted content is data, not instructions | `openclaw/src/security/` |
| Secret capture, never in chat | `openclaw/src/secrets/` |
| Reactions (tapbacks) | `openclaw/src/channels/ack-reactions.ts` |
| Voice memos | `openclaw/src/tts/` |
| Memory tiers and scopes, `instructions_update` | `openclaw/src/memory/` + our sync |
| Hidden cues: `[routine]`, `[agent]`, `[inbound]`, first run | our cron, `sessions-send-tool.ts`, channels |
| Markdown in answers | `design/thread/parts.ts` |
| Hidden chats, notify-on-updates | agent record fields |

### New to us

- **In-chat forms** (`request_user_form`) — a fillable card for a typed
  login, address or OTP, with write-only secrets. Nothing in
  `openclaw/src/agents/tools/` matches; `polls.ts` is the nearest and it
  is not the same thing. This is the one piece of chat UI in the
  document we would have to build from nothing.
- **Reference chips** — jump to an earlier message by address.
- **Deep-link pills** into settings rows.
- **Threading** — `reply_to` for secondary bulk under a TLDR.
- **"N new messages" jump control** when scrolled up. Directly implied
  by multi-bubble turns, which we already do.
- **The render matrix** (§11.5): widgets and cards do not exist in group
  rooms or external channels; text degrades terser. A rule we would have
  discovered the hard way.
- **Room turns invert reply-first** — work first, then send, and silence
  is a legitimate move.

### Not ours, and struck with the box

- `request_box_help` (§5, §14) — hands the box desktop to the user.
  There is no box. The fillable half (`request_user_form`) stands on its
  own and is worth having; the handoff half goes with §4.1.
- `type: cursor-agent` / cloud agent cards (§10.5) — Cursor's product.
- `[Sent from machine <id>]` provenance and machine-targeted approval
  (§3.3) — the machine registry, struck.

### Nothing here contradicts `direction.md`

Other than the three lines above, which are the box again. On
everything else the two documents agree, including the parts the
founder wrote before seeing this one.
