# What the server does for the app, part 2

This page covers the features where Simeon Labs' server (`server/`, Python package `simeon`,
at `https://api.simeonlabs.com`) works for the Simeon app (`desktop/`) beyond sign-in and the
model proxy: cloud agents, routines and listeners, sharing, messaging channels, video, skill
publish, connectors, a few agent features (avatars, group chats, auto-review, drafts), and
voice calls.

Conventions used below:

- **Settings on Render** are read as `SIMEON_<NAME>`. The older `CLAIDOR_<NAME>` is still read
  when the `SIMEON_` one is not set (`server/simeon/config.py`). Keys and secrets here are empty by
  default, and a path that needs a missing one answers with a sentence naming it.
- **App switches** are `SAND_*` environment variables read by the host program inside the
  agent's computer (the box). The on/off switches are on by default; `0` turns one off. The
  Mac forwards them only into a local Docker computer (`SERVED_SWITCH_ENVS` in
  `electron-main/box/local-docker-host-connector.ts`, used with `SAND_BOX_RUNTIME=local-docker`).
  A cloud computer gets none of them, so there they always keep their default.
- **Box log** is `/tmp/sand-host.log` inside the computer; host lines start with `[simeon]`
  (`shared/host-log.ts`). **Server log** is the API's log on Render.
- App paths are relative to `desktop/source/` unless they say otherwise.
- Most server features here are Connect RPC services or JSON routes mounted at the **root** of
  the API host by `server/simeon/sand/__init__.py`. The app's Connect transport sends JSON
  (`useBinaryFormat: false`); `simeon/sand/connect.py` reads only JSON.

## 1. Cloud agents

**For the person.** The agent can hand a task to a cloud agent that keeps running on Simeon
Labs' servers, check on it, reply to it, pause it and read its answer. Today a cloud agent
answers in words only: it does not check out code, run commands or open pull requests.

**How it works.**

- Server: `server/simeon/sand/cloud_agents.py` (Connect surface), `cloud_agents_service.py`,
  `cloud_agents_repository.py`. It serves `simeon.v1.CloudAgentService` (start, info,
  list, follow-up, pause, rename, archive, delete, artifacts, conversation, and empty
  pull-request and diff answers) and `simeon.v1.AiService/AvailableModels`.
- A cloud agent is a `sand_cloud_agents` row over one `MatyJob` per turn in the job queue
  (`server/simeon/maty/`). A follow-up on a finished turn is a continuation job with the whole
  conversation; on a running turn it waits and is queued when the turn settles. Pause calls off
  a queued job, or sets `cancel_requested` on a running one, which the runner reads from its
  heartbeat. There is one environment, `simeon-computer` ("Simeon's computer").
- Runner: `runner/` (Render service `claidor-maty-runner`) claims a job, lays out the person's
  memory, makes one model call over the conversation through the API's metered proxy on the
  job's token (`runner/src/engine.ts`), and writes the reply back as the turn's message. The
  call runs on the model the API names `primary` (`PersonClient.models` in `runner/src/api.ts`;
  until 2 October 2026 it took the catalogue's first row, the Claude fallback). Jobs
  go through the `Executor` seam in `runner/src/executor.ts`; the only executor today is
  `maty-runner`. The model cannot write files, so a cloud turn writes nothing back to memory.
- App: the CloudAgent tool (`host/cloud-agents/cloud-agent-tool.ts`), the manager and a poll
  loop that checks every 10 s for up to 5 hours (`host/extensions/cloud-agents/`), and the
  card type `cursor-agent`. The card links to `https://app.simeonlabs.com/agents/<bcId>`
  (`shared/cloud-agents-availability.ts`).

* **Settings on Render.** API service: `SIMEON_MATY_RUNNER_TOKEN`. Runner service: the same
  `SIMEON_MATY_RUNNER_TOKEN` and `SIMEON_API_BASE_URL`. Without the token the queue refuses:
  "The cloud engine is not available on this server."
* **App switches.** `SAND_CLOUD_AGENTS_SERVED` (off removes the tool, the card type and the
  brief's cloud-agent sections); `SAND_CLOUD_AGENTS_WEB_BASE` (where the card's link points).
* **Log lines.** Server: `[simeon] cloud-agent started bcId=… job=…`, then `follow-up`,
  `continuation`, `pause`, `deleted`, `continuation refused`. Runner:
  `job <id> (<kind>, <executor>) claimed`. A card stuck at "creating" means no runner has
  claimed the job.
* **Not yet verified.** Nothing has run from a Mac against production. The page at
  `app.simeonlabs.com/agents/<bcId>` does not exist yet. Images attached to a launch are ignored.

## 2. Routines and event listeners

**For the person.** An agent can keep routines: tasks that run on a schedule, or when
something happens in Slack, GitHub, Linear, Sentry or PagerDuty (a mention, a pull request, a
failed check, a new issue).

**How it works.**

- The agent creates a routine with its state tool (`update_state`, target `routine`); the
  routine lives in the agent's folder in the box (`host/automations/automation-store.ts`).
- The box mirrors every routine the server can schedule through
  `simeon.v1.AutomationsService` (`listeners_automations.py`; app side
  `host/extensions/automations/sand-automation-cloud-sync.ts`). Once the server answers, the
  box stops firing those routines itself (`shouldScheduleLocally`) and the server owns them.
- **Cron.** The worker actor `sand.listeners.fire_due_crons` (`listeners_tasks.py`) runs every
  minute and queues one fire per due routine, never a second while one is pending, then moves
  the routine's next slot (`listeners_cron.py`), at least 15 minutes on (`ROUTINE_MIN_INTERVAL`
  in `listeners_service.py`; the Mac holds the same gap). A pending fire expires after two hours, so a
  computer that was off for a day runs a missed routine once, not once per missed slot.
- **Events.** Webhooks arrive at the ingress routes (`listeners_ingress.py`), are checked,
  matched against each person's routines (`listeners_service.py`) and queued.
