# What Cursor's server did, what we already have, and what is actually missing (25 September 2026)

The founder's instruction, verbatim: "I don't want us to treat these as
features we need to rebuild from scratch when we already have the
reconstructed app-side implementation. For each one, I want us to first
preserve and use everything we already have, then only build the missing
server contract that the existing code actually expects." So this record
answers five questions per feature, in the founder's order:

1. What Cursor-owned service we cannot use
2. What existing Caisra code we already have
3. The exact server endpoints/contracts that code expects
4. What is genuinely missing
5. Whether the missing piece is just wiring/backend replacement or actually new product functionality

Every route, field and file below was read from the tree by five
read-only mappers on 25 September; nothing is from memory. Paths are under
`desktop/source/` unless they start with `server/` or `docs/`. "Connect"
means Connect RPC over HTTP/1.1, JSON, `POST {SAND_BACKEND_URL}/<service>/<Method>`
with the headers `createSandBackendTransport` adds (`authorization: Bearer`,
`x-cursor-checksum`, `x-cursor-client-type: sand`, `x-cursor-client-version`,
`x-sand-box-namespace`, `x-ghost-mode`, `x-request-id`;
`shared/node/cursor-backend/cursor-inference.ts:134-156`). Every Connect
client in the tree is built by `createSandCursorBackendClient`, which answers
`Unimplemented` without sending anything unless `SAND_CONNECT_SERVED=1`
(`shared/cloud-agents-availability.ts`). That one switch is global: it
cannot turn on one Connect service without the others.

## The one-line verdicts

| Feature | Client we have | Server work | Kind |
|---|---|---|---|
| Event routines (listeners) | complete | five JSON routes + one SSE stream + workflow store + cron + Slack/GitHub apps | **backend replacement** (plus app registrations at Slack/GitHub) |
| Messaging channels (Discord, Slack, Teams, …) | complete, minus one module | none on the server; a connector module in the box | **wiring** (a missing client module) |
| Cloud agents | complete | a Connect server for 17 RPCs and a coding executor | client: backend replacement; server: **mostly new** (maty covers 4 of 16) |
| Memory sync | app side never existed | routes exist but were built for a different layout | ~~new product work~~ **served, 25 September 2026**: the routes and their merge were reused, their names widened to the app's tree, and the client built (`memory-sync-served.md`) |
| Cloud computer | complete | a broker, a network path, a VNC path, hosting | **backend replacement**, hosting is the new product decision |
| Watching videos | mostly complete | a Gemini provider on the proxy; three desktop wires | **backend replacement** |
| Publishing a skill to a team | complete | a team plugin registry | **new**, but small if scoped to "my account" |
| Sharing (cross-user rooms) | complete | a multi-user relay — **served since 25 September 2026** (`polar/sand/sharing.py`, `sharing-served.md`) | **new product functionality**, built |

One bug came out of the box mapping and is fixed in this commit:
`createRemoteHostConnector` dropped `issueBoxRenewalCredential` when a
descriptor fast path was passed, and both production call sites pass one, so
the box's own renewal credential (the 25 September routine work) was never
minted (§5.4).

---

## 1. Event routines (listeners): Slack, GitHub, Teams, Linear, Sentry, PagerDuty

### 1. What Cursor-owned service we cannot use

Cursor's listener relay on `api2.cursor.sh` (the `/sand/*` JSON routes
below), its `aiserver.v1.AutomationsService` and `DashboardService` RPCs,
and Cursor's own Slack app and GitHub App, which is what the relay's events
come from. `SAND_LISTENER_RELAY_SERVED=1` restores the app's calls to all of
it; the variable is not forwarded into the Docker box by
`localDockerInferenceEnvironmentArguments`, so today it changes nothing.

### 2. What existing Caisra code we already have

Complete, in the host: the automations extension (`host/extensions/automations/`),
`backend-relay-source.ts` (the poller), the fire consumer, cloud sync and
trigger (`automation-cloud-sync.ts`, `automation-cloud-trigger.ts`), the
trigger hub, the connect watcher and its cards, and the notify bus
(`shared/node/notify-bus/`). The renderer draws the routine editor and the
listener rows from the pinned chunk. Cron routines already fire from the box
(CLAUDE.md, 25 September); only the event sources are missing.

### 3. The exact server endpoints/contracts that code expects

All at the **root** of `SAND_BACKEND_URL` (built with a leading slash), JSON,
`Authorization: Bearer <desktop token>`:

| Route | Request | Response | Cadence |
|---|---|---|---|
| `POST /sand/listener-subscriptions` | `{slackChannels: string[], githubRepos: string[], githubKinds: string[]}` | `{slack: {status, teams: [{channels: [{input, isBotMember}]}], unresolvedChannels: []}, github: {status, repos: [{repo, isSubscribed, detail?}]}}` | every 5 min, and on change |
| `POST /sand/listener-events/poll` | `{ackIds: string[]}` | `{events: [...]}` (Slack: team, channel, user, text, ts, thread_ts; GitHub: repo, kind, number, title, url, actor) | every 4 s |
| `POST /sand/automation-events/poll` | `{ackRunUuids: string[]}` | `{events: [{id, sandAgentId, automationId, timestampMs, definitionRevision?, scheduledForMs?, event?}], nextPollAfterMs}` | every 15 s |
| `POST /sand/automation-runs/complete` | `{runUuid, status, errorMessage?}` | `{}` | per run |
| `GET /sand/notify` | SSE | `{"kind":"connected"}`, then `{"kind":"notify","topic":...}`; heartbeat within 35 s | one stream; gated by `sand_notify_bus` |

Connect: `AutomationsService` `ListSandAutomations`, `CreateSandAutomation`,
`UpdateSandAutomation`, `DeleteSandAutomation` (a workflow shape with the
trigger kinds; the app stamps `description: "sand-shadow:<hash>"`), and
`DashboardService` `GetSlackUserSettings`, `GetScmConnectionStatus`,
`GetSlackInstallUrl`.

Fire rules the server has to honour: `automationId = stableAutomationId(agentId, localId)`;
a fired event's `definitionRevision` must equal the app's current revision
or the app drops it; six event payload shapes (Slack message, GitHub
issue/PR/comment, Teams, Linear, Sentry, PagerDuty) are read by
`automation-cloud-trigger.ts`.

### 4. What is genuinely missing

- On the server: the five routes and the stream, a workflow store, a fire
  queue with acks, a cron scheduler for the cloud copy (the box already runs
  cron locally), a notify publisher. `server/polar/desktop/` serves no
  `/sand/*` route today.
- App registrations: a Slack app whose bot is "@Simeon", a GitHub App, a
  Teams bot, and webhooks for Linear, Sentry and PagerDuty. The relay is
  only as real as those.
- Desktop wiring: forward `SAND_LISTENER_RELAY_SERVED` (and
  `SAND_CONNECT_SERVED`) into the box; a per-feature gate instead of the
  global Connect switch.

### 5. Wiring/backend replacement or new product functionality

**Backend replacement.** The client contract is fully specified by the
code and the app is finished. The server side is sizeable but has no
product decisions in it. One shortcut to weigh: Pipedream Connect, which
`polar/connectors/` already speaks, offers Slack and GitHub triggers, so the
relay could be a thin adapter over Pipedream events rather than our own
Slack and GitHub apps.

---

## 2. Messaging channels (Discord, Slack, Teams, WhatsApp, Telegram, Signal, iMessage)

### 1. What Cursor-owned service we cannot use

None. The design is bring-your-own bot token from the box:
`connector-secret-store.ts` has one field, "token", labelled "bot token"
for Discord and "app token" for Slack. No Cursor route is in this path.

### 2. What existing Caisra code we already have

Complete, in the host: outbound delivery via
`BackgroundWakes.deliverToChannel` → `tm.channelDelivery`; inbound via
`tm.wakeForInbound(agentId, envelope)`; the channel store; the gateway
commands `connectChannel`, `disconnectChannel`, `getAgentChannels`; the
secret-request route; and the brief's channels section. The renderer draws
the channel cards from the pinned chunk. Availability is a per-connector
flag: `CONNECTOR_MANIFESTS[].availability` in `shared/channels.ts`, set to
`"coming-soon"`.

### 3. The exact server endpoints/contracts that code expects

No server contract. The host expects an in-box module to call
`tm.setChannelDelivery(deliver)`, `tm.setChannelActivity(...)`,
`tm.setChannelConfigChanged(...)`, and to call `tm.wakeForInbound` with an
envelope when a message arrives. The hooks are on the transcript manager
and nothing in the tree registers against them.

### 4. What is genuinely missing

The connector runtime itself: a Discord Gateway WebSocket client and a
Slack Socket Mode client (Slack's needs an app token and a bot token; the
store has one field). Then flip the two manifests. Teams, WhatsApp,
Telegram, Signal and iMessage are further out (each is its own client
library and, for iMessage, a Mac-side bridge).

