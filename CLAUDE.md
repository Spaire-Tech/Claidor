# Claidor

Legal research platform for OHADA law (see README.md). Monorepo with Python/FastAPI backend and Next.js frontend. NOTE: the backend Python package keeps the internal name `polar` (inherited from upstream).

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
still `docker stop grok-bot-local-vm`. Not yet run on a Mac.

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
offline (`tests/send-message-through-agent-loop.test.mjs`); the "hi" that
made 481 calls is not yet explained, and
`docs/product/ai-does-not-answer-measured.md` says which log line decides
it. Read that before reasoning about a silent agent again.

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
`package-macos.mjs`. `CFBundleName` stays `Grok Bot` for Electron's helper
names; the bare words "Bot"/"Bots" were not asked for and were left.
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
The icon is the founder's black tile (`brand/`). Kept: `CFBundleName`
`Grok Bot`, lower-case identifiers (`caisra`, `CAISRA_*`, `~/.caisra`).
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
