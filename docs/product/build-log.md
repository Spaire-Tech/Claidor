# Build log

What was actually done, stage by stage, with the commits and the
verification. `plan.md` says what we intend; this says what happened,
including the things that turned out differently.

Newest stage last.

---

## Stage 0 — Point the app at our own server

**Commit:** `4eeffd85`. Preceded by `9d5c9c59` (the name).

### What changed

**One base URL, shared by both processes.** `src/shared/server/
constants.ts` is new and holds `SERVER_API_BASE_URL =
'https://api.claidor.com/desktop'`. The main process imports it in
`libs/endpoints.ts` and keeps a development override
(`FAISER_SERVER_BASE_URL`, was `LOBSTER_SERVER_BASE_URL`); the renderer
imports it directly.

**Nothing else had to move.** The app's paths already matched the
server's: `/api/auth/exchange`, `/api/auth/refresh`, `/api/auth/logout`,
`/api/user/profile`, `/api/user/profile-summary`, `/api/user/quota`,
`/api/models/available`, `/api/models/pricing-catalog`, and both proxy
routes. The base ends in `/desktop` because that is the prefix
`server/polar/desktop/endpoints.py` mounts under, and everything lined up
without a single path edit.

**Update, skill-store and kit-store** are built off that base instead of
NetEase's absolute URLs.

**The renderer's duplicate endpoint getters are gone.** It carried its
own `getUpdateCheckUrl`, `getManualUpdateCheckUrl`,
`getFallbackDownloadUrl`, `getSkillStoreUrl` and `getKitStoreUrl` that
nothing in the renderer imported — those calls are all made from main.
Duplicates pointing at another company's servers are worse than no
duplicates.

**Sign-in lost a round trip.** Upstream's `fetchLoginUrl()` asked NetEase
for the login URL over a request that could fail, then fell back to a
portal page. Ours is a fixed route, so it returns `${base}/login` and the
fetch and the fallback are both gone.

**Analytics is off at the source.** This was the urgent part and it was
not in the plan — the audit found it. Upstream posts every product event
to `rlogs.youdao.com` carrying the installation id, the signed-in user
id, subscription status and keyfrom attribution, including one fired
automatically at app start before anybody clicks anything.
`reportYdAnalyzer` now discards the event: no URL is built, no request is
made, nothing is queued for later. The cut is at the one function all 105
call sites go through. The sending machinery, the pending queue and the
retry timer are deleted.

### What was deliberately left

The portal and download links still point at NetEase
(`getPortal*`, `getFallbackDownloadUrl`). Every one is handed to
`shell.openExternal`, so nothing is fetched unless a person clicks a
growth surface — the ad slot, the credits float, the upgrade and pricing
links — and those screens go with the Messages shell. Pointing them at a
site that does not exist would be worse. Both files carry a comment
saying so and naming the one place to change.

### Fallout the tests caught

`logReporterUuidQueue.test.ts` covered the pending-event queue and was
deleted with it. `logReporter.test.ts` was rewritten to prove the
negative on every path — nothing sent for a normal event, nothing sent
for the app-start event, a touchpoint identity override ignored rather
than reported, and nothing queued after five calls.
`auth.test.ts` pinned the old portal login URL and now reads
`SERVER_API_BASE_URL`.

### Verified

Against the live server:

| Route | Result |
|---|---|
| `GET /desktop/api/kit-store` | 200 — `{"code":0,"data":{"value":{"kits":[]}}}` |
| `GET /desktop/api/skill-store` | 200 |
| `GET /desktop/api/mcp-marketplace` | 200 |
| `GET /desktop/api/updates/check` | 200 |
| `GET /desktop/api/user/profile` | 401 — no token, correct |
| `GET /desktop/api/models/available` | 401 — no token, correct |
| `POST /desktop/api/proxy/v1/messages` | 401 — correct |
| `POST /desktop/api/proxy/v1/chat/completions` | 401 — correct |

Locally: `tsc --project electron-tsconfig.json` clean, `tsc` clean,
`vitest run` 3900 passed across 394 files, `eslint --max-warnings 0`
clean on every touched file.

**Not verified:** the app has not been opened. Signing in with a Claidor
account and watching credits move is the founder's check.

### One thing I got wrong in passing

`GET /desktop/api/proxy/v1/chat/completions` returned 404 and I read it
as a missing route. It is the method: `POST` returns 401, which is
correct for an unauthenticated proxy call. Both proxy routes exist and
behave.

