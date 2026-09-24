# Claidor

Legal research platform for OHADA law (see README.md). Monorepo with Python/FastAPI backend and Next.js frontend. NOTE: the backend Python package keeps the internal name `polar` (inherited from upstream).

## Simeon Labs rebrand — safe-rename rule (23 September 2026)

The company is now **Simeon Labs** (`simeonlabs.com`). The product users see is **Simeon** (spelling Simeon, never Simon). The old brand is Claidor.

**Do NOT blanket find-replace `claidor` → `simeonlabs` across the repo.** The `CLAIDOR_*` environment variable prefix is load-bearing: Render, Vercel, and the running API read those names. Renaming them requires a planned migration with a dual-read alias layer and coordinated Render/Vercel env updates — that is a separate, later PR after Bass confirms Google login on `app.simeonlabs.com`.

What is safe to change now (and was changed in the initial rebrand PR):
- User-visible UI copy, page titles, email text, invoice legal text → **Simeon** or **Simeon Labs**
- Hardcoded public hostnames for the Simeon deploy path (`app.claidor.com` → `app.simeonlabs.com`, etc.)
- Package metadata (description, author) → **Simeon Labs**

What must NOT be changed yet:
- `CLAIDOR_*` env var keys (Render + running API still read this contract)
- Auth/cookie/JWKS wiring that keys off those env names
- Internal identifiers: Python module names, CSS class names, component names, file paths
- HTTP header names (`X-Claidor-Signature`, `X-Claidor-Event`) — breaking change for webhook consumers
- `render.yaml` env var values — managed separately per deploy target
- Token prefixes (`claidor_ci_`, `claidor_da_`), cookie keys (`claidor_session`)

See `docs/cutover/simeonlabs-rebrand-brief.md` for the full brief.

## Swens — archived (September 2026)

This repository carried the Swens build (a model review platform for finance). It is archived, switched off and kept as a record: the engine under `server/polar/tieout` (routes no longer mounted; tests not collected), the screens under `clients/apps/web/src/components/Workspace` (no longer rendered), the scripts under `server/scripts`, and the documents of record under `docs/pierce` (`swens.md`, `swens-plan.md`, `notes.md`). There is **no `swens-final` tag** — the repository has no tags at all (`git ls-remote --tags origin` returns nothing, checked 18 September). Earlier copies of this file, and a user-facing page in the dashboard, named that tag; anyone sent to it found nothing. The last Swens state is reachable only by commit or by the `swens/*` branches on the remote. Do not extend it; answer questions about it from those documents, never from memory.

## desktop/ — Caisra, and the only product (18 September 2026)

**Correction, 19 September 2026 — read this before the paragraphs below.**
`desktop/` is no longer the LobsterAI tree. Commit `ce9fc2d8` (18 September,
"Re-found Caisra on the Grok Bot 0.18 reconstruction", 7,651 files changed)
replaced it with a from-source reconstruction of Grok Bot 0.18.0
(`desktop/PROVENANCE.md`). Measured on 19 September: 2,134 tracked files,
1,724 under `source/`, and `rg -il "lobsterai|openclaw|yodo|strongs|whisper|
macTasks|CHIEF_OF_STAFF"` over the tree (excluding `node_modules` and the
pinned `src/app/dist`) returns **zero files**. Every paragraph in this section
that names LobsterAI, OpenClaw, `openclaw.json`, `openclawConfigSync.ts`,
Yodo, the 23 strongs, Chief of Staff, whisper, `useDictation.ts`,
`macTasks.ts`, `main.ts:304` or "2,551 files" describes the tree before that
commit and is history, not a map. The paragraphs about the pinned renderer,
`npm run bootstrap`, `router-renderer-patch.mjs`, `SAND_BACKEND_URL` and
app sign-in describe the current tree. `docs/product/building-the-app.md`
and `docs/product/grok-bot-layers-measured.md` are the current map.
**`docs/product/start-here.md` is not**: it still describes the LobsterAI
tree (`desktop/src`, "2,552 files", the 23 strongs) and was never rewritten
after the re-founding (checked 22 September).

