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

## Stage 2b — The design becomes code

The first pass of this plan said "build the Messages shell" and never
said where the design came from. That was the gap. The canvas is not a
picture to work from — it is a finished specification, and most of it is
liftable rather than buildable.

**First: commit the canvas.** It lives in a chat upload today. It goes
into `docs/product/design/` so it survives, alongside the unpacked
template and the extracted assets.

**The tokens are already exact.** Counted straight out of the canvas:

| Token | Value | Uses |
|---|---|---|
| ink | `#1e3358` | 76 |
| muted | `#55606f` | 72 |
| paper | `#fbfbfc` | 39 |
| fill | `#e9edf2` | 17 |
| fill-raised | `#eef1f5` | 11 |
| faint | `#7d8797` | 7 |
| accent | `#2b6cf5` | 6 |
| ink-hover | `#2c4674` | 4 |
| shimmer-ink | `#1c1f23` | 6 |
| success | `#1a8547` on `#e7f6ec` | |
| warning | `#e8a300` — the approval triangle | |
| record | `#e0322d` — teach a task | |
| hairline | `rgba(16,22,35,.11)` | everywhere |

Type scale: 13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 17, 19, 21, 22, 27.
Radii: 999, 24, 22, 20, 18, 16, 14, 13, 12, 11.
Ground: `#fbfbfc` with a 34px grid at `rgba(16,22,35,.018)`.
Glass: `rgba(255,255,255,.94)` + `backdrop-filter: blur(20px)` + a white
inset top highlight. Used for every modal, popover and raised row.

Five motions, with their timings: `orbIn` .52s
`cubic-bezier(.22,.68,.36,1)`, `orbIdle` 7.5s, `orbSpeak`, `runShimmer`
1.9s linear, `msgIn` .16–.22s ease-out.

**The orb is a lift, not a build.** `cloud-orb.js` in the bundle is 195
lines of self-contained WebGL2 — a custom element with a vertex and
fragment shader, domain-warped fBm clouds, taking `colors`, `seed` and
`grain` as attributes. It drops in as-is. The only work is extending the
canvas's four palettes to **fifteen**, and picking one at random per
agent.

**The assets come out of the bundle too** — 22 files, the service logos
as webp, png, svg and jpg. They are extracted, not re-sourced.

**What is left to author** is the part the canvas cannot give: the
loading, empty, error and offline states of every surface it draws at
rest. The canvas shows the app working. It does not show the app
waiting, failing, or empty, and those are most of the states a real user
meets.

**Done when:** there is a token file, the orb renders fifteen distinct
agents, and the assets are in the tree.

**Size:** small, and it must land before Stage 3 rather than during it.
Building the shell against ad-hoc values and retrofitting tokens after
is how a design stops matching its spec.

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

## The audit: what the first pass missed

Re-run against the code, not against the plan. Twelve things, each with
a file or a question. Three of them need the founder before they can be
planned at all, and they are marked.

### 1. Routines and "no cloud computer" contradict each other — **decide**

`render.yaml` deploys a worker called `claidor-maty-runner`. Its own
README: *"This is the service that does a person's work when they are
not at their computer. It takes one job at a time from Claidor, does it
with the same agent engine the desktop app ships, and reports the answer
back."* It fetches the person's memory, runs the engine in the cloud,
writes memory back, deletes the directory.

That is a cloud computer. It is deployed and it costs money now.

And the design needs something like it: **Routines** is one of the five
agent tabs, and a routine that runs "every weekday at 8" cannot run when
the laptop is shut unless something else runs it.

The distinction that may resolve it, but only the founder can say:

- **Struck:** a cloud computer *the person works on* — files living
  there, apps installed on it, an update and reset surface, an egress
  tunnel. That is what the design had and what was called a mistake, and
  striking it is what keeps "we open your file where it lives".
- **Possibly not struck:** a headless runner that executes *scheduled
  jobs with your memory* while your Mac is asleep. It holds no files and
  the person never sees it.

**The question: does a routine fire when the Mac is closed, or only when
the app is open?** If only when open, the runner is dead weight and
should be torn down. If it should fire regardless, the runner lives and
this plan is missing a stage for it.

### 2. There is no sign-in screen, and no first run — **decide**

The canvas opens straight into a thread with four agents already there.
An account is mandatory — the model proxy meters against it — so
something must come before that, and the design does not draw it.

What exists to build on: `libs/authLocalCallbackServer.ts` (browser
login), `/desktop/login` on the server, and
`NewUserOnboardingOverlay.tsx` upstream, which is NetEase's tour and
should go.

What has to be decided: whether first run is a single sign-in screen, or
sign-in followed by making your first agent — which the design already
has a form and a voice picker for, and which would double as onboarding
without drawing anything new.

### 3. The name decides where the data lives — **settled: Faiser**

`src/main/appConstants.ts` is the one definition site, and `APP_NAME` is
what `configureUserDataPath()` joins onto `appData` — so it decides where
a person's conversations, memory, logins and engine state live. Renaming
after an install orphans all of it.