---

## Before Stage 0 — The name

**Commit:** `9d5c9c59`.

Faiser, applied in `appConstants.ts` as the single definition site,
plus `electron-builder.json` and `package.json`. It had to land before
anything shipped because `APP_NAME` decides the `userData` directory.
`direction.md` §0 says what deliberately keeps the old name and why.

**Two real faults surfaced while chasing the test fallout**, neither
caused by the rename:

- `scripts/electron-builder-config.cjs` hardcoded the old product name in
  all three installer artifact names while deriving the web package URL
  from `productName`. It would have shipped installers named for another
  app.
- `scripts/dist-win-web.cjs` separately hardcoded the same package name
  that the config derives. The two would have disagreed, and the build
  would have printed an upload path that does not exist.

Both now read `productName` from `electron-builder.json`.

Eleven tests across three files pinned the product name while the code
derived it. They derive it too now, so the next rename is checked by them
rather than broken by them.

---

## Stage 1 — Models: one to talk to, cheap ones behind

**Commits:** server and app together.

### The shape of it

The roles live on the **server**, not in the app. `/api/models/available`
now carries a `role` on every row, so the policy — which model is the
primary, which is the cheap one, which stands behind them — changes with
a deploy instead of a release. Nothing in the app names a model.

| Role | Model | What it does |
|---|---|---|
| `primary` | GPT-5.6 Terra | every reply the person reads |
| `cheap` | GPT-5.6 Luna | sub-agents, compaction, the memory flush, heartbeats |
| `fallback` | Claude Sonnet 5 | answers when OpenAI is down; never default, never shown |

Withheld, priced but roleless so a saved config still meters correctly:
**GPT-6 Astra**, **Claude Opus 5**, **Claude Haiku 4.5**.

Astra's reason is written into `pricing.py` beside it: every OpenAI model
runs with `reasoning_effort: "none"` whenever tools are present, and for
an agent tools are always present, so Astra costs five times Terra for a
capability that is switched off. It comes back when the proxy speaks
`/v1/responses` — Stage 2 — and not before.

### Server

- `pricing.py` gains `ModelRole` and `DesktopModel.role`; `available()`
  carries it.
- `service.offered_models()` now filters on **two** things: a role, and a
  configured provider key. The docstring says what that means for the
  fallback — no Anthropic key means no fallback is offered and the app
  writes none, which is visible here rather than at the moment OpenAI
  goes down.

### App

- `ModelRole` and `parseModelRole` in `shared/providers/constants.ts`.
- `claudeSettings.ts` carries the role through the server-model cache;
  the wire field is typed `unknown` and parsed, like the other wire
  fields beside it.
- `libs/agentModelRoles.ts` is new and pure: it turns roled models into
  `provider/model` refs and the `agents.defaults` fragments they fill.
  Every field is omitted when its role has no model, so a partial
  catalogue degrades to the engine's own defaults rather than to a
  dangling reference.
- `openclawConfigSync.ts` spreads those fragments into
  `agents.defaults` — four slots that already existed in OpenClaw's
  config and were simply never filled: `model.fallbacks`,
  `compaction.model`, `compaction.memoryFlush.model`, `heartbeat.model`,
  plus a `subagents` block.
- `auth.ts` filters the model picker to the primary. A row with no role
  is kept, so an older server leaves a working picker rather than an
  empty one.

### Verified

- The pricing module was **run**, not read: one primary, one cheap, one
  fallback; Astra, Opus and Haiku roleless; `available()` carrying the
  role. Prices printed from the real table.
- `tests/desktop/test_pricing.py` — 20 passed. The stale
  `test_claude_comes_first_so_the_default_stays_claude` is replaced by
  four tests of the current policy.
- `agentModelRoles.test.ts` — 10 tests on the pure helper.
- `openclawConfigSync.runtime.test.ts` — two new tests that read the
  **generated config file** and assert every slot, and assert the
  no-roles case writes nothing.
- `auth.test.ts` — three tests on the picker filter.
- `tsc` clean on both projects; `vitest run` 3915 passed across 395
  files; `ruff check` and `ruff format --check` clean; `eslint
  --max-warnings 0` clean on every touched file.

**Not verified:** the app has not been opened, and the server change is
not deployed. Both are the founder's to do.

### What a test caught