- **The box collects its work** (`listeners_relay.py`): `POST /sand/listener-subscriptions`
  (what it listens for), `POST /sand/listener-events/poll` (raw Slack/GitHub events, acked by
  id), `POST /sand/automation-events/poll` (fires to run), `POST /sand/automation-runs/complete`
  (a run's result). App side: `backend-relay-source.ts`, `sand-automation-fire-consumer.ts`.
  The notify stream (`GET /sand/notify`, gate `sand_notify_bus`) wakes the box early; polling
  stays on as a fallback.
- **Ingress**: `POST /sand/ingress/slack/events` (`X-Slack-Signature`, five-minute replay
  window); `POST /sand/ingress/github/events` (`X-Hub-Signature-256`);
  `POST /sand/ingress/{linear|sentry|pagerduty}/{token}`, a per-person URL minted by
  `POST /sand/listener-webhooks/{platform}` (the service's signature is checked when it sends
  one).
- **Connecting accounts**: `/sand/slack/install`, `/sand/slack/callback`,
  `/sand/github/install`, `/sand/github/callback` (`listeners_connections.py`,
  `listeners_slack.py`).

**What must be registered before it works.**

- **Slack app**, display name Simeon. Bot scopes `app_mentions:read`, `channels:history`,
  `channels:read`, `groups:history`, `groups:read`, `reactions:read`, `users:read`,
  `chat:write`. Event request URL `https://api.simeonlabs.com/sand/ingress/slack/events`, bot
  events `app_mention`, `message.channels`, `message.groups`, `reaction_added`. OAuth redirect
  `https://api.simeonlabs.com/sand/slack/callback`.
- **GitHub App**, separate from the sign-in app. Webhook URL
  `https://api.simeonlabs.com/sand/ingress/github/events` with a secret; setup URL
  `https://api.simeonlabs.com/sand/github/callback` with "Redirect on update" on. Events: pull
  request, pull request review, review comment, review thread, issue comment, issues, check
  suite, installation, installation repositories.

* **Settings on Render.** `SIMEON_SLACK_APP_ID`, `SIMEON_SLACK_CLIENT_ID`,
  `SIMEON_SLACK_CLIENT_SECRET`, `SIMEON_SLACK_SIGNING_SECRET`, `SIMEON_SAND_GITHUB_APP_SLUG`,
  `SIMEON_SAND_GITHUB_WEBHOOK_SECRET`. The worker service must run for cron routines to fire.
* **App switch.** `SAND_LISTENER_RELAY_SERVED` (off restores the "coming soon" paths).
* **Log lines.** Server: `sand.listeners.subscribed`, `sand.listeners.ingress`,
  `sand.listeners.ingress_refused` (with `reason`), `sand.listeners.fire_enqueued`,
  `sand.listeners.cron_fired`, `sand.listeners.run_completed`,
  `sand.listeners.automation_upserted`, `sand.listeners.slack_install_refused` /
  `github_install_refused`. In the box, a routine's run shows as a `[simeon] model=` line.
* **Known limits.** Microsoft Teams triggers are accepted and never fire (no bot). Nothing in
  the app mints a Linear, Sentry or PagerDuty URL yet; the route is there for the agent to call.
  A private Slack channel resolves only once the bot is invited.
* **Not yet verified.** The Slack and GitHub apps are not registered, so no real event has
  arrived. No routine has fired from the server against a real computer.

## 3. Sharing between people

**For the person.** Someone can share one of their agents in a room with another Simeon user.
The other person joins with an invite link, the host approves, and both talk with each other's
agents. A turn for an agent always runs in its owner's computer.

**How it works.**

- Server: `server/simeon/sand/sharing.py` (routes), `sharing_service.py`,
  `sharing_repository.py`; tables `desktop_share_rooms`, `desktop_share_room_members`,
  `desktop_share_join_requests`, `desktop_share_events`. Invite links are signed tokens with no
  table; typing state and turn nonces live in Redis.
- Routes, all `POST` with the desktop or box credential: `/sand/xuser/poll` (events, acked by
  id); `/sand/xuser/send` (`room-entry`, `room-typing`, `turn-request`, `turn-result`);
  `/sand/share-rooms`, `/sand/share-rooms/from-agent`, `/sand/share-rooms/invite-links`,
  `/sand/share-rooms/join`, `/sand/share-rooms/join/respond`, `/sand/share-rooms/agents/add`,
  `/sand/share-rooms/agents/remove`, `/sand/share-rooms/agents/remove-deleted`,
  `/sand/share-rooms/picture`, `/sand/share-rooms/leave`, `/sand/share-state`.
- Every write another person should see becomes a row in their event queue and a publish on
  the `xuser-events` notify topic.
- App: `host/extensions/cross-user-sharing/` (relay client, remote turns, room state). It
  starts only when the `sand_multiplayer` gate is on, which it is in
  `shared/node/experiments/simeon-gate-defaults.ts`.
- The invite link is `https://app.simeonlabs.com/share/<token>`; the person pastes it into
  Simeon's join box.

* **Settings on Render.** `SIMEON_DESKTOP_SHARE_INVITE_TTL` (default 7 days),
  `SIMEON_DESKTOP_SHARE_JOINS_PER_MINUTE` (default 10). Redis must be reachable.
* **App switch.** `SAND_SHARING_SERVED` (off: "Sharing is coming soon in Simeon.").
* **Log lines.** Box: `[sand:sharing] on: relay at https://api.simeonlabs.com/` when it starts;
  `[sand:sharing] coming soon: …` or an environment reason when it does not. Server:
  `desktop.sharing.room_created`, `desktop.sharing.event`, `desktop.sharing.join_requested`,
  `desktop.sharing.join_invalid`, `desktop.sharing.join_rate_limited`,
  `desktop.sharing.turn_requested`, `desktop.sharing.turn_answered`.
* **Known limits.** The web page behind the invite link does not exist. `room-post` (a guest
  writing from a web page) has no producer.
* **Not yet verified.** No room has been shared between two Macs. Whether the shipped window
  draws the Share entry points from the gate is not measured.

## 4. Messaging channels: Discord and Slack

**For the person.** An agent can have its own Discord bot or Slack app: people message it
there, and it answers there. The person makes the bot and gives Simeon its token.

**How it works.**

- No server is in the path. The computer connects to Discord and Slack directly with the
  person's own tokens.
- App: `host/extensions/channels/`. `channel-runtime.ts` keeps one connector per agent and
  platform, and reconciles on every credential change and every 5 s. `discord-connector.ts`
  uses the Discord Gateway (v10) and REST; `slack-connector.ts` uses Socket Mode and the Web
  API. An inbound message wakes the agent (`wakeForInbound`); the reply goes back through
  SendMessage's `channel` target.
- Credentials are stored per agent in the box under `connector-secrets/`; the live status
  sits beside the label in `channels/<platform>/connection.json`.
- Slack needs two tokens. The Channels tab's one field takes both in any order (`xapp-…` app
  token, `xoxb-…` bot token; `shared/channel-credential.ts`). In chat the agent asks for them
  as two secret requests.

