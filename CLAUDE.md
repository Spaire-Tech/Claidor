# Claidor

Legal research platform for OHADA law (see README.md). Monorepo with Python/FastAPI backend and Next.js frontend. NOTE: the backend Python package keeps the internal name `polar` (inherited from upstream).

## Swens — archived (September 2026)

This repository carried the Swens build (a model review platform for finance). It is archived, switched off and kept as a record: the engine under `server/polar/tieout` (routes no longer mounted; tests not collected), the screens under `clients/apps/web/src/components/Workspace` (no longer rendered), the scripts under `server/scripts`, and the documents of record under `docs/pierce` (`swens.md`, `swens-plan.md`, `notes.md`). The last working state is the git tag `swens-final`. Do not extend it; answer questions about it from those documents, never from memory.

## desktop/ — untouched LobsterAI (13 September 2026)

`desktop/` is the LobsterAI desktop app (NetEase Youdao, MIT), vendored
with `git subtree` (squashed; upstream commit named in the vendoring
commit) and, as of 13 September, **exactly as upstream ships it** —
commit `b1ef0e3e`, to the byte. Keep the MIT notices.

Everything built on top of it between 9 and 13 September was removed at
the founder's word, after four days in which every real fault was found
by them opening the app and none by any test. That work is not lost — it
is this branch's history, and `3e1224d5` is its last state — but it is
not here, and it is not the starting point.

So the app at this commit has what upstream ships: Chinese services and
Chinese text, provider and API-key screens, NetEase's growth surfaces (a
sidebar ad slot, credit campaigns, a first-run tour), thirteen settings
tabs, and no connection to Claidor at all. That is expected here, not a
defect.

**Nothing in `server/` or `runner/` was removed.** Claidor still serves
the desktop account protocol under `/desktop` (browser login, tokens, the
metered model proxy for Anthropic and OpenAI, memory sync, the skill,
kit and MCP catalogues, and — from `polar/connectors/`, mounted there —
Pipedream Connect sign-in links and per-service MCP targets), the maty
job queue under `polar/maty/`, and the cloud runner. `render.yaml` and
the deployed services are unchanged and the API answers right now. All
of it is live and, at this commit, nothing in the app calls it. **Speech,
checked 15 September:** the server serves text-to-speech at
`/api/proxy/v1/audio/speech` (`server/polar/desktop/endpoints.py`, the
`desktop:speech` route). It serves **no speech recognition**: the app's
voice input asks `/api/asr/realtime/sessions` (`ipcHandlers/asr/handlers.ts`),
which was NetEase's, and nothing under `server/polar/` answers it, so
voice input is dead in our build until a recogniser exists. An earlier
version of this file said there was no speech route at all; that was
wrong in the other direction.

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
`restartGatewayIfRunning: true` on any change to `browserWebAccess`,
`displayMode` included. Checked 15 September against
`main.ts:4395` and `main.ts:4846`.

Nobody has run the browser in this tree. Do not call it broken and do not
call it fixed — run it, and if it fails get the gateway log before
touching code. The line that decides it is
`[EngineConfigSync] browser profile=…` (the tag was `[OpenClawConfigSync]`
until 15 September), which on a fallback names which half was missing.

**Why there is no machine registry, and what actually differs.** Grok Bot
needs registered computers because it lives in the cloud and has to reach
in. Maties runs on the machine, so there is no "which computer", only
this computer. Two laptops is a v2 problem, and by then we will know
whether anyone asks. The real difference is in how a file gets worked on:
Grok Bot copies it to its own machine and copies it back — its words, "my
computer ≠ your disk … we copy when needed". Maties opens the file where
it lives. That shows up in spreadsheet formulas, links between workbooks,
folder structure, and privacy.

The macOS installer builds on GitHub Actions
(`.github/workflows/desktop_mac.yml`), unsigned until an Apple
certificate exists.

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
about this product, grep `desktop/src`, `server/polar`, `rakazo/packages` and
`rakazo/apps`. If nothing is found, say what was searched for. If something is
found, it is a port or a wiring job, not a build.

