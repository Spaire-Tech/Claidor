# Messaging channels are served: Discord and Slack from the box (25 September 2026)

`docs/product/cursor-dependencies-map.md` §2 said it in one line: "a
lost client module, not a server". This is that module, and the record of
what was reused, what was built, and what has not run on a Mac. Nothing
below has run on a Mac; the last section says what to read when it does.

## What existed, and is used as it was

Searched by concept before anything was written (`rg -il "discord|socket
mode|apps.connections.open|gateway.discord|wss://gateway|slack-bolt|@slack|
discord.js|channelDelivery|setChannelDelivery|wakeForInbound|ChannelEnvelope|
channel-connector|connector runtime"` over `desktop/source`,
`desktop/scripts`, `docs/product`, `server/polar`). In the app:

- `host/extensions/transcript/transcript-manager.ts`: the hooks
  `setChannelDelivery`, `setChannelActivity`, `setChannelConfigChanged`,
  the delegated `wakeForInbound`, `connectChannel`, `disconnectChannel`,
  `getAgentChannels`, `listChannelConfigs`. Nothing in the tree
  registered against them (the hooks' only producers were
  `widget-responses.ts`, which calls `channelConfigChanged` after a
  secret-request is answered, and `background-wakes.ts`, which reads
  `channelActivity`).
- `host/extensions/transcript/background-wakes.ts`: `deliverToChannel`
  (the SendMessage `channel` target → `tm.channelDelivery`, failure →
  tray error + a `[channel-delivery-failed]` hidden wake) and
  `wakeForInbound` → `runInboundWake` (queues the envelope, appends it to
  the transcript as a user message with `channel` and `channelSender`,
  runs the agent on `buildChannelInboundWakePrompt`, signals
  `channelActivity` while the run lasts).
- `shared/channel-messaging.ts`: the envelope shape (`address`, `sender`,
  `text`, `reaction`), the wake prompts, the outbound shapes, the
  delivery-failure sentences (`No live … connection`, `not a valid channel
  address`), and the brief's Channels section.
- `host/extensions/session/channel-store.ts` (`channels/<platform>/connection.json`,
  label only) and `connector-secret-store.ts` (`connector-secrets/<agent>/<platform>.json`,
  0600, any field), `agent-session.ts` (`listChannelConfigs`,
  `storeConnectorCredential`, `disconnectChannel`).
- The gateway commands `getAgentChannels` / `connectChannel` /
  `disconnectChannel` / `refreshChannel` (`host-gateway-api.ts`,
  `shared/rpc/coordinator.ts`, reply `channels-view`), which the pinned
  renderer's Channels tab calls, and the agent's own `update_state`
  target `channel` / `disconnect` (`memory/agent-state.ts`).
- The SendMessage `secret-request` type and its card
  (`send-message-tool.ts`, `widget-responses.ts` `routeSecret`).
- The `ws` client already in the tree for the egress tunnel
  (`shared/node/egress-tunnel/websocket-client.ts`, ws 8.20.0, bundled
  into the host). The host bundle targets `node22`; Node's built-in
  `WebSocket` would also serve, but `ws` is already there and already
  runs in the box.

In the server: `server/polar/integrations/discord/` is Polar's Discord
client for benefits (a bot that adds members to guild roles over REST,
`DiscordClient` with `Bot`/`Bearer` schemes, `DISCORD_BOT_TOKEN`,
`DISCORD_PROXY_URL` in `config.py`). It is server-side, REST-only, has no
Gateway or message code, and is not in this path: the design is a bot the
person owns, driven from their box, and no server of ours sees the token.
Nothing named Slack's Socket Mode, `apps.connections.open`, `slack-bolt`
or `discord.js` existed anywhere.

Grok Bot's own channel connector code is **not** in the reconstruction
under any name: every producer and consumer of `channelDelivery`,
`ChannelActivity`, `channelConfigChanged` and the envelope was read, and
the hooks had no registrant. The map's verdict stands.

## What was built

`desktop/source/host/extensions/channels/`, the 36th host extension
(`HostExtensions.Channels`, `extension-ids.generated.ts`, `registry.ts`,
`host-production-extensions.ts`; it depends on `transcript` only):

