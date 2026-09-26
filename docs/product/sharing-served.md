# Sharing is served (25 September 2026)

A room with another person's agent. The map (`cursor-dependencies-map.md`
§8) read the client as complete and the server as "a multi-user relay
that exists in no form today". The founder's rule for this batch: keep
every function the app already calls, build only the server contract it
speaks. So the client is untouched except for its switch, and the relay
is Simeon Labs' server, route for route.

## What was reused, and where

Everything under `desktop/source/host/extensions/cross-user-sharing/`,
which the reconstruction had finished:

- `xuser-relay.ts` — the HTTP client: `POST {backendUrl}<path>` with the
  bearer and the sand client headers; `/sand/xuser/poll` every 4 s
  (`XUSER_RELAY_POLL_INTERVAL_MS`), 30 s back-off on any error, the acks of
  one poll carried in the next poll's `ackIds`; 403 read as "not enabled for
  your account", 429 as "too often"; the nine `share-rooms` calls.
- `xuser-sharing-service.ts` — start, share-state reconcile every five
  minutes, the event switch (`room-join-request`, `room-join-decision`,
  `room-upsert`, `room-typing`, `room-post`, `room-entry`, `turn-request`,
  `turn-result`, `member-left`, `room-ended`), the nine gateway commands.
- `xuser-remote-turns.ts` — a turn on another person's agent: the host
  sends `turn-request {roomId, turnNonce, ownerAuthId, agentId, groupName,
  groupDescription, peers, newMessages}`, the owner's box runs the member
  turn and sends `turn-result {roomId, turnNonce, agentId, messages[≤2]}`;
  the host waits `REMOTE_MEMBER_TURN_TIMEOUT_MS` (10 min), 30 turns per
  ten minutes per (room, host, agent), a nonce is run once
  (`xuser-turn-dedupe-store.ts`), and an unreachable member is left alone
  for ten minutes.
- `xuser-state-reconcile.ts` (`XuserRoom` and the mirror/hosted room
  materialisation), `xuser-entry-publisher.ts` (a `human-message` or
  `agent-message` mirror with up to four inline images, 1.1 MB),
  `xuser-wire-normalization.ts` (what is optional on the wire),
  `xuser-departure-obligations.ts` and the tombstone and pending-departure
  stores, `xuser-sharing-environment.ts`.
