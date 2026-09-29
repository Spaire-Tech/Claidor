# What the server does for the app, part 1

This page covers four things the server at `api.simeonlabs.com` does for the
Simeon app on the Mac: sign-in, the model proxy with its prices and spend
limits, memory sync, and the cloud computer.

Server code lives in `server/simeon/` (the Python package is `simeon`). App code
lives in `desktop/source/`.

**Settings on Render.** Every server setting is read as `SIMEON_<NAME>`. The
older `CLAIDOR_<NAME>` is still read when the `SIMEON_` name is not set
(`server/simeon/config.py`). This page always uses the `SIMEON_` form. Settings
that are durations (for example `SIMEON_BOX_IDLE_HIBERNATE_AFTER`) are written
as ISO 8601, such as `PT30M`.

**Logs.** Server log lines are structured events such as
`desktop.proxy.upstream_refused`. Inside the person's computer (the box), the
host writes one line per event to `/tmp/sand-host.log`. Every such line starts
with `[simeon]` (`desktop/source/shared/host-log.ts`).

---

## 1. Sign-in

**What it does for the person.** The person clicks sign in, confirms in the
browser, and the app is signed in to their Simeon account. After that the app
stays signed in by itself until the person signs out.

### How it works

The app calls three routes. They sit at the **root** of the API host, not under
`/desktop`, because the app builds each URL with a leading slash
(`server/simeon/desktop/app_sign_in.py`):

| Route | What it does |
|---|---|
| `GET /loginDeepControl?challenge=…&uuid=…` | The browser page. With no web session it redirects to `/login?return_to=…` on the web app (`app.simeonlabs.com`). With a session it shows a confirm page naming the account. |
| `POST /loginDeepControl` | The confirm form. Same-origin only. Records the pending sign-in; nothing is written before this post. |
| `POST /auth/poll` (body `{uuid, verifier}`) | The app polls here. `404` means "not yet"; `200` returns `{accessToken, refreshToken}` once. `GET /auth/poll` with query parameters is still served for older builds. |
| `POST /oauth/token` (`grant_type=refresh_token`) | The refresh. Returns a new pair. A spent or expired refresh token gets `200` with `shouldLogout: true`; only a malformed request gets `400`. |

The challenge is `base64url(sha256(verifier))`. The server recomputes it from
the verifier the app sends, so only the app that started the sign-in can
finish it. The app sends the verifier in a POST body so it never lands in an
access log.

**The access-token envelope.** The app reads `sub`, `email` and `exp` from its
access token. If it cannot read `exp`, it refreshes before every call. So the
server wraps the real, opaque access token in a signed JWT
(`envelope_access_token` in `server/simeon/desktop/service.py`). The prefix stays
on the outside. When a request comes in, `authenticate` unwraps the envelope
and looks the inner token up by its hash in `desktop_sessions`. There is still
only one way to check a desktop credential.

**Token prefixes** (`server/simeon/desktop/tokens.py`):

| Token | Prefix now | Older prefix still accepted |
|---|---|---|
| Sign-in code | `simeon_dc_` | |
| Access token | `simeon_da_` | `claidor_da_` |
| Refresh token | `simeon_dr_` | |
| Box renewal credential | `simeon_db_` | `claidor_db_` |

Older tokens stay valid because a token is found by the hash of the whole
string.

**Lifetimes** (`server/simeon/config.py`):

- Access token: 1 hour (`SIMEON_DESKTOP_ACCESS_TOKEN_TTL`).
- Refresh token: 30 days (`SIMEON_DESKTOP_REFRESH_TOKEN_TTL`).
- Sign-in code: 5 minutes (`SIMEON_DESKTOP_AUTH_CODE_TTL`).

**Refresh grace.** A refresh kills the old refresh token at once. The old
access token stays good for up to `SIMEON_DESKTOP_REFRESH_GRACE` (5 minutes),
so a copy of it held elsewhere does not fail right after a refresh.

**Sign-out.** The app posts `POST /desktop/api/auth/logout`. The server revokes
the session, the box credentials that belong to it, and any access token of
that person still inside its refresh grace. A box credential or a cloud job's
token cannot sign anyone out.