Two facts about the current tree that are established by build output, not
reasoning (`docs/product/host-wall-measured.md`): **every one of the 14
runtimes, the host included, compiles from `source/`** —
`buildFidelityDistribution()` reports `blockedFallbacks: []` with no host
binding manifest supplied, so the "missing manifest" the ours-brief calls the
wall is not a wall; and the agent loop **spoke**
`aiserver.v1.InferenceService/Stream` on 19 September, which Claidor does
not serve, so the real gap was the executor, not the compile. Since
`c0128b33` the loop runs on the `claidor` executor (OpenAI Responses through
Claidor's proxy) and `turn-run-shell.ts:182` hard-codes that provider; the
Cursor path is still in the tree as dead code (`cursor-session.ts`,
`cursor-inference.ts:191`). Also since 19 September: the box
runtime defaults to `local-docker`, the container is always told
`SAND_BACKEND_URL`, and the host-bundle update channel has no default origin
(`desktop/tests/local-docker-box.test.mjs`, `host-bundle-source.test.mjs`).

`desktop/` is Caisra: an Electron app that runs on the person's Mac, built on
LobsterAI (NetEase Youdao, MIT), vendored with `git subtree`. Keep the MIT
notices.

**This is the product.** On 18 September the founder ended an attempt to
rebuild on a different foundation and came back here:

> "i just wanna go back. this is not working. i prefer the idea of just being
> an app. i dont like how they built at rakazo. tho the tech is there. we can
> inspire ourselves."

`docs/product/going-back-brief.md` is the record of that decision and what it
costs.

**Two earlier headings of this file were wrong, and both cost real time.** This
section used to say `desktop/` was "exactly as upstream ships it" at commit
`b1ef0e3e`, which was true on 13 September and stopped being true when the
Caisra work was rebuilt on top over the following four days. It also said
"frozen, do not add to it". Nobody corrected either line, so for a week the
repository's own map described this directory as an untouched parts bin when it
held the finished product. **Check `git diff` before believing any claim in
here about what a directory contains** — including this one.

What is actually in it, measured on 18 September: 2,551 files, of which 102
under `src/` name Yodo or Caisra. The agent and its brief, the 23 strongs, the
roster card, Chief of Staff, onboarding, the Messages design, the document
artifacts, whisper speech recognition, the Mac tasks, the connections
catalogue. The tree is identical to `b41c9364`, the last commit before the fork
was vendored, which is the state the founder judged good.

**The backend is Claidor and it never moved.** `server/` and `runner/` serve
the desktop account protocol under `/desktop`: browser login, tokens, the
metered model proxy for Anthropic and OpenAI, memory sync, the skill, kit and
MCP catalogues, Pipedream Connect links from `polar/connectors/`, the maty job
queue under `polar/maty/`, and the cloud runner. `render.yaml` and the deployed
services are unchanged and the API answers now.

**The app signs in to Claidor, added 19 September.** `server/polar/desktop/app_sign_in.py`
answers the three routes the app actually calls — `/loginDeepControl`,
`/auth/poll`, `/oauth/token` — at the **root** of the API host, because the app
builds each with a leading slash and a leading slash throws away whatever path
a base URL carried. `/desktop` is untouched. Two things here were nearly wrong
and both are measured in `docs/product/app-sign-in.md`: **`SAND_BACKEND_URL`
alone does not point the app at us** (login and poll stay on cursor.com and
api2.cursor.sh — the stock `LoginManager` reads `CURSOR_API_BASE_URL` and
`CURSOR_WEBSITE_URL` and nothing else), and **the access token has to be a
readable JWT** or `isTokenExpiringSoon` refreshes before every call and a
refresh sent to the wrong host signs the person out. The token is the same
opaque `claidor_da_` value as ever, inside a signed envelope; `authenticate`
unwraps it and looks it up by the same hash, so there is still one way to check
a desktop credential. Sign-in is not the whole server the app wants: profile,
usage, access and the box broker are Connect RPC and Claidor serves none of
them. They degrade rather than fail — that is measured too, not assumed.

**`npm run package` ships the 0.18.0 window chrome inside the 0.18.0 Electron
shell, with the recovered host ignited so Terra→Luna actually runs.** Shipping
`frontend/` as that window on 20 September emptied the sidebar and composer:
the atom stylesheet was never recovered.
`npm run package:diagnostic` is the fidelity bundle. **The build loop is
`npm ci && npm run bootstrap && npm run check && npm run package && npm run
verify`, macOS arm64 only.** `docs/product/building-the-app.md` is the record.


**A renderer bug I fixed on the way, in the workspace build — corrected 19 September.** `docs/product/reconstruction-audit.md` said
the styling "does not exist and cannot be recovered". It exists: the built
stylesheet is 142 KB and 1,122 rules, with 448 of 734 atoms, 40 of 50 semantic
classes and 123 of 131 theme tokens defined, and a hash-locked 130-entry
palette that runs. The app rendered in Times New Roman because Vite marks the
emitted script and stylesheet `crossorigin`, and Electron's `loadFile` gives
the document the opaque origin `null`, so Chromium refused the stylesheet under
CORS before parsing it. One attribute. `scripts/build-caisra.mjs` and
`scripts/renderer-production-build.mjs` strip it, and
`desktop/tests/renderer-file-url.test.mjs` fails if it comes back. Separately,
the 18 runtime assets named by `rendererRuntimeAssetUrl()` were never in this
repository at all and are now drawn by `scripts/make-runtime-assets.mjs`. **The
lesson is the one already written at the top of this file and it was ignored
anyway: grep the built artifact before saying a thing is absent.** I asserted
"the atom rules were never recovered" without once looking at
`dist/renderer/assets/*.css`.

**Product turns run Grok Bot's own loop, decided 22 September 2026.** The
founder, after an audit of the tools (`docs/product/tools-audit-2026-09-22.md`):
"Use the original Grok Bot loop. i want literally everything." So a chat turn
goes through the host's full agent loop in the box (`turn-run-shell.ts`, on
Claidor), which keeps one transcript per agent in one SQLite table, carries
tool calls and results into the next turn, nudges for a reply as a
continuation instead of re-running the turn, creates teammates in the
background, gives the model the teammate directory, and draws every card
through the one append. `routesClaidorThroughHost` is **on with an empty
environment**; `SAND_CLAIDOR_FULL_AGENT=off` is the Mac-local, text-only
escape hatch, and everything under the router's dispatch in
`node-agent-coordinator/inference-router.ts` is that hatch. The first-run intro
runs on the real runner again (`agent-lifecycle.ts`, the pristine
reconstruction). The earlier rules "product turns stay on the Mac" and "do not
default routesClaidorThroughHost true" are superseded by this decision. The
gateway's deadlines (connect, send, roster reads, all 15 s) are what make a
cold box fail visibly instead of hanging; they are unchanged. **Why the audit
mattered:** the Mac path was the reconstruction's text-only router for its
alternative providers with Grok Bot's tools bolted on, and it glued a host
transcript to a local one, forgot its own tool calls between turns, re-ran
whole turns when no SendMessage landed (so CreateAgent ran twice), and wrote
cards to the host while text stayed local, which put every card at the top
of the chat. One thing was missing on **both** paths: no host writer stamped
the account scope the renderer's permission dock demands, so the Allow card
never showed; the coordinator stamps it now
(`node-agent-coordinator/permission-scope-stamp.ts`). **Not yet measured on a
Mac:** a full turn on the loop with a warm box, a cold box, and Docker off.

**Model roles copy Grok Bot's table, decided 22 September 2026.** No reflex
model, no per-step router. The loop runs on Terra at `effort: high`, the way
Grok Bot runs its loop; summarization, memory and the computer and browser
subagents run on Luna at `effort: low`, the way Grok Bot runs computer use.
Until this the executor sent no effort and every call ran at OpenAI's
default. Done-or-continue is Grok Bot's nudge mechanism, unchanged. Risky-or-
safe is Cursor's server-side classifier, which Claidor does not serve, so
auto-review is effectively off; do not invent an app-side model for it.
Escalation to Astra comes after, on the rule `pricing.py` already states.
**Found 24 September: until then a turn's model id never reached the
executor.** The owner input built in `host-runner-composition.ts`
(`createAgentOwnerInput`) carried no `modelId`, so every turn fell
through to the executor's default whatever `SAND_AGENT_MODEL` said; it
now passes `staticModelId`, and the executor still ignores an id the
proxy does not serve. A cross-lab roster with per-seat routes was built
on top of this the same day and reverted at the founder's word ("i'll
keep the grok bot idea for now. v1."); only this fix stayed.
`docs/product/model-roles-measured.md` is the record, with the two lines to
read on the Mac (effort on the wire, cached tokens on step two).