Settled and applied on 13 September, before anything shipped, so no
migration is owed. See `direction.md` §0 for what deliberately keeps the
old name and why.

### 4. The design has no error state anywhere

Five message kinds, and none of them is "it failed". No quota-exhausted
state, no offline state, no engine-won't-start state, no
connector-expired state. `src/common/coworkErrorClassify.ts` already
classifies engine failures into i18n keys, so the machinery is there and
the surface is not.

The smallest honest answer, consistent with the design: failures are
`system` lines in the thread, in the agent's own voice, never a red
banner. That keeps the closed list closed. It needs writing.

### 5. Quota at 100% is undrawn

The canvas shows "Trial usage 74%" and "Ends in 6 days". It does not
show what the app does at 100%. The server has `/api/user/quota` and
`src/main/authQuota.ts` already gates on entitlement. The behaviour —
refuse, degrade, or let it run and bill — is a product decision with a
UI consequence.

### 6. Attachments are in the composer and not in the thread

The `+` menu has "Attach files", but no message kind draws an attached
file, and the canvas never shows one. Upstream has the whole thing —
`DraftAttachment`, media mentions, and a `userAttachment` tab in the
panel. Either a sixth message kind, or attachments render inside a
`text` bubble. Needs deciding when Stage 3 is built, not after.

### 7. Two header buttons do nothing

Search and share, both without handlers in the canvas. Share has a menu
("Share as template"). Search does not, and it is not obvious what it
searches — this thread, or every thread. The sidebar already has its own
search over agent names. Upstream has session search to build on.

### 8. Notifications exist and are unwired

`src/main/libs/desktopNotificationManager.ts` is in the tree. Nothing in
the design uses it. A routine that reports back while the app is in the
background has nowhere to land. The tray manager is there too.

### 9. The mac build is deliberately unsigned

`.github/workflows/desktop_mac.yml` sets
`CSC_IDENTITY_AUTO_DISCOVERY: "false"` with the comment *"No certificate
yet: produce an unsigned app instead of failing."* Anyone who installs
it meets Gatekeeper. That is an adoption blocker, it costs an Apple
Developer account, and it has a lead time — so it should be started
early even though it belongs at the end.

### 10. i18n: 8,771 lines of Chinese and English

`renderer/services/i18n.ts` is 7,964 lines and `main/i18n.ts` is 807,
both carrying `zh` and `en`. The design is English only. Dropping `zh`
deletes roughly half of the largest non-UI file in the renderer and
removes a rule that otherwise doubles the cost of every string we write.
Keeping it is a market decision, not an engineering one.

### 11. Diverging from upstream has a cost nobody has priced

`desktop/` is vendored with `git subtree`, squashed. Once the shell is
rewritten, taking a future LobsterAI release stops being a merge and
becomes a port. The choice is to keep tracking upstream (and keep our
changes narrow and patch-shaped) or to fork outright and stop pretending.
Stage 3 makes this decision whether or not anyone makes it deliberately.

### 12. The prune list needs more than `webhooks`

`desktop/scripts/prune-openclaw-runtime.cjs` deletes seventy-odd bundled
extensions for startup speed. Four are worth reconsidering against this
design, each one line:

| Extension | Why it matters here |
|---|---|
| `webhooks` | event-driven routines — "when mail arrives from X" |
| `document-extract` | reading a document somebody sends the agent |
| `web-readability` | every "summarise this link" |
| `active-memory` | looks memory up *before* replying rather than when asked |

And one piece of housekeeping: `speech-core` sits on the keep-list and
matches nothing in the engine, so the list is protecting a name that
does not exist.

---

## Order, and why

```
Stage 0  point at us          ─┐
Stage 1  models + fallback     │  the spine: prove it before designing
Stage 2  /v1/responses        ─┘  (server-only, runs in parallel)

Stage 2b the design becomes code ── tokens and the orb, before the shell

Stage 3  the Messages shell   ─── the long one
Stage 4  the computer icon     │  each of these is short
Stage 5  ask before acting     │  on top of a shell that exists
Stage 6  agents + kits        ─┘

Stage 7  connectors           ─┐  content-heavy, parallelisable,
Stage 8  voice                 │  and none of them blocks the others
Stage 9  routines, teach, group─┘

alongside, started early for its lead time: the Apple certificate
```

0–2 first because they are cheap and they prove the spine. 2b before 3,
because building a shell against ad-hoc values and retrofitting tokens
after is how a design stops matching its spec. 3 next because everything
visible sits on it. 4–6 are short once 3 exists. 7–9 are mostly content
and can be worked in any order.

Two answers are still needed, and they are in the audit above: **does a
routine fire when the Mac is closed** (§1 — the deployed runner costs
money either way), and **what happens before the first thread** (§2 —
the founder is designing it, to land by the end of Stage 1). The third,
the name, is settled: Faiser (§3).

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