* **Settings on Render.** None.
* **App switch.** `SAND_CHANNELS_SERVED` (off marks every channel coming soon and removes the
  `channel` target and the secret-request type).
* **Log lines.** Box:
  `[simeon] channel=<discord|slack> agent=<id> event=connect|ready|inbound|delivery|delivery-failed|pending|error …`.
  Tokens appear only as prefix and length. A Discord bot without the Message Content intent
  closes with code 4014.
* **Known limits.** A Slack reply goes to the thread of the last inbound message in that chat.
  Discord has no thread routing. An https attachment is sent as a link; only a local file is
  uploaded. There is no hosted Simeon bot.
* **Not yet verified.** No real Discord or Slack token has been used. Whether the Channels tab
  shows the live status is not measured.

## 5. Watching a video

**For the person.** The person attaches a short video and the agent can say what happens in
it.

**How it works.**

- The agent dispatches the Task tool with subagent type `watchVideo` or `videoReview` and the
  video's path in the computer (`host/runner/tools/sand-video-subagent.ts`, registered in
  `host-runner-composition.ts`).
- The child speaks Google's Gemini API directly (`host/extensions/inference/gemini-direct-generate.ts`),
  with the video inline at 4 fps by default. Videos up to 15 MB are accepted; the brief tells
  the agent to trim a larger one first.
- Server: `POST /desktop/api/proxy/v1beta/models/{model}:generateContent` and
  `:streamGenerateContent` (`proxy_gemini_generate` in `server/simeon/desktop/endpoints.py`,
  helpers in `simeon/desktop/video.py`). It adds Simeon's key, meters usage into
  `desktop_usage` with provider `gemini`, and applies the monthly allowance and the hourly
  brake. The video model is `gemini-2.5-flash` (`ModelRole.video` in `pricing.py`); the
  person never picks it.

* **Settings on Render.** `SIMEON_GEMINI_API_KEY` (optional `SIMEON_DESKTOP_GEMINI_BASE_URL`).
  Without the key the child's first call answers 503, and that sentence is the task's result.
* **App switches.** `SAND_VIDEO_SUBAGENT_SERVED` (off puts the "coming soon" sentence back in
  the brief); `SAND_SIMEON_VIDEO_MODEL` (the model id, default `gemini-2.5-flash`).
* **Log lines.** Box: `[simeon] prompt … identity=video:watchVideo`,
  `[simeon] video model=gemini-2.5-flash parts=1 video/mp4@4fps …`, and `[simeon] model-error …`
  on a failure. Server: `desktop.video.generate`, and `desktop.proxy.upstream_refused` with
  Google's own sentence.
* **Known limits.** No path for files over 15 MB. The Gemini prices in `pricing.py` are marked
  "to confirm". Reasoning effort is not sent to Gemini.
* **Not yet verified.** No video has gone through the live server or a Mac.

## 6. Skill publish

**For the person.** A skill the person made can be published to their own account ("Just me")
or to a team. It is then installed into every agent of theirs, or of that team's members, on
the next plugin sync.

**How it works.**

- Server: `server/simeon/sand/skill_registry.py`, `skill_registry_service.py`,
  `skill_registry_repository.py`, as methods of `simeon.v1.DashboardService`: `GetTeams`
  ("Just me" first, then one team per organization the person belongs to), `PublishPlugin`
  (a tar.gz of at most 10 MB packed, 50 MB unpacked and 2,000 files, which must contain
  `skills/<name>/SKILL.md`), `UnpublishPlugin`, `GetEffectiveUserPlugins`.
- Files come back to the app as inline content; no git is involved. The tarball is also
  copied to S3 at `sand-plugins/<owner>/<id>/<hash>.tgz`; if S3 fails the publish still
  succeeds.
- App: `host/extensions/mcp/skill-publish.ts` (publish, unpublish, resync) and
  `host/extensions/mcp/plugin-skills.ts` (the daily sync). A refusal shows the server's own
  sentence on the card.

* **Settings on Render.** `SIMEON_S3_FILES_BUCKET_NAME` and the API's S3 credentials (only for
  the archive copy).
* **App switches.** None of its own.
* **Log lines.** Box: `[simeon] skill-publish published: plugin=… team=… sha=…`,
  `[simeon] plugins sync=<trigger> skills=N plugins=N changed=…`,
  `[simeon] plugins sync=<trigger> failed: …`. Server: `sand.skill_registry.published`,
  `sand.skill_registry.unpublished`, `sand.skill_registry.tarball_not_stored`.
* **Known limits.** The per-person enable/disable table has no writer yet.
* **Not yet verified.** No skill has been published from a Mac against the live server.

## 7. Connectors

The Connect apps sheet lists 52 connectors (`shared/node/vendor-mcp/catalog.ts`): 21 are the
vendor's own MCP servers and 31 are apps served by Simeon Labs' server. People can also add
their own MCP servers.

### 7a. Vendor MCP connectors

**For the person.** Notion, Linear, Stripe, Dropbox and the other vendor cards connect with
the vendor's own sign-in, and the agent can then use their tools.

**How it works.**

- `shared/node/vendor-mcp/`: `backend-exec.ts` lists and calls tools over streamable HTTP
  (`http-mcp-client.ts`) and runs the sign-in; `oauth.ts` does discovery, dynamic client
  registration and PKCE (it tries the RFC 8414 path form of the metadata first, registers with
  `client_secret_post` when a vendor offers no public client, and keeps a pending sign-in for
  15 minutes); `installs.ts` is the store; `display.ts` turns an install into a server row
  (ids are decimals from 900,000 up).
- The browser sign-in runs only on the Mac, through the loopback
  (`http://localhost:8787/callback`). The computer never opens a sign-in and never spends a
  refresh token.
- The store (`vendor-mcp-installs.json`, in `~/.simeon` on the Mac) travels both ways: the Mac
  sends its copy on every MCP refresh and pulls the box's copy before the connect card looks
  for a row (`box-pull.ts`). Newer entries win; removals leave tombstones.
- The agent reads and calls a connected connector's tools with GetMcpTools and CallMcpTool
  (`productionTurnMcpProjection` in `host/host-runner-composition.ts`).

