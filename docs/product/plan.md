# The plan

13 September 2026. Built from `direction.md`, the founder's canvas, and
the code as it stands at `ba4ec8c0`. Every claim about what exists names
a file. Where I could not establish something, it says so.

Read `direction.md` first. This is how we get there, not what it is.

---

## What this is actually made of

The honest shape of the work, before any stages:

**The engine is done.** OpenClaw gives us agents, sessions, streaming,
permissions, skills, memory, subagents, cron, MCP, and a real browser.
We are not building an agent.

**The server is mostly done.** `api.claidor.com` already serves login,
tokens, the metered model proxy, memory sync, the skill/kit/MCP
catalogues, Pipedream Connect, and the maty job queue. It is live now.

**The UI is the work.** `desktop/src/main` and `desktop/src/renderer`
are 273,535 lines across 543 renderer files. The design deletes most of
what they draw. So this is not "modify the app" — it is **build a thin
new shell and stop rendering the old one**, keeping every line below the
UI untouched.

That division is the whole plan. `src/main/` is left alone wherever
possible, because `main.ts` alone is 14,794 lines and
`openclawRuntimeAdapter.ts` is 12,028, and that is where breakage lives.

**What is genuinely plug-and-play:** models, the kit store, the artifact
panel, permissions, skills, memory, cron, the browser.
**What is genuinely a build:** the Messages shell, OpenAI speech, and
the connector catalogue's content.

### Work that already exists in history

`3e1224d5` is the last state of the deleted branch. It is a **reference,
not a source** — CLAUDE.md records that 51% of its files were rewritten
and never run, so nothing comes back without being read first. But these
modules solved problems we are about to solve again, and reading them
will be faster than starting cold:

| Module at `3e1224d5` | What it did |
|---|---|
| `shared/providers/matiesRequestOptions.ts` | pointed model requests at our proxy |
| `libs/connectors/connectorMcpServers.ts` | per-service Pipedream MCP targets into the engine |
| `components/connections/*` | connector catalogue, cards, browser sign-in |
| `libs/authLocalCallbackServer.ts` | the browser-login callback (also in the tree today) |
| `libs/maty/matyClient.ts`, `matyService.ts` | the cloud client |
| `ipcHandlers/onboarding/profile.ts` | profile into the engine's instructions |

---

## Stage 0 — Point the app at us

**Nothing visual changes. This is the spine.**

Today every endpoint is NetEase's: `src/renderer/services/endpoints.ts`
has seven URLs on `api-overmind.youdao.com` and `lobsterai.youdao.com`.

Replace them with `api.claidor.com`, which already answers on every one
of them:

| App endpoint | Our route |
|---|---|
| update check / manual | `/desktop/api/updates/check`, `/check-manual` |
| skill store | `/desktop/api/skill-store` |
| kit store | `/desktop/api/kit-store` |
| login url | `/desktop/login` |

Then wire the account: browser login → token exchange → profile → quota.
`libs/authLocalCallbackServer.ts` is already in the tree. The server side
is `server/polar/desktop/endpoints.py`.

Then route the models through our proxy — `/desktop/api/proxy/v1/messages`
and `/desktop/api/proxy/v1/chat/completions`.

**Done when:** you open upstream LobsterAI, sign in with a Claidor
account, ask it something, get an answer from GPT through our proxy, and
watch the credits move.

**Size:** small. It is configuration and one auth flow, and both halves
already exist.

**Why first:** it proves account, billing, proxy and engine end to end
before a single pixel is designed. If this stage is wrong, nothing built
on top of it can be right.

---

## Stage 1 — Models: one to talk to, cheap ones behind

Set the slots in `src/main/libs/openclawConfigSync.ts`. All of these are
existing OpenClaw config fields (`src/config/types.agent-defaults.ts`):

| Slot | Model |
|---|---|
| `model.primary` | **Terra** — everything the person reads |
| `model.fallbacks` | **Claude Sonnet 5** — never default, never shown, answers when OpenAI is down |
| `subagents.model` | **Luna** |
| `compaction.model` | **Luna** |
| `compaction.memoryFlush.model` | **Luna** |
| `heartbeat.model` | **Luna** |

App-side cheap work — chat titles, sidebar previews, intent sorting —
also goes to Luna.

**Astra is not offered.** Until `/v1/responses` exists, every OpenAI
model runs with `reasoning_effort: "none"` whenever tools are present
(`server/polar/desktop/endpoints.py`, `_openai_body`), which for an agent
is always. Astra costs 5× Terra for a capability we are switching off.
Remove it from the catalogue rather than sell it.

Retire the provider and API-key screens. There is no model picker in the
design.

**Done when:** there is one model in the UI, subagent and compaction
traffic shows Luna in the proxy logs, and killing OpenAI's key falls
through to Claude without the person noticing.

