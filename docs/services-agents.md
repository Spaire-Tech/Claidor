# What the server does for the app, part 2

This page covers the features where Simeon Labs' server (`server/`, Python package `simeon`,
at `https://api.simeonlabs.com`) works for the Simeon app (`desktop/`) beyond sign-in and the
model proxy: cloud agents, routines and listeners, sharing, messaging channels, video, skill
publish, connectors, a few agent features (avatars, group chats, auto-review, drafts), voice
calls, flight search, and notifications on the person's iPhone.

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
  the routine's next slot (`listeners_cron.py`), with no shortest gap since 8 October 2026 (`ROUTINE_MIN_INTERVAL`
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
the vendor's own sign-in, and the agent can then use their tools. Since 13 October 2026 every
app has one button, **Connect**, on the iPhone and the Mac (rows, pages, chat cards, Your
plugins): the consent, then the app added on the computer and its sign-in opened in one go;
"Connected" only once it is signed in. A sign-in the person cancels, or one that never opens,
takes the app back out, so nothing is left added and not signed in (`SimeonCore/Connecting.swift`,
`AppStore.beginConnect` and `undoConnect`; `mac/STEPS.md`, "One Connect"). Before, Add said
"Added" and the sign-in waited in Your plugins under Authenticate.

**How it works.**

- `shared/node/vendor-mcp/`: `backend-exec.ts` lists and calls tools over streamable HTTP
  (`http-mcp-client.ts`) and runs the sign-in; `oauth.ts` does discovery, dynamic client
  registration and PKCE (it tries the RFC 8414 path form of the metadata first, registers with
  `client_secret_post` when a vendor offers no public client, and keeps a pending sign-in for
  15 minutes); `installs.ts` is the store; `display.ts` turns an install into a server row
  (ids are decimals from 900,000 up).
- Since 11 October 2026 `oauth.ts` also asks the token for the resource the server names
  itself (RFC 9728 `resource`, when it is on the server's own origin; Miro names itself
  `https://mcp.miro.com/` and refused the `/mcp` address with `server_error`), takes a public
  client when the vendor registers one whatever its metadata said (Vercel, for the loopback),
  and falls back to the server's own origin as its authorization server when the resource
  document is missing (Atlassian answers 404 to it from some networks).
- Where the vendor sends the person back. The Electron Mac signs in on the Mac, through its
  loopback (`http://localhost:8787/callback`). The iPhone, the Mac app in Swift and the web
  start the sign-in in the computer, which asks for Simeon Labs' hosted page
  (`https://api.simeonlabs.com/desktop/mcp-oauth/callback`, then `/app/connected.html`, which
  hands the code to the computer). Canva, Square, Vercel and Dropbox refuse that address
  (`loopbackOnly` in `catalog.ts`), so the computer asks them for the loopback, and the iPhone
  and the Mac app in Swift listen there while their sign-in sheet is open
  (`ios/SimeonCore/Sources/SimeonCore/LoopbackSignIn.swift`): the code goes to the computer
  (`completeMcpOAuth`) and the sheet closes. The computer never opens a browser and never spends
  a refresh token it did not get.
- Measured 11 October 2026 with the real code against each vendor: all 23 vendor connectors
  start a sign-in and land on the vendor's own sign-in or consent page.
- The store (`vendor-mcp-installs.json`) travels both ways: the Mac
  sends its copy on every MCP refresh and pulls the box's copy before the connect card looks
  for a row (`box-pull.ts`). Newer entries win; removals leave tombstones.
- On the Mac both connector files (`vendor-mcp-installs.json`, `account-mcp-config.json`) sit in
  `~/.simeon/accounts/<scope>/`, one folder per Simeon account, the scope being the settings'
  account hash; signed out, the Mac reads `accounts/signed-out/`
  (`shared/node/connector-account-scope.ts`). Until 7 October 2026 they sat once per Mac, so a
  second account on the same Mac saw the first one's connectors and pushed them into its own
  cloud computer. Files from before are adopted once by the account the Mac is scoped to. The
  box belongs to one account and keeps its files in its data folder.
- The agent reads and calls a connected connector's tools with GetMcpTools and CallMcpTool
  (`productionTurnMcpProjection` in `host/host-runner-composition.ts`).

* **Log lines.** `vendor-mcp-signin.log` (Mac: `~/.simeon/`; box: its data folder), one line
  per sign-in start (`registered=dynamically`, `registered=by us` or `registered=by our
  document`, and `return=` the address
  the vendor sends the person back to), refusal, token-exchange failure and
  `credential stored`. The connect card itself only says "retry". Box: `[simeon] tool=` lines.
* **Known limits.** Dropbox gives every self-registered client one shared id and calls it "Self
  host app" on its consent page. To show Simeon's name, create an app in Dropbox's App Console,
  add the loopback redirect, and put its app key in the `dropbox` row of `catalog.ts` as
  `clientId`; the sign-in then skips registration. No key is set yet. Canva, Square, Vercel and
  Dropbox cannot connect from the web window: a browser tab cannot listen on the loopback, and
  the vendor's page ends on "can't connect to localhost". On a Mac with the Electron app open
  and signing in, the Mac app in Swift finds the loopback taken and says to quit the other app.
* **Not yet verified.** The loopback sign-in on an iPhone and in the Mac app in Swift: the
  listener was checked against stand-ins for Apple's Network framework on Linux, not run on a
  device.