* **Log lines.** Mac: `~/.simeon/vendor-mcp-signin.log`, one line per sign-in start
  (`registered=dynamically` or `registered=by us`), refusal, token-exchange failure and
  `credential stored`. The connect card itself only says "retry". Box: `[simeon] tool=` lines.
* **Known limits.** Dropbox gives every self-registered client one shared id and calls it "Self
  host app" on its consent page. To show Simeon's name, create an app in Dropbox's App Console,
  add the loopback redirect, and put its app key in the `dropbox` row of `catalog.ts` as
  `clientId`; the sign-in then skips registration. No key is set yet.

### 7b. Custom MCP servers and account plugins

**For the person.** The person, or the agent with AddMcpServer, can add an MCP server by URL
(with optional headers) or by command. A URL server that needs a sign-in draws the same
connect card.

**How it works.**

- `shared/node/account-mcp/`: `store.ts` is `account-mcp-config.json` beside the vendor store
  (server ids are random decimals in 100,000–899,999; entries carry a time, removals are
  tombstones, `mergeAccountMcpStores` keeps the newer entry); `local-client.ts` answers the
  account MCP calls from that file; `backend-exec.ts` lists and calls a URL server's tools with
  its headers and uses the vendor sign-in flow on a 401; `box-pull.ts` has the Mac pull the
  box's copy before each read, at most once per 2 s, giving up after 3 s.
- A command server runs inside the computer through the box's own MCP executor. The lookup
  order is vendor → account → anything else, on the Mac and in the box.

* **Not yet verified.** An AddMcpServer from a live turn reaching the Mac, and the connect card
  for a custom server, have not run on a Mac.

### 7c. Apps behind Simeon Labs' server

**For the person.** Gmail, Outlook, Google Calendar, Drive, Docs, Sheets, Slides, Tasks, Meet,
Asana, Todoist, Zoom, Figma, QuickBooks, HubSpot, Salesforce, Intercom, GitHub, Mailchimp,
Gusto, Slack, LinkedIn, OneDrive, Trello, Xero, Shopify, Brex, Pipedrive, Docusign, Klaviyo
and Ashby connect through Simeon. The provider behind them is never named in the app.

**How it works.**

- Server: `server/simeon/desktop/apps.py`, under `/desktop`: `GET /desktop/api/apps`
  (`{"available": true}` when configured), `POST /desktop/api/apps/mcp/{toolkit}` (our MCP
  server per app), `GET /desktop/api/apps/{toolkit}/status`,
  `POST /desktop/api/apps/{toolkit}/connect` (the sign-in link),
  `DELETE /desktop/api/apps/{toolkit}` (disconnect), `GET /desktop/apps/connected` and
  `GET /desktop/apps/oauth/callback`. The provider's key stays on the server; tool
  descriptions, results and errors are scrubbed of the provider's name.
- App: each app is a vendor connector with `appsToolkit` (`vendor-mcp/catalog.ts`), so the
  card, the tools and the store work as in 7a. The bearer is the account's own token (the
  box's credential in the box); the stored "credential" is only a connected marker
  (`clientId: "simeon-apps"`).
- **A sign-in without its permission** (7 October 2026). Google's consent screen shows one
  checkbox per permission and leaves them unticked, so a Gmail sign-in that skipped the mail box
  is "connected" and every read answers "Request had insufficient authentication scopes". The
  tool's error now says the fix: `AuthenticateMcpServer` with `force_reauth` true, which signs
  the app out on the server (before, `/connect` answered "connected" while the account existed
  and the card never came back) and shows a fresh card; the person ticks every box this time.
- **The availability check.** An app card offers Connect only when `GET /desktop/api/apps`
  answers `{"available": true}` (`vendor-mcp/apps-availability.ts`, cached one minute).
  Otherwise it stays "coming soon", and a sign-in answered 404 or 503 says "<App> is coming
  soon in Simeon." The vendor connectors in 7a do not depend on this check.

* **Settings on Render.** `SIMEON_COMPOSIO_API_KEY` (optional `SIMEON_COMPOSIO_BASE_URL`). To
  show Simeon's own name on a provider's consent screen, register Simeon's own OAuth app with
  that provider, with redirect URI `https://api.simeonlabs.com/desktop/apps/oauth/callback`.
* **Log lines.** Server: `desktop.apps.sign_in_started`, `desktop.apps.upstream_refused`,
  `desktop.apps.upstream_unreachable` (a timeout or dropped connection: `path`, `error`,
  `elapsed_ms`; the app then reads "could not be reached" and Render shows a 200) and
  `desktop.apps.upstream_slow` (a provider call over 5 s). Mac:
  `<app> sign-in started through Simeon's apps service` in `~/.simeon/vendor-mcp-signin.log`.
  Box: `[simeon] tool=GetMcpTools` and `tool=CallMcpTool` lines in `/tmp/sand-host.log`; a
  question that takes more than three of them is worth reading.
* **What the model is shown.** `GetMcpTools` with `{"server":"gmail"}` lists a large app's
  tools by name, short description and arguments (`query: string, max_results?: integer`), so
  the model calls one straight from the list (every schema inline was tens of thousands of
  tokens, paid again by each later call). A blank `toolName` or `pattern` counts as absent, and
  a tool not found names the ones that exist. Clicking Add waits up to 8 s for the install to
  reach the cloud computer, and a proposal card's sign-in resumes the agent that proposed it
  (it was never told before, and went on saying the app "isn't installed").
* **Apps added 3 October 2026, for founders.** Through our apps service, each with a sign-in the
  provider manages (checked that day on its toolkit page): Google Analytics, Google Search
  Console, YouTube, Kit, Instagram and Facebook Pages (business accounts only), Calendly,
  Cal.com, Attio, Zendesk, Microsoft Teams, Discord. Through the vendor's own MCP (dynamic
  registration and S256, checked the same day): Mercury (read-only) and PostHog. Left out because
  their sign-in needs an API key or a developer setup of ours: X, Google Ads, Close, PandaDoc,
  Help Scout, Fireflies, Beehiiv, Mixpanel, Freshdesk. Run the apps check after signing in to one
  to see it work end to end.
* **Checking an account's apps for real.** On the API service's shell on Render:
  `uv run python -m scripts.desktop_apps_check someone@example.com` lists every app sign-in the
  provider holds for the account (with the date it was made: one older than an account reset is
  why Add then asks for no sign-in) and makes one read-only call per app through the agent's own
  path (Gmail's address, LinkedIn's name), saying `works` or `FAILED` with the provider's
  sentence. `--disconnect gmail` removes that app's sign-ins, so the next Add asks again. Notion
  is not one of these apps: it is served by Notion's own MCP server, signed in on the Mac.