**Spend guards, built 23 September 2026.** One unattended first-run turn
made 481 model calls in fifty minutes with nothing on screen, $5.82 by the
proxy's meter (`docs/product/spend-guards.md`). Now: the proxy refuses at
`DESKTOP_HOURLY_CREDITS` (200,000 an hour, code 40201) before the month's
allowance is near; a hidden turn (intro, nudge, automation) may make 40
model calls and an asked turn Grok Bot's 5,000 (`SAND_HIDDEN_TURN_MAX_STEPS`,
`SAND_AGENT_MAX_STEPS`); the intro greets and stops and runs once; quitting
Simeon stops the local Docker box unless `SAND_KEEP_BOX_RUNNING_ON_QUIT=1`;
every model call writes a `[claidor]` line with its tokens to the box's
`/tmp/sand-host.log`; the box token file is written by one writer at a
time (a startup burst used to race on it and blind the app); and the
computer narration prints the failure's sentence. The brake by hand is
still `docker stop simeon-box` (the container was `grok-bot-local-vm` until 23 September). Not yet run on a Mac.

**The GPU is on by default, measured 24 September 2026.** Grok Bot's
shell disabled hardware acceleration and passed `disable-gpu`, so the
whole window was drawn on the CPU; #190 made it opt-in with
`SAND_ENABLE_HWA=1`. The founder ran the packaged app with that variable
and the scroll lag went away ("yeah the app is faster after this"), so
`main.ts` now disables the GPU only under `SAND_DISABLE_HWA=1`. The
merged transcript work (#187–#189) is in `desktop/frontend/`, which
`npm run package` does not ship, and behind a flag that is off; it
changes nothing on screen. If a scroll still stutters with the GPU on,
the Liquid Glass blurs and the marks' grain filter are next.

**Connectors sign in and serve tools, built 24 September 2026.** "i
thought i fixed the connectors, but its still not fixed." They were
not: both MCP managers (Mac and box) ran Grok Bot's manager around
Cursor's backend for HTTP servers, which Claidor does not serve, so a
vendor connector could be installed and nothing else; the box path,
which InstallPlugin takes since 22 September, drew no card because no
server row existed, and the Mac path opened a sign-in nothing ever
finished. Now `shared/node/vendor-mcp/backend-exec.ts` is that backend
for the vendor connectors (sign-in start on the Mac, code exchange from
the loopback, tools listed and called over streamable HTTP by
`http-mcp-client.ts`, the old backend for anything else), an installed
connector is an account row (`display.ts`, numeric id above 900,000
because server ids must be decimal), the credential lives in the Mac's
`vendor-mcp-installs.json` and is copied to the box on every
`refreshMcp`, on transport connect and on change (`vendorMcpStore` on
`refreshMcp` and `setHostSettings`); the box never opens a sign-in and
never spends a refresh token. #185's resume now has a sign-in to resume
from. `docs/product/connectors-signin-measured.md` is the record, with
the three commands to read on a Mac. Not yet run on a Mac.

**Custom MCP servers and account plugins live on the Mac, built 24
September 2026.** Grok Bot kept the account's MCP configuration on
Cursor's server and `shared/node/cursor-backend/account-mcp.ts` still
called those six RPCs, so reads came back `unavailable` and every write
threw; and the manager's `addServer` had no `parseServerConfig`, so
`AddMcpServer` threw before any RPC. Now the configuration is
`account-mcp-config.json` beside the vendor store
(`shared/node/account-mcp/store.ts`), the six calls are answered from it
as the generated proto messages (`local-client.ts`), a custom URL
server's tools run through the vendors' HTTP client with the server's
headers and the vendors' OAuth flow when it answers 401
(`account-mcp/backend-exec.ts`; sign-in on the Mac only), and a
command-configured server goes where it always went, the box's own MCP
executor. **The store travels both ways**, newer entry per name with
tombstones: the agent's `AddMcpServer` runs in the box, so the Mac sends
its copy with every refresh, the box merges and answers with its own,
and the Mac pulls the box's copy before each read
(`account-mcp/box-pull.ts`), because a whole-file replacement like the
vendor store's would wipe what the agent added and the connect card
runs on the Mac. `docs/product/account-mcp-local-measured.md` is the
record; `tests/account-mcp-local.test.mjs` measures it offline against
an in-process streamable-HTTP MCP server. Not yet run on a Mac.

**Two things the first evening with Simeon found, fixed 24 September 2026.**
"Name yourself Simeon" failed with `deps.readProfile is not a function`:
`host-runner-composition.ts` built the memory extension's agent state
without the `readProfile`, `writeProfile` and `writeSettings` deps that
`AgentStateDeps` requires (the call is untyped through `method(...)`),
so the agent's own rename, settings and avatar paths threw. They are
supplied now and write through the transcript so the roster follows.
And "open Render in your browser" failed with `No subagent types are
available`: the production turn passed `subagentConfigs: []`, so the
Task tool existed and refused every dispatch, and the composition's
`buildSubagentConfigsForRun` was never called by the production path.
The types are now built per run the same way it does: computerUse (and
browserUse when its gate is on) when the box answers, the executor when
multitask is on. **Then the dispatch failed one step later, "production
subagent result is not bound"**: the child runner was built with
`productionTurnRunShell: undefined`, no engine is bound to
`createRunStep` in production, so its run returned nothing. The shell
is now built by `buildProductionTurnRunShell(identity)` for the agent
(`session.id`, not a subagent) and for each child (`agentId`,
`isSubagentRunner`, its `subagentType`); the identity picks the
toolset (computer or browser tools, no Task tool), the cheap model at
low effort (`isComputerUseSubagent` on the session options), and the
child's own interrupt; a child runs with `transport: undefined`, so
nothing it streams reaches the chat and its text returns as the Task's
result. The subagent reads the parent's system prompt; a subagent
prompt of its own was not found in the tree. **Then the subagent ran
and never touched the desktop** (the founder's log, later that day:
`model=gpt-5.6-luna effort=low`, `tools=Shell(...printf...)` on every
step, "Awaiting asynchronous completion…"): it had a Shell tool and
nothing else. The computer, screenshot and browser deps exist
(`createTurnToolProjections` in `host-runner-composition.ts`, the
reconstruction's own `createHostComputerToolDependencies`), but the
only thing that ever applied them was the retired `createRunStep`
path; the production shell's provider
(`createTurnToolsetFactoryProvider`) never offered them, so
`buildTurnTools` read `factories.computer?.()` as undefined on every
shell turn, for the agent (no Screenshot tool either) and for every
child. The provider now offers all three, built on the box's accessor
(`turn.remoteBoxResourceAccessor`, the way BoxRead is), so the agent
gets Screenshot and RequestBoxHelp and a computerUse child gets the
computer tool. Not yet run on a Mac; the line to read in
`/tmp/sand-host.log` is a `[claidor] tool=` line naming the computer
tool on a Luna turn. The transcript's third
finding, one reply sent twice ("Nice. We're set…"), is not explained by
the code alone: the send count is collected synchronously before the
run settles, and the early-result reminder cannot fire in a turn with no
other tool call, so it is either the model calling SendMessage twice in
one turn or a reply nudge; the `[claidor] model=` lines for that turn
in the box log decide it, and nobody has read them.

**"Agent failed to respond: Unauthorized", read 24 September 2026.**
The word is the API's own `Unauthorized` exception, answered to the
box's model call (`AI_APICallError … statusCode: 401` in
`/tmp/sand-host.log`): the proxy's `get_proxy_caller` found no live
session behind the bearer, which for an envelope token means the
session's one-hour `access_expires_at` had passed. How the box gets that
token: the Mac writes it to `local-docker-credential/inference.json`
(mounted at `/run/grok-bot`) at box connect, and the host's renewer
re-reads the file as it nears expiry; **nothing ever rewrote it after
connect**, so a box older than an hour called the model with an expired
token until the app reconnected. The Mac now re-issues the credential
every five minutes and rewrites the file when it changed
(`startInferenceCredentialKeepFresh`); an expired file is re-read by the
host every 30 s, so a fresh token lands within the minute. A box only
minutes old that still gets 401 means the Mac had no valid token to
write (signed out, or its refresh failed): the file's `expiresAtMs`
says which. Not yet run on a Mac.

**Teach a task is there and gated off.** The composer's plus-menu entry
and the computer bar's button are in the pinned renderer, the recording
extension is in `host/extensions/teach-recording/`, and both key off
one feature gate, `sand_teach_by_demonstration`, default off, which
Grok Bot turns on from Cursor's experiments server and Claidor does not
serve. The host honours `SAND_FEATURE_GATE_OVERRIDES=sand_teach_by_demonstration=1`;
whether the renderer's snapshot follows it is not measured.

**The box silences the loop's logger, established 23 September 2026.**
`ports.runnerContext` is bound at build time
(`scripts/host-production-activation.mjs`) to
`createProductionRunnerContext()`, whose logger is `log: () => {}`. No
`nal.tool_call.*`, `Running step` or `nal.empty_response.*` line can appear
in `/tmp/sand-host.log`, so their absence proves nothing; and "Failed to
send the message to the user" is a tool result the model reads, never a log
line. What does reach the log is the stdout channel of `shared/host-log.ts`:
the `[claidor] model=` line, and since 23 September a `[claidor] tool=`
line per completed tool call (`host/runner/tool-call-log.ts`) and a
`[claidor] send-message written|not written` line per delivery
(`host/ports/transport.ts`). The real Agent loop delivers a SendMessage
offline (`tests/send-message-through-agent-loop.test.mjs`). **The "hi" that
made 481 calls is explained, by the next run's log, the same evening:**
GPT-5.6 greets with a `type:text` SendMessage carrying a `widget` object of
empty strings, the schema refused the whole call ("Nothing was sent.
Re-send…"), and the model re-sent it identically, one call every 3–5
seconds. On the second run it padded every slot with `x` instead.
`send-message-schema.ts` now lets `type` decide: fields of the other types
are dropped before validation whatever they hold (`stripFieldsOfOtherTypes`).
`docs/product/ai-does-not-answer-measured.md` has the log lines. Not yet
run on a Mac with the fix. Read that file before reasoning about a silent
agent again.

**The agents' faces are Grok Bot's own, reverted 22 September 2026.** Over
one day the marks carried, in turn, cloud bodies, DiceBear clay and DiceBear
slice, each painted over `.sand-grok-bot-mark` by a preload overlay. The slice
build was keyed on attributes the shipped page mostly does not carry (the
founder's screenshot: one lump per colour in the sidebar, nine identical brown
faces in the bot picker), then re-keyed on the drawing itself. The founder
then ended it: "just revert it to the way it original way. the original grok
bot avatars." The overlay, the generators, the motion table, the DiceBear
packages and the screenshot harness are out of the tree; the pinned 0.18.0
renderer draws its own faces and nothing paints over them.
`docs/product/faces-slice-measured.md` is the record. Do not put anything
over the marks again without the founder asking for it by name.

**The agents' faces are the founder's twenty-one avatars, decided 23
September 2026.** After a clay redesign the founder did not like ("i really
dont like it"), they made twenty-one avatars with DiceBear's Adventurer
style and sent them: "i want 20 avatars, straight up. you dont change the
form of his head, or skin color. when you change something, you change the
avatar straight up." So there is no shape axis and no colour axis any more.
The sources are `desktop/brand/avatars/adventurer-01..21.svg` (CC BY 4.0,
Lisa Wischofsky; the About dialog carries the credit),
`scripts/import-avatars.mjs` inlines them into `avatars.generated.ts`, and
`OnboardingCharacter` draws one by key inside the same 259 box with the same
two animation groups and the same forty-state table; the eyes squint about
their measured centre. The stored `avatarShape` holds the key; Grok Bot's
eight shape names map onto the first eight; an agent with nothing stored
hashes onto the twenty-one; `avatarColor` is kept and draws nothing. The
editor and the onboarding create step offer one row of twenty-one. **The
packaged app does not draw it**: `npm run package` ships the pinned 0.18.0
renderer, whose faces are still Grok Bot's own.
`docs/product/faces-adventurer-measured.md` is the record, with what was not
run on a Mac. The clay attempt is `faces-clay-measured.md`, superseded.

**The app says Simeon, decided 22 September 2026.** "replace all 'Grok Bot'
by 'Simeon' everywhere in the app. Replace all new names 'New Bot' by 'New
Agent'. replace grok bot logos by this." The pinned renderer's strings are
renamed by a brand pass in `scripts/lib/router-renderer-patch.mjs` at package
time (every chunk, the stylesheet, the page; counts recorded; the build
refuses a renderer that never said Grok Bot), the host names a new agent
"New Agent" (`source/shared/agents/agents.ts`), and the logo is Simeon's
mark, twelve petals measured off the founder's PNG and drawn from numbers
(`scripts/lib/simeon-logo.mjs`): the in-app icon through
`make-runtime-assets.mjs app-icon`, the Dock icon through
`make-app-icon.mjs` → `brand/Simeon.icns`, written over the shell's icons by
`package-macos.mjs`. **`CFBundleExecutable` and `CFBundleName` are Simeon
since 23 September, measured on the founder's Mac (menu bar says Simeon);
the bundle id is `com.claidor.simeon` and the scheme `simeon://`, measured
the same day (sign-in returned to the app)**: the packager renames the shell's
executable, the helper bundles, their executables and plists together
(`scripts/lib/macos-bundle-rename.mjs`). Earlier that day `CFBundleName`
alone was set to Simeon and the app died at launch with SIGTRAP in
`ElectronMain`, because Electron finds its helper bundles by that name and
they were still `Grok Bot Helper*.app`; the rename refuses to move the
executable without helpers to move with it. The bare words "Bot"/"Bots"
were not asked for and were left.
**The marks in the shipped screens, 23 September, later:** the landing
page's black mark and the onboarding hero are clouds ("make it a cloud",
`Jo.cloud`, the renderer's own shape; mood cycle, gaze and springs
untouched); the boot screen's logo (`tOt`, "Setting up Simeon's
computer") was Grok Bot's 158-frame morph and is now Simeon's twelve
petals from `simeon-logo.mjs`, same size and colour variable, turning
once in 14 s, still under reduced motion; and the pinned renderer's
`app-icon-C7NKj2u7.png` (the hand-off screen "Waking your computer…",
About) **was still Grok Bot's icon until then**, since nothing wrote the
founder's file over it. All four are in `router-renderer-patch.mjs`
(`patchOriginalMarks`, the app-icon copy), recorded under `marks` in
`dist/renderer-router-extension.json`. Verified headless at 56 px in light
and dark; measured on the founder's Mac the same evening ("ok it works").
**The agents' colours are twelve palettes, 23 September, later still**
("replace all existing colors with this"): Dusk, Sage, Lagoon, Ember,
Moss, Sand, Berry, Ocean, Rose, Slate, Peach, Mint, soft vertical
three-stop gradients under film grain, the same in light and dark. The
eleven colour ids keep their names (a saved agent still resolves; `black`
is Slate, so the landing mark and hero are slate) and `mint` is the
twelfth; the picker offers all twelve. The mark's body is always filled
with a gradient on `--ink-from/--ink-mid/--ink-to` through an SVG grain
filter, both defined in the animator's `<defs>`; `--fg` (the middle
colour) still feeds rings, particles and glyphs. `patchOriginalPalette`
in `router-renderer-patch.mjs`, ten anchors; previewed headless with the
face on, not yet seen on a Mac. **Frame cost of the grain filter on forty
sidebar marks is not measured**; if the sidebar stutters, the filter is
the first thing to remove (one anchor, `palette-body-fill`).
**The person's chat bubble is iMessage blue, 23 September, later still**
("copy imessage style and make it blue"): `#007aff` light, `#0a84ff`
dark. The renderer's theme variables come from a token list in the chunk
(`Ct("fill/bubble-user", …)`, emitted at runtime by `bzn` as
`--sand-fill-bubble-user`); the stylesheet holds only the light default.
Both are patched (`patchOriginalBubble`, `patchOriginalBubbleStylesheet`).
The bubble's text is `text/on-color`, white everywhere, untouched. The
same token feeds `--cursor-foreground`, which the checked state of a
checkbox uses, so that turns blue too. Not yet seen on a Mac.
**The chat header is the agent's card, 23 September, later still**
("the name of the agent are up top, left. i want to middle it … like
muse … remove the line"): a CSS block appended to the pinned stylesheet
(`HEADER_CARD_CSS`, `patchOriginalHeaderStylesheet`) hides the toolbar
divider, stacks the identity as a centred column, draws the same
animated mark at 88 px by overriding its inline 20 px, makes the name a
pill, and pins the computer/info controls to the right; scoped with
`:has()` to the identity variant so the thread breadcrumb and the agent
exchange keep their layout. The transcript offsets by the toolbar's
measured height (`qSn` writes `--sand-toolbar-height`), so it moves
down by itself. Rendered headless with the real markup and stylesheet
(toolbar 147 px); on the Mac the mark was first drawn at 20 px inside an
88 px box (the animator's SVG carries its own inline size; overridden
too), then 88 was "way too big" (now 52), then the bar's hard lower edge
read as a line (now a translucent, blurred strip whose bottom 30 px
fade out with a mask, so messages scroll under it).
**Liquid Glass on the chrome, 23 September, later still** ("bring apple
liquidglass design in the whole app"; the Figma link could not be opened
from the container, so this follows Apple's description of the
material): `LIQUID_GLASS_CSS`, appended after the header block, frosts
the sidebar, the info pane, the composer shell, popover menus, dialogs,
the floating pills, the message hover actions and the computer's top
bar: translucent fill, 24 px blur with saturation, a 1 px specular
highlight along the top, a soft ambient shadow, large radii. Messages
and text are content and are not touched. Not yet seen on a Mac; the
composer shell's base styling was not resolvable from the chunk, so it
is the surface most likely to need a second look.
`docs/product/name-measured.md` §Simeon is the record.

**The product is Simeon, decided 22 September 2026, later the same day.**
"any caisra word become Simeon … rename everything Caisra - Simeon", and the
bare words Bot/Bots become Agent/Agents. Every user-facing string of ours now
says Simeon (96 files; generated protos and this file's history are not
rewritten); the brand patch renames the pinned renderer's words at package
time; and the app is Simeon in Electron's eyes too (`build-asar.mjs` writes
`productName`), which is where the application menu, "About …", the window
title and the user-data folder come from. **Until then the staged
`productName` was still `Grok Bot`, so the app shared
`~/Library/Application Support/Grok Bot` with the real Grok Bot**; the first
launch as Simeon copies that folder once (`desktop-user-data-bootstrap.ts`).
The icon is the founder's black tile (`brand/`). Kept: lower-case
identifiers (`caisra`, `CAISRA_*`, `~/.caisra`); the executable name is
Simeon since 23 September (above).
`docs/product/name-measured.md` §Simeon is the record.

**The computer's screen, measured 22 September 2026.** With the Computer
panel spinning "connecting", the founder measured: port 6080 published, the
page answers 200, websockify and x11vnc up inside the box, and **no client
line in websockify's log**, so the app's webview never opened the socket.
The stock renderer cannot say why: it shows the spinner until noVNC's page
reports `noVNC_connected`, never times out, and the preload hides noVNC's
own failure text; noVNC retries every 5 s forever. There is no unused fix
in Grok Bot's code; production stock reaches a cloud box through the pod's
egress proxy, and our local Docker box uses stock's loopback dev path. The
app now narrates the stream to `computer-stream.log` in its data folder
(attach, load events, page console, preload failures) and paints the last
reason under a spinner after 20 s
(`electron-main/vnc/computer-stream-log.ts`, `preload-vnc.ts`
`installNoVncStatusReporter`, `electron-preload/computer-stream-notice.ts`,
`docs/product/computer-stream-measured.md`). Read that file before
reasoning about the screen again.

**The cost of running on the Mac.** The engine runs locally, so nothing runs
with the laptop shut. The maty queue and `claidor-maty-runner` are the cloud path
for exactly this, and **their completeness is now established**, 18 September:
the queue is live (`POST /maty/runner/claim` → 401), both routers are mounted,
the runner matches its README line for line — and **nothing produces a job**.
`grep -ril maty desktop/src` returns nothing. It is a finished pipe with nothing
plugged into the input, so no routine has ever fired overnight, because none can
be created.

**The decision, 18 September: keep the queue, change the executor.** The claim /
lease / heartbeat / scoped-token / memory-in-memory-out half is the hard part and
is tested. The other half is a Render container with no Docker, which is why
shell, web and browser are switched off in `runner/src/engineConfig.ts` — its own
README says so. The box on E2B removes that constraint, so a routine and an
interactive turn end up on one substrate. **Do not wire the app to the queue
first**: a producer against today's executor ships routines that can read a file
and call a model and nothing else. See `docs/product/box-substrate-read.md`.

**Speech, checked 15 September:** the server serves text-to-speech at
`/api/proxy/v1/audio/speech` (`server/polar/desktop/endpoints.py`, the
`desktop:speech` route). It serves **no speech recognition**, and it does not need to.
**Checked 18 September, and the open question here is now closed: whisper is
wired.** The design's dictation runs entirely on the Mac —
`renderer/design/shell/useDictation.ts` → `window.electron.speech` →
`main/ipcHandlers/speech/handlers.ts` → `main/speech/whisperServer.ts`,
registered at `main.ts:304` (`registerSpeechIpcHandlers`). Nothing in that path
touches the server.

The dead NetEase route survives in one place only: `ipcHandlers/asr/handlers.ts`
still asks `/api/asr/realtime/sessions`, which nothing under `server/polar/`
answers, and it is reached from the **upstream cowork** voice input
(`renderer/services/voiceInput/realtimeAsrClient.ts`,
`components/cowork/voiceInput/useCoworkVoiceInput.ts`). It is still registered
at `main.ts:282`. So voice input is not dead — it is two paths, one live and
one orphaned.

The macOS installer builds on GitHub Actions
(`.github/workflows/desktop_mac.yml`), unsigned until an Apple certificate
exists. The workflow is `workflow_dispatch` only — by hand, on purpose,
because GitHub bills macOS runners at ten times the minute rate. The same build
runs free on a Mac with `npm run mac:build`.

**On CI, corrected 18 September.** This file used to say Actions "dispatches no
jobs at all in this repository". That is false, and it was stated without
checking. A Dependabot job took a runner (`GitHub Actions 1000013128`,
ubuntu-latest) and ran green for 2m32s on 18 September at 16:27 UTC. What is
true is narrower: **the repository's own workflows** get no runner — `Server`,
`Client`, `Build and Deploy` and the scheduled jobs all fail 3–4 seconds after
creation, and their logs 404 because no log was ever written. Dependabot runs on
GitHub's own infrastructure and is not billed against Actions minutes, which is
consistent with a spending limit rather than a broken repository, but **that is
inference and not a log**. Nobody has read the Actions billing page. Until
someone does, the cause is unproven and CI confirms nothing for our own
workflows.

## What does not work, audited (24 September 2026)

"check the reconstruction to find all fails right now in the repo that we
didn't identify." `docs/product/reconstruction-gaps-2026-09-24.md` is the
record: five audits over the host, the Mac side, the three features the
founder named, the production bindings and the documents. **Read it before
saying a feature is broken or fine.** The shape: Claidor serves fourteen
HTTP routes under `/desktop/api/` and no Connect RPC; the app still calls
about sixty `aiserver.v1.*` methods, each preceded by a privacy-mode
lookup, and every one 404s. Three things were found and fixed that day:
**pressing the mic or "Generate" avatar could sign the person out**
(`getValidAccessToken()` with no backend named refreshed against
`api2.cursor.sh`; now the configured backend, `cursor-auth.ts`); **every
dictation came back in English** (`claidor-transcribe.ts` forced `en-US`;
no language is sent now); and **the agent's system prompt had no memory,
no automations, no workflows, no channels and an empty roster** (every
store handed to `createSystemPromptAssembly` was `() => null`; it reads
the session's stores now, and the memory section's compaction epoch
follows the summary count instead of a constant 0). The three named
features: avatar generation and upload are wired end to end to things
Claidor serves or to the box, and fail only on a runtime condition the
error line names; "voice note" is dictation, there is no voice-note
attachment and no text-to-speech in the app, and whether the packaged
`Info.plist` carries `NSMicrophoneUsageDescription` is not read. Still
broken with a known cause: the model picker (Cursor's `AvailableModels`),
the Usage tab (gated off, and the Settings patch is a no-op), the account
avatar and name (`GetMe`), reading a PDF (no worker bound), auto-review
(classifier not served, rejects), custom MCP servers and account plugins
(writes throw), Send Feedback, Help Center and "open cloud agent" links,
and everything on the cloud box, cloud agents, listeners and sharing. Not
yet run on a Mac.

**Fixed later the same day, "directly from the reconstruction"** (the
founder: "i need you to fix all of this"): each fix keeps the function
the renderer or the agent already calls and points it at a route Simeon
Labs' server serves, or at a local store, the way dictation was done.
The model picker reads `/desktop/api/models/available` into the
generated `AvailableModelsResponse` (`electron-main/models/claidor-model-catalog.ts`);
the account profile and Google picture come from `/desktop/api/user/profile`;
Usage & Billing is fed from `/desktop/api/user/quota` and its gate
`sand_usage_page` is on for our build (`shared/node/experiments/simeon-gate-defaults.ts`,
applied where the gate is read, the generated table untouched);
sign-out POSTs `/desktop/api/auth/logout` before deleting the keychain
entries; Send Feedback posts to the new `POST /desktop/api/feedback`;
Help Center opens simeonlabs.com; the migration watcher is not started
on a local Docker box; `attachProdBox` answers "disabled" in a packaged
build; reading a PDF works, with pdf.js bundled into the host so it
reaches the box (`host/runner/pdf-text-extractor.ts`); auto-review's
risky-or-safe classifier runs on Luna through Simeon Labs' proxy
(`host/extensions/auto-review/simeon-smart-mode-classifier-exec.ts`,
one `[claidor] auto-review` line per verdict); a subagent's prompt is
built for its own identity; the per-turn MCP snapshot is real; the
connector card's cancel works; host diagnostics reach the log; and
custom MCP servers and account plugins live in a store on the Mac
(paragraph above). Still not done, because the services behind them do
not exist: cloud boxes, cloud agents, Slack and GitHub listeners,
sharing, and Cursor's feature-gate server (gates keep their bundled
defaults; `sand_usage_page` is the one we set). None of this has run on
a Mac. `docs/product/reconstruction-gaps-2026-09-24.md` §"Fixed the same
day" has the per-item file list.

## The product's hostnames are simeonlabs.com (24 September 2026)

"i want to replace all claidor.com instances by simeonlabs.com … now i
want the app to respond to simeonlabs not claidor." The founder set up
Render, AWS and Google auth for the new hosts first; the Render env vars
keep their `CLAIDOR_` prefix (the setting names in `polar/config.py` are
unchanged, only their values move). In the repository every `claidor.com`
hostname in code, configuration and tests is now `simeonlabs.com`:
`render.yaml` (`CLAIDOR_BASE_URL`, `CLAIDOR_FRONTEND_BASE_URL`,
`CLAIDOR_ALLOWED_HOSTS`, `CLAIDOR_CORS_ORIGINS`,
`CLAIDOR_USER_SESSION_COOKIE_DOMAIN` = `.simeonlabs.com`,
`CLAIDOR_EMAIL_FROM_DOMAIN`, the maty runner's `CLAIDOR_API_BASE_URL`),
the desktop app's packaged environment (`desktop/scripts/lib/config.mjs`:
`CURSOR_API_BASE_URL`, `CURSOR_WEBSITE_URL`, `SAND_BACKEND_URL` all
`https://api.simeonlabs.com`, which is where sign-in goes), the web app's
fallback hosts (`clients/apps/web/src/utils/domain.ts`), the runner's
docs and the desktop tests' fixtures. The web app's real hosts are the
`NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_FRONTEND_BASE_URL` values on Vercel,
not in the repository. Left as they were, on purpose: `docs/` (records of
what was measured on claidor.com), the `billing.claidorhq.internal`
placeholder e-mail domain (never resolves; tests pin it), the 2026-04-06
migration's `server_default`, `CLAIDOR_EMAIL_FROM_NAME: Claidor` in
`render.yaml` (a name, not a host; the founder decides), and the paragraph
above about `app.claidor.com` on Vercel, which is history. Not yet
measured: a sign-in round trip from the packaged app against
`api.simeonlabs.com`, and whether the cookie domain change signs everyone
out of the web app once (it does, by design: a `.claidor.com` cookie is
not sent to `.simeonlabs.com`).

## What the Rakazo attempt left behind (17–18 September 2026)

Rakazo (Apache 2.0, `elie222/rakazo`) was vendored as a subtree on 17 September
and removed on 18 September. It is not in the working tree. Its history is on
this branch: subtree merge `34325164`, the Caisra-on-Rakazo build archived at
`4118ac0f`, and the removal commit.

Do not reason about it from memory. `docs/product/caisra-build-map.md` is the
audit of what it shipped; `docs/product/going-back-brief.md` says why it ended.

**Two things from it are worth taking, and neither is code:**

1. **Their eval harness** (`rakazo/docs/agent-verification.md` at `34325164`)
   runs the real agent loop against a local model fixture, offline, with no
   keys, plus 16 eval cases graded on actual effects over three trials. Its
   rule is the founder's own: missing live credentials mean **not run**, never
   a passing evaluation. Every argument in this repository about whether a
   brief rule works has been reasoning. That harness measures.

2. **The blindness failure.** Rakazo treated an OpenAI-compatible model as
   text-only unless its id was named in an environment variable. Ours were not,
   so the agent had no screenshot tools, never used graphical tools, the
   desktop never started, and it read as stupid when it was blind. Whatever
   this build does about vision, make it impossible to configure a model that
   silently cannot see.

**What the comparison actually measured.** The agent the founder judged "miles
and miles" worse was stock Rakazo with no brief of ours anywhere in the tree —
no Yodo, no `CHIEF_OF_STAFF_RULES` — and the task to write one was raised and
never started. That does not make the judgement wrong; it is the judgement of
the person using it. It does mean nobody should conclude from this episode that
the writing cannot survive a change of engine, because it was never tried.

**What changed in `server/` during the attempt, all additive and all kept:**
`Scope.model_proxy`, `get_proxy_caller` in `polar/desktop/auth.py`, a
`GET /api/proxy/v1/models` route, and helpers in `polar/desktop/pricing.py`,
plus a token-minting button at Account → Developer in the dashboard.
`get_proxy_caller` accepts a desktop access token **first** and falls through to
a personal access token only when the bearer is not one, so the desktop path is
unchanged.

**`app.claidor.com` needs no decision — measured 18 September.** This file,
and `docs/product/going-back-brief.md`, said the hostname had been pointed at the
Rakazo server and away from Vercel, and listed pointing it back as outstanding
work. It is not outstanding. Measured from this container:

```
app.claidor.com  →  CNAME cname.vercel-dns.com  →  76.76.21.164
GET https://app.claidor.com/  →  307 → /signup,  server: Vercel,  x-claidor-* headers
```

That is the Claidor dashboard on Vercel, answering now. Whether the repoint ever
happened or was reverted is not established and does not matter; nothing is to be
done. `docs/product/app-claidor-com-facts.md` remains the inventory of everything
that names this hostname, and it measured Vercel too.

## The design direction (13 September 2026)

The founder has redesigned the app and set the direction. It is written
down in `docs/product/direction.md`, with the founder's own words quoted
and every code claim tied to a file. Read it before proposing anything
about the product's shape. Its headlines: the app is Messages, with each
conversation an agent; five message kinds and no step cards; the
computer asks once, the first time, and then not again until the person
changes it in Settings (`docs/product/sources/caisra-permissions.md`,
17 September), except a risky command or a sensitive file, which the
engine's reviewer flags with a reason on the card (review item 68;
decisions that are hard to undo still ask, as a question card); text
arrives as texts and only speech
streams; one computer, this one; role agents are kits in the upstream's format, whose
store endpoint we already serve empty. **The product is Caisra**, the
founder's official name, decided 15 September 2026. The agent works for
Caisra: no string a person or the agent can read says LobsterAI, NetEase,
Youdao or OpenClaw, and the MCP servers the app registers are Caisra's.
`docs/product/direction.md` §0 lists what keeps an old name as an
internal identifier, and why.