**Rate limits** (`server/simeon/rate_limit.py`):

- `/loginDeepControl`: 20 a minute, 100 an hour.
- `/auth/poll`: 120 a minute.
- `/oauth/token`: 30 a minute.

**The person's name.** When the person signs in with Google, the server keeps
their Google name in `user.meta` (`server/simeon/integrations/google/service.py`).
`GET /desktop/api/user/profile` returns it as `name`.

### Settings on Render

- `SIMEON_BASE_URL` (`https://api.simeonlabs.com`)
- `SIMEON_FRONTEND_BASE_URL` (`https://app.simeonlabs.com`, where `/login` lives)
- `SIMEON_SECRET` (signs the envelope and keys the token hashes)
- The durations above, only to change the defaults.

### In the app

The packaged app points sign-in at `https://api.simeonlabs.com` through
`SIMEON_API_BASE_URL`, `SIMEON_WEBSITE_URL` and `SAND_BACKEND_URL`
(`desktop/scripts/lib/config.mjs`). `SAND_BACKEND_URL` alone is not enough:
the login and poll URLs come from the first two.

### When it misbehaves

- A sign-in that never completes: the app keeps getting `404` from
  `/auth/poll`. Check that the confirm form was posted from the same origin.
- A person signed out without asking: `/oauth/token` answered `shouldLogout`
  (the refresh token was spent, expired or revoked).

**Not yet verified:** a full sign-in round trip from the packaged app against
`api.simeonlabs.com`, and the refresh grace in use on a Mac.

---

## 2. The model proxy, model roles, prices and spend guards

**What it does for the person.** Every model call the agent makes goes through
Simeon's server, on Simeon's provider keys. The person never needs an API key.
Usage counts against a monthly allowance, and limits stop a runaway agent
before it spends much.

### Routes

All are under `/desktop` (`server/simeon/desktop/endpoints.py`,
`server/simeon/desktop/capabilities.py`):

| Route | Wire |
|---|---|
| `POST /desktop/api/proxy/v1/responses` | OpenAI Responses. This is the one the agent uses. Reasoning and tools travel together here. |
| `POST /desktop/api/proxy/v1/chat/completions` | OpenAI Chat Completions, for general OpenAI-compatible clients. |
| `POST /desktop/api/proxy/v1/messages` | Anthropic Messages. |
| `POST /desktop/api/proxy/v1beta/models/{model}:streamGenerateContent` | Gemini, for the video subagents. |
| `POST /desktop/api/proxy/v1/web/search` | One web search. `{query}` in, `{answer, documents}` out. |
| `POST /desktop/api/proxy/v1/images/generations` | Image generation. |
| `POST /desktop/api/proxy/v1/audio/transcriptions` | Speech to text. |
| `POST /desktop/api/proxy/v1/audio/speech` | Text to speech. |
| `GET /desktop/api/models/available` | The models offered to the app. |
| `GET /desktop/api/models/pricing-catalog` | Their prices. |
| `GET /desktop/api/user/quota` | The person's usage, for the Usage tab. |

The body goes through to the provider untouched. The usage the provider
reports is converted to credits and stored as a `desktop_usage` row.

### Model roles and prices

The catalogue is `MODELS` in `server/simeon/desktop/pricing.py`. One credit is
one input token at $3.00 per million.

| Model id | Role | Price per million tokens |
|---|---|---|
| `gpt-6-sol` | `primary`: the agent loop, every reply the person reads | $2.00 in, $0.20 cached, $10.00 out |
| `gpt-6-luna` | `cheap`: subagents, summaries, memory, computer and browser use | $0.10 in, $0.01 cached, $0.50 out |
| `claude-sonnet-5` | `fallback`: only when the primary's provider is down | $3.00 in |
| `gemini-2.5-flash` | `video`: the watch-video subagents | $0.30 in (to confirm) |
| `gpt-5.6-terra`, `gpt-5.6-luna` | `retired`: still served to older app builds, never offered | $2.00 / $0.20 in |
| `gpt-6-astra`, `claude-opus-5`, `claude-haiku-4-5-20251001`, `gemini-2.5-pro` | no role: priced, not offered | |