* **The provider round trips.** Which accounts a person has connected is asked once a minute at
  most for the agent's tool calls (`connected_account_ids`); "not connected" is never kept, and
  disconnecting forgets it.
* **Known limits.** Google's consent screen shows the provider's name until Simeon Labs uses its
  own Google OAuth app.
* **Not yet verified.** No sign-in or tool call against the live provider, and nothing on a Mac.

## 8. Agent features that touch the server

### Avatars

**For the person.** An agent's picture can be uploaded from a file or generated from a
sentence.

**How it works.** **Upload** stays on the Mac and in the box: a file dialog, a crop, then
`setAgentAvatarBytes`, which writes `avatar.png` in the agent's folder and refuses an empty
payload, one over 5 MB, or one that is not an image. **Generate** posts to
`POST /desktop/api/proxy/v1/images/generations` (`server/simeon/desktop/capabilities.py`, model
`gpt-image-1`) at low quality (`electron-main/adapters/avatar-images.ts`); the result is
cropped and saved by the same upload path. The roster reads the picture into every row
(`readAgentAvatarForSummary` in `host/extensions/session/session-summaries.ts`), and an avatar
change made by the agent itself redraws the roster (`onAvatarChanged`).

* **Settings on Render.** `SIMEON_OPENAI_API_KEY`.
* **Log lines.** A failed Generate shows `edge/handler-failed: <the server's sentence>` in the
  editor; on the server, `desktop.proxy.upstream_refused`. The Mac keeps no log for this path.
* **Not yet verified.** Neither flow has been measured on a Mac since the roster fix.

### Keys an agent asks for in the chat

Added 2 October 2026; the upstream app had no path for this. An agent asks for a key
with `SendMessage` `{"type":"secret-request","secret":{"label","connector","field"}}`,
and the person types it into a masked input.

- **For a messaging connector** (`discord`, `slack`): the key goes to that connector's
  credential file, as before.
- **For any other service**: the key becomes a secret in the cloud computer's environment,
  named for the service and what it is (connector `render`, field `api_key` →
  `RENDER_API_KEY`; `shared/box-secret-redaction.ts`). The agent is told the name and uses
  it as `"$RENDER_API_KEY"` in its commands; it never sees the value.
- **Where these keys live:** the box's own file (`agent-keys.json` beside
  `box-secrets.json`, mode 600). They join the person's Secrets from the Mac's Settings;
  the person's Secrets win a clash (`host/extensions/secrets/secrets-service.ts`).
- **Blanking:** every secret value the box was given is blanked to `[secret]` in what the
  shell and await tools hand the agent, so a command that prints one does not put it in
  the chat.
- **Log:** the host logs `agent key <NAME> stored for the box's commands`.
- **Needs** a host bundle from 2 October 2026 or later.

### Group chats

**For the person.** A group holds several agents. Each member answers in turn, and an
@-mention narrows who answers.

**How it works.** Each member runs its own agent loop in its own session and speaks through
SendMessage (`host/extensions/transcript/group-chat-orchestrator.ts`, `group-chat-glue.ts`).
A plain message allows up to three rounds (`GROUP_MAX_ROUNDS`) and ten member turns in total
(`GROUP_MAX_MEMBER_TURNS`, `host/groups/group-chat.ts`). The group's roster row reads its
`group.json`, so it carries `isGroup` and its members. No server route is involved beyond the
model proxy.

* **Not yet verified.** Not run on a Mac.

### Auto-review approvals

**For the person.** Before a risky action (for example a destructive shell command, a
computer action or a routine write), the agent stops and shows an approval card with a reason.
The person can allow it once or always.

**How it works.** The classifier asks the cheap model at low effort, through the model proxy,
for an allow-or-block decision (`host/extensions/auto-review/simeon-smart-mode-classifier-exec.ts`,
30 s deadline). A block always carries a `proposedAllowRule`, so "Always allow" saves a rule;
when the model leaves it out, `fallbackAllowRule` builds one from the command. Review is
enforced because the `sand_auto_review` gate is on in `simeon-gate-defaults.ts`. A new
message from the person retires the previous approvals (`beginAutoReviewUserMessageEpoch`).

* **Log line.** Box: `[simeon] auto-review action=… mode=… verdict=allow|block|unparseable|error …`.
* **Known limits.** MCP tool calls are not classified (their approval provider is absent;
  `desktop/scripts/host-production-activation.mjs`).
* **Not yet verified.** A blocked command's card has not been seen on a Mac.

### Draft composer cards

**For the person.** The agent can draft an email or a Slack message as an editable card. The
person edits it, then sends or discards it.

**How it works.** `DraftExternalMessage` (`host/runner/tools/draft-message-tool.ts`) draws an
`email-draft` or `slack-draft` card; drafting sends nothing. Send and Discard are the gateway
commands `sendDraft` and `discardDraft` (`host/extensions/transcript/draft-cards.ts`). Send
marks the card `sending` and wakes the agent to deliver by the best route the person has: a
connector's tool, a custom MCP server, or the box browser through a computer-use subagent.
The agent then reports with `MarkDraftDelivered`: sent, or failed (the card comes back
editable).

* **Known limits.** In the packaged app the card's Send and Discard buttons do nothing: the
  shipped window's callbacks are empty, and no package-time patch binds them yet (there is no
  draft patch in `desktop/scripts/lib/router-renderer-patch.mjs`).
* **Not yet verified.** Not run on a Mac.

## 9. Voice calls

**For the person.** The person calls one of their agents and talks to it out loud. The voice
answers in a sentence or two, hands anything that needs doing to the agent, which works in
the background while the call goes on, and says how it is going when asked.

**How it works.**

- The call runs between the Mac app and ElevenLabs Agents over WebRTC (`@elevenlabs/client`).
  Simeon's ElevenLabs key never reaches the Mac: for each call the app asks the server for a
  short-lived conversation token.