**Corrected 19 September 2026 — Phase 5.** The same rule now covers
Cursor, Grok Bot and Anysphere. Settings, sign-in errors and the agent's
brief say Claidor and Caisra. Internal identifiers stay (`cursor`
provider id, `Cursor*` types, `AnysphereAgent`, IPC). The pinned 0.18.0
renderer still says Grok Bot in onboarding and About; that is the
shipped bytes, not a string we edit except through the Settings patch.
Measured in `docs/product/name-measured.md`.

**GPT models reason with tools, on `/v1/responses`.** OpenAI refuses
`reasoning_effort` together with function tools on
`/v1/chat/completions`, so on that wire the proxy sends
`reasoning_effort: "none"` whenever an OpenAI model holds tools. That
wire is no longer the one used. Since 13 September (`e87c0169`, on
`main`, which Render deploys) the server lists every OpenAI model with
`transportApi: "openai-responses"` (`polar/desktop/pricing.py`,
`DesktopModel.spoken`), the app writes that api onto the engine's
provider (`openclawConfigSync.ts`, `transportApi`), and the engine
speaks Responses natively to `/api/proxy/v1/responses`, where reasoning
and tools travel together and nothing is forced to `none`. An earlier
version of this paragraph said the translation was "a layer nobody has
built"; it was written before the merge and repeated once on 17
September without checking. The engine config on a Mac shows which wire
is in use: the `lobsterai-server` provider's `api` field in
`openclaw.json`.