- `channel-runtime.ts`: reads every agent's stored credentials
  (`listAgentIds` × `listChannelConfigs`), keeps one connector per
  (agent, platform), restarts one whose credential changed, stops one
  whose row is gone; registers delivery (`platform:chat` → the
  connector), activity (typing) and the config-changed hook on the
  manager; reconciles on that hook and, as a backstop, every 5 s
  (`CHANNEL_RECONCILE_POLL_MS`; the agent's `update_state` disconnect
  says "within a few seconds"). Each inbound message becomes
  `tm.wakeForInbound(agentId, { address, sender, text, timestampMs,
  reaction? })`.
- `discord-connector.ts`: Gateway v10 over `ws` (HELLO → IDENTIFY with
  the guild, DM, reaction and MESSAGE_CONTENT intents; heartbeats at
  Discord's interval, zombie detection, RESUME on `resume_gateway_url`,
  op 7 / op 9 handled; the fatal close codes 4004/4010–4014 stop the loop
  with Discord's reason on the status, everything else reconnects with
  exponential backoff 1 s → 60 s). `MESSAGE_CREATE` from a person (not a
  bot, not itself) → envelope, attachments appended as
  `[attachment name: url]`; `MESSAGE_REACTION_ADD` on the bot's own
  message → reaction envelope. Delivery: `POST /channels/{id}/messages`
  (2,000-character chunks; an https attachment as a link; a `file://`
  attachment as a multipart upload), one retry on 429 after
  `retry_after`; `POST /channels/{id}/typing` every 8 s while the agent
  works on that chat.
- `slack-connector.ts`: `auth.test` with the bot token (its own user id,
  to ignore its own messages), `apps.connections.open` with the app
  token, Socket Mode over `ws` (`hello`, every `events_api` envelope
  acked by `envelope_id`, `disconnect` with `refresh_requested`
  reconnects at once, duplicates dropped by `event_id`). A `message`
  from a person (no `bot_id`, no subtype but `file_share`) → envelope,
  entities unescaped, the sender named through `users.info` once and
  cached; `reaction_added` on the bot's own message → reaction envelope.
  Delivery: `chat.postMessage` (4,000-character chunks) in the thread
  the last inbound message on that chat came from; a `file://`
  attachment through `files.getUploadURLExternal` → upload →
  `files.completeUploadExternal`. `invalid_auth`, `token_revoked`,
  `missing_scope`, `account_inactive`, `not_authed` stop the loop with
  Slack's reason on the status.
- `channel-log.ts`: `[claidor] channel=<platform> agent=<id>
  event=connect|ready|disconnect|inbound|delivery|delivery-failed|
  pending|stop|error …` on `shared/host-log.ts`'s stdout channel, which
  is what reaches `/tmp/sand-host.log` in the box. A token appears only
  as its prefix and length.
- `channel-http.ts`, `socket.ts`, `connector.ts`: the REST helper with
  the 429 retry and the file reader, the `ws` slice, the connector
  interface and backoff.

Changed beside it, each small:

- `shared/channels.ts`: Discord and Slack are `available`, with a
  `connectGuide` the brief prints (how to make the bot, which intents
  and scopes, which fields to ask for); `connectorManifests(env)` and
  `SAND_CHANNELS_SERVED=0` restore every coming-soon path, and the Mac
  forwards that switch into the box (`SERVED_SWITCH_ENVS`). Every reader
  of availability follows it: `isAnyChannelAvailable` (the SendMessage
  `channel` target, the `secret-request` type and both descriptions),
  the brief's Channels section, the gateway's `channels-view` manifests
  (`listener-integrations.ts`), `connectChannel`'s refusal, the runner's
  manifests, and the secret ack (`sand-secret-request.ts`, which says
  the connector links within seconds, or names the second token Slack
  still needs).
- **Slack's second token.** The store has one field per request and the
  Channels tab one input, so: the tab's field takes both tokens in
  either order, separated by whitespace or a comma
  (`shared/channel-credential.ts` `splitChannelCredential`: `xapp-` →
  `token`, `xoxb-` → `botToken`); in chat the agent sends two
  secret-requests (connector `slack`, fields `token` and `botToken`).
  One alone leaves the row `pending` with a sentence naming the other.
  `listChannelConfigs` now carries every stored field (`secrets`);
  `listAgentChannels` shows a row with any field stored.