- One ElevenLabs agent, "Simeon voice", serves every Simeon agent. The app overrides its
  prompt, first message, language and voice per call, so each agent keeps its own name and
  voice. The server finds it by name (`GET /v1/convai/agents?search=`) or creates it on first
  use, and rewrites it whenever `VOICE_AGENT_CONFIG_VERSION` in
  `server/simeon/desktop/voice.py` changes (the version is a tag on the agent; the id is
  remembered per process). Its configuration: authentication required, the four overrides
  above and no others, `gemini-2.5-flash` as the voice's model with `thinking_budget: 0` (2.5 Flash thinks
  before every reply by default, and the replies waited on it), `eleven_flash_v2` for
  speech (an English agent is refused on any other), a voice the workspace has (the first of the
  founder's voices the account has, else the first ElevenLabs default, else Eric: a missing
  voice is refused with `voice_not_found`), `end_call` and `skip_turn`, a 7 s turn timeout,
  `turn_eagerness: eager` and `speculative_turn` (it answers soon after the caller stops and
  starts thinking during the pause, which costs a little more), the call ended after 25 s of
  silence, 30 minutes at most, and no voice recording kept. The per-call prompt carries the
  last 6 chat messages; `recall_text_messages` reads up to 20.
- Two client tools, the upstream app's, answered by the app: `send_task {task, quote?}`
  (relayed to the person's agent over the call's channel; the app answers at once; 20 s
  timeout, the voice always speaks first) and `recall_text_messages` (the latest texts between
  the person and the agent). The voice speaks as the agent itself, in the first person, and
  never mentions another agent or a hand-off.
- Routes, all under the model proxy's credential (`get_proxy_caller`):
  - `POST /desktop/api/proxy/v1/voice/calls` checks the monthly allowance and the hourly
    brake, makes sure the platform agent exists, and returns `{token, conversation_id,
    agent_id}`. `conversation_id` is null when ElevenLabs does not name the call before it
    starts; the SDK reports it once connected.
  - `POST /desktop/api/proxy/v1/voice/calls/{conversation_id}/end` with `{seconds}`: the
    server asks ElevenLabs how long the call lasted (`metadata.call_duration_secs`) and bills
    that; when ElevenLabs does not say, it bills the app's count, capped at 30 minutes. The
    call is billed once (`desktop_voice_calls`, unique on the conversation id); asking again
    bills nothing and returns the recap, which ElevenLabs
    writes shortly after the call ends. The recap is our own `recap` field on the agent's
    analysis (`platform_settings.data_collection`, read from
    `analysis.data_collection_results.recap.value`): written by the agent to the person
    ("You asked me to…"), with the person's name put in front by the server
    (`recap_for`). ElevenLabs' own `transcript_summary` speaks of "the user" and is not used. A conversation of another ElevenLabs agent, or one
    already billed to someone else, is answered 404.
  - `GET /desktop/api/proxy/v1/voice/voices`: the picker's list: the founder's 12 voices
    (`CURATED_VOICES`, Michael first and the default; Jessica and Kass were removed on
    6 October 2026), looked up by id in the account
    (`/v2/voices?voice_ids=…`) and shown by their names only. Each must be added to the
    ElevenLabs account ("Add to my voices"); one it lacks is skipped, and with none of them
    the picker offers ElevenLabs' defaults. `[{id, name, description, labels, preview_url}]`,
    description and labels empty, cached for an hour.
- Price: `VOICE_CALL_MODEL` in `server/simeon/desktop/pricing.py`, by the second, at $0.08 a
  minute times a 1.25 margin (`VOICE_CALL_MARGIN`): about 33,000 credits a minute. Usage rows
  carry provider `elevenlabs`.

**On the Mac.** (`electron-main/voice/`, `shared/voice-call/`, `voice-call/`)

- **Starting.** A phone button beside the agent's name in the chat header, and Agent › Call
  <name> in the menu bar for the agent open in the window. Both reach main's
  `startVoiceCall` (`window.desktop.voiceCall.start`). One call at a time: a second start
  brings the banner forward. The button and the picker are patched into the pinned window by
  `scripts/lib/router-renderer-patch.mjs` (`VOICE_CALL_REPLACEMENTS`, `voiceCallCss`).