**Frozen is not gone.** `desktop/` must not be added to. The code in it is a
finished, tested parts bin: the Mac tasks, whisper speech recognition, the
ask-input MCP server, the connections catalogue, the 23 strongs, the whole
design. Reach for it first.

## rakazo/ — the new foundation (17 September 2026)

`rakazo/` is Rakazo (Apache 2.0), vendored with `git subtree` (squashed;
upstream `elie222/rakazo` commit `1f69485c`, named in the vendoring
commit). It is **not a reference copy**. On 17 September the founder
decided it is the foundation Caisra is built on, and that development on
`desktop/` stops.

Rakazo calls itself "an open source Grok Bot alternative for persistent
AI teammates" (`rakazo/apps/www/src/site.ts`). It is what Caisra was
being built toward: persistent bots with their own threads, memory,
routines and computers; web, Electron and Expo from one API; connectors
through Composio, Pipedream, MCP, OpenAPI and GraphQL; four sandbox
providers plus the user's own Mac; four voice providers with
transcription; and an eval harness that runs the real agent loop offline.

**The four decisions of 17 September, from the founder:**

1. Rakazo is the base. We add `apps/caisra` as a sibling and do **not**
   delete `apps/web`, because leaving it alone keeps upstream merges
   close to clean while they ship roughly 24 commits a day.
2. The backend is hosted by us. Their desktop app already supports it:
   `setup-config.ts` takes `mode: "existing"` with a `serverUrl`. This is
   what makes a routine fire with the laptop shut.
3. Keep from our tree: the renderer and the Messages design, onboarding,
   Yodo, the 23 strongs, the roster card, Chief of Staff, the OpenUI
   cards and artifacts (Rakazo has no equivalent; its `chat-ui` package
   is 358 lines of markdown), the Caisra brand, and the Claidor server.
4. `desktop/` is frozen. Do not add to it.

**Two more, later the same day, both product and both reversing a rule
we shipped:**

5. **Caisra has progress updates.** The desktop brief said the opposite
   ("Interrupt them for decisions, not for progress"), which was right
   for an app you can watch and wrong for a hosted backend where work
   runs for minutes with nobody looking. Rakazo's `message_user` rule
   wins: a few short, high-signal beats during long work, capped at 500
   characters, never the final answer. **This does not reverse "no step
   cards"** (`docs/product/direction.md`). A progress update is a text
   message in the person's own language, not a card showing tool calls.
   The rule against exposing the tool lifecycle stands.