`/desktop/api/models/available` lists only models that have a role, are not
retired, and whose provider has a key on the server. The app's model menu keeps
only the `primary` row, so there is nothing for the person to choose
(`desktop/source/electron-main/models/simeon-model-catalog.ts`). The proxy
refuses any model with no role: "This model is not offered by the desktop app."

**Effort.** The app sends reasoning effort by role: `high` for the agent loop
and `low` for the cheap roles
(`desktop/source/host/extensions/inference/provider-session.ts`).

**Older model ids.** If the server does not offer `gpt-6-sol` or `gpt-6-luna`
yet, the app retries the step on the model it replaced (`gpt-5.6-terra` or
`gpt-5.6-luna`, `LEGACY_SIMEON_MODELS`) and writes a `[simeon] model-legacy`
line. This means the server and the app can be deployed in either order.

### Capabilities

| Capability | Model | Price |
|---|---|---|
| Web search | `gpt-5.6-luna` with OpenAI's hosted `web_search` tool, one non-streaming call | tokens, plus $0.01 per search |
| Images | `gpt-image-1` | $5 text in, $10 image in, $40 image out, per million tokens |
| Transcription | `gpt-4o-mini-transcribe` | $0.003 per minute of audio; 25 MB upload limit |
| Speech | `gpt-4o-mini-tts`, voice `alloy` | $15 per million characters; 4,000 characters a call |

### Spend guards

On the server, every metered route checks two limits before calling a provider
(`budget_refusal` in `server/simeon/desktop/proxy_common.py`):

- **Monthly allowance:** `SIMEON_DESKTOP_MONTHLY_CREDITS` (3,000,000). Over it,
  the route answers `402` with code `40200`.
- **Hourly cap:** `SIMEON_DESKTOP_HOURLY_CREDITS` (200,000 over a sliding hour).
  Over it, the route answers `402` with code `40201`: "Hourly spending budget
  reached … The agent stops here; it can continue as the hour passes."

In the app, a turn has a limit on how many model calls it may make
(`desktop/source/shared/inference/turn-step-budget.ts`):

| Turn | Limit | Switch |
|---|---|---|
| A turn the person asked for | 5,000 calls | `SAND_AGENT_MAX_STEPS` |
| The first message, a routine | 5,000 calls (`fullStepBudget`) | `SAND_AGENT_MAX_STEPS` |
| Any other hidden turn (reply nudges, wake-ups, memory extraction) | 40 calls | `SAND_HIDDEN_TURN_MAX_STEPS` |

**Stopping the box on quit.** This applies only to the Docker box on the Mac,
which is a testing path (`SAND_BOX_RUNTIME=local-docker`). When Simeon quits,
it asks the box whether any routine is enabled. If none is, it stops the box.
If one is, it keeps the box running. `SAND_STOP_BOX_ON_QUIT=1` always stops the
box and `SAND_KEEP_BOX_RUNNING_ON_QUIT=1` always keeps it running
(`desktop/source/electron-main/box/local-docker-host-connector.ts`).

### Settings on Render

- `SIMEON_OPENAI_API_KEY`: the OpenAI key. Without it, no OpenAI model is offered.
- `ANTHROPIC_API_KEY` (or `SIMEON_ANTHROPIC_API_KEY`): Claude, for the fallback.
- `SIMEON_GEMINI_API_KEY`: Gemini, for the video role.
- `SIMEON_DESKTOP_MONTHLY_CREDITS`, `SIMEON_DESKTOP_HOURLY_CREDITS`: only to
  change the defaults.

### In the app

- `SAND_SIMEON_REASONING_EFFORT`, `SAND_SIMEON_CHEAP_REASONING_EFFORT`:
  override the effort (`none`, `low`, `medium`, `high`, `xhigh`, `max`).
- `SAND_AGENT_MAX_STEPS`, `SAND_HIDDEN_TURN_MAX_STEPS`: the step limits.