- **The banner.** A window of its own (`voice-call-window.ts`): borderless, transparent,
  always on top, on every Space, shown without taking focus, top right of the display under
  the pointer, 330 pt wide, growing and shrinking with the call. It runs its own page
  (`dist/voice-call/index.html`, `banner.css`, `banner.js` with the SDK bundled in) and
  preload (`dist/electron-preload/preload-voice-call.cjs`), because the main window's
  Content-Security-Policy refuses ElevenLabs. The page's own policy allows only ElevenLabs'
  API and LiveKit hosts, microphone and playback streams, and blob: for the SDK's audio
  worklets. The glass is CSS (the page cannot blur the desktop behind it, so the fill is
  denser than the mock-up's; see the top of `banner.css`).
- **A call.** Two soft rings (WebAudio) while main asks `voice/calls` for the token and reads
  the agent's profile and last 20 chat messages; then `Conversation.startSession` over WebRTC
  with the per-call prompt, greeting (`voice-call-prompt.ts`, every sentence in one module),
  language `en` and the agent's voice. The waveform follows the SDK's frequency data; Mute and
  End are the SDK's. If the token or the connection fails, the banner says "Couldn't connect"
  ("Calls aren't switched on yet" on a 503, "Out of credit for calls" on a 402) with Close.
- **The call is a channel into the agent** (1 October 2026, the upstream app's design, its
  text in `shared/voice-call/main-loop-voice.ts`). When the call connects, main opens
  `voice:<callId>` on the agent's host (`voiceCall {kind:"open"}`, through the coordinator's
  main-process leg; `host/extensions/transcript/voice-call-channel.ts`).
  - `send_task` relays the request (at most 2,000 characters, and the caller's own words when
    the voice quotes them). The agent wakes at once on a hidden `[inbound] From voice:<call>:`
    message carrying the voice channel's rules and how to answer; a run in progress is
    interrupted and the message says it landed mid-turn. A turn that sends nothing to the
    call is nudged once; the nudge allows one line on the channel when the result is not
    ready (7 October 2026: a balance check went to a background subagent and the caller
    heard nothing until the call ended).
  - **The launch of a background subagent is reviewed with the conversation.** Until 7 October
    2026 the review for that surface read "Recent conversation: (none)" (the other surfaces
    carried it), so a check the person had asked for on the call was blocked as "without a
    clear request from you".
  - The agent answers with `SendMessage` with `channel` set to the call's address. That
    message goes to the call, not to the chat. Main reads the call's outbox every 1.2 s and
    pushes new messages into the call (`sendContextualUpdate`, then a one-line
    `sendUserMessage` nudge, once the voice has stopped speaking), and the voice says them as
    its own. The banner's status line shows the agent's activity meanwhile ("Using Gmail…").
  - A request that does not reach the agent answers the voice "That did not come back. Say
    you could not get to it, and offer to try again."
  - A host without the channel (a cloud computer still on a host bundle from before 1
    October 2026, so `voiceCall` fails) gets the call through the agent's chat instead: the
    request is sent as the person's own message (`sendPrompt`, "(On our call) …"), and each
    new text the agent writes in the chat (read every 1.2 s from the chat's tail) is said by
    the voice. No `voice-calls/` record is written that way. Main's log says
    `call channel: voice:<id> goes through the agent's chat`.
  - On hang-up the address closes (`kind:"ended"`, with the seconds, the recap and the
    transcript). The record is written to `voice-calls/<start>-<callId>.json` in the agent's
    own files. If anything was asked on the call, the agent is told "The call ended…" and puts
    anything still owed into the chat, nudged once if it sent nothing.
  - Every agent's system prompt carries the `## Voice calls` section.
  - The host part ships with the host bundle (`npm run publish:host-bundle`).
- **After.** The banner says "Call ended", plays the hang-up tone and leaves by itself after
  1.2 s. Main posts `voice/calls/{id}/end` with the seconds and asks twice more for the summary
  (after 5 s and 10 s) if it is not ready.
- **In the chat.** One line per call, where the call began (1 October 2026, the founder: "i
  want things to behave the same way as it should behave when i text"). The host writes an
  event entry, `{type:"voice-call", status:"live"}`, when the call opens, so everything the call
  asks of the agent sits below it, as it would below a text. On hang-up the same entry is filled
  in (`status:"ended"`, `seconds`, `lines`). The window draws it as "Voice chat · 01:49"
  ("Voice chat · now" while the call is on); a click opens the call in the window's read-only
  exchange panel, the person's lines as their own blue messages on the right and the agent's on
  the left. The sidebar's preview reads "Voice chat · 01:49" until a later message. A call
  that never connected leaves no line. The person is never written as a peer: calls a host
  wrote before this (messages with a `voice-call:<call>:<seconds>` peer named for the person)
  are drawn the same way, on a line of their own, never merged with the agent's exchanges with
  teammates. A host from before 2 October 2026 writes no line, so main adds "Voice call · 2:48"
  plus the recap as the agent's message (`appendSendMessage`), drawn as a card
  (`__simeonCallRecord`). A banner closed mid-call still ends and bills the call.
- **The voice.** Each agent's `voiceId` is in its profile (`host/agents/agent-profile.ts`;
  a profile without one reads as empty: the call then sends no voice and speaks in the
  platform agent's, which the server picked from the workspace's voices). The
  picker under "Character color" (Edit agent avatar › Agent) lists `voice/voices`, plays a
  sample (downloaded once to `voice-previews/` in the app's folder and played through
  `sand-media:`), and saves through the host's `updateAgent`. The Mac also keeps each choice
  in `voice-calls.json`, used while the box's host is older than `voiceId`.
- **App switch. Calls are shown by default** (hidden on 1 October 2026, shown again on
  2 October). The phone button, the picker and the menu item are hidden only when
  `SIMEON_VOICE_CALLS=0` (or `off`) is in the app's environment. On, the server decides:
  without its key the banner says calls aren't switched on.
- **Log.** `voice-call.log` in `~/Library/Application Support/Simeon`, also on stderr as
  `[simeon] voice-call …`: `call started`, `connect: token issued … (voice …)`, `connect: the
  server refused the call: …`, `connected: conversation …`, `call channel: …` (on hang-up
  `closed (its line in the chat holds N line(s) of what was said)` or `closed (no line in the
  chat)`), `banner: sdk error: …`, `call ended: conversation …, 168s, billed …s, summary
  yes|no`, `call record not added to the chat: …`.
- **Needs a new host bundle.** The voice is saved in the profile by the host in the box;
  until `npm run publish:host-bundle` has shipped this commit, the choice lives only on the
  Mac (above). Everything else uses host methods that already exist.

**Try this on the Mac** (after `npm run package`, with `SIMEON_ELEVENLABS_API_KEY` set on
the API):

1. Open an agent. A round phone button sits right of its name pill. Agent › Call <name> in
   the menu bar names the same agent.
2. Press it. The banner appears top right without taking focus from the window, rings twice
   (soft), and macOS asks for the microphone the first time. The agent greets you by its name.
3. Talk; the waveform moves with your voice and with the agent's. Mute turns orange and says
   Unmute; the waveform goes flat while you are muted.
4. Ask for something that needs doing ("send the agenda to Dana"). The voice says it is on it;
   the task appears in the agent's chat as your message; the banner's line shows the work.
   When the agent answers in the chat, the voice tells you, in its own words.
5. Ask "how's it going?" while it works: it answers from the agent's activity.
6. Say "thanks, that's all": the voice says goodbye and hangs up. The banner reads "Call ended
   · m:ss"; a few seconds later the chat shows "Voice call · m:ss" and a summary.
7. Chat opens the agent's chat; Call Again rings again. Press the phone button during a call:
   the banner comes forward, no second call starts.
8. Edit agent avatar › Agent: under the colours, the Voice list. Play a sample, choose one,
   call again: the agent speaks in it. Relaunch the app: the choice is kept.
9. Light and dark: switch the system appearance; the banner follows.
10. With the server's key removed, a call says "Calls aren't switched on yet" with Close.
11. `~/Library/Application Support/Simeon/voice-call.log` has a line for each step above.

* **Settings on Render.** `SIMEON_ELEVENLABS_API_KEY` on the API service (declared in
  `render.yaml`). Optional: `SIMEON_ELEVENLABS_BASE_URL` (default
  `https://api.elevenlabs.io`) and `SIMEON_ELEVENLABS_AGENT_ID`, which names an agent managed
  by hand; that agent is then used as it is and never rewritten. Without the key every voice
  route answers 503 "Voice calls are not switched on on this server."
* **Log lines.** Server: `desktop.voice.call_started`, `desktop.voice.call_ended` (seconds,
  and `source=provider|app`), `desktop.voice.call_latency` (ElevenLabs' own per-turn
  timings for the call, the median and slowest of each, such as the model's time to first
  word, and the model that answered: read it before reasoning about a slow voice), `desktop.voice.agent_created`, `desktop.voice.agent_synced`,
  `desktop.voice.agent_ready`; on failure `desktop.voice.upstream_refused` with ElevenLabs'
  own answer, `desktop.voice.upstream_unreachable`, `desktop.voice.conversation_unread` (the
  duration could not be read, so the app's count was billed) and
  `desktop.voice.foreign_conversation`.
* **Known limits.** The allowance is checked when a call starts, not during it, and a call is
  billed only when the app says it ended: a call the app never ends is not billed. At about
  33,000 credits a minute the hourly brake (200,000) stops a new call after roughly six
  minutes of calling in an hour. ElevenLabs bills the voice's model on top of the minute; the
  margin is meant to cover it. The $0.08 figure was not read off ElevenLabs' price page. Two
  API processes making the first call at once can each create a platform agent; every later
  lookup settles on the older one.
* **Not yet verified.** Nothing has reached ElevenLabs: the tests replace it with a fake, and
  the agent and tool configuration shapes (`pre_tool_speech`, `built_in_tools`, `tags`) are
  written from the brief, not checked against the live API. No call has been placed from a
  Mac: the banner was rendered in headless Chromium with a fake call, and the phone button
  and the picker in the patched window's demo, but the window, the microphone, WebRTC, the
  worklets under the page's policy and the ring have not run in the packaged app.

## 10. Flight search

**For the person.** Ask any agent for a flight ("cheapest refundable Seattle to LA tomorrow,
landing before 2") and it answers with a results card of up to four distinct options, fastest
whole journey first, each opening a panel with each leg, the layover, and the fare's
cancellation and change terms and bags in plain words, then one short line with its pick.
Booking is not built; the panel has no Book button.

**How it works.**

- The agent's `SearchFlights` tool (`host/runner/tools/flight-search-tool.ts`, main agents
  only, not shared rooms) calls `POST /desktop/api/flights/search` with the box's own
  credential (`get_desktop_or_box_session`). The brief tells agents to use it for every flight
  question and never to look flights up on airline or travel sites.
- The server (`server/simeon/desktop/flights.py`) turns a city into an airport through
  Duffel's place suggestions (a city with one airport becomes that airport's code), makes one
  Duffel offer request, drops offers that fail the filters asked for (refundable, named
  airlines), and counts each complete itinerary once at its cheapest fare.
- The shortlist follows Muse's own flight rules (2 October 2026, from Muse's booking and
  Duffel skill files the founder shared): the shortest whole journey first (a connection must
  save over 30 minutes a stop to lead over a nonstop), then the cheapest when it is at least
  10% and $20 cheaper, then a refundable fare when none shown is, then other distinct trips;
  a trip no faster, no cheaper and leaving within two hours of one shown is left out, and
  a change of airports mid-journey only when nothing else is left. `priority: "cheapest"`
  leads with the cheapest and keeps one at least 45 minutes faster. Each row says why it is
  there (`label`: Fastest, Cheapest, Refundable) in the agent's summary.