**The engine cuts every instruction file at 20,000 characters unless
told otherwise** (`agents.defaults.bootstrapMaxChars`), and the managed
AGENTS.md is about 38,000. Until 16 September the app never set it, so
every agent on every model read half its brief and none of the rules
after the cut. The config sync now sets it and a runtime test keeps
the file under the line (review item 63). If an agent "ignores" a
rule, check where in AGENTS.md the rule sits before blaming the model.

That bug was found by one log line and not by reasoning about it. The
proxy records every provider refusal as `desktop.proxy.upstream_refused`
with the provider's own sentence in it. Two hours of my guessing —
including two confident wrong answers — were ended by reading it. When
something fails through the proxy, read that first.

**The browser: unverified, not broken.** It was the browser failing and
not GPT; I had the two the wrong way round until the founder corrected
me, and I gave three explanations for it, all wrong. Of the two faults
that were ever established, both were ours and both went with the reset:
plugin loading is all-or-nothing, so one extension that cannot load kills
the browser and every other plugin (12 September, self-inflicted by
un-pruning three extensions), and a startup-order change of ours.

**A third "observation" here was wrong, and is now deleted.** This file
used to say that because `browser` is in neither `COWORK_SYNC_FIELDS` nor
`COWORK_RESTART_FIELDS` (`openclawConfigImpact.ts`), a change of browser
mode does not restart the gateway, so the config could say in-app while
the running engine drove its own Chromium. The premise is true and the
conclusion is false: those two sets govern **cowork** config, and the
browser lives in `app_config`. `main.ts`'s `store:set` handler computes
`hasBrowserWebAccessConfigChanged` and passes
`restartGatewayIfRunning: true` when it reports a change — `displayMode`
included, which is the point. Re-checked 18 September: the helper is at
`main.ts:4536`, the `store:set` handler at `main.ts:4931`, the call at
`main.ts:4990`. (The line numbers here were `4395`/`4846` and had drifted.)
One precision the old wording missed: it is **not** any change to
`browserWebAccess` — the comparison blanks `credentialUseMode` and
`credentialSaveMode`, so a change to those two alone restarts nothing.