**Size:** small.

---

## Stage 2 — `/v1/responses`

A third wire in the proxy, beside `/v1/messages` and
`/v1/chat/completions`: different request shape, different response
shape, different streaming.

Until this exists the whole OpenAI line runs without reasoning. It is the
highest-leverage item on this list and it is invisible — no UI, no design
decision, just the difference between "cheaper" and "cheaper and as
good".

**Done when:** an agent holding tools gets a reply with reasoning on, and
`desktop.proxy.upstream_refused` stays quiet.

**Size:** medium, and self-contained. It is one file on the server and it
can run in parallel with everything below.

---

## Stage 3 — The Messages shell

**The one real rewrite.** Everything else is wiring.

Build a new top-level shell beside the old one and switch `App.tsx` to
render it. Do not delete the old screens yet — stop rendering them.

What the shell is:

- sidebar: agent list, search, Apps, account menu
- thread: header (orb, name, Text/Voice, search, share, **computer icon**),
  message list, composer
- compose: To: field with chips, picker with ⌘1–⌘9, two actions
- new agent: Name, Voice, Label, Description
- the five message kinds, closed list: `text`, `system`, `status`,
  `choice`, `auth`
- the orb: fifteen palettes, one picked at random per agent

What it reuses without modification:

- the whole IPC bridge (`src/main/preload.ts`)
- `src/renderer/services/cowork.ts` and `store/slices/coworkSlice.ts`
- the streaming adapter in `src/main/libs/agentEngine/`
- `src/main/coworkStore.ts`

What it must get right, because it is the product:

- **Text lands as texts.** Split the reply on blank lines, at most three
  parts, pushed whole, ~420 ms apart. Not token by token.
- **Only speech streams.** Word by word in voice mode only.
- **The voice brief** goes into the agent's instructions verbatim
  (`direction.md` §4).

**Done when:** you open the app and it is Messages. Four seeded agents,
you can talk to them, and no LobsterAI screen is reachable.

**Size:** large. This is the stage that takes the time, and it is the
only one where I would expect to be wrong about something and have to
redo it.

---

## Stage 4 — The computer icon

Wire the header icon to `ArtifactPanel`, which already exists at 8,676
lines and already has every tab
(`src/renderer/store/slices/artifactSlice.ts:29`):

| Tab | What you watch |
|---|---|
| `agentBrowser` | the agent's live Chromium — `AgentBrowserInAppPanel.tsx` |
| `browser` | a page preview |
| `fileList` | files it produced |
| `subagents` | what it delegated |
| `userAttachment` | what you gave it |

Plus every artifact as preview or code.

This is the richest thing upstream gives us and it survives intact. The
work is a mount point and a panel width, not a rebuild.

**One open fault to clear here:** nobody has run the browser in this
tree. It is not broken and not fixed — run it, and if it fails, read
`~/Library/Application Support/…/openclaw/logs/gateway-*.log` before
touching code.

**Done when:** the icon opens the panel, the agent browses, and you can
watch it.

**Size:** small, unless the browser fault is real. Then it is unknown,
which is why it gets its own stage and an early run.

---

## Stage 5 — Ask before anything touches the computer

Map the engine's permission requests onto the `auth` message kind:
warning triangle, device id, **the literal command behind a disclosure
triangle**, then Always allow / Allow once / Never. Answering consumes
the card — it is replaced by the one-line system note, so threads never
accumulate dead UI.

The mechanism exists (`CoworkPermissionModal.tsx` and the permission
channel in `shared/cowork/constants.ts`). This re-renders it as a message
instead of a modal and adds the command text.

**Done when:** every action that touches the computer asks, and the card
shows the real command.

**Size:** small.

---

## Stage 6 — Agents, kits, the twelve roles

Two halves.

**In the app:** the new-agent form writes an agent record — name, orb
palette, voice into instructions, label, description. The agent detail
gets its five tabs: Instructions, Memories, Skills, Routines,
Integrations. All five read from things that already exist (`agents`
table, `MEMORY.md`, `skillManager.ts`, `CronJobService`, the MCP store).

**On the server:** fill `/api/kit-store`. It already answers, and returns
`{"kits": []}` with the docstring *"Empty until Claidor curates one."*

A kit is `skills.bundle` + `skills.list` + `mcpServers` + `connectors`
(`desktop/src/renderer/types/kit.ts`). It carries no identity, so a role
agent is **a kit plus an agent record**. Twelve of them: Engineering
Lead, Design Lead, Operations Manager, Product Manager, Head of People,
Marketing Lead, Financial Controller, Account Executive, Data Analyst,
Support Specialist, In-house Counsel, Research Scientist.

**Done when:** Apps → Agents lists twelve, installing one gives you an
agent that already knows its work.