- The card shows every connection airport with its layover (`1 stop · PHX 1h 38m`), the
  operating airline when another flies it, the fare brand, and "One way" or "Round trip"
  with the price. A fact the airline does not give reads "Not stated", never "none".
- The agent is told (tool description and brief) to learn the traveller from memory, past
  trips, email and calendar before asking, to assume one adult one way and say so, to ask
  only what would change the route, to run one targeted `airlines` search when an expected
  airline is missing, and after the card to write one short line, never the card's details
  again and never the data provider's name.
- The tool posts the card itself, as a message that is one ```` ```simeon-flights ```` block
  of JSON, which the window draws (`flights-components` in
  `scripts/lib/router-renderer-patch.mjs`). The agent gets a short summary and writes only the
  line under the card.
- The tool asks the agent for the trip (`one_way` or `round_trip`); a return date goes to the
  server only for a round trip. The same search twice in one turn is not run again and posts no
  second card (2 October 2026: an agent ran one search six times).
- Searches are capped per person per hour (`FLIGHT_SEARCHES_PER_HOUR`, default 30): past
  Duffel's free allowance each search is billed.

**Settings on Render.**

- `SIMEON_DUFFEL_ACCESS_TOKEN`: a read-write token from Duffel's dashboard (More → Developers
  → Access tokens). A `duffel_test_` token searches Duffel's test mode (its pretend airline,
  Duffel Airways, and airlines' sandboxes, at unrealistic prices) and the card says "Test
  results". Empty: the route answers 503 and the agent says flight search is not switched on.
- `SIMEON_FLIGHT_SEARCHES_PER_HOUR` (default 30), `SIMEON_DUFFEL_BASE_URL` (default
  `https://api.duffel.com`).

**When it misbehaves.** Server log: `desktop.flights.search` (one line per search: route,
date, `priority`, `airlines`, offers found and shown, `test`, milliseconds), `desktop.flights.upstream_refused` (what
Duffel answered, in full) and `desktop.flights.rate_limited`. An agent that browsed instead of
calling the tool shows no `desktop.flights.search` line for that request.

## 11. Simeon, the Chief of Staff

**For the person.** Onboarding ends by making Simeon, their Chief of Staff: the
first agent, made for them (name Simeon, title Chief of Staff, Ocean), who manages
their other agents and pulls them in for decisions. There is no "Create your first
Agent" form. He is pinned, hidden, moved or deleted like any agent; his name and
avatar are theirs to change, his title and description are read only. The apps
step ("What do you use every day?") offers "Skip for later" under Next.

**How it works.** All in the window (`desktop/scripts/lib/router-renderer-patch.mjs`):

- The flow is landing, meet, Chief of Staff ("Your Personal Chief of Staff"),
  computer, name ("How should they call you?"), apps, then the hand-off screen.
  Next or Skip for later on the apps step runs the flow's own create-and-finish
  with `SIMEON_COO_PROFILE`; agent creation carries a `title` (`n5n`), which the
  host stores (`host/host-gateway-api.ts`, `mintAgent`).
- The Chief of Staff is the oldest agent titled "Chief of Staff", or "COO", the
  title from 3 October 2026 (`__simeonFindCoo`, noted on every roster read). His
  title and description fields are read only, so the title that marks him cannot
  be typed away.
- An account made before this has no such agent, and nothing changes for it.
- The Chief of Staff suggestion is gone from the new-agent picker.

**When it misbehaves.** If Simeon's title can be edited, check it in the roster: it
must be "Chief of Staff". If creation fails, the hand-off screen shows "Simeon
couldn't finish setting up" with Try again, which creates him again.