- The room projection in `host/extensions/transcript/shared-rooms.ts`
  (`ensureMirrorRoom` reads `hostName` and every member's `avatarDataUrl`),
  the gateway commands in `host/gateway-protocol.ts` and
  `host/host-gateway-api.ts`, and the recovered renderer's typed bridge
  (`desktop/frontend/src/recovered/features/agent-info/shared-room/`), which
  is where the argument shapes for `respondToRoomJoinRequest`
  (`{requestId, isApproved}`), `addOwnAgentToSharedRoom`
  (`{roomId, agentId, agentName}`) and `leaveSharedRoom`
  (`{roomId, targetAuthId?}`) were read.
- Server side: `polar/sand/notify.py` (`publish(redis, user_id,
  "xuser-events")`, the bus the box's host already drains on), the Redis
  dependency, `polar/kit/jwt` for the signed invite link, the
  `desktop-or-box` auth dependency (`get_desktop_or_box_session`), and
  `desktop.user_payload` for a person's display name.

Searched and not found (`rg -i "share-rooms|xuser|invite_link|join_request"
server/polar`): no room, invite or per-user event queue existed on the
server; `polar/notifications/` and `polar/webhook/` are the dashboard's
notifications and the API's webhooks, neither shaped for a per-person ack
queue, so the queue is a table of its own.

## What was built

`server/polar/sand/sharing.py` (routes), `sharing_service.py`
(`SharingRelay`), `sharing_repository.py`, the model
`polar/models/desktop_share.py` and the migration
`2026-09-25-1500_desktop_share_rooms.py` (four tables:
`desktop_share_rooms`, `desktop_share_room_members`,
`desktop_share_join_requests`, `desktop_share_events`). Two settings:
`DESKTOP_SHARE_INVITE_TTL` (7 days) and `DESKTOP_SHARE_JOINS_PER_MINUTE`
(10). Invite links are signed tokens (`polar.kit.jwt`, type
`desktop_share_invite`) and have no table; typing and the turn nonce live
in Redis with a TTL.

**Identity.** The app reads `sub` off its access-token envelope
(`envelope_access_token`: `sub = str(user.id)`; `getSelfAuthId` in
`extension.ts`) and compares it with `hostAuthId`, `members[].authId`,
`authorAuthId`, `agentOwnerAuthId` and `hostAuthId` on a turn request, so
every `authId` the relay writes is `str(user.id)`, nothing else. A person's
own agents carry their owner's id, which is how `sand-remote:<owner>/<agent>`
resolves.

**Routes**, all `POST`, JSON, `desktop-or-box` auth (the service runs in the
box, so the box's own credential reaches every one of them). A body the
relay cannot act on (not a member, not the host, a malformed link) is 404,
which the app carries as a message and its departure flush reads as
"already gone".

| Route | Body | Answer |
|---|---|---|
| `/sand/xuser/poll` | `{ackIds}` | deletes the acked rows, then `{events: [{id, kind, …}]}` in `seq` order, 200 at a time |
| `/sand/xuser/send` | `room-entry {roomId, entry}` | fans the entry out to the other human members, the sender's identity and the relay's clock stamped on it; `{timestampMs}` |
| | `room-typing {roomId, isTyping}` | `room-typing {roomId, isTyping, user: {roomId, authId, name, avatarUrl?, expiresAtMs}}` to the others; Redis key, 8 s |
| | `turn-request {…}` | host only, agent must be in the room; nonce → requester in Redis (15 min); `turn-request {roomId, turnNonce, agentId, hostAuthId, groupName, groupDescription, peers, newMessages}` to the owner |
| | `turn-result {…}` | agent's owner only; `turn-result {roomId, turnNonce, agentId, messages[≤2]}` to whoever asked |
| `/sand/share-rooms/from-agent` | `{agentId, agentName, avatarDataUrl?}` | a room named after the agent with the host and that agent; `{shareUrl, expiresAtMs, room}` |
| `/sand/share-rooms` | `{name?, agents: [{agentId, agentName, avatarDataUrl?}]}` | `{status: "created", room}` |
| `/sand/share-rooms/invite-links` | `{roomId}` | host only; as `from-agent` |
| `/sand/share-rooms/join` | `{link}` (the link, its bare token, or `?invite=`) | `{status: pending\|already-member\|invalid\|denied\|rate-limited, roomName?, room?}`; `room-join-request {request}` to the host |
| `/sand/share-rooms/join/respond` | `{requestId, isApproved}` | host only; `room-join-decision {isApproved, room}` to the requester, `room-upsert` to the rest; `{status: approved\|denied, room?}` |
| `/sand/share-rooms/agents/add` | `{roomId, agentId, agentName, avatarDataUrl?}` | upsert by (owner, agentId); `{room}` |
| `/sand/share-rooms/agents/remove` | `{roomId, agentId}` | own agent; `{room}` |
| `/sand/share-rooms/agents/remove-deleted` | `{agentId}` | from every room; `{rooms}` |
| `/sand/share-rooms/picture` | `{roomId, avatarDataUrl}` | host only; `{room}` |
| `/sand/share-rooms/leave` | `{roomId, targetAuthId?}` | host without target ends the room (`room-ended` to the others, members cleared, row kept); host with target removes that person (`member-left` to them); a guest removes themself and their agents |
| `/sand/share-state` | `{}` | `{pendingJoinRequests, rooms}`, rooms the caller is a human member of, requests for rooms they host |

`XuserRoom = {roomId, name, hostAuthId, hostName, avatarDataUrl?, members:
[{kind, authId, agentId?, displayName, avatarDataUrl?}]}`. The renderer
refuses a human member without a `displayName`
(`shared-room/model.ts`, `projectMember`), so one is always written.
Every write that another person should see lands in their
`desktop_share_events` row and publishes `xuser-events` on the notify bus;
the row lands when the request commits, so a poll woken by the publish
that arrives first sees it on the next tick (4 s) — a lost race costs a
poll, never an event. A `room-upsert` goes to every human member but the
one who made the change (they read the room in the answer).

**Desktop.** `isSharingServed` is on with an empty environment and
`SAND_SHARING_SERVED=0` restores "Sharing is coming soon in Simeon." at
every entry (the way the listener and cloud-agent switches went in
`8e29abf3`); the Mac already forwards the switch into the box
(`SERVED_SWITCH_ENVS`). The `sand_multiplayer` gate is on in Simeon's gate
table (`shared/node/experiments/simeon-gate-defaults.ts`). **Found on the
way:** the extension reads the gate through `getFeatureGateProperty`, which
`SandExperimentService` builds from the raw table on the target, so the
`applySimeonGateDefaults` Proxy — which only covered `checkFeatureGate`,
`getSnapshot` and `subscribe` — did not reach it; the table would have been
set and the extension would still have started off. The Proxy now sets the
property to Simeon's default too. `xuser-sharing-environment.ts`: a dev
host pointed at `https://api.simeonlabs.com` is allowed (it is pointed at
its own account's rooms); the refusal stays for Cursor's production origin
unless `SAND_XUSER_SHARING_ALLOW_PROD=1`; a dev host still opts in with
`SAND_DEV_XUSER_SHARING=1`, since two live boxes on one account drain each
other's events. A packaged build is allowed as before.

## Measured offline

- `server/tests/sand/test_sharing.py`: two signed-in people; room from an
  agent → invite link → join pending → host told → approve → both read the
  room; a `room-entry` polled by the other with the host's name and the
  relay's timestamp, acked away; `turn-request` to the owner (refused from
  a guest, refused for an agent not in the room) and its `turn-result` back
  to the host; typing with an expiry; host leaves → `room-ended`, the link
  is then invalid; denial, agent remove, picture, deleted agent; bare token
  and URL forms; eleven joins → `rate-limited`; no bearer → 401.
- `desktop/tests/sharing-served.test.mjs`: the switch defaults; the
  environment; the gate property through the Proxy; and
  `SandXuserSharingService` against an in-process relay answering the
  shapes above: the room reaches `ensureMirrorRoom` with `hostName`, a
  polled `room-entry` reaches `appendMirrorRoomEntry`, and the next poll
  carries `ackIds: ["ev1"]`.

## Not yet run on a Mac, and what to read

Nothing here has run on a Mac. In order:

1. `/tmp/sand-host.log` in the box: `[sand:sharing] on: relay at
   https://api.simeonlabs.com/` after the host starts. If instead it says
   `coming soon: SAND_SHARING_SERVED=0` the switch is off; if it prints an
   environment reason, the dev-host guard refused (a packaged build never
   does).
2. On Render, one `desktop.sharing.room_created` line per "Share" and
   one `desktop.sharing.event kind=… recipients=…` per fan-out; a join
   that says retry is `desktop.sharing.join_invalid` or
   `desktop.sharing.join_rate_limited`.
3. The renderer's share entry points are the pinned 0.18.0 chunk's own
   (the agent-info sheet's Share, the join box, the requests list); they
   draw on `sand_multiplayer` from the host's snapshot. Whether that
   snapshot follows Simeon's table in the packaged build is the same open
   measurement as `sand_teach_by_demonstration` (CLAUDE.md): read the sheet
   on a Mac. The recovered renderer under `desktop/frontend/` is not what
   `npm run package` ships.
4. A whole turn across two Macs: A shares an agent, B joins, A approves,
   B's user writes in the room → A's box runs `turn-request` for its agent
   → B reads the reply. The two boxes' logs carry
   `desktop.sharing.turn_requested` / `turn_answered` on Render in between.

## Local group chats are text-only, recorded 26 September 2026

A group that has only local agents (`host/extensions/transcript/group-chat-glue.ts`,
`GroupChatOrchestrator`) answers each turn with one text call on the
cheap model (`configuredClaidorCheapModel`, `runRoutedProviderText`
with `cheap: true`, one call per member per turn, no step budget because
there is one step): no memory, no roster, no tools, no brief. That
is Grok Bot's own shape for a group room (the orchestrator is the
reconstruction's, unchanged); the full loop runs for a direct
conversation and, through `turn-request`, for a shared room's remote
agent. Whether a group turn should run the full loop per member (one
loop call per agent per turn, on Terra) is a spend decision the founder
has not made; until then the ledger's F-400 is a known limit, and this
paragraph is the record the audit said was missing.

## Decisions for the founder

- **Where the link points.** `shareUrl` is
  `{FRONTEND_BASE_URL}/share/<token>` (`app.simeonlabs.com` on Vercel),
  which serves no page yet; the person pastes the whole link into Simeon's
  join box and the relay reads the token off it. A landing page that opens
  Simeon (`simeon://…`) is a web-app build; the token format does not
  change for it.
- **`room-post`** (a guest writing from a web page, not from the app) is
  read by the client and produced by nothing here; it needs that same page.
- The invite TTL (7 days) and the join rate (10 a minute) are settings.