### 5. Wiring/backend replacement or new product functionality

**Wiring: a lost client module**, not a server. Discord and Slack are a few
days each against the hooks above. A hosted Simeon bot (one app we
register, so people do not paste tokens) would be new product functionality
and is not what the code was written for.

---

## 3. Cloud agents

### 1. What Cursor-owned service we cannot use

`aiserver.v1.BackgroundComposerService` (Cursor's cloud coding agents), plus
`DashboardService` and `AiService.AvailableModels`, over Connect on
`SAND_BACKEND_URL`; the cards link to `cursor.com/agents/<bcId>`.
`SAND_CLOUD_AGENTS_SERVED=1` restores the calls.

### 2. What existing Caisra code we already have

Complete: `host/cloud-agents/cloud-agent-tool.ts` (13 actions the agent can
take), `host/extensions/cloud-agents/` (manager, request composition, the
poll loop at 10 s for up to 5 h), the composition wiring, the `cursor-agent`
card, the renderer's `cloud-agent-provider.ts`, and the brief's sections.

### 3. The exact server endpoints/contracts that code expects

Seventeen Connect RPCs: `StartBackgroundComposerFromSnapshot`,
`GetBackgroundComposerInfo`, `ListBackgroundComposers`,
`AddAsyncFollowupBackgroundComposer`, `PauseBackgroundComposer`,
`RenameBackgroundComposer`, `ArchiveBackgroundComposer`,
`DeleteBackgroundComposer`, `ListBackgroundComposerArtifacts`,
`GetBackgroundComposerConversation`, `GetPullRequestMergeStatus`,
`GetOptimizedDiffDetails`, `GetEnvironment`, `ListEnvironments`,
`GetTeamAdminSettingsOrEmptyIfNotInTeam`, `GetTeams`, `AvailableModels`.
The fields each reads are in the generated protos under
`packages/proto/generated/aiserver/v1/` and in the manager's request
builders.

### 4. What is genuinely missing

A Connect server for those RPCs; a coding executor (clone a repo, run a
shell, commit, open a PR); a GitHub credential per person; a persistent
per-run conversation that takes follow-ups; mid-run cancel; per-run
metadata (name, archive); and our own page in place of `cursor.com/agents`.
The maty queue (`server/polar/maty/`, `runner/`) covers about four of the
sixteen: start, info, list, and pause before start. It is single-shot,
cannot be cancelled while running, and its executor on Render has no
Docker, which is why shell, web and browser are switched off in
`runner/src/engineConfig.ts`.

### 5. Wiring/backend replacement or new product functionality

**Client: backend replacement. Server: mostly new.** Keep the queue as the
lower layer (claim, lease, heartbeat, scoped tokens are the hard, tested
half) and put a box executor on it (`docs/product/box-substrate-read.md`);
the Connect surface is then a projection over jobs. A follow-up
conversation and a PR flow are product work that no existing code does.

---

## 4. Memory backed up to our server

### 1. What Cursor-owned service we cannot use

None. The app's memory was always local; no client in the tree calls a
memory route, Cursor's or ours.

### 2. What existing Caisra code we already have

The app side: markdown files under the sand root, per agent
(`agents/<id>/memory/profile.md`, `log/YYYY-MM.md`), per user
(`user-memory/`) and per project (`projects/<slug>/…`), fact lines of the
form `- (YYYY-MM-DD) <fact>` with an id that is the sha1 of the lowercase
content, monthly logs, and `.dreaming/` metadata. The hooks to sync from:
`WatchedDirectory.setOnChange` and `MemoryService.subscribe` (composition
around line 3061), the point after `runTurnMemory` in `turn-settle.ts`, and
a pull at start.

The server side (`server/polar/desktop/`): `POST /desktop/api/memory/sync`
and `GET /desktop/api/memory`, the `desktop_memory_files` table, and the
three-way merge in `memory_merge.py`.

### 3. The exact server endpoints/contracts that code expects

The app expects nothing; the server offers:

| Route | Request | Response |
|---|---|---|
| `POST /desktop/api/memory/sync` | `{files: [{name (≤200), content, base_version}]}` | `{files: [{name, content, version, changed}], deleted: []}`; 400 `{code: 40001, message}` on refusal |
| `GET /desktop/api/memory` | | `{files: [{name, version, size}]}` |

Accepted names: only `MEMORY.md`, `USER.md`, `memory/YYYY-MM-DD.md`. Auth
is `get_desktop_session` (refuses the box credential, accepts a job token).

### 4. What is genuinely missing

Both halves disagree: every app file name is refused by the server; the
server is flat per person, the app is per agent × scope; the server wants
daily logs, the app writes monthly; the server treats the profile as a
document to merge, the app as a list of facts; the app's fingerprint
includes the date; there are no tombstones; the box's own credential is
refused. So: an app client and a trigger, version state, a format and
scope adapter (or widened server names), merge fixes, a delete rule, a
write-back path, and a decision about which machine wins.

### 5. Wiring/backend replacement or new product functionality

**Corrected 25 September 2026, later the same day — it was a contract
widening plus a client, not new product work, and it is served.** The
verdict above ("new product work … 4–6 days … 8–12") counted both halves
as rebuilds. What was actually done (`docs/product/memory-sync-served.md`):
the server's routes, version dance, merge and table were kept as they
were; `memory_merge.py` accepts the app's tree (`agents/<id>/memory/
profile.md`, `log/YYYY-MM.md`, the `user-memory/` and `projects/` shards,
`projects/<slug>/project.md`) beside the runner's three names; a fourth
rule unions fact lines by the app's own `memoryIdFor`; `deleted: [names]`
on the request and tombstones fill the `deleted: []` the response always
carried; the box's credential is accepted on the two routes; and the
client is `host/extensions/memory-sync/`, on the hooks §2 named
(`WatchedDirectory`, `MemoryService.subscribe`, a pull at start). The
runner is untouched (`job.ts:48` already filtered the bundle to the names
it lays out). Not yet run on a Mac. The one thing §4 named that is still
true: "which machine wins" for a single fact deleted on one side and
appended on the other is the union, a known limit of a merge without base
text.

---

## 5. A computer in the cloud (the "remote" box runtime)

### 1. What Cursor-owned service we cannot use

`aiserver.v1.GrokBotService`, Cursor's box broker
(`packages/proto/generated/aiserver/v1/grok_bot_connect.ts`,
`sand_box_pb.ts`), and Cursor's "anyrun" pod proxy, which is where the
`x-anyrun-network-token` header and the `-<port>` hostname-label rewriting
come from. Of its 30 RPCs, 11 have callers in the tree.

### 2. What existing Caisra code we already have

Complete, on the Mac: `electron-main/box/box-host-connector.ts`
(`BrokeredHostConnector`: the broker call, error mapping, descriptor build,
recreate), `EnvDescriptorHostConnector` (any remote gateway through
`SAND_HOST_GATEWAY_URL`, `SAND_HOST_GATEWAY_TOKEN`,
`SAND_HOST_GATEWAY_NETWORK_TOKEN`, no broker, no VNC proxy, no recreate),
`gateway-descriptor-cache.ts` and `-store.ts` (encrypted, account-scoped,
7-day, stale-while-refresh), `node-agent-coordinator/gateway/box-vnc-proxy.ts`
and `electron-main/vnc/vnc-trust.ts` (loopback noVNC URLs rewritten to the
proxy, the network token injected), the egress tunnel
(`shared/node/egress-tunnel/*`, `box/egress-tunnel-wiring.ts`), and the
migration watcher. The reference implementation of the same contract is
`local-docker-host-connector.ts`: it runs the image
`public.ecr.aws/k0i0n2g5/cursorenvironments/universal:sand-box-latest`
with `SAND_SUPERVISOR_ENABLED=1`, `SAND_BOX_AUTO_UPDATE=0`,
`SAND_USE_EXISTING_BOX_EXEC_DAEMON=1`, `SAND_GATEWAY_BIND_HOST=0.0.0.0`,
`SAND_HOST_PORT=1340`, a random `SAND_GATEWAY_TOKEN`, `SAND_BACKEND_URL`,
`SAND_DEV_INFERENCE_TOKEN_FILE=/run/grok-bot/inference.json`, bind-mounts
`host-main.cjs` and `box-exec-daemon/`, and publishes 1340, 6080, 6081 on
loopback; it waits for `GET /health` and returns
`{baseUrl: "http://127.0.0.1:1340", token}`.

Complete, on the server: `POST /desktop/api/box/renewal-credential` (mint,
`{code: 0, data: {credential, expiresAtMs}}`) and
`POST /sand-box/inference-credential` (trade, `{credential}` →
`{accessToken, expiresAtMs}`, 401 `invalid_grant`). In the box:
`host/extensions/auth/credential-renewer.ts` renews from either
`SAND_INFERENCE_RENEWAL_CREDENTIAL` (the cloud path) or the token file's
`renewalCredential` (the local path).

### 3. The exact server endpoints/contracts that code expects

From the Mac, Connect on `GrokBotService`:

| RPC | Request | Response fields read |
|---|---|---|
| `EnsureSandBox` | `{}` | `gateway_url` (required), `gateway_token`, `network_token`, `vnc_url`, `fork_vnc_base_url` |
| `RecreateSandBox` | `preserve_data`, `force` | `started`, `reason`, `operation_id` |
| `ForceRecreateSandBox` | `{}` | same |
| `WatchSandBoxMigration` (stream) | `from_offset_key`, `include_finished: true` | `phase` (1–7), `detail`, `at_ms`, `offset_key`, `operation_id`; optional, recreate reports "started-untrackable" without it |

`EnsureSandBox` errors: header `x-automation-failure-hint` with
`CLOUD_AGENT_STORAGE_DISABLED`, `SAND_BOX_BLOCKED` (+ `retry-after`, an
`ErrorDetails` with `title`, `detail`, `additionalInfo.sandBoxBlockReason`)
or `SAND_CLIENT_UPDATE_REQUIRED`; a bare `Unauthenticated` or
`PermissionDenied` clears the cached descriptor. The descriptor built:
`{baseUrl: gateway_url, token: gateway_token, headers: {"x-anyrun-network-token": network_token}, vncProxy: {primaryUrl: vnc_url, forkBaseUrl: fork_vnc_base_url, networkToken}}`;
`vncProxy` only when all three are non-empty.

From inside the box (only with `SAND_CONNECT_SERVED=1`): `GetSandBoxRunState`
(reads `image_update_available`), `RecreateSandBox`,
`NotifySandAgentTurnFinished` (mobile push), and the six
`*SandBoxStore*` presign RPCs (Cursor's object-store persistence, off
unless `SAND_BOX_STORE_SYNC`).

Plain routes: `POST /sand-box/local-exec-daemon-credential` (`{}` →
`{credential, expiresAtMs?}`, not served, suppressed on local-docker) and
`POST /sand-box/local-exec-connection` (`{credential}` →
`{baseUrl, token?, networkToken?}`, not served).

Ports behind the gateway URL: 1340 (`/health`, `/api/*`, `/events` SSE,
`/avatars`, bearer `SAND_GATEWAY_TOKEN`), 6080/6081 (noVNC), 8790 (egress
tunnel WebSocket; when proxied, the first hostname label must end in
`-<digits>`, swapped for `-8790`, `box-connection.ts:17-35`). The VNC proxy
must serve `vnc.html` and `websockify`, accept the network token as a query
parameter and as the header, and tolerate `resume_lower_s` /
`resume_upper_s` (`packages/constants/sand-box.ts`).

### 4. What is genuinely missing

1. **A broker** that takes the desktop bearer, finds or creates the person's
   box on a cloud host with the same `docker run` as the local path
   (credential via `SAND_INFERENCE_RENEWAL_CREDENTIAL` in the env instead of
   the mounted file; the host bundle baked into the image or uploaded, since
   today it is a bind mount from the Mac), and answers `EnsureSandBox`,
   `RecreateSandBox`, `ForceRecreateSandBox`. Either as Connect at
   `/aiserver.v1.GrokBotService/*` with `SAND_CONNECT_SERVED=1` (no app
   change), or as one JSON route plus a small connector; either way the
   `SAND_HOST_GATEWAY_*` path already proves the app can drive a remote
   gateway.
2. **A network path** from the Mac to 1340, 6080, 6081 and 8790 over TLS:
   an authenticating reverse proxy checking `x-anyrun-network-token`, with
   per-port hostnames shaped `*-1340.` and `*-8790.` so the tunnel derivation
   works. Whether E2B's per-port hostnames fit the `-<digits>` rule is not
   established.
3. **A VNC path** as above.
4. **The credential fix**, done in this commit: `createRemoteHostConnector`
   (`box-host-connector.ts:172`) built a new object for the fast path and
   left out `issueBoxRenewalCredential`; both production call sites
   (`main-production-services.ts:648`, `adapters/coordinator-gateway.ts:49`)
   pass a fast path, so `local-docker-host-connector.ts:463` always saw
   `null`, logged "no box renewal credential" and minted nothing. The box
   outliving the app (25 September) never had a credential to renew with.
   `tests/routine-box-lifecycle.test.mjs` now builds the fast-path
   connector and checks the method is there.
5. Stays off in a first version, and the box already treats "not served" as
   normal: image-update checks, in-box recreate, mobile push, store sync.

### 5. Wiring/backend replacement or new product functionality

**Backend replacement**, end to end on the app side. The one new product
piece is the hosting itself: running, isolating, persisting and paying for
a box per person, and what quitting the app means for it. Maty is not a
broker and has no path to this; a routine on a cloud box is a new executor
for the runner, as `box-substrate-read.md` §2 decided.

---

## 6. Watching videos

### 1. What Cursor-owned service we cannot use

`agent.v1.AgentService/GetSignedUrlForAttachedMedia` (Connect; the media
store behind the `gemini_video_developer_api` gate, which the generated
config says uses "Cursor's Google AI Studio credential"), and Cursor's
`InferenceService` running a Gemini model with
`InferenceReason.GEMINI_VIDEO_SUBAGENT`. Our executor forces the provider
to `claidor`, so that path is dead.

### 2. What existing Caisra code we already have

Mostly complete: the subagent types `videoReview` and `watchVideo`
(`packages/agent/tools/core/subagent/subagent-config.ts`,
`isGeminiVideoSubagentType`); attachment preparation
(`task-subagent-preparation.ts`: MIME map for mp4, webm, mov, avi, mkv,
wmv, flv, m4v; trusted roots; 15 MB inline or signed, 1 GB for a video
subagent on Gemini); the task client and toolset plumbing
(`task-client.ts`, `turn-toolset.ts` ~1395,
`geminiVideoAttachedMediaUrlProvider`, `trustedVideoAttachmentRoots`); the
context part (`context-processing.ts` ~283: `{type: "image", image: <URL or data URI>, providerOptions: {cursor: {mimeType, videoFps}}}`,
fps 0.25–20); the host limit `VIDEO_BYTE_LIMIT = 200 MB`.

### 3. The exact server endpoints/contracts that code expects

- `GetSignedUrlForAttachedMedia`: request `conversation_id`, `key?`,
  `mime_type`, `content_length_bytes`; response `key`, `put_url`,
  `get_url`, `expires_at_unix_ms`, `refresh_after_unix_ms`. The client
  `PUT`s the bytes to `put_url` with `Content-Type`, then passes `get_url`
  as `SelectedVideo_SignedUrl{url, key, expiresAtUnixMs, refreshAfterUnixMs, conversationId}`; renewal calls the RPC again with `key`.
- A model whose id contains "gemini" (`isGeminiModelId`); the only Gemini
  id in the tree is `SAND_SUMMARIZATION_MODEL_ID = "gemini-2.5-flash"`.
- The inline alternative: a `data:<mime>;base64,…` URI up to 15 MB, no
  upload at all.

### 4. What is genuinely missing

- On the server: a Gemini provider on the proxy. `DesktopProvider` in
  `server/polar/desktop/pricing.py` has `anthropic` and `openai`; every
  model reports `supportsVideo: False`; `/api/models/available` returns
  `videoModels: []`; `polar/config.py` has no Google key; no media-upload
  route.
- On the desktop: `resolveSubagentConfigs` (`host-runner-composition.ts`
  ~2644) registers computerUse, browserUse and executor only, so a
  `watchVideo` ask is refused; the `claidor` executor's `toCoreMessages`
  drops `providerOptions.cursor.mimeType` and `videoFps`; and the brief
  says "You can't watch videos yet".

### 5. Wiring/backend replacement or new product functionality

**Backend replacement.** Add Gemini to the proxy (provider, key, price rows,
a route the engine can speak with video parts intact), register the video
subagent pinned to it, carry the two provider options, and delete the
brief's sentence. The inline data-URI path removes the need for a media
store for files up to 15 MB; the signed-URL route is only for the large
files.

---

## 7. Publishing a skill to a team

### 1. What Cursor-owned service we cannot use

`aiserver.v1.DashboardService` (`GetTeams`, `PublishPlugin`,
`UnpublishPlugin`, `GetEffectiveUserPlugins`, `GetMe`) and the git-hosted
team plugin marketplace behind it. Ledger F-157.

### 2. What existing Caisra code we already have

Complete: `host/extensions/mcp/skill-publish.ts` (`SandSkillPublishService`:
`listTargets`, `publish` stages the skill, packs a tar.gz, confirms with up
to five sync passes on `pluginId` and `pluginVersion === commitSha`, moves
the skill out of the local library; `resync`; `unpublish`),
`plugin-skills.ts` (install and sync: `GetEffectiveUserPlugins` + `GetMe`,
then clone by `git_url`/`git_ref`/`git_path` or read
`inline_content_json`), the wiring in `mcp/production.ts`, and the gateway
commands `publishSkill` / `unpublishSkill`.

### 3. The exact server endpoints/contracts that code expects

| RPC | Request | Response read | Timeout |
|---|---|---|---|
| `GetTeams` | `active_only` | `teams[].{id, name, isDirectMember}` (kept when `id > 0 && isDirectMember`) | 10 s |
| `PublishPlugin` | `team_id`, `name`, `display_name`, `description`, `plugin_tar_gz` (bytes), `commit_message?` | `plugin_id`, `marketplace_id`, `commit_sha` | 60 s |
| `UnpublishPlugin` | `plugin_id`, `team_id?`, `commit_message?` | `commit_sha` | |
| `GetEffectiveUserPlugins` | `use_replica`, `team_id`, `exclude_configured_variables` | `plugins[].{plugin: {id, name, display_name, description, git_url, git_ref, git_path, publisher.ownerUserId, marketplace.{teamId, git_url, allow_user_publish}}, is_team_required, is_enabled, pinned_git_ref, configured_variables, inline_content_json, install_mode}`, `marketplaces[]` | 15 s |
| `GetMe` | `team_id`, `source_site_hostname`, `include_mobile_app_status` | `userId` | 10 s |

The published plugin must come back from `GetEffectiveUserPlugins` with a
ref equal to `commit_sha` before the publish counts.

### 4. What is genuinely missing

A registry: storage for uploaded tar.gz files, plugin records, team
membership, and a way to serve plugin content back (as
`inline_content_json` or a git URL). Our `/api/skill-store` is a different
thing: a read-only, unauthenticated catalogue of Anthropic's Apache
skills (`server/polar/desktop/skill_store.py`) written for the LobsterAI
tree, and nothing in `desktop/source` calls it or `/api/kit-store`. There
is no team concept in `polar/desktop`.

### 5. Wiring/backend replacement or new product functionality

**New, served behind the existing contract.** Two sizes: a team registry
(teams, membership, uploads, listing; serve it as Connect `DashboardService`
so the client is untouched, or as JSON with a small client swap), or
"publish to my own account", which drops `GetTeams` and is a few days.

---

## 8. Sharing (a room with another person's agent)

### 1. What Cursor-owned service we cannot use

Cursor's `/sand/xuser` and `/sand/share-rooms` relay
(`backend/server/src/sand/handleSandShareEndpoints.ts` by the generated
config's own comment), gated by `sand_multiplayer`, with the optional
`/sand/notify` bus on topic `xuser-events`.

### 2. What existing Caisra code we already have

Complete: `host/extensions/cross-user-sharing/` (`extension.ts` with the
`SAND_SHARING_SERVED=1` switch, otherwise "Sharing is coming soon in
Simeon."; `xuser-sharing-service.ts`, `xuser-relay.ts`,
`xuser-state-reconcile.ts`, `xuser-remote-turns.ts`,
`xuser-wire-normalization.ts`; dedupe, pending-departure and tombstone
stores; `xuser-sharing-environment.ts`, which refuses the production
backend origin unless `SAND_XUSER_SHARING_ALLOW_PROD` is set), the room
projection in `transcript/shared-rooms.ts`, remote agent ids
(`sand-remote:<ownerAuthId>/<agentId>`), and nine gateway commands
(`createRoomFromAgent`, `createRoomInvite`, `joinSharedRoom`,
`respondToRoomJoinRequest`, `createSharedRoom`, `addOwnAgentToSharedRoom`,
`removeOwnAgentFromSharedRoom`, `setSharedRoomTyping`, `leaveSharedRoom`).
Local group chats work today and are unrelated (F-400).

### 3. The exact server endpoints/contracts that code expects

JSON `POST {backendUrl}<path>`, `Authorization: Bearer`; identity is the
JWT `sub`; 403 means not enabled, 429 rate-limited.

| Route | Request | Response |
|---|---|---|
| `/sand/xuser/poll` | `{ackIds}` | `{events: [{id, kind, …}]}`; every 4 s, 30 s back-off on error |
| `/sand/xuser/send` | `room-entry {roomId, entry}` · `turn-request {roomId, turnNonce, ownerAuthId, agentId, groupName, groupDescription, peers[], newMessages}` · `turn-result {roomId, turnNonce, agentId, messages[≤2]}` · `room-typing {roomId, isTyping}` | `{timestampMs?}` |
| `/sand/share-rooms/from-agent` | `{agentId, agentName, avatarDataUrl?}` | `{shareUrl, expiresAtMs, room: {roomId}}` |
| `/sand/share-rooms` | `{…args, agents}` | |
| `/sand/share-rooms/invite-links` | `{roomId}` | as `from-agent` |
| `/sand/share-rooms/join` | `{link}` | `{status: pending\|already-member\|invalid\|denied\|rate-limited, roomName?, room?}` |
| `/sand/share-rooms/join/respond` | `{requestId, …}` | |
| `/sand/share-rooms/agents/add` | `{roomId, agentId, agentName, avatarDataUrl?}` | `{room?}` |
| `/sand/share-rooms/agents/remove` | `{roomId, agentId}` | |
| `/sand/share-rooms/agents/remove-deleted` | `{agentId}` | |
| `/sand/share-rooms/picture` | `{roomId, avatarDataUrl}` | |
| `/sand/share-rooms/leave` | `{roomId, targetAuthId?}` | |
| `/sand/share-state` | `{}` | `{pendingJoinRequests: [], rooms: XuserRoom[]}` |

`XuserRoom = {roomId, name, hostAuthId, avatarDataUrl?, members: [{kind: "human"|"agent", authId, agentId?, displayName?, avatarDataUrl?}]}`.
Event kinds polled: `room-join-request`, `room-join-decision {isApproved, room}`,
`room-upsert {room}`, `room-typing`, `room-post`, `room-entry` (a mirror
`human-message` or `agent-message` with `entryId`, author fields, `text`,
`images[≤4] {base64, mediaType, alt?}`, `timestampMs`), `turn-request {roomId, turnNonce, agentId, hostAuthId}`,
`turn-result`, `member-left`, `room-ended`.

### 4. What is genuinely missing

Everything on the server: rooms, invite links with expiry, join approval,
per-person event queues with acks, fan-out of entries to members, and
brokering a turn on another person's agent (the host of the room asks the
owner's box to run a turn and waits for `turn-result`). `polar/desktop`
serves no `/sand/*` route. Then a decision on the production-origin refusal
in `xuser-sharing-environment.ts`.

### 5. Wiring/backend replacement or new product functionality

**New product functionality.** The client is done and needs one switch,
but the server is a multi-user relay with permission logic that exists in
no form today, and it cannot be got by extending the proxy.

**Built, 25 September 2026, later the same day.** `server/polar/sand/sharing.py`
serves every route in §3 with those field names (`sharing_service.py`,
four tables, invite links as signed tokens, the per-person queue acked by
id, fan-out on the `xuser-events` notify topic); the client's switch is on
by default and `sand_multiplayer` is on in Simeon's gate table. Two
corrections to §3 from building against it: `XuserRoom` also carries
`hostName` (read by `xuser-remote-turns.ts` and `shared-rooms.ts`), and a
human member must carry a non-empty `displayName` or the renderer refuses
the whole state. The production-origin refusal in
`xuser-sharing-environment.ts` now allows `api.simeonlabs.com` and keeps
refusing Cursor's origin. `docs/product/sharing-served.md` is the record,
with what is not yet run on a Mac.

---

## What to build first, by return on what already exists

1. **Channels (Discord, then Slack)**: days, no server, flips two manifests.
2. **Video**: a Gemini provider on the proxy plus three desktop wires.
3. **Listeners**: the largest pure backend replacement; consider Pipedream
   triggers before registering our own Slack and GitHub apps.
4. **Cloud computer**: the broker and the proxy, on the E2B decision
   already taken; the app is ready for it.
5. **Cloud agents**: after the cloud computer, since the executor is the
   same box.
6. **Skill publish** scoped to "my account"; **sharing** last, because it
   is product work rather than replacement. (**Memory sync** was listed
   here too and is served since later the same day, §4.5.)

Not measured on a Mac: anything above. The box renewal-credential fix is the
one thing in this commit that changes runtime behaviour; the line to read
after a connect is the absence of "no box renewal credential" in the Mac's
log and `renewalCredential` present in
`local-docker-credential/inference.json`.