Nobody has run the browser in this tree. Do not call it broken and do not
call it fixed — run it, and if it fails get the gateway log before
touching code. The line that decides it is
`[EngineConfigSync] browser profile=…` (the tag was `[OpenClawConfigSync]`
until 15 September), which on a fallback names which half was missing.

**A machine registry is coming, decided 18 September 2026.** Two decisions are
locked: **file custody is explicit import** (the person's files live on their
machine; moving one to the agent's box is a deliberate copy, never ambient) and
**the machine model is a registry** (the box plus the person's registered
machines). `docs/product/cards-plan.md` holds both and the six things they
oblige us to change — the approval card has to name a machine, the brief's
"their computer asks once" section is written for a world with one, and box
handoff must never come to mean "your files are here now".

`direction.md` §10 is **retired** and marked as such. Its thesis survives — under
explicit import the box is where work happens, not where files live — but its
"there is no 'which computer'" does not. The paragraph below is what §10 argued
and is kept for the same reason §10 is: it is what the new design has to answer.

**Why §10 said there was no machine registry.** Grok Bot
needs registered computers because it lives in the cloud and has to reach
in. Maties runs on the machine, so there is no "which computer", only
this computer. Two laptops is a v2 problem, and by then we will know
whether anyone asks. The real difference is in how a file gets worked on:
Grok Bot copies it to its own machine and copies it back — its words, "my
computer ≠ your disk … we copy when needed". Maties opens the file where
it lives. That shows up in spreadsheet formulas, links between workbooks,
folder structure, and privacy.

## Artifacts are files, and OpenUI is gone (18 September 2026)

A report, plan, guide, deck or spreadsheet is a **file** — `.docx`, `.pptx`,
`.xlsx` — written with the matching skill and drawn in the thread as a file
card. OpenUI was removed from the product entirely on 18 September: it had been
asked for as the *look* of an artifact and had become the way every shaped
answer was drawn, which is how the document the person could send on stopped
being made at all. `docs/product/artifacts-decision.md` is the record.

**Images are unblocked in the app and do not work yet.** The gate that refused
every generate call is gone and the agent is told the tool exists, but
`GET /desktop/api/media/images/models` returns **404** — `server/polar/` serves
no `/api/media` route. That is a server build, not a switch;
`docs/product/images-state.md` has the measurement and the two options.

**Corrected 19 September 2026.** The host's generate-image tool never called
those NetEase `/api/media` paths. It now posts to
`POST /desktop/api/proxy/v1/images/generations`, which Claidor serves
(`server/polar/desktop/capabilities.py`). Web search and transcription have
matching doors; web fetch runs on the machine. Measured in
`docs/product/capabilities-measured.md`. The `/api/media` 404 is still true
and still unused.

## Before you say anything is missing (18 September 2026)

**`docs/product/what-exists.md` is an inventory of what is already built and
where. Read it before claiming any part of this product does not exist.**

It exists because of one failure, repeated. I told the founder the onboarding
Mac tasks had "genuinely nothing behind them". They are 178 lines of working
AppleScript with 107 lines of tests in
`desktop/src/main/onboarding/macTasks.ts`, which the founder had run many
times, and `useOnboarding.ts` — which I had read that same session — points
straight at them with `window.electron?.onboarding`. I reasoned forward from my
own file instead of searching the repository.

The rule: **"X does not exist" is a claim that requires a search.** Before
writing *missing, absent, not built, nothing behind it, a hole, needs building*
about this product, grep `desktop/src` and `server/polar`. If nothing is found, say what was searched for. If something is
found, it is a port or a wiring job, not a build.

**`desktop/` is the product, not a parts bin.** The code in it is finished and
tested: the Mac tasks, whisper speech recognition, the
ask-input MCP server, the connections catalogue, the 23 strongs, the whole
design. Reach for it first.

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