My first runtime assertion checked that no roleless model appeared
anywhere in `agents.defaults`, and it failed. The role slots were all
correct; what it found was that `agents.defaults.models` — a different
mechanism — registers per-model params for **everything** the server
sends. In production that is moot, because `offered_models()` only sends
roled models, and the roleless ones in the test were seeded by hand to
prove the resolver skips them. The assertion was wrong, not the code, and
it is now scoped to the role slots with a comment saying why.

### Left for Stage 3

Retiring the provider and API-key screens. The picker filter means one
model shows without touching them, and those screens go with the rest of
the old shell rather than being removed twice.

---

## Stage 2 — `/v1/responses`

**The stage turned out to be a fifth of the size it was planned at**, and
the reason is worth writing down: the plan said "a third wire in the
proxy: different request shape, different response shape, different
streaming — nobody has built it". Somebody had. **OpenClaw implements the
Responses API natively.** `src/agents/openai-transport-stream.ts` is
4,586 lines built on the OpenAI SDK's own `responses` types, handling
`response.created`, `response.output_text.delta`,
`response.function_call_arguments.delta`, reasoning items, tool calls and
`response.completed`.

So there was no translation layer to write. There was a wire to open and
a switch to flip. Checking before building saved the largest item on the
plan.

### What changed

**The proxy speaks three languages now, not two.** `_WIRES` was keyed by
provider, which worked while provider and wire were the same question.
They are not: Anthropic has one wire and OpenAI has two. It is now keyed
by `SpokenApi` — `anthropic-messages`, `openai-responses`,
`openai-completions` — and each knows its provider. The model/provider
check became model/`spoken.provider`.

`POST /api/proxy/v1/responses` is the new route and the one the engine is
pointed at. Chat Completions is kept and still works; nothing of ours
uses it.

**Metering follows the wire, not the provider.** `tally_for` and
`usage_from_answer` now take the spoken language. `Usage.
from_openai_responses_payload` reads `input_tokens` minus
`input_tokens_details.cached_tokens` — the same accounting as Chat
Completions under different names. `OpenAIResponsesUsageTally` reads the
usage off the terminal event, where it rides inside the whole response
object rather than beside it.

Three events end a run — `response.completed`, `response.incomplete`,
`response.failed` — and all three are read, so a run that stops on a
token limit or fails halfway is still metered for what it burned. The
tokens were spent either way.

**The field names were read, not remembered.** Every one came out of the
engine's own `response.completed` handler rather than from memory, which
matters because these models postdate what I can recall. The engine does
the identical `max(0, input - cached)` subtraction on its side.

**The server names the wire per model.** `available()` gains
`transportApi` — `openai-responses` for OpenAI, `anthropic-messages` for
Anthropic. A **new** field rather than a changed one: `apiFormat` keeps
meaning the provider's dialect family, so an app that predates this
picks the same wire it always did instead of a wrong one.

**The app honours it.** `buildProviderSelection` takes an optional
`transportApi` that wins over the provider descriptor, threaded through
both the provider config and the per-model loop. Everything else leaves
it unset and the descriptor decides as before — the app already had
`shouldUseOpenAIResponsesApi`, but it only fires for a direct
`api.openai.com` base URL, and ours is a loopback proxy.

**No change was needed to the loopback proxy.** It builds
`` `/api/proxy${req.url}` `` — path-agnostic, so `/v1/responses` reaches
the new route on its own.

### Two things that follow

`tool_reasoning` and the `reasoning_effort: "none"` it forces are now
read on the Chat Completions wire only. Nothing of ours is pointed there,
so in practice nothing is forced any more — which was the whole point.

**Astra's reason for being withheld is gone, and it stays withheld.** On
this wire it would actually reason. What is missing now is a reason to
offer it: a role is a job and every job is filled, and a second
`primary` would mean nothing decides which model answers. Astra belongs
to escalation — the person asks, a step has failed twice, the agent asks
— and that is not built. It returns the day it is, as a decision rather
than a leftover.

### Verified

- `test_pricing.py` — 24 passed, including the Responses usage split, a
  Responses stream read seven bytes at a time, both early-stop events
  metered, and a stream with no terminal event tallying nothing.
- Two new runtime tests read the **generated config file** and assert
  `api` is `openai-responses` per OpenAI model and `anthropic-messages`
  for Claude — plus one asserting an older server with no `transportApi`
  still gets `openai-completions`.