### When it misbehaves

- On the server, read `desktop.proxy.upstream_refused` first. It holds the
  provider's own sentence explaining the refusal. Also check
  `desktop.proxy.upstream_unreachable` and `desktop.proxy.usage_not_recorded`,
  and for capabilities `desktop.search.*`, `desktop.images.*`,
  `desktop.transcription.*`, `desktop.speech.*` and `desktop.video.generate`.
- In the box, each model call writes a `[simeon] model=… effort=… input=…
  cached=… output=… tools=… offered=…` line. A failed call writes
  `[simeon] model-error`. A switch to the cheap model after a rate limit writes
  `[simeon] model-fallback`.

**Not yet verified:** GPT-6 Sol and Luna have not run against OpenAI. The
spend guards have not run on a Mac. The Gemini prices are marked "to confirm"
in the code.

---

## 3. Memory sync

**What it does for the person.** What the agents learn about the person is
kept on Simeon's server as well as in their computer. A new computer receives
the whole memory, and changes made in one place reach the other.

### How it works

Routes, under `/desktop` (`server/simeon/desktop/endpoints.py`):

- `POST /desktop/api/memory/sync`: the client sends the files it has changed,
  each with the version it last saw (`base_version`), plus any names it
  deleted. The server merges them and answers with every file it holds, plus
  the tombstones for deleted files.
- `GET /desktop/api/memory`: lists what the server holds (name, version,
  size) without the text.

Both routes take either a signed-in desktop or the box's own credential
(`get_desktop_or_box_session`).

The server is the only side that merges (`server/simeon/desktop/memory_merge.py`).
The rule depends on the kind of file:

- **Fact files** (`agents/<id>/memory/profile.md`, the monthly `log/YYYY-MM.md` files,
  and the `user-memory/` and `projects/` shards). Each line is
  `- (YYYY-MM-DD) <fact>`. Two lines are the same fact when their ids match,
  using the app's own `memoryIdFor`: the first 16 hex digits of the sha1 of the
  normalised text. The date is not part of the id. The merge keeps the server's
  lines in order, then adds the client's new ones.
- **`MEMORY.md`**: a list, merged by markdown bullet.
- **Daily notes**: merged line by line.
- **`USER.md`**: a document. The newer text wins whole.

Limits (`server/simeon/desktop/service.py`): 1 MB per file, 8 MB per request,
2,000 files per person. Tombstones are kept for 90 days. A refused sync
answers code `40001` with a sentence.

**The client** is the host extension `desktop/source/host/extensions/memory-sync/`,
which runs in the box:

- When the box starts, it lists what the server holds, then runs one round
  that pushes local files and pulls everything.
- It then watches `agents/`, `user-memory/` and `projects/`. After a change it
  waits 5 seconds and sends only what changed, with base versions.
- It authenticates with the box's own access token, the same token the model
  proxy takes.
- It keeps its state in `<sand root>/.memory-sync/state.json`.

### Settings on Render

None beyond sign-in.

### In the app

`SAND_MEMORY_SYNC=0` switches the client off.

### When it misbehaves

Read the `[simeon] memory-sync` lines in `/tmp/sand-host.log`. Each round writes
one line: `pushed=… pulled=… deleted=… held=…`, or `refused <sentence>`,
`failed <reason>`, or `skipped: no credential`. At start, a
`memory-sync server holds N file(s)` line says what the server has.

**Not yet verified:** memory sync has not run on a Mac.

---

## 4. The cloud computer

**What it does for the person.** Each person gets their own computer in the
cloud, where their agents run, work, and keep their files. It is the only
runtime for real users. It sleeps when nobody uses it and wakes when needed.

### How it works

**The broker.** The app speaks Connect RPC to `aiserver.v1.GrokBotService` at
the root of the API host (`server/simeon/sand/box_broker.py`). Its methods are
`EnsureSandBox`, `RecreateSandBox`, `ForceRecreateSandBox`,
`WatchSandBoxMigration` and `GetSandBoxRunState`. The logic is in
`server/simeon/sand/box_service.py`, and `server/simeon/sand/box_hosts.py` talks
to Docker Engine over its HTTP API with TLS client certificates.