- **Live status where people and the agent read it.** The connector
  runtime writes `status` (`connecting`, `connected`, `pending`,
  `error`) and `detail` into `connection.json` beside the label
  (`FileChannelStore.writeStatus`, never a credential, unchanged writes
  skipped), so the Channels tab's `channels-view` rows and the brief's
  "Currently connected" lines (`[error] (Slack refused the token …)`)
  say what the connection is doing without a new gateway command.
- `transcript-manager.ts`: `connectChannel` and `disconnectChannel` call
  `channelConfigChanged`, so the tab's connect and disconnect reach the
  runtime at once, the way the secret card's already did.

## Routes

None on the server. The box speaks to `discord.com/api/v10`,
`gateway.discord.gg`, `slack.com/api` and Slack's Socket Mode host with
the person's own tokens. The API host, `SAND_BACKEND_URL` and the model
proxy are untouched.

## Measured offline

`desktop/tests/channels-runtime.test.mjs`: an in-process Discord
gateway + REST fake and a Slack Web API + Socket Mode fake drive the
runtime through its real `ws` client and `fetch`: identify with the
stored token (intents checked), READY → `connected` status, own and bot
messages ignored, a person's DM → one `wakeForInbound` with the exact
envelope, a reaction to the bot's message → a reaction envelope,
delivery → the REST POST with the `Bot` header (text, raw SendMessage
shape, link, multipart file), 429 retried once, typing while active, a
removed row closes the socket, a refused token stops with Discord's
sentence and never reconnects; Slack pending on the missing bot token,
both tokens on the two calls, envelope acked, entities unescaped, sender
from `users.info`, duplicate `event_id` dropped, reply in the thread,
file upload's three calls, `refresh_requested` reopens the socket,
`invalid_auth` is terminal; `SAND_CHANNELS_SERVED=0` opens nothing and
marks every manifest coming soon; the tab's one field split; the store's
status beside the label; the extension in the host's table; the brief and
the SendMessage tool offering channels; the secret ack.
`tests/cloud-agents-channels-coming-soon.test.mjs` keeps the coming-soon
branch honest behind the switch.

## Not yet run on a Mac, and what to read

1. **A real Discord bot.** Make the application, turn on Message Content
   Intent, invite the bot, paste the token into the Channels tab (or
   answer the agent's secret-request). Within 5 s `/tmp/sand-host.log`
   in the box (`docker exec simeon-box tail -f /tmp/sand-host.log`) must
   show `[claidor] channel=discord agent=<id> event=connect …` then
   `event=ready bot=<name> botId=<id> guilds=<n>`, and the tab's row must
   say connected. A DM to the bot → `event=inbound chat=<id>
   sender=<name> …` and the agent's reply → `event=delivery chat=<id>
   kind=text …`. A bot without the intent closes with 4014 and the row
   says so.
2. **A real Slack app.** Socket Mode on, the scopes and event
   subscriptions the brief's guide lists, both tokens in the tab's field
   (`xapp-… xoxb-…`). Same lines with `channel=slack`; `event=ready
   bot=<name> botId=U… team=T…` comes from `auth.test`; a message in a
   channel the app is in → `event=inbound`. A missing `users:read`
   scope makes the sender its user id, nothing more.
3. **Whether the pinned renderer's Channels tab draws the `status` and
   `detail` fields** of `channels-view`; the row shape it reads was not
   changed, only filled.
4. **The 5 s poll's cost with many agents** (one directory read and a
   few small files per agent per tick; nothing is opened unless a row
   changed).

Known limits, on purpose: the address names one chat, so a Slack reply
goes to the thread of the last inbound message on that chat, not to a
thread the agent picks; Discord has no thread routing at all; Slack has
no typing indicator for a Socket Mode bot; an https attachment is sent
as a link on both platforms, only a `file://` one is uploaded; Teams,
WhatsApp, Telegram, Signal and iMessage are not in the manifests (each
is its own client library, and iMessage a Mac-side bridge; none exists
in the tree). A hosted "@Simeon" app people would not need a token for
is new product work, not this.