- `vitest run` 3917 passed across 395 files; `tsc` clean on both
  projects; `ruff check`, `ruff format --check` and `mypy` clean on the
  desktop module (mypy's 27 errors are pre-existing, in unrelated
  modules); `eslint --max-warnings 0` clean on every touched file.

**Not verified:** no request has been made to OpenAI's Responses endpoint
from this code. The shapes come from the engine's implementation rather
than from a live call, the server is not deployed, and the app has not
been opened. The first real call is the proof, and
`desktop.proxy.upstream_refused` is where to look if it is not.

---

## Stage 3 — The design becomes code

The canvas turned into `desktop/src/renderer/design/`. Nothing imports it
yet, which is the point: the shell gets built against it rather than
against ad-hoc values retrofitted after. `docs/product/design/
README-system.md` is the full write-up; this is what happened.

### Tokens

Counted out of the canvas, not invented. `tokens.ts` is written by hand,
`tokens.css` is generated from it and checked in so the app needs no
build step, and `tokens.test.ts` fails when they disagree.

Not a fifth theme. The app carries a four-theme skinning contract from
upstream that the old shell uses; the canvas is one considered look, and
putting it behind a skinning layer would invite the other four to stay.

### Logos, and a privacy fault in the canvas

The canvas resolves a logo it has no file for by asking
`icons.duckduckgo.com`, then `www.google.com/s2/favicons`. On the
installed-connectors row that tells two companies which services this
person actually uses. Against an instruction to track nothing at all,
that cannot ship, and it also makes an instant screen wait on two third
parties.

So: a logo is a file we ship or it is nothing, and nothing is already
designed — the canvas draws a monogram tile behind every logo and reveals
it when the image fails.

The 18 bundled logos came out at **1.62 MB** for icons drawn at 26–42px,
one of them a 1024×1024 PNG at 634 KB. Re-encoded to 128px webp: **55
KB**. Thirty times smaller.

**34 of ~50 catalogue services still have no logo.** They draw monograms,
which is correct rather than broken. The list is asserted in a test so it
shrinks deliberately; which brand assets to ship is a licensing question
and the founder's.

### The orb

Shaders verbatim. The host rewritten, because the canvas ran four orbs on
one screen and a sidebar of agents is a different problem:

- **a context budget** — browsers cap live WebGL contexts around sixteen
  and evict silently past it; sixteen agents plus a header plus the panel
  is already over. Capped at ten, and an orb under 56px never takes one.
- **stops when scrolled out of view** — the canvas's loop ran forever.
- **gives the context back** on disconnect.
- **survives a context loss** — a GPU reset killed the canvas's orb for
  the life of the window.
- **no layout read per frame** — the canvas measured itself every frame,
  per orb.
- **respects reduced motion.**

An orb denied a context draws a gradient in the same two colours; at 28px
nothing is lost, because the motion a person sees there is the CSS pulse
on the wrapper, not the shader.

**Fifteen palettes**, the canvas's four first and unchanged. The palette
is derived from the agent's id rather than randomised, because an orb is
the agent's face: a person finds Mira by colour before reading the name,
so it must survive a relaunch and a reordering. A separate seed from the
same id shapes the clouds, so two agents sharing a palette still differ.

### What a test caught

`apple-calendar-mac.webp` came out of the bundle under a name no service
resolves to — it would have shipped and never drawn. A test asserting
every bundled file is reachable by its own service name found it, and it
was renamed.

### Verified

- 27 design tests: token/CSS agreement, every value reaching CSS,
  property naming, fifteen palettes, the canvas's four exact, the pale
  colour really being lightest, stability under reordering, spread across
  1,500 agents, and the logo resolver never returning a remote url.
- `vitest run` **3944 passed** across 398 files; `tsc` clean on both
  projects; `eslint --max-warnings 0` clean on the whole design
  directory.

**Not verified:** nothing has been rendered. The shaders are the canvas's
and were seen working there, but no orb has been drawn by this code and
no token has been applied to a screen. That happens in Stage 4, and it is
where the design stops being a claim.

---

## Stage 4 — The Messages shell (first half)

The screens exist. Nothing is wired to the engine yet, and nothing has
been rendered — this is the shell built against the design, ready for the
IPC layer underneath it.

### The part that is actual engineering