6. **Every agent posts its own results into the shared conversation.**
   The desktop brief routed everything back through Yodo ("Bring things
   back yourself, in a few lines"). It no longer does. Rakazo's model
   wins: `handoff_to_bot` says "post results in the shared thread", and
   each bot speaks for itself. **Yodo is the first person you meet and
   who helps you, not a funnel.** In the founder's words: "ultimately
   the idea is to have a team." Rewrite `CHIEF_OF_STAFF_RULES`
   accordingly; do not port the relay rules.

**Three facts the plan rests on, each checked against source on 17
September rather than assumed:**

- A bot can run on the user's own Mac. `host-aware-sandbox.ts`:
  `if (envKind === "docker" && computerHost === "this-mac") return "desktop"`.
  It is per bot, so one bot works in a container while another works on
  the real disk at real paths. "It opens your file where it lives"
  survives the move.
- Our metered proxy becomes a model provider through
  `pi-openai-compatible-provider.ts` (`OPENAI_COMPATIBLE_PROVIDER_ID`).
  Rakazo is bring-your-own-key and we are not; this is the seam where
  "my users should never put a key" is kept. Config, not a build.
- Their runtime is **Pi** (`@earendil-works/pi-agent-core`), not OpenClaw
  and not Claude Code. The Claude Code routing work (review items 47, 59,
  63, 65, 74) does not port. It is rework, against `ExecutionRunner` and
  the cloud-agent tools.

**Apache 2.0 obligations.** Keep the licence text and copyright notices,
and state that files were changed. There is no NOTICE file upstream, so
that is the whole burden. One trap: **Treg** is usage-metered and their
README says hosted resale needs a written agreement — read it before
shipping anything Treg-shaped.

**`rakazo/` was the pristine fork, and is no longer.** It was byte-identical
to the squashed subtree merge `34325164` from the Caisra archive until the
model work later the same day, which by the founder's instruction removes the
bring-your-own-key surface from their apps. See "One model service, internal,
and no key fields" below for exactly what is edited and what it costs at merge
time. `git diff 34325164 -- rakazo/` is the honest list; nothing else of ours
is in there.

The Caisra build that used to live inside it was archived — see the section
below. Do not reason from memory about what we added there; there is nothing
there.

**Two of their gates fail in this container and neither is code.**
`apps/mobile`'s check runs `expo install --check`, which needs the network and
dies on a TLS handshake here; its `tsc` is clean. And one desktop test binds
`[::1]`, which this container has no route for. Both pass on a machine with
ordinary network.

**Pulling upstream:**
`git subtree pull --prefix=rakazo https://github.com/elie222/rakazo main --squash`.
`Spaire-Tech/rakazo` is the founder's fork, kept for contributing back;
the subtree tracks upstream directly so merges do not route through it.

**Where their engineering is ahead of ours, and it is the part to copy
first.** `rakazo/docs/agent-verification.md` runs the real agent loop
against a local model fixture, offline, with no keys, plus 16 eval cases
graded on actual effects over three trials. Its rule — "Missing live
credentials mean **not run**, not a passing model evaluation" — is the
founder's rule, already written into their engineering doc. Every
argument we have had about whether a brief rule works was reasoning.
They measure. Take the harness before taking opinions.

## One model service, one voice, and no key fields (18 September 2026)

**`docs/product/claidor-on-rakazo.md` is the document. Read it before
changing anything about models.**

The founder: *"remove their model you can add you key api logic completely
and make it a one api thing internal for me."* Done. Claidor is the
deployment's one model service, and **`rakazo/` is no longer the pristine
fork** — this is the first change that edits their apps. Set two variables
and every run uses Claidor:

```env
CLAIDOR_API_KEY=claidor_pat_…
RAKAZO_OPENAI_COMPAT_ALLOW_PUBLIC=1
```

Base URL `https://api.claidor.com/desktop/api/proxy/v1`, models
`gpt-5.6-terra` and `gpt-5.6-luna`, all overridable
(`CLAIDOR_API_BASE_URL`, `CLAIDOR_MODEL`, `CLAIDOR_MODELS`). The public-host
flag is needed because `api.claidor.com` is a public hostname.

**What a person sees: no model, anywhere.** Not in Settings, not on an agent.
The archived Caisra code settled this and I regressed it for one pass — see
`git show 4118ac0f:rakazo/packages/core/src/caisra-settings.ts`, whose own
comment reads *"No Models group … Which models run is decided in code, through
the metered proxy"*, with a test that failed if any settings row mentioned a
model. The Models screen, the mobile Models route, the per-agent model row and
`models.setDefault` are all gone; `models.list` stays because the app must know
what it speaks to, and is never drawn as a menu. Nine RPC procedures were
deleted from the contract, so a re-introduced picker or key field would not
compile.

**The cost design is Claidor's roles, not a picker.** `ModelRole` in
`server/polar/desktop/pricing.py`: `primary` is every reply a person reads,
`cheap` is machinery they never see, `fallback` is never shown. Rakazo had no
cheap tier — checked, not assumed — so summarising a thread ran on the everyday
model. `CLAIDOR_CHEAP_MODEL` now exists and history compaction uses it.

**The seam is theirs.** `resolveDeploymentModel` already chose the fallback
provider; it just carried no base URL and nothing stopped a user connecting
beside it. Both fixed. `setDefault` had to be rewritten — it hung off a
credential row that no longer exists and now writes `DeploymentSettings`.

**Kept on purpose:** the bring-your-own-key path still runs when
`CLAIDOR_API_KEY` is blank, because their offline harness and eval runner
must work with no Claidor account. Voice, memory and integration keys are
untouched; those are separate features.

**Voice went the same way (18 September).** ElevenLabs is the deployment's
voice provider, keyed from `ELEVENLABS_API_KEY`; `voice.connect` and
`voice.credentials` are gone from the contract and the two voice screens are
voice pickers with no key field. All four of their adapters remain, switched
with `VOICE_PROVIDER`. One thing here needs a database: `setVoice` used to hang
off a per-user credential row, so `DeploymentSettings.defaultVoiceId` was added
with a hand-written migration —
`packages/db/prisma/migrations/20260918120000_deployment_default_voice`. **It
has not been applied anywhere**; the API runs `prisma migrate deploy` before it
serves, so a deployment takes it on the next start.

**The cost, stated once:** our conflict surface was seven of their files.
It is now `apps/web`, `apps/mobile`, `apps/api`, `packages/contracts`,
`packages/core` and `packages/adapters`. Upstream ships ~24 commits a day,
so `git subtree pull` will conflict where it did not. That was the
founder's call, made knowingly.

Two things changed in `server/`, and both have a reason worth keeping:

- **`Scope.model_proxy` and `get_proxy_caller`.** A desktop access token
  lives one hour and the app refreshes it; a server is handed one static
  key and has no refresh loop, so a session token would answer 401 an hour
  in, mid-conversation. A `claidor_pat_` personal access token carrying
  that scope is the right credential — and it reaches the proxy and
  nothing else, because every other `/desktop` route asks for a session.
- **`GET /api/proxy/v1/models`.** Rakazo probes `<base URL>/models` before
  it will show a model list. That GET answered 404 until now, measured
  live.

**Claude is not reachable over that connection**, and that is not a
policy. An OpenAI-compatible client speaks Chat Completions only, and
nothing in the proxy translates it into an Anthropic request, so
`/models` lists the two GPTs and asking for Claude earns a 400 that says
why. Making it reachable is a translation layer, a real build, not
started.

**What has never been run:** a real model request through this connection.
The offline evidence is `scripts/rakazo/wire-check.mts`, which drives
Rakazo's own adapter code against a stand-in whose model list our own
Python generates. The server's nine new endpoint tests need Postgres and a
final Python 3.14 and have not executed. Say "designed and checked", not
"working", until somebody sends a message through it.

## Caisra on Rakazo — archived (18 September 2026)

The Caisra build that sat inside the fork is archived. The founder ended it:
"no we're done here i think. i've no choice but to start over. there's too much
damage. its done", then "archive that whole thing we did. only leave in
claidors repo the complete fork of rakazo."

**Where it is.** In this branch's history, not in the working tree. The last
state is commit `4118ac0f`, and the work is the 56 commits in
`34325164..4118ac0f`. To read it: `git show 4118ac0f:<path>`, or
`git checkout 4118ac0f` in a worktree. An annotated tag `caisra-final` points
at it locally; it is **not** on the remote, because this session's credentials
are refused on `refs/tags/*` with HTTP 403 — the branch carries the history
either way, so nothing is lost, but anyone with push rights should run
`git push origin caisra-final` so the name survives the container.

**What it was.** `rakazo/apps/caisra` (5,693 lines: the founder's design as a
working shell — dock, floating frame, thread, compose, apps, settings,
computer, onboarding), twelve `caisra-*` modules under `packages/core/src`
(layout, settings, compose, onboarding, thread, cards, files, routines, live),
a metered-proxy model provider and account adapter under `packages/adapters`,
and the `answer_card` block kind in their contract.

**What was removed to get back to the fork.** 145 files of ours deleted, and
nine of their files restored to the subtree merge. The fork is now
byte-identical to `34325164`.

**What was kept, on purpose.** `docs/product/caisra-build-map.md` and
`docs/product/what-exists.md` are the documents of record. The first is the
audit the founder asked for — what Rakazo ships, module by module, and every
place I rebuilt logic they already had. The second is the inventory of
`desktop/src`. Both outlive the code they describe.

Do not extend it, and do not restore parts of it into `rakazo/` on a hunch.
Answer questions about it from those two documents and from
`git show 4118ac0f`, never from memory.

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