`EnsureSandBox` finds the person's box, starts it if it is stopped, and
creates it if it does not exist. It replaces the container, keeping the same
volumes, in any of these cases:

- the container is gone,
- its credential died with a sign-out,
- it runs a host program other than the current bundle,
- it runs an image other than the pinned one.

A box that is busy keeps its current program until the app next connects to
it while it is idle (`sand.box.update_deferred`).

Each box has two volumes: `/workspace` and `/home/box/sand-data`.

**The proxy.** The API forwards the box's ports at `/sand-box/{box_id}/p/{port}/…`,
for both HTTP and WebSocket (`server/simeon/sand/box_proxy.py`). The ports are
1340 (gateway), 6080 and 6081 (screens) and 8790 (egress tunnel). A request
passes only with the box's network token, sent as the `network_token` query
parameter or the `x-anyrun-network-token` header. Inside the box, the host runs
the same token check in front of the screen stream
(`desktop/source/host/box-stream-guard.ts`).

**Placement across several servers.** `SIMEON_BOX_HOSTS` lists the box servers
as JSON:

```
[{"name": "docker", "docker_host": "tcp://box1.simeonlabs.com:2376", "accepting": false},
 {"name": "us-west-1", "docker_host": "tcp://box2.simeonlabs.com:2376", "max_running": 3}]
```

- A new computer goes to the accepting server with the largest share of its
  limit free, and stays there, because its volumes live on that server.
- `"accepting": false` drains a server: it keeps its computers and takes no
  new ones.
- The first server must keep the name `"docker"`.
- If the list is empty, the one server at `SIMEON_BOX_DOCKER_HOST` is used,
  under the name `"docker"`.
- If a computer's server is removed from the list, the person gets a new,
  empty computer somewhere else.

All servers share one CA, so one client certificate opens every one of them.

**Capacity and sleep.**

- **Size.** Each box is capped at `SIMEON_BOX_MEMORY_LIMIT_MB` (4096, no swap
  beyond it) and `SIMEON_BOX_CPU_LIMIT` (2.0).
- **Capacity.** At most `SIMEON_BOX_MAX_RUNNING` (3) boxes are awake at once
  per server; a server entry may set its own `max_running`. One more is
  refused with the `SAND_BOX_BLOCKED` hold and `retry-after: 60`, and the app
  waits and asks again.
- **Sleep.** The worker job `sand.box.hibernate_idle` runs every minute
  (`server/simeon/sand/box_tasks.py`). It asks each running box's `/health`:
  - A box that is busy stays awake. A box that is only waiting on the person's
    approval can still sleep.
  - So does a box the app is attached to through the proxy, tracked by a Redis
    key that lasts 180 seconds.
  - Any other box idle for `SIMEON_BOX_IDLE_HIBERNATE_AFTER` (30 minutes) is
    stopped with its files kept, and the app shows it as sleeping.
- **Wake.** `EnsureSandBox` wakes a sleeping box. So does `sand.box.wake`,
  which is queued whenever the server publishes something for the box, such
  as a routine's fire or a shared room's turn. A wake refused for capacity is
  retried every minute for an hour.

**The pinned image.** The box image is `SIMEON_BOX_IMAGE` pinned by
`SIMEON_BOX_IMAGE_DIGEST` (default `322c3a90…c0c1c8`). That build's supervisor
starts `/home/box/sand-host/host-main.cjs`, which is where the host bundle is
mounted. A box on any other image is replaced. Move the pin only after
checking which path a new build's supervisor starts.

**The host bundle channel.**

- `SIMEON_BOX_HOST_BUNDLE_URL` names either a folder or a single `.tgz`.
- A folder holds `sand-host-bundle-latest.version` (a commit id) and
  `sand-host-bundle-<commit>.tgz`.
- The server reads the version file at most every 10 minutes, with no restart
  needed.
- Each bundle is written once to `/var/lib/simeon/box-host/<key>/` on each
  server. It is mounted read-only over `/home/box/sand-host/host-main.cjs` and
  `/home/box/box-exec-daemon`, and the container is labelled with the host
  program's sha256.