`design/thread/fromEngine.ts`. The engine emits thinking blocks, tool
calls, tool results, streaming partials, token counts and errors; the
design has five things. Deciding what a person never sees is the whole of
the design's discipline, and it now lives in one file with a table saying
why for each.

What is dropped: **thinking**, because the design has no block for it and
watching a model think is not company. **Tool results**, because their
arrival is what removes the status above them, and their content is the
agent's to summarise in its own words rather than ours to dump. **Empty
replies**, because a bubble with nothing in it is a bug wearing a design.

What is changed: **errors become centred grey lines**, not red banners. A
banner would be the only shouting in an app that never shouts. And a long
reply becomes **up to three short bubbles** — the tail kept in the last
one rather than thrown away, because losing an answer to a formatting
rule would be the app quietly eating it.

### Never a tool name

`design/thread/toolVerbs.ts`. The engine's tools are `bash`,
`sessions_spawn`, `mcp__gmail__send_message`. The voice brief says never
to dump tool names, and the design has one line for this — an orb and a
shimmering verb.

So every tool becomes a phrase a person would use: `bash` is "Running
commands", `glob` is "Looking through files" because nobody says they are
globbing. Connector tools name the service — `mcp__google-calendar__*`
becomes "Working in Google Calendar" — because the service is the part a
person recognises and there is no list of those tools to maintain. An
unknown tool is "Working", never its own name. A test asserts no
underscore ever reaches the thread.

### The screens

`SignIn` — one screen, not a flow, because the founder has not designed
onboarding yet. A door: no tour, no feature grid, no invented welcome
copy standing in for copy they will write. It is never empty — an orb is
already breathing before anybody clicks — and a failed attempt is a
sentence in the same grey as everything else.

`Sidebar` — the conversation list. Search filters by name only;
pretending to search message content in a filter box is how a search box
becomes untrustworthy.

`Thread` — pins to the bottom while you are at the bottom and stops the
moment you scroll up, so a long answer arriving does not yank you away
from something you are reading.

`Composer` — the send button is a microphone when empty and an arrow with
a draft. One control, two jobs, no dead button ever shown.

`ThreadItemView` — one component per kind and a switch, deliberately not
one clever renderer: the kinds have nothing in common but their
container, and the moment they share code the list stops being closed.

`MessagesShell` — 300px of sidebar and everything else, the 34px ground
grid, the centred Text/Voice toggle, and the computer icon that will open
the inherited panel.

### Verified

- 24 tests on the mapper and the verbs, including the one that matters
  most: no tool name, no `mcp__`, no underscore reaches a thread.
- `vitest run` **3968 passed** across 399 files; `tsc` clean on both
  projects; `eslint --max-warnings 0` clean on the whole design
  directory.

**Not verified, and it is the whole point:** nothing has been rendered.
No orb drawn, no thread scrolled, no button pressed. The components
type-check and their logic is tested; whether they *look* right is a
question only opening the app answers.

### What is left in this stage

Wiring to the real IPC layer — `services/cowork.ts` and `coworkSlice`
already carry sessions, messages, streaming and permissions, so this is
connection rather than construction. Then compose, Apps and Settings,
which are modals over this.

---

## Stage 4 — Wired

The shell now reads the real store and talks to the real engine.

### The shape of the wiring

Everything that **decides** anything is in `shell/select.ts` and is pure:
which rows the sidebar shows and in what order, what a row's preview
says, what "9:12 AM" versus "Friday" means, which approvals belong to
this conversation. Sixteen tests, no store, no Electron, no render.

`shell/useMessagesShell.ts` reads Redux, calls those, and hands the
result down. It owns no state the store already owns — sessions,
messages, streaming and the permission queue stay the app's. So when
something looks wrong on screen the question is only ever "the selector
or the hook", and the selector is already covered.

### Decisions taken while wiring

**A row's preview is the last thing actually said**, not the last event.
A thread whose newest entry is a tool call would otherwise preview blank
— or worse, as the tool's name. Thinking is skipped here too.

**Only this conversation's approvals reach this thread.** The store keeps
one permission queue for the whole app. An approval raised in another
conversation appearing here would ask somebody to agree to something
they cannot see the context for. A test proves the other conversation's
`rm -rf` never reaches the wrong thread.

**An agent nobody has spoken to sorts last, never hidden.** A freshly
installed role agent has to be findable before it has a history.

**Answering an approval leaves one line and removes the card.** The note
is local state, because the engine's record is the decision itself; the
line is a presentation fact.