- **Ten apps moved here from our apps service, and two added** (13 October 2026, the founder:
  "there are plenty of MCPs out there"). The audit that day probed each app's maker for a
  hosted MCP server (an unsigned `initialize` answered 401 with OAuth metadata) and read the
  official MCP registry; nothing was registered anywhere. Ten answered with open registration
  and S256 and moved in place, keeping their ids: Asana (`mcp.asana.com/mcp`), Todoist
  (`ai.todoist.net/mcp`), Intercom, Klaviyo, Ashby (`mcp.ashbyhq.com/mcp/v1`), Calendly
  (`mcp.calendly.com/`), Cal.com, Attio, Gorgias and Gong. Klaviyo and Ashby leave "Coming
  soon" with it. Granola (`mcp.granola.ai/mcp`) and Resend (`mcp.resend.com`) were appended.
  Someone who had connected one of the ten through our apps service is moved to the new
  address and signs in once on the maker's page (`atCatalogAddress` in `installs.ts`). Not yet
  known for any of them: whether the maker accepts our hosted return address (as Canva,
  Square, Vercel and Dropbox did not); a refusal shows on the first sign-in, and the fix is
  `loopbackOnly`. Left for later: Figma and Gumroad advertise open registration but may limit
  who registers; GitHub, HubSpot, Slack, Discord, Zoom and Docusign need an app of ours (GitHub,
  HubSpot and Discord are being registered: their secrets go on the API service only, as
  `SIMEON_MCP_GITHUB_CLIENT_ID` and `SIMEON_MCP_GITHUB_CLIENT_SECRET`, likewise `HUBSPOT` and
  `DISCORD`, for a token exchange on the server that is not built yet: a secret never ships in
  the computer's engine); Jira stays on `/v1`, which Atlassian already serves v2's tools from. Google's and Microsoft's apps
  stay on our apps service (no hosted server for people's own accounts), as do the rest.
- **Simeon's client document, and why Shopify still waits** (13 October 2026, the founder: "the
  newer sign-in style that Shopify and Zendesk require"). Some MCP servers register no clients
  and take none made by hand; their metadata says `client_id_metadata_document_supported` and
  a public client at the token endpoint (the MCP specification's 2025-11-25 sign-in). The
  client ID is the address of a document describing the client, which the vendor fetches.
  Simeon Labs' server serves Simeon's at
  `https://api.simeonlabs.com/desktop/mcp-oauth/client.json` (`mcp_oauth_client_document` in
  `server/simeon/desktop/app_sign_in.py`: name, logo, privacy and terms pages, the hosted
  return address and the loopback, no secret; live since that day). Its `client_id` is built
  from `SIMEON_BASE_URL`, and the computer builds the same address from the server it talks to
  (`hostedMcpOAuthClientUrl` in `host/extensions/mcp/mcp-service.ts`), so the two match.
  `oauth.ts` sends it only to a vendor with no registration endpoint; a vendor that offers
  both (Notion, Linear, Granola and others) keeps registering as before. Custom servers added
  by URL (7b) get the same. Log line: `registered=by our document`.
  **Shopify** (`https://mcp.shopify.com/`) reads such documents but takes only clients it has
  approved. Measured that day at `setup.shopify.com/oauth/authorize`, each client with its own
  return address and the resource: Claude's document went on to Shopify's consent page (302);
  VS Code's, VS Code Insiders', Goose's, Zed's and Simeon's (live and valid) were each answered
  `{"error":"unauthorized_client"}`. So Shopify stays with our apps service and "Coming soon"
  (`OWN_APP_NEEDED`, `AppsComingSoon.builtIn`) until Shopify approves Simeon's client document
  address; then its row in `catalog.ts` becomes `url: "https://mcp.shopify.com/"`, with
  nothing else to build. Its server also answers without a sign-in (business names, domains,
  sample catalogs) and signs in for the store's own tools; the store is picked on Shopify's
  page.
- **Lovable** (13 October 2026, the founder: "add lovable"): its own server
  (`https://mcp.lovable.dev`, open registration, a public client, S256, measured that day) takes a
  hosted sign-in address only once Lovable approves it, and the loopback always
  (docs.lovable.dev, "Lovable MCP server"), so it is `loopbackOnly`, as Canva is: it connects from
  the iPhone and the Mac app, not from the web window. Workspaces on Lovable's Enterprise plan
  must switch third-party MCP clients on. Word and PowerPoint have no app of their own anywhere
  (no Composio toolkit, no Microsoft server for people's own accounts): their files are
  OneDrive's and SharePoint's, which agents open, change on their computer and save back.
- **Zendesk stays on our apps service.** `mcp.zendesk.com` advertises client documents, but
  its authorize page sends everyone to "Help Center Closed" (measured 13 October 2026): it
  behaves as a Zendesk account named "mcp" that nobody can sign in to. Zendesk's own server is
  per account, `https://<subdomain>.zendesk.com/api/mcp` (early access, measured on
  `support.zendesk.com`: 401 with RFC 9728 metadata, open registration, a public client,
  S256). Moving Zendesk needs the person's subdomain in the connect sheet before the address
  is known.

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
Zoom, Figma, QuickBooks, HubSpot, Salesforce, GitHub, Mailchimp, Gusto, Slack, LinkedIn,
OneDrive, SharePoint, OneNote, Microsoft To Do, Trello, Xero, Shopify, Brex, Pipedrive, Docusign
and the others marked `app(…)` in
`catalog.ts` connect through Simeon. The provider behind them is never named in the app.
(Asana, Todoist, Intercom, Klaviyo, Ashby, Calendly, Cal.com, Attio, Gorgias and Gong moved to
their makers' own servers on 13 October 2026; see 7a.)

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

* **Settings on Render.** `SIMEON_COMPOSIO_API_KEY` (optional `SIMEON_COMPOSIO_BASE_URL`), and
  `SIMEON_COMPOSIO_AUTH_CONFIGS`, Simeon Labs' own sign-in per app as JSON
  (`{"xero": "ac_…", "gusto": "ac_…"}`).
* **Simeon Labs' own sign-in for an app** (needed for the six in Known limits; also what puts
  Simeon's name on Google's consent screen). 1. Register an OAuth app with the company (its
  developer portal), redirect URI `https://api.simeonlabs.com/desktop/apps/oauth/callback`. 2. In
  the provider's dashboard, Auth Configs, create one for that app with "your own credentials"
  (the client id and secret), and set its redirect URI to the same address. 3. Add its `ac_` id
  to `SIMEON_COMPOSIO_AUTH_CONFIGS` and redeploy. A sign-in uses a config only when the session
  is given it (the provider's documentation, checked 11 October 2026; before that day the
  server gave none, so a config made in the dashboard alone was never used).
* **White label without apps of our own** (13 October 2026, the founder: "i dont have money for
  google so white label composio as best as you can"). Every sign-in now starts on our address,
  `https://api.simeonlabs.com/desktop/apps/start?…`, a link signed with the server's secret and
  good for 15 minutes, so the iPhone's and the Mac's sign-in sheet say simeonlabs.com. The server
  asks the provider's link where it leads (`provider_page`, without following it): while it only
  redirects, the person goes straight to Google's, Slack's or HubSpot's own page and never sees
  the provider's; a link that is a page of its own is kept. Log lines
  `desktop.apps.link_direct` (with the host) and `desktop.apps.link_kept` (with why). The way back
  is ours too: the provider returns the person to `/desktop/apps/connected`. The connect sheet in
  the apps no longer names the provider: "Simeon connects Gmail through a secure sign-in partner
  … Gmail's page may show the partner's name." **What still shows its name:** the app's own
  consent screen ("Composio wants access to your Google Account") for every app on the
  provider's managed sign-in, until Simeon Labs registers its own app with that company; and, for
  a link kept as a page, the provider's hosted page, branded in its dashboard (Project Settings →
  White Labeling → Branding: title "Simeon", our logo; its "Secured by" line goes only with our
  own app). Not yet seen on a live sign-in.
* **No in-between pages** (13 October 2026, the founder: "that simeon wants to connect page
  makes no sense ... it goes to the page that ends connection immediately without me clicking
  anything. please remove it" and "the last screen after something is connected makes no sense
  ... should take us back"). The provider's managed sign-ins only ever hand out its hosted
  Connect page (`connect.composio.dev/link/lk_…`; the documented `long_redirect_url` is refused
  for its managed sign-ins since July 2026). That page, read from its own script, asks its
  backend about the link (`GET api/v3.1/internal/connected_accounts/link/{token}`, no key) and,
  when the app asks for nothing, starts the sign-in at once (`POST` the same, `{"input": {}}`)
  and goes where that answers. The server now does those two calls itself
  (`_past_link_page`), so the start link leads straight to Google's or Slack's page. An app
  that asks something (a shop's or a subdomain's name), a team account, or any answer not
  understood keeps the page, which still works (`desktop.apps.link_kept` says why). The internal
  calls are undocumented: if the provider changes them, sign-ins fall back to the page, nothing
  breaks. At the end, the apps add `back=<their scheme>` to our start link (`Connecting.returning`);
  `/desktop/apps/start` keeps it in a 15-minute cookie on `/desktop/apps`, and
  `/desktop/apps/connected` then sends the person to `simeon-ios://connected` or
  `simeon://connected` (`?status=failed` when the provider says so), which closes the sign-in
  sheet at once. Only the two apps' schemes are kept; a browser's tab (the web app) still ends on
  the page. A vendor's own sign-in (an MCP server's) is not ours to end and is unchanged: the
  sheet closes itself as soon as the computer says it is connected.
* **"That link has expired" on every Google sign-in** (fixed 13 October 2026). The apps add
  `back=` through Apple's `URLComponents.queryItems`, which writes the link's values back with
  every `+` left bare, and a bare `+` in a query reads as a space. The start link carried Google's
  address as itself (`to=`), so Google's `scope=a+b` arrived as `scope=a b`, the signature failed,
  and the page said the link had expired (reproduced in `tests/desktop/test_apps.py`). The
  address now travels as base64url (`t=`), which nothing rewrites; a link made before (`to=`) is
  still accepted, with its spaces put back. A refused start link writes
  `desktop.apps.start_refused` with `reason=signature` (changed on its way, or never ours: "That
  link didn't work") or `reason=expired` (older than 15 minutes). The same page was light text on
  a white card in dark mode; its dark colours now come last.
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
  a tool not found names the ones that exist. A `pattern` ignores case since 7 October 2026:
  `"search|thread|list_messages"` found nothing among Gmail's upper-case names, and three
  agents each fetched the whole 60-tool listing instead (`get-mcp-tools.ts`). Clicking Add waits up to 8 s for the install to
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
* **What a tool call hands back** (7 October 2026). `simeon/desktop/app_results.py` tidies
  every result before the agent sees it: a mail's routing headers (DKIM, ARC, Received) go and
  From, To, Cc, Subject, Date stay; encoded bodies become text, the HTML copy goes when a plain
  one exists, quoted earlier replies fold to one line; ids, tokens and links stay whole. What is
  left is cut at 30,000 characters with a hint to ask for less. One Gmail thread used to fill
  the old 60,000 character cut and was paid for again on every later step. On the box, a result
  over 40,000 bytes goes to a file under `.sand/tools/`; if that file cannot be written the
  result is now cut with a notice instead of going to the model whole.
  Since the September inbox log (also 7 October), for a message whose text is in `messageText`:
  text that arrives as HTML (an Apple Mail reply) is turned into text; the earlier reply chain
  under it (an HTML quote, or Outlook's `From: ... Sent: ...` block of 800 characters or more)
  folds to one line saying how much was left out, except in a forward (`Fwd:` in the subject, or
  "Forwarded message" in the text), where the quoted part is what was sent; and the MIME
  skeleton (`payload.parts`) and the `preview` copy go, since the text is in `messageText` and
  every attachment id is in `attachmentList`. A listing without text (`verbose=false`) keeps its
  preview. A message shaped like the Carlton budget email went from 3,694 to 1,884 characters.
  For every message, a header that repeats its own `sender`, `to` or `subject` exactly goes,
  and so does the preview's copy of the subject: a listing entry sent to nine people carried
  the recipient list twice and the subject three times (5,249 → 3,362 characters for three
  entries from the staffing log).
* **The provider round trips.** Which accounts a person has connected is asked once a minute at
  most for the agent's tool calls (`connected_account_ids`); "not connected" is never kept, and
  disconnecting forgets it.
* **Known limits.** Google's consent screen shows the provider's name until Simeon Labs uses its
  own Google OAuth app. Gusto, Xero, Shopify, Brex, Pipedrive and Docusign have no sign-in the
  provider manages (checked 11 October 2026; Klaviyo and Ashby left this list on 13 October for
  their makers' own servers, 7a; Shopify's own server takes only approved clients, 7a), nor do
  OneNote and Microsoft To Do (added 13 October 2026; Composio's toolkit pages say "requires
  connections to go through your own OAuth app"; Simeon Labs' Microsoft app serves them once
  registered, with Teams, Outlook, OneDrive and Excel): their
  link works once Simeon Labs registers its own app with each and names it in
  `SIMEON_COMPOSIO_AUTH_CONFIGS`. Until then a refused link answers 503 and the card says
  "<App> is coming soon in Simeon." (`OWN_APP_NEEDED` in `apps.py`; log line
  `desktop.apps.sign_in_needs_own_app` with the provider's sentence); once named, a refusal is
  the provider's sentence (502). Gusto (production pre-approval, security review, QA), Brex
  (credentials issued by its developer support), Docusign (go-live review) and Shopify (app
  review to reach other stores) review an app before it reaches other people's accounts.
* **"Coming soon" in the apps** (13 October 2026, the founder: "mark a clearer coming soon in
  those in the apps. they cant be added"). The six have no Add in the iPhone and Mac apps: their
  row in Connect apps (Plugins on the Mac), their page and an agent's connect card show a grey
  "Coming soon" pill, and the row is faded. `GET /desktop/api/apps` names them
  (`{"available": …, "comingSoon": ["brex", …]}`): `OWN_APP_NEEDED` less the ones in
  `SIMEON_COMPOSIO_AUTH_CONFIGS`, so naming an app's own sign-in there brings its Add back with
  no new build. The apps read it with the catalog (the iPhone) or as Plugins opens (the Mac),
  and until they have, they hold the same six (`AppsComingSoon` in SimeonCore). Needs a new
  build of each app; not yet seen on a device.
* **Not yet verified.** No sign-in or tool call against the live provider, and nothing on a Mac.

### 7d. Link: purchases and bank accounts

**For the person.** (13 October 2026, the founder: "add stripe/link-cli so that the agents can
make purchase for the user … and access their banks, read and advise based on it".) Link is
Stripe's agent wallet. Added from Connect apps like any app, it lets an agent buy something the
person asked for, and read the bank and card accounts the person chose to share with Link
(transactions, balances, account details) to answer questions about spending and give advice.
Nothing is paid until the person approves the purchase in the Link app; each purchase gets its own
one-time card, never their real one. Purchases work for US and Canadian Link accounts, bank
reading for US ones.

**How it works.** No server of ours is involved. The engine runs Stripe's own CLI,
`@stripe/link-cli` 0.27.1, on the person's cloud computer
(`desktop/source/shared/node/link-wallet/`), as a third kind of app beside the vendors' and the
ones our server serves (`boxCli` in `vendor-mcp/catalog.ts`; `vendor-mcp/backend-exec.ts`).
* **Sign-in.** Add runs `link-cli auth login --client-name Simeon` with the four financial
  source actions; Link answers a page on app.link.com that already carries the code
  (`/device/setup?code=…`), which the apps open in their sign-in sheet. The person signs in to
  Link there (or approves in the Link app); the sign-in's watch runs `auth status` every 5 s,
  which finishes it. The approval screen names "Simeon on <computer>" with Link's generic look:
  Simeon's own name and logo there need Simeon Labs' registered OAuth client (below).
* **Where it lives.** The sign-in is one file on the data volume,
  `/home/box/sand-data/link/auth.json` (0600), so a box update keeps it. The CLI comes with the
  image (`box/Dockerfile`, `LINK_CLI_VERSION`); a box on an older image installs the same version
  under `/home/box/sand-data/link/cli` the first time Link is used (about 150 MB, 15 to 35 s).
  Its install script is skipped: it fetches Stripe's agent skills with npx.
* **The agents' tools** (`link-tools.ts`): `get_wallet`, `wait_for_approval`, `pay_checkout`,
  `cancel_purchase`, `list_purchases`, `list_accounts`, `get_balances`, `list_transactions`. No
  Link tool starts a payment: every purchase is a checkout card first (below). The old
  `create_purchase` answers with a pointer to it.
* **A flight** is booked through the same card with a flight on it, and Simeon, not the agent,
  pays it once Link approves (§10a).
* **The checkout card** (13 October 2026, the founder: "we also need a card for each payment …
  like muse"; `shared/node/link-wallet/purchase-card.ts`, `host/runner/tools/purchase-tool.ts`,
  `host/extensions/transcript/purchase-cards.ts`, SimeonCore `PurchaseCard.swift`, the cards in
  `ios/Simeon/Cards.swift` and `mac/Simeon/Cards.swift`). The path, adapted from Muse's payment
  rules to our tools (the system prompt's purchase lines):
  1. A browser subagent opens the shop, fills the cart and the delivery details (from
     `get_wallet`: the sole or default address, name, email, phone) and stops at the last step
     before paying. The agent tells the person what the order is (Order, Delivery, Price, Terms).
  2. `RequestPurchase` checks the person's Link (connected, nothing to verify, the amount within
     their per-purchase, daily and 30-day limits, the card that pays: the one asked for, else the
     default or only one, and not one Link marks unusable by agents,
     `capabilities.agentic_payments.eligible: false`), takes a JPEG of the checkout tab over DevTools (`captureCheckout`,
     only a tab on the shop's own site) and posts the card: Checkout, "<agent> wants to place an
     order at <site>", the picture with Review order, "Visa •••• 1234 · Pay with Link", the
     total, Deny and Allow. The turn ends there, as after a question. Nothing is asked of Link yet.
  3. Deny: the card says Denied and the agent is told once. Allow (gateway `answerPurchase`): the
     host makes the spend request, one per card (`--idempotency-key` from the card, so a second
     tap or device asks Link nothing), Link asks the person in the Link app, and the card shows
     "Approve it in the Link app" with Open Link (Link's approval page). The host, not the agent,
     watches Link (`spend-request retrieve` waiting two minutes a look, up to Link's 30 minutes),
     so waiting costs no model calls. An app showing such a card asks the host to keep watching
     it (`resume`), which never answers a card.
  4. Approved: the agent is woken once with the steps: check the checkout is unchanged,
     `pay_checkout`, the browser subagent presses Place order once (its brief says the person
     approved this exact order; subagents may press it only then), `MarkPurchaseDone` with the
     order number. The card shows Ordered (or Didn't go through), and Link gets `report` with the
     outcome. Declined in Link, expired or canceled: the card says so and the agent is told.
* **The card never reaches the agent.** `pay_checkout` has Link write the one-time card to a
  0600 file, types it into the checkout open in the box's Chrome over DevTools
  (`checkout-fill.ts`: 127.0.0.1:9223, and 9222+N for window N; card fields in the page and in
  Stripe's, Shopify's, Braintree's and Adyen's payment frames), deletes the file and answers only
  which fields it filled. A billing ZIP or name is typed only where the field is plainly the
  card's, never a shipping address's. For a Stripe checkout that offers it, the Link pay token is
  set the same way. Every answer is scrubbed of card numbers, security codes and tokens. The
  agent presses Pay itself after checking the order. A screenshot it takes of the filled form can
  still show the digits.
* **The CLI's answers.** Run with `--format json`, a list command (`payment-methods list`,
  `shipping-address list`, `spend-request list`) prints the list itself as an array; a step that
  streams (`auth login` and `status`, `spend-request create` and `retrieve`) prints its states as
  one array, of which the last is where it ended (`LINK_LIST_COMMANDS` in `link-cli.ts`). Until
  14 October 2026 every array was read as states, so the card list came back as its last card,
  and `RequestPurchase` answered "The person has no card in Link yet" before every checkout.
* **Limits (Link's).** $500 a purchase, $500 a day, $20,000 in 30 days; 30 minutes to approve;
  the card works for 12 hours. `RequestPurchase` reads the person's own limits first and says
  which one a total breaks before any card. Test mode (`test: true` on `RequestPurchase`) returns
  a test card and charges nothing; the card shows a Test pill.
* **Log lines.** Box: `[link] installing …` / `[link] installed …` and `[link] purchase
  requested: <status> <lsrq_…>` in the host log; `[simeon] [purchase] allowed <agent>/<entry>:
  <status> <lsrq_…>`, `[purchase] denied on the card …`, `[purchase] ordered …` and
  `[purchase] watching <lsrq_…> failed: <code>` for the card; `link sign-in started with Link's
  device code` and `link connected` in `vendor-mcp-signin.log` on the data volume.
* **Later: Simeon's own client.** Stripe asks agent products to register an OAuth client (the
  Link Agent Wallet application form, redirect `https://api.simeonlabs.com/desktop/apps/link/callback`,
  settings `SIMEON_LINK_CLIENT_ID` / `SIMEON_LINK_CLIENT_SECRET` on the API service). With it the
  approval screen carries Simeon's name, and bank reading needs the company's Stripe account (the one Simeon's billing uses)
  registered for Financial Connections. Only the sign-in changes then: the server holds the
  tokens and hands the box `LINK_ACCESS_TOKEN`, which the same CLI reads.
* **Not yet verified.** Tested here: the CLI's sign-in start and status against Link's real
  server (no account approved), the tools and the card's whole path (Deny, Allow, a double
  Allow, Link's approval, decline and refusal, the order, a card in a chat that isn't open)
  against a scripted CLI (`desktop/tests/purchase-card.test.mjs`), the filler and the checkout
  picture against Chromium with a fake checkout, and the card's model and the demo's Allow in
  SimeonCore's tests. The flags and answer shapes were read from `@stripe/link-cli` 0.27.1's own
  code. No real Link account, purchase or bank read yet, and the cards have not been drawn on a
  device (no Xcode here: parse-checked only).

## 8. Agent features that touch the server

### Avatars

**For the person.** An agent's picture can be uploaded from a file or generated from a
sentence.

**How it works.** **Upload** stays on the Mac and in the box: a file dialog, a crop, then
`setAgentAvatarBytes`, which writes `avatar.png` in the agent's folder and refuses an empty
payload, one over 5 MB, or one that is not an image. **Generate** posts to
`POST /desktop/api/proxy/v1/images/generations` (`server/simeon/desktop/capabilities.py`, model
`gpt-image-2.5-flare` since 14 October 2026, `gpt-image-1` before) at low quality (`electron-main/adapters/avatar-images.ts`); the result is
cropped and saved by the same upload path. The roster reads the picture into every row
(`readAgentAvatarForSummary` in `host/extensions/session/session-summaries.ts`), and an avatar
change made by the agent itself redraws the roster (`onAvatarChanged`).

**Faces** (12 October 2026). The iPhone and Mac apps draw no butterflies: every agent shows
a picture, and an agent without one is given a face from a catalogue of 31 clay characters
(15 women, 15 men, and Simeon's own), shipped in both apps
(`ios/SimeonCore/Sources/SimeonCore/Resources/Faces`, 512 px WebP, about 500 KB in all, made
by `ios/scripts/make-faces.py`). A face is a picture like an uploaded one: the app sends its
bytes with `setAgentAvatarBytes`, so it lands in `avatar.png`, syncs and shows everywhere; the
host's `avatarVersion` (the first 16 hex of the bytes' SHA-256) tells the apps which face an
agent wears, and they draw it from their own copy. The face given is kept on the agent in its
`avatarShape` profile field (`clay-07`; the host stores it and passes it on untouched), so an
upload keeps it and the editor's Reset puts it back. The choice (`AgentFaces` in SimeonCore):
the Chief of Staff gets Simeon's face, which no one else is given; any other agent the face its
gender has fewest of, the gender being its name's (`AgentVoices.nameGender`, as for its
voice), else its voice's, else one its id picks; ties by the voices' FNV-1a hash of the id, so
the iPhone and the Mac pick the same. A name with no gender keeps the face's, and its voice is
then given of that gender; in the editor, a face of the other gender than the voice's brings a
voice of its gender with it. Faces are given by the apps (`StoreFaces.swift`, on every roster
change, to every agent with no picture, new or from before), not by the engine: no new host
bundle is needed. Until an app has run once after an agent is hired, that agent has no
picture, and the web app (out of this change) draws its butterfly. On the iPhone's New Agent
sheet the face has the agent page's pencil (13 October 2026): the same editor (Faces, Generate,
Upload, the voice) works on the agent to be (`AgentDraft` in SimeonCore) and nothing is sent until
Create; then the face and the voice go with `createAgent` (`avatarShape`, `voiceId`) and a
picture drawn or uploaded right after it, with no face put on over it
(`AppStore.createAgent(name:draft:)`). A face picked brings a voice of its gender, so a woman's
face picked for "Leo" speaks with a woman's voice. Untouched, the agent is made as before. The
Mac makes agents from the new chat's To: line, which shows no face; there the pencil is on the
agent's pane once it exists. Mentions in messages are
the face in a glass pill with the name in the app's blue; names are no longer coloured. A tap
(a click on the Mac, with the pointing hand) on a pill opens that agent's chat: each pill is
drawn on its own line of words and records where it was drawn (`MentionSpots`), and the tap is
matched to it (`MentionTaps` on the iPhone, `MentionClicks` on the Mac, both in
`MessageText.swift`); VoiceOver has an "Open <name>" action for each.
* **Log lines.** In the apps' trace: `face for <agent>: clay-07`, or `face clay-07 shown on
  <agent>, not saved: <error>` (the host refused; the face shows until the next sign-in, which
  tries again).
* **Follow-ups.** The web app's window and the website's demo still draw butterflies (the
  pinned renderer, `desktop/scripts/lib/router-renderer-patch.mjs`).

**Colours** (7 October 2026; since faces only the web app shows them). An agent without a picture is drawn as the butterfly in one of
12 colours (`AGENT_MARK_PALETTES`, `shared/voice-call/agent-mark.ts`). One with no colour
stored is drawn in a colour hashed from its id, among the first ten: the window's own
fallback, the upstream app's (`sle`, kept by `AGENT_COLOR_RESOLVER` in the renderer patch). It
stored a colour only when the person picked one in onboarding or settings; an agent created
by another agent had none and was left to the hash, which is even (about 10% per slot) but
can repeat. In the staffing log Leo, Nina and Ava all hashed to Ocean, the blue the Chief of
Staff is stored with, a one in a hundred draw. Asked to tell them apart, the main agent
messaged each teammate to draw its own picture: two refused (the upstream app's own rule, "Never
change your picture unless the user asks", and its "not the user" note on agent messages),
one generated an image, one wrote a script, and each reply woke the main agent on its whole
conversation.

A new agent without a colour now gets the colour fewest agents are drawn in, an agent without
one counting as its id's hash (`pickAgentColor` in `shared/agents/agent-colors.ts`, called by
`mintAgentSession` in `host/extensions/transcript/agent-lifecycle.ts`). Ties go by a measured
order: from Ocean, each next palette is the farthest from all before it (mean CIE Lab ΔE over
the butterfly's three stops): Ember, Moss, Dusk, Lagoon, Sand, Mint, … Agents are created
one at a time, so three hired in one step get three colours. A colour given at creation is
kept. The agent can recolour a teammate with `UpdateAgent` `color` (a label such as `Moss`);
The upstream app had no way for one agent to change another's look. Agents made before this keep
their hashed colour until recoloured. `tests/agent-colors.test.mjs`.

* **Settings on Render.** `SIMEON_OPENAI_API_KEY`.
* **Log lines.** A failed Generate shows `edge/handler-failed: <the server's sentence>` in the
  editor; on the server, `desktop.proxy.upstream_refused`. The Mac keeps no log for this path.
* **Not yet verified.** Neither flow has been measured on a Mac since the roster fix. The
  colours are tested offline only: three agents hired at once have not yet been seen in the
  window.

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

* **The buttons in the packaged app** (7 October 2026). The shipped window drew both cards
  with empty callbacks, so Send and Discard did nothing. The `draft-send` patch in
  `desktop/scripts/lib/router-renderer-patch.mjs` teaches the window's coordinator and
  transcript client `sendDraft`/`discardDraft` and binds both cards to them with the card's
  agent and entry id; the box first loads that agent's transcript (`ensureActionTarget`), as
  approval cards do. A card that stays on "sending" means the agent's wake never finished:
  read `/tmp/sand-host.log` for `tool=CallMcpTool` and `tool=MarkDraftDelivered`.
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
  use, and rewrites it whenever its version tag changes: `VOICE_AGENT_CONFIG_VERSION` in
  `server/simeon/desktop/voice.py` and, since 9 October 2026, a fingerprint of the voices
  (`VOICES_FINGERPRINT`: the default and `CURATED_VOICES` in order), so a change to the list
  rewrites it too (the id is remembered per process). On 6 October Michael replaced Jessica as
  the default without a new version: the agent kept Jessica as its own voice, and every call
  that named no voice spoke as Jessica. Version 9 rewrote it; version 10 (9 October 2026) raised
  the speech's stability from 0.7 to 0.85 (`VOICE_TTS_STABILITY`; the founder: "the voice changes
  tone randomly. i want them all the be calm"), and the voice is told to keep one calm tone and
  never to exclaim. Its configuration: authentication required, the four overrides
  above and no others, `gemini-2.5-flash` as the voice's model with `thinking_budget: 0` (2.5 Flash thinks
  before every reply by default, and the replies waited on it), `eleven_flash_v2` for
  speech (an English agent is refused on any other), a voice the workspace has (the first of the
  founder's voices the account has, Michael; else Eric when listed or nothing is; else the
  first ElevenLabs default: a missing voice is refused with `voice_not_found`), `end_call` and `skip_turn`, a 7 s turn timeout,
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
    the list is empty: no other voice is ever offered (until 9 October 2026 the picker fell
    back to ElevenLabs' defaults, which brought Jessica back). `[{id, name, description, labels, gender,
    preview_url}]`, description and labels empty, cached for an hour. `gender` is ElevenLabs'
    own label when the voice has one, else `CURATED_VOICE_GENDERS` (Veda, Amanda, Chelsea and
    Hope are women's voices). The voice listed as Jon is shown as Simeon since 8 October 2026
    (`SIMEON_VOICE_ID`): the Chief of Staff's own.
- Each agent's own voice (8 October 2026; the founder: "each agent should be assigned a
  different voice … named like a woman, like Maya, default to a woman voice, not always the
  same, and vice versa for men"). Every agent without a voice on the list gets one and keeps
  it (`assignMissingVoices` in `electron-main/voice/voice-call-service.ts`, saved through
  `updateAgent` like a picked one): on the Mac as soon as the window names an agent (at most
  once a minute), and before any call or picker that needs it (`assignedVoice`); on the
  iPhone when it attaches, when an avatar editor opens and before a call
  (`AppStore.ensureVoice`, `ios/SimeonCore/.../AgentVoices.swift`, the same rules and hash, so
  both give an agent the same voice). A stored voice no longer on the list (Jessica) counts as
  none and is replaced (9 October 2026, the founder: "every voice says "michael" by default,
  even tho its a different voice": the pickers showed the list's first while the calls spoke
  in the stored or the platform agent's voice). Agents are given theirs in id order; groups
  and shared rooms have none. Log: `voice for agent <id>: <voice> (given by name…)`. `pickAgentVoice` (`shared/voice-call/agent-voices.ts`) gives the Chief of Staff the
  Simeon voice and no one else; any other agent the voice fewest agents have among those of
  its name's gender, from the voices the account has. A name's gender comes from the US
  Social Security baby-name counts (`shared/voice-call/name-genders.ts`: a name is a woman's or
  a man's when at least 85% of those given it were; Jordan or Taylor are neither, and get any
  voice). Between equally free voices the agent's id decides, so agents hired together differ.
  Until then every agent without a picked voice spoke as Michael. The four women's voices are
  spread over the first four women before one repeats. `tests/agent-voices.test.mjs`,
  `tests/voice-call-lifecycle.test.mjs`, `AgentVoiceTests` in the iPhone core (its expected
  voices are the Mac code's own answers; its name lists are generated from the Mac's by
  `node ios/scripts/make-name-genders.mjs`, and a test fails when they differ).
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
  - **"Browser Auto-review could not capture the current page state."** Before a browser or
    computer action is reviewed, the host reads the page through the box's shell (the CDP list
    on the agent's display). That shell refuses in three cases: an Auto-review approval is
    pending for the agent ("Another action is waiting…"), the box is not ready, or the turn was
    cancelled. Since 7 October 2026 the message carries the shell's own reason, and a
    cancellation stays a cancellation; before, every case read the same. Since 8 October,
    when the review only shadows (the default again, `sand_auto_review` off), a failed probe
    no longer stops the action: the host logs `auto-review probe failed in shadow, action
    allowed: <reason>` and the action runs. In enforce it still refuses, with the reason.
  - **"Not run: this is the third time you have sent exactly this action to exactly this
    screen."** The Computer tool's loop guard (8 October 2026, `sand-computer-tool.ts`): the
    third identical action on a screen that did not change after the first two is refused
    with that sentence, and never reaches the box. The insurance log of 6 October showed a
    helper send the same click and ZIP code to the same screen four times over.
  - **A form that needs the person's own details.** The computer and browser helpers are told
    to stop at such a form (a quote, a booking, an application) with it on screen and report;
    the main agent and a staffed agent hand the person the box with `request_box_help` so they
    fill it in themselves, then dispatch the helper again. Never to swap the job for a safer
    one, never to invent the details (8 October 2026, the same log).
  - **"Couldn't attach" on the Mac.** The stage step now takes the bytes in any shape the
    bridge delivers (Uint8Array, ArrayBuffer, Buffer, DataView, array) and writes a line to
    the Mac's main log when it refuses or fails: `[simeon] attachment stage refused …` or
    `[simeon] attachment stage failed: <error>`, and `[simeon] attachment commit failed:
    <error>` when the upload to the host fails (for example "No active agent to attach to").
    Read that line before reasoning about a failed attachment.
  - **The launch of a background subagent is reviewed with the conversation.** Until 7 October
    2026 the review for that surface read "Recent conversation: (none)" (the other surfaces
    carried it), so a check the person had asked for on the call was blocked as "without a
    clear request from you".
  - The agent answers with `SendMessage` with `channel` set to the call's address. That
    message goes to the call, not to the chat. Main reads the call's outbox every 1.2 s and
    pushes new messages into the call (`sendContextualUpdate`, then a one-line
    `sendUserMessage` nudge, "(Your work just came back.)"), and the voice says them as its own.
    Never over the voice (9 October 2026, the founder: "he cant cut himself like this, wait of
    turn"): the Mac holds them until the voice is listening, with no forced push after 8 s any
    more; the iPhone and the native Mac app (SimeonCore's `LiveCall`) hold them until the voice
    has stopped and the person is not talking, for a second. A message that only confirms something the voice already said it was doing is not
    announced ("they can see it done"): the voice stays silent with `skip_turn` unless asked.
    The banner's status line shows the agent's activity meanwhile ("Using Gmail…"). The host
    keeps both the nudge's words and an older app's ("…Tell me what it found.") out of the
    call's record.
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
  picker on Edit agent avatar › Faces (under the faces; it was under "Character color" on Agent
  before faces) lists `voice/voices`, plays a
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
7. Press the phone button during a call: the banner comes forward, no second call starts.
   (The ended banner has no Chat or Call Again: the protocol carries them, nothing draws them;
   measured 11 October 2026.)
8. Edit agent avatar › Faces: under the faces, the Voice list. Play a sample, choose one,
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
  33,000 credits a minute the hourly brake (1,000,000 since 8 October 2026; 200,000 before) stops a new call after roughly six
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
Each flight can be booked from there ("Book with Simeon", §10a).

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

### 10a. Booking a flight

**For the person** (13 October 2026). "Book with Simeon" under a flight (the iPhone's flight
sheet, the Mac's flight pane), or "book that one" to the agent, puts a traveller form in the
chat: each traveller's first and last name as on their ID, title, gender, date of birth, email
and phone, and the passport only when the airline needs it; the first traveller starts with
what Link knows (name, email, phone). Continue brings the flight's checkout card: the airline,
the route and times, who flies, the Link card that pays and the total, with Allow and Deny.
Allow sends it to Link, which asks the person to approve it in the Link app; then Simeon pays
the airline and books it, and the card ends on "Booked" with the airline's booking reference.
When the bank wants to check the card (3-D Secure), the card says so and its button opens the
computer, where the bank's page is.

Nobody holds a Duffel balance: the traveller pays the airline by card through Duffel's card
payments, with the one-time card Link makes for this booking. **Duffel has to switch card
payments on for the account** (help@duffel.com, "approval is required to pay using cards").
Until it does, and always with a `duffel_test_` token, it all runs in Duffel's test mode
(Duffel Airways, nothing charged; the cards say "Test").

**How it works.**

- Every offer on the search card carries Duffel's `offerId`, and the agent's summary too.
  The apps' button calls the gateway's `startFlightBooking` (the card's entry and the offer's
  place on it); the agent's `BookFlight` tool (`host/runner/tools/book-flight-tool.ts`) takes
  the `offer_id`. Both ask the server for the offer again (`POST /desktop/api/flights/offer`,
  `server/simeon/desktop/flight_booking.py`: Duffel's prices hold for minutes) and post the
  form (`flight-passengers`, `shared/node/flight-booking/flight-booking.ts`), from the host for
  the button (`host/extensions/transcript/flight-bookings.ts`) or from the agent's turn, which
  then ends.
- Continue is the gateway's `submitFlightPassengers`. The host checks each traveller as the
  server will (`checkTravellers`), writes them to a file only the computer's owner reads
  (`<data folder>/flight-travellers/`, mode 0600, gone after the booking or a day), and keeps
  only the names in the chat (what Link filled in leaves the form too). It asks for the offer
  again, checks the person's Link (`checkoutFacts`: connected, limits, which card) and posts
  the checkout card: the purchase card (§7d) with a `flight` block. Allow, Deny and Link's
  approval are the purchase card's own.
- Once Link approves, the agent is not woken to pay: `purchase-cards.ts` hands the card to
  `flight-bookings.ts`, which stamps where it is (`purchaseStep`: paying, verify, booking):
  1. the offer again: a total that changed since the approval pays nothing and cancels Link's
     card;
  2. a component client key (`POST /desktop/api/flights/client-key`);
  3. the pay page (`GET /desktop/flights/pay`, `flight_pay.html`) opened in the agent's own
     Chrome on the computer, the key in the address's fragment (no server sees it); the page
     holds Duffel's card form (an iframe on `api.duffel.cards`, so the card never reaches
     Simeon's servers);
  4. Link's one-time card read to a file only the computer's owner reads, typed into Duffel's
     form over DevTools (`shared/node/flight-booking/duffel-pay.ts`), and the file deleted. In
     Duffel's test mode Duffel's own test card (4111 1100 1166 3887, no bank check) is typed
     instead, because Link's test card is not one Duffel knows; the box log says so;
  5. the bank check: a 3-D Secure session for that card and offer, made from the page as
     Duffel's own components make it; most cards pass without a word, some show their bank's
     page (Evervault's), which the person finishes on the computer;
  6. the order (`POST /desktop/api/flights/order`): instant, paid by card with the 3-D Secure
     session, for exactly the offer's total and its travellers. One order per offer per
     person (a second ask is refused); a refusal is Duffel's own sentence and books nothing;
     an answer that never came back, on the server or between the computer and the server,
     is "Not confirmed", never retried, and the agent tells the person to look for the
     airline's email.
  The card then shows "Booked" and the booking reference, Link is told how it went, the
  travellers' file is deleted, and the agent is told in one hidden line.
- A computer that restarts while paying closes the card honestly when an app shows it:
  before the order, "nothing was booked" and Link's card is canceled; during the order,
  "Not confirmed".

**Settings on Render.** `SIMEON_DUFFEL_ACCESS_TOKEN` (the same token as search; it must be
allowed card payments for live bookings), `SIMEON_FLIGHT_BOOKINGS_PER_DAY` (default 6 orders a
person a day; client keys four times that).

**When it misbehaves.** Server log: `desktop.flights.offer`, `desktop.flights.client_key`,
`desktop.flights.order` (order id, booking reference, total, `test`),
`desktop.flights.order_refused` (Duffel's answer in full) and
`desktop.flights.upstream_refused`. Box log: `[flight] form`, `[flight] travellers saved`,
`[flight] Duffel test mode: …`, `[flight] pay page stopped at <stage>: filled …; not found: …;
the form's fields: …` (the form's field names and labels, never a value: the first live run
of Duffel's card form says here which field the filler missed), `[flight] card confirmed`,
`[flight] booked <reference>`, `[flight] not booked: <why>`, `[flight] uncertain`.

**Not verified yet.** Run only against local stand-ins for Duffel's card form, its 3-D Secure
API and Evervault in Chromium (the filler found every field, by autocomplete and by label, and
the bank-check path ran), and against Duffel mocked in the server tests. Not yet: Duffel's real
card form (it needs a client key from Duffel), a Link one-time card through a real bank check,
and the whole path on an iPhone or a Mac.

## 11. Simeon, the Chief of Staff

**He staffs (7 October 2026).** The founder: "Simeon main job is to delegate. Not take on
action from the get go … onboarding should be him delegating. That also showcases him messaging
the agent, him creating it, and giving him directions." `desktop/source/shared/agents/chief-of-staff.ts`:
- His first run is his own cue, `SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT`, chosen by the lifecycle for
  the agent titled Chief of Staff (`agent-lifecycle.ts`): a hello, then one question, "What's the
  first thing you'd hand to a person if you hired one today?", its options drawn from the apps
  connected during setup (he reads GetMcpServerStatus first; he proposes no connectors for himself).
  On the answer he hires with CreateAgent: a first name, a title that names the job, a description,
  and a `brief`. Unclear answer: one more question, two at most, then he hires with what he has and
  says what he assumed. "I don't know" or "what do you recommend": he recommends and says why. A
  project that needs several roles: he says who he'd staff, three at most for a first team, and
  creates each. Then "Anything else you'd hand off today?".
- `CreateAgent` takes `title` and `brief`. With a brief the new agent runs no generic greeting: the
  brief is sent as its first message, and the inbound wake (`agent-to-agent-messaging.ts`) puts the
  staffed first-run cue in front of it: introduce yourself to the person as the one now on the job,
  propose the app you need, start. The brief always reads "<first name> staffed you to …"
  (`staffingMessage` puts the opening in front when the model forgot). The person's name reaches
  the transcript manager through `setUserFullNameResolver`, set by the composition.
- Every turn, his system prompt carries `## Chief of staff` (`system-prompt-assembly.ts`, by the
  profile's title, which now reaches the runner): a task that fits an agent goes to that agent; one
  that fits nobody gets a new agent; a project gets a small team; he does a thing himself only when
  it is quicker than briefing someone; when the person is unsure he recommends.
- The demo's onboarding (`desktop/demo/scenario.ts`, `onboardingScript`) plays the same scene: the
  question, the hire (Nora, Inbox, appears in the sidebar with Simeon's brief and her first words
  in her chat), the report. Not verified in the packaged app on a Mac yet.

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

## 12. Phone notifications

**For the person (8 October 2026).** The founder: "i want the app ready. mobile ios... plus
other stuff, like notification etc." When an agent finishes a turn or needs them, the person's
iPhone gets a push, with the Mac open or closed: the same news the Mac shows, in the same
words (the agent's name and its last message, or "<name> needs you" and what it needs). The
push carries `data: {agentId, kind}` for the iPhone app to open that agent. An agent whose
notifications are off, or a hidden one, sends none, exactly as on the Mac. The Mac's own
notifications are unchanged.

**How it works.**

- The host in the box emits the agents list the Mac's notification manager reads
  (`host/sand-host.ts`, `wireEvents`: `notification-baseline` at start, then
  `notification-agents` and `notification-agent-upserted`). `host/extensions/notifications/`
  runs the Mac's own decision over it (`SandOsNotificationDecider` in
  `shared/os-notification.ts`), with the window taken as unfocused. The agents as found at
  start are the baseline and never fire, so a restart is not news. It runs only where the box's
  supervisor starts the host (`SAND_HOST_IN_BOX=1`, `box/bin/simeon-supervisor.mjs`): in the
  person's cloud computer, and in the local Docker computer for internal testing, which pushes
  to the tester's own phone.
- For each notification it posts `POST /desktop/push` `{agent_id, agent_name, kind, title,
  body}` with the box's own credential (`get_desktop_or_box_session`). `kind` is `agent-done`
  or `agent-needs-input`; title and body are `buildNotificationContent`'s. A card's body is what
  the card says (a question card's question, `cardPreviewText` in
  `host/extensions/session/session-projection.ts`); until 12 October 2026 it was the card's type
  name ("widget"), and the server still turns a bare type name into a sentence
  (`push.py`, `CARD_SENTENCES`) for engines not yet updated. Fire and forget with a
  10-second deadline: a turn never waits on it. The same agent's same news at most once in 30
  seconds.
- The server (`server/simeon/desktop/push.py`) answers `{"sent": 0}` when the person has no
  phone (the host posts blindly), drops a push past the caps with `{"sent": 0, "capped": …}`
  (one per agent and kind every 30 seconds, 20 a minute for a person), clips the title to 120
  characters and the body to 400, and otherwise queues `desktop.push.send` and answers 202
  `{"queued": <phones>}`. The worker (`push_tasks.py`) sends one Expo push to each phone in one
  request, through the client the inherited notifications use
  (`simeon/notifications/tasks/push.py`): sound, badge 1, priority `high` for
  `agent-needs-input` and Expo's default (immediate on iOS) for `agent-done`, kept by Expo for
  a day while the phone is off. Nothing is retried. A phone whose ticket says
  `DeviceNotRegistered` is removed.
- The native iPhone app's pushes go straight to Apple (`apns.py`) with `mutable-content` and
  `thread-id` (the agent), `agentId`, `kind` and `agentName`: its notification extension
  (`ios/SimeonNotifications`, 12 October 2026) shows each one as a message from the agent, with
  the agent's picture and the app's icon in the corner. The app shows no banner for the chat
  on screen, and opening a chat clears its notifications (`ios/Simeon/Notifications.swift`).
- The phone registers itself after sign-in: `POST /desktop/push-devices`
  `{"expo_push_token": "ExponentPushToken[…]", "platform": "ios"}` (`ExpoPushToken[…]` is taken
  too; anything else is 422), with the desktop token the app's sign-in gives (`/auth/poll`,
  `/oauth/token`), never the box's. Posting again changes nothing; a phone someone else
  registered moves to the person signed in on it now. Sign-out: `DELETE /desktop/push-devices`
  `{"expo_push_token": …}` answers `{"removed": n}`. The phones are `notification_recipients`
  rows, the table the inherited `/v1/notifications/recipients` routes keep; those routes ask
  for web scopes, and the auth middleware reads a desktop token as nobody, so the phone uses
  these instead.
- Before this the box told the server over the upstream app's
  `ComputerService.NotifySandAgentTurnFinished`, which the server only logs
  (`sand.box.turn_finished`). A box whose host predates 8 October 2026 still does, and that
  person's phone hears nothing until the host updates.

**Settings on Render.**

- None is required: Expo's push service takes a push without a key of ours.
- `SIMEON_EXPO_ACCESS_TOKEN`: only when "Enhanced Security for Push Notifications" is switched
  on for the Expo project; Expo then refuses every push without it. An access token from
  expo.dev (Account settings, Access tokens). Empty sends without one.
- Not on Render, on the founder's side: Apple's push key for the iPhone app's bundle, uploaded
  to Expo with `eas credentials` (iOS, Push Notifications). Without it Expo takes the push and
  Apple never delivers it.

**When it misbehaves.**

- Box log: one line per notification, `[simeon] phone push posted agent=… kind=… status=202
  {"queued":1}`, or `[simeon] phone push failed agent=… kind=…` with the status and the
  server's answer, or the error (a timeout, no credential yet). No line at all means the
  decision found nothing to say: notifications off for that agent, a hidden agent, the same
  news within 30 seconds, or a host from before this.
- Server log: `desktop.push.queued`, `desktop.push.capped` (with `reason`: `same_push` or
  `per_minute`), then from the worker `desktop.push.sent` (`sent` out of `devices`),
  `desktop.push.failed` (Expo unreachable, or it refused the whole request),
  `desktop.push.refused` (one phone's ticket error, with Expo's details) and
  `desktop.push.device_removed`. The phone's side: `desktop.push.device_registered`,
  `desktop.push.device_moved`, `desktop.push.device_unregistered`.
- `{"sent": 0}` on every push: no phone is registered for that person. Look for their rows in
  `notification_recipients` with `deleted_at` empty.
- `desktop.push.sent` with `sent=1` and nothing on the phone: Expo took it and Apple did not
  deliver. The server reads tickets, not receipts; Expo's push receipts (or its dashboard) say
  why, most often the push key (`eas credentials`).

**Known limits.**

- A person looking at the Mac still gets the push on the phone: the box takes the Mac's window
  as unfocused. (The host does know whether it is focused, `windowFocusedAtMs` on the events
  above; the upstream app sent no push while the window was focused and the Mac had been heard
  from in the last five minutes.) The iPhone app hides the banner itself while it is in the
  foreground.
- Receipts are not read, so a phone whose app was deleted is only removed when a ticket says
  so; Expo mostly says it in the receipt, later. It is asked again, harmlessly, until then.
- A phone's registration belongs to the person, not to the phone's sign-in session: it lasts
  until the phone unregisters, someone else registers it, or Expo calls it gone.

**Not yet verified.** No push has reached a real iPhone: the tests replace Expo with a fake,
and the host's half ran in tests, not in a cloud computer. The iPhone app's side is built
separately.