- A URL ending in `.tgz` names one fixed file.
- On a Mac, `npm run publish:host-bundle` in `desktop/` publishes the packaged
  app's host in this layout.

**The box's renewal credential.** When it creates a box, the broker mints a
`simeon_db_` credential (`issue_box_credential`). This is a child row of the
person's desktop session, revoked when they sign out and moved to the new
session on each refresh. It is passed to the box as
`SAND_INFERENCE_RENEWAL_CREDENTIAL`.

The box trades it for a fresh one-hour access token at
`POST /sand-box/inference-credential`, at the root of the API host. This works
without the Mac.

The credential reaches the model proxy, the profile route and the memory
routes. Other desktop routes refuse it. A refresh never accepts it.

**Several API workers.** The proxy keeps its "attached" marks in Redis, and
the migration log that `WatchSandBoxMigration` streams is also in Redis, so
more than one API process can serve boxes.

### Settings on Render

Put these in the environment group that both the API and the worker read,
because the worker runs the sleeper and the wake. Full steps are in
`docs/ops/box-host/render-env.md`.

| Setting | Value |
|---|---|
| `SIMEON_BOX_HOST_PROVIDER` | `docker` (empty: the broker answers "Simeon's cloud computer needs a host; set SIMEON_BOX_HOST_PROVIDER") |
| `SIMEON_BOX_HOSTS` | the JSON list above, or leave it empty and set `SIMEON_BOX_DOCKER_HOST` |
| `SIMEON_BOX_DOCKER_TLS_CA`, `_CERT`, `_KEY` | paths to the secret files, e.g. `/etc/secrets/ca.pem` |
| `SIMEON_BOX_HOST_BUNDLE_URL` | the public HTTPS folder of host bundles |
| `SIMEON_BOX_IMAGE`, `SIMEON_BOX_IMAGE_DIGEST` | defaults; change only with a checked image |
| `SIMEON_BOX_IDLE_HIBERNATE_AFTER` | `PT30M`; `PT0S` never sleeps |
| `SIMEON_BOX_MEMORY_LIMIT_MB`, `SIMEON_BOX_CPU_LIMIT` | `4096`, `2.0`; `0` means no limit |
| `SIMEON_BOX_MAX_RUNNING` | `3`; `0` means no limit |

Leave `SIMEON_BOX_HOST_ADDRESS` and `SIMEON_BOX_PUBLIC_URL_TEMPLATE` empty so
the API proxies the ports itself.

### In the app

The runtime is the cloud (`remote`) unless `SAND_BOX_RUNTIME=local-docker`,
which selects the Docker box on the Mac for testing only. A value saved in
settings is not read (`desktop/source/shared/box-runtime.ts`).

### When it misbehaves

- On the API:
  - `sand.box.ensure` shows the box, server, `created` and `ready`.
  - `sand.box.ensure.refused` says what is missing.
  - `sand.box.ensure.recreate` gives the reason with `stale_host` or
    `stale_image`.
  - `sand.box.update_deferred` means a new version is waiting for the box to
    be idle.
  - `sand.box.capacity.refused` and `sand.box.placed` cover placement.
  - `sand.box.proxy.refused` and `sand.box.proxy.unreachable` cover the proxy.
- For the bundle: `sand.box.bundle.version` shows a new version was read, and
  `sand.box.bundle.pointer_unread` shows the version file could not be read.
- On the worker: `sand.box.hibernated`, `sand.box.sleeper`,
  `sand.box.sleep.failed`, `sand.box.woken`, `sand.box.wake.deferred`.
- In the box, `/tmp/sand-host.log`:
  - `[simeon] box-stream guarded on …` shows the stream guard is up.
  - `inference credential renewed with the box's own credential` shows the
    renewal worked.
- On the server machine, `docker ps` shows the container.

**Not yet verified:** the cloud computer has been tested against two real
Docker Engines, but has not run in the packaged app on a Mac. Sleep and wake
have not run against the production VM.