**Size:** medium in the app, and the twelve kits are writing more than
engineering.

---

## Stage 7 — Connectors

Server half exists: `server/polar/connectors/` is a working Pipedream
Connect integration — one-use sign-in link, list connections, remove
one, and **an MCP target per service**, which is where the engine's tool
conversation goes. Router mounted from `desktop/endpoints.py`.

Desktop half: a connect card that opens the link, and the per-service
MCP target written into the engine's config.
`3e1224d5:libs/connectors/connectorMcpServers.ts` did exactly this.

Catalogue: nine categories, ~50 services, each carrying context from
`github.com/cursor/plugins`. Ours has fifteen today
(`src/renderer/data/mcpRegistry.json` and the server's
`mcp_marketplace.json`).

**Open, and the founder's to decide:** whether sign-in is Pipedream or
browser. Pipedream gives both halves — the card and the tools. Browser
gives neither until built. Everything above assumes Pipedream; if it
changes, this stage changes and nothing else does.

**Done when:** you click Connect on Gmail, sign in once in a browser
window, and the agent can read your mail.

**Size:** medium for the plumbing, large for the catalogue content.

---

## Stage 8 — Voice

OpenAI speech, because it is cheaper than ElevenLabs.

**There is no speech route on the server today.** Nothing under
`server/polar/` matches `speech`. So this is a build: a route that takes
text and returns audio, metered like the model proxy.

Then the voice mode UI: the Text/Voice toggle, the 104px orb, and word by
word streaming — the one place streaming belongs.

Seven voices in the picker: Concise, Balanced, Warm, Direct, Sassy,
Curious, Formal. They name a manner, not a speaker, so they are prompt
settings on top of one OpenAI voice.

**Done when:** you press Voice and it talks, and the meter moves.

**Size:** medium.

---

## Stage 9 — The rest of the agent's five tabs

**Routines.** `src/scheduledTask/` and `CronJobService` already give at /
every / cron, agent turn or system event, delivery, run history. What is
missing is event-driven — "when an email arrives from X". The engine's
`webhooks` extension does exactly that and our packaging deletes it; it
comes back with one line in
`desktop/scripts/prune-openclaw-runtime.cjs`.

**Teach a task.** The `+` menu with the red record dot. The engine's half
exists — `skill_workshop` in
`openclaw/src/agents/tools/skill-workshop-tool.ts` lets the agent
propose, write, revise and apply a skill with support files. The screen
recording is the new part. The founder is handling the approach.

**Group chat.** The design already models it: agents as members, replies
one at a time, a name in the message routes to that agent. `sessions_send`
in the engine already lets one agent message another.

---

## Housekeeping, done as we pass through

Not a stage. Things that get removed when the stage that touches them
lands, so nothing is deleted speculatively:

- NetEase growth surfaces: sidebar ad slot, credit campaigns, daily
  check-in, first-run tour, publishing/deployment upsells
- Youdao analytics (`shared/analytics/constants.ts`,
  `services/logReporter.ts`) — the founder asked for no tracking
- Chinese-only services and the provider/API-key screens
- thirteen settings tabs down to four: General, Computer, Usage &
  Billing, Updates
- from Settings → Computer: the second machine and its execution
  setting; from Settings → Updates: **The Swens computer** and its reset;
  and the egress tunnel, which existed only to reach it. One computer,
  this one.
- and **no product name anywhere** — one placeholder constant, one
  definition site.

---

## Order, and why

```
Stage 0  point at us          ─┐
Stage 1  models + fallback     │  the spine: prove it before designing
Stage 2  /v1/responses        ─┘  (can run in parallel, server-only)

Stage 3  the Messages shell   ─── the long one
Stage 4  the computer icon     │  each of these is a day or two
Stage 5  ask before acting     │  on top of a shell that exists
Stage 6  agents + kits        ─┘

Stage 7  connectors           ─┐  content-heavy, parallelisable,
Stage 8  voice                 │  and none of them blocks the others
Stage 9  routines, teach, group─┘
```

0–2 first because they are cheap and they prove the spine. 3 next because
everything visible sits on it. 4–6 are short once 3 exists. 7–9 are
mostly content and can be worked in any order.

## What I expect to get wrong

Said in advance, because it is cheaper than saying it after:

- **Stage 3 is the risk.** A 543-file renderer has coupling that does not
  show up until the shell is running. I expect at least one thing there
  to need doing twice.
- **The browser is unverified.** If Stage 4 finds a real fault, its size
  is unknown until the gateway log is read.
- **Astra.** I am recommending we do not sell it. If `/v1/responses`
  turns out harder than it looks, that recommendation stands for longer
  than anyone wants.
- **Nothing here is tested by tests.** Every real fault in this project
  so far was found by the founder opening the app. Each stage above ends
  with something to open, for that reason.