**A choice card is answered by saying the answer.** Picking an option
sends its text as an ordinary message, so the agent sees a reply rather
than a protocol — which is also what a person would have typed.

**"Tuesday" three weeks ago is a lie dressed as helpfulness**, so a
timestamp older than a week is a date.

### Sign-in

`FaiserApp` has two states and no third. There is no loading screen
between them because there is nothing to wait for: the sidebar arrives
with the agents it has and fills in as sessions load, which is how a list
should behave. A failed sign-in is a grey sentence, not a banner.

It is mounted behind a switch while the old shell is still in the tree.
Nothing here reaches into the old screens and nothing there reaches into
this, so either can be removed without touching the other.

### Still stubs, deliberately

Compose, Apps, the account menu and the computer icon are wired to
nothing and say so in the code. Each is a modal over this and each is its
own stage. A button that silently does nothing is worse than one that is
obviously not built yet, so they are named rather than hidden.

### Verified

- 16 new selector tests; 40 across the thread and shell together.
- `vitest run` **3984 passed** across 400 files; `tsc` clean on both
  projects; `eslint --max-warnings 0` clean on the whole design
  directory.

**Not verified:** still nothing rendered. The app has not been opened,
no orb has been drawn, no message sent. Every claim above is about code
that type-checks and passes tests, which is not the same as code that
looks right.

## Looking at it

The line above — "still nothing rendered" — is no longer true. A harness
under `desktop/harness/` mounts the real components with fixture data and
Playwright photographs six screens: sign-in, sign-in with an error, a
thread, a choice card, the typing state, voice.

The harness mounts the shipped components, not copies of them. The only
thing faked is the store.

### What the screenshots found that the tests did not

**An approval card said "Allow juno to continue".** `toThreadItems` was
passing `agentId` where a display name belongs, so an identity key —
`juno`, `engineering-lead`, a uuid — was being read out to a person as a
name, on the one card in the app that asks them to trust something.
`ToThreadOptions` now carries `agentName` separately; without it the card
says "this agent", which is honest. Two tests now hold the line, one of
them asserting an id with a hyphen in it never reaches the text.

Forty tests passed over this code and none of them caught it, because
every one of them passed a name where the app passes an id.

**The computer icon drew as a blank rectangle.** It was `🖵` (U+1F5B5),
which has no glyph in the fonts macOS or Linux ship. The search
magnifier, the Apps grid, the account caret, the microphone and the send
arrow were Unicode too, and the canvas has real SVGs for all of them.
`design/icons.tsx` now holds those paths verbatim — same geometry, same
stroke widths, same 24×24 box — stroked in `currentColor`.

**Two shimmering lines at once.** In the typing state the thread showed
"Running commands" and "Writing" stacked. `typing` in this app is the
session being busy, which stays true while a tool runs, so the two would
have shown together for the whole of every tool call. `showsTypingLine`
now gives the status precedence: it says what is actually happening.

**"typing" in voice mode.** The canvas passes `typing && mode === "text"`
and we passed `typing`. In voice the orb is already pulsing; the word is
wrong there anyway.

**A 404 in the console** that turned out to be `/favicon.ico` — harness
noise. It is named now rather than guessed at: the shoot script prints
the path of anything the server refuses, because "404 (Not Found)" with
no URL is one guess away from chasing the wrong file.

### What the screenshots confirmed rather than found

The five sidebar orbs are visibly different colours; the three-bubble
split reads as texts; the approval card shows the device id, the
disclosure and three buttons; scroll pinning lands at the newest message.

The composer stays on screen in voice mode. That looked wrong until the
canvas was checked: it does the same, with the orb above it. Left alone.

Sidebar orbs at 40px fall under `LIVE_MIN_PX = 56` and draw the gradient
fallback rather than the shader. That is the context budget working as
designed, and at 40px the difference is not visible — but it is a
decision, not an accident, and the founder should know it was made.

### Verified

- `vitest run src/renderer/design` — **73 passed**.
- `eslint --max-warnings 0` clean across `src/renderer/design` and the
  harness; `tsc --noEmit` clean.
- Six screenshots taken, no console errors, seven live orbs on the
  thread screen.

**Still not verified:** none of this has run inside Electron. The harness
is a browser with the real components in it, which is closer than tests
and is not the app. `FaiserApp` is still not mounted in `App.tsx`.
