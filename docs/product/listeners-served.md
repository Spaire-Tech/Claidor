# Event listeners, served (25 September 2026)

Slack, GitHub, Linear, Sentry and PagerDuty routines fire through Simeon
Labs' server. This is the record of what was reused, what was built, the
routes, what the founder has to register, and what has not run on a Mac.
It corrects `docs/product/cursor-dependencies-map.md` §1 and the
`listeners-coming-soon` cluster of `design-audit-ledger.md`.

The founder's rule for the batch: "always assume that we already have
it." So the first thing here is what exists and was kept.

## What was reused, untouched

The app side is Grok Bot's listener machinery, unchanged and now on by
default (`shared/listener-availability.ts`, `isListenerRelayServed`
defaults to served since `8e29abf3`; `SAND_LISTENER_RELAY_SERVED=0`
restores the Coming Soon paths):

- `host/extensions/automations/backend-relay-source.ts` — registers what
  the box listens for (`POST /sand/listener-subscriptions`, every 5 min
  and on change), polls the relay (`POST /sand/listener-events/poll`,
  every 4 s or on a `listener-events` notify), acks by id on the next
  poll, reads the Slack/GitHub statuses into the Routine panel's copy
  ("Invite @Simeon to #ops…").
- `sand-automation-fire-consumer.ts` — polls `POST /sand/automation-events/poll`
  (15 s or on an `automation-fires` notify), runs a fire for its event or
  its cron slot, refuses one whose `definitionRevision` is not the
  routine's current hash, completes it at `POST /sand/automation-runs/complete`,
  acks the completion on the next poll.
- `sand-automation-cloud-sync.ts`, `sand-automation-cloud-trigger.ts` —
  mirror every server-schedulable routine as a shadow workflow
  (`aiserver.v1.Workflow`, `description: "sand-shadow:<hash>"`,
  `automationId = stableAutomationId(agentId, localId)`) through
  `AutomationsService` List/Create/Update/DeleteSandAutomation, and decide
  what the box still fires itself.
- `sand-trigger-hub.ts`, `listener-connect-watcher.ts`,
  `listener-integrations.ts`, the connect card
  (`runner/tools/listener-connect-cards.ts`), the notify-bus client
  (`extensions/notify-bus/`), the state tool's trigger shapes
  (`runner/tools/sand-state-tool.ts`) and the brief's listener text
  (`host/automations/automation.ts`).

On the server: `polar/sand/connect.py` (Connect RPC over FastAPI),
`polar/sand/notify.py` (`GET /sand/notify`, `publish(redis, user_id, topic)`),
`polar/sand/dashboard.py` (the preflight methods), the desktop auth
(`get_desktop_or_box_session`: the host runs in the box and calls with
the box's own credential), APScheduler's `CronTrigger` (the worker already
schedules with it), the `@actor(cron_trigger=…)` declaration pattern
(`polar/auth/tasks.py`), the repository base, the migration shape of
`2026-09-25-1200_desktop_box_credentials.py`.

Searched and **not** reusable, with what was found:

- `polar/integrations/github/` is the sign-in OAuth app (`user`,
  `user:email`) and secret scanning; it receives no webhooks
  (`rg -i "x-hub-signature" server/polar` → nothing).
  `polar/integrations/github_repository_benefit/` installs a *different*
  GitHub App (`GITHUB_REPOSITORY_BENEFITS_*`) whose install/callback
  pattern (`installation_install`, `installation_callback` on the web
  cookie) is what `/sand/github/install` and `/callback` copy.
- `polar/connectors/` (Pipedream) and `polar/connector/` (SharePoint)
  carry no trigger or event-source code; the map's "Pipedream triggers"
  shortcut would have been the same build behind a middleman.
- `polar/webhook/` is Polar's *outgoing* webhooks (endpoints, deliveries,
  retries); its `slack.py` is a payload brander. The relay queue is
  inbound and per person, so it got its own two small tables.
- `polar/integrations/discord/webhook.py` is an embed formatter, not a
  verifier.

## What was built

`server/polar/sand/` (all included from `listeners.router`, mounted by
`polar/sand/__init__.py` at the root of the API host):

| Module | What |
|---|---|
| `listeners_relay.py` | the five JSON routes + `POST /sand/listener-webhooks/{platform}` |
| `listeners_automations.py` | `aiserver.v1.AutomationsService` List/Create/Update/DeleteSandAutomation |
| `listeners_connections.py` | `DashboardService` GetSlackUserSettings / GetScmConnectionStatus / GetSlackInstallUrl; `/sand/slack/install`, `/sand/slack/callback`, `/sand/github/install`, `/sand/github/callback`; subscription resolution |
| `listeners_ingress.py` | `POST /sand/ingress/slack/events`, `POST /sand/ingress/github/events`, `POST /sand/ingress/{linear\|sentry\|pagerduty}/{token}` |
| `listeners_service.py` | trigger matching (mirrors `automation-trigger.ts`), the two queues, cron owed, ingest |
| `listeners_cron.py` | `CRON_TZ=… expr`, `@every`, aliases → next slot (APScheduler) |
| `listeners_slack.py` | OAuth v2 exchange, `conversations.list`, request signing check |
| `listeners_tasks.py` | `sand.listeners.fire_due_crons`, every minute |
| `listeners_repository.py` | queries |
| `polar/models/sand_automation.py`, migration `2026-09-25-1400_sand_listeners.py` | five tables |

Settings (`polar/config.py`, env prefix `CLAIDOR_`): `SLACK_APP_ID`,
`SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`,
`SAND_GITHUB_APP_SLUG`, `SAND_GITHUB_WEBHOOK_SECRET`. All empty by
default; every path that needs one fails with a sentence naming it.

Desktop, small: `listener-integrations.ts` `getConnectUrl` opens
`/sand/slack/install` (from `GetSlackInstallUrl`, falling back to the
same path on the backend host) and `/sand/github/install`;
`extension.ts` passes `getConfiguredBackendUrl`; the brief says
"Simeon's Slack app" and "@Simeon" where it said Cursor;
`sand_notify_bus` is on in `simeon-gate-defaults.ts` (the server serves
the stream, so the box drains on a notify frame instead of at the next
poll; the safety polls stay on); the comments in
`listener-availability.ts` and `extension.ts` say served.

## The contract, as served

Every route takes the box's credential (`get_desktop_or_box_session`).

`POST /sand/listener-subscriptions` `{slackChannels, githubRepos, githubKinds}` →
```
{ "slack": { "status": "ok" | "not-linked",
             "teams": [{ "teamId", "teamName",
                         "channels": [{ "input": "#eng", "channelId": "C…", "isBotMember": true }],
                         "unresolvedChannels": ["#nowhere"] }],
             "unresolvedChannels": [...] },
  "github": { "status": "ok" | "not-connected",
              "repos": [{ "repo", "isSubscribed", "detail"? }] } }
```
Slack channels are resolved against the workspace's cached channel list
(`conversations.list`, refreshed when older than 5 min or a name is
unknown); a GitHub repo is subscribed when one of the person's
installations covers it (from the App's `installation*` webhooks).

`POST /sand/listener-events/poll` `{ackIds}` → `{events: [wire…]}`; acked
ids are deleted, the rest returned oldest first (100 at most, dropped
after two days). A Slack wire event: `{id, source:"slack",
kind:"message"|"reaction", channelName, channelId, senderSlackUserId,
text, isMention, isSelf, reactionEmoji?, ts?, threadTs?, timestampMs}`;
GitHub: `{id, source:"github", repo, kind, title, actor, url?, detail?,
prOwner?, branch?, timestampMs}` — what `mapRelayWireEvent` reads.

`POST /sand/automation-events/poll` `{ackRunUuids}` → `{events: [{id,
sandAgentId, automationId, timestampMs, definitionRevision?,
scheduledForMs?, event?}], nextPollAfterMs: 15000}`. A fire is `pending`
→ `completed` (the box reported) → `acked` (the box saw it land); the
poll returns pending and completed ones, so the consumer can settle its
state; a pending fire older than two hours is `expired` and never handed
out. `POST /sand/automation-runs/complete` `{runUuid, status, errorMessage?}`
→ `{}`; an unknown run answers 404, which the consumer treats as settled.

`AutomationsService`: `ListSandAutomations {sandAgentId}` →
`{workflows: [{workflow: {automationId, name, enabled, workflow,
description, createdAt, updatedAt}}]}`; `CreateSandAutomation` is an
upsert on `(user, sandAutomationId)` (the sync re-lists and expects
convergence); `UpdateSandAutomation` by `automationId`;
`DeleteSandAutomation` of a gone id succeeds. The workflow JSON is stored
as sent; enums may arrive as names (`GIT_PULL_REQUEST_ACTION_OPENED`) or
numbers, both are read.

`DashboardService`: `GetSlackUserSettings` → `{hasSlackAuth, canShow:
true}`; `GetScmConnectionStatus` → `{connected}`; `GetSlackInstallUrl` →
`{url: "<BASE_URL>/sand/slack/install"}`.

## What fires what

An ingested event is normalized once into the fire shape
(`parseFireTriggerEvent`'s), then for each person it may concern: a relay
row if their subscription names the channel or repo, and one fire per
enabled shadow routine whose trigger matches
(`listeners_service.trigger_matches_event`, the same rules as
`automation-trigger.ts`: channel scope `*`/`#name`/id, mention vs
message vs keyword vs reaction with `onlyOwnerReactions`, the fourteen
GitHub kinds against `pullRequest.prAction`, `pullRequestReview.on*`,
`reviewThread.on*`, `ciCompleted.condition`+`branch`, `userAllowlist` per
kind; Linear/Sentry/PagerDuty event cases with id filters). Both queues
publish on the notify bus (`listener-events`, `automation-fires`).

**Cron, measured:** `shouldScheduleLocally` in
`sand-automation-cloud-sync.ts` returns false for every cron-only
routine once the cloud service answers (`triggerListeners(...).length === 0
→ false`), and for a listener+cron routine the server lists as enabled.
So the server owns cron for whatever it lists: `sand.listeners.fire_due_crons`
runs every minute, fires each due routine once (`scheduledForMs` the
slot, `definitionRevision` the hash from the marker), never queues a
second pending fire for the same routine, then advances `next_fire_at`.
The box still fires locally what the server does not list as enabled (a
Slack DM listener, a routine whose create failed), so nothing fires
twice.

## Ingress

- **Slack** (`POST /sand/ingress/slack/events`): `X-Slack-Signature` /
  `X-Slack-Request-Timestamp` over the raw body with the signing secret,
  five-minute replay window; `url_verification` answered with the
  challenge; `app_mention` → `isMention: true`; `message` (no bot, no
  edit subtype; one carrying `<@bot>` is skipped because `app_mention`
  already delivered it); `reaction_added` → kind `reaction`, `isSelf` when
  the reactor is the installing member. Routed to every person connected
  to that `team_id`.
- **GitHub** (`POST /sand/ingress/github/events`): `X-Hub-Signature-256`
  with the App's webhook secret; `installation` and
  `installation_repositories` keep each installation's repo list;
  `pull_request` (opened / synchronize / closed+merged /
  review_requested), `issue_comment` on a PR, `pull_request_review`
  (approved / changes_requested / commented), `pull_request_review_comment`,
  `pull_request_review_thread`, `issues` assigned, `check_suite`
  completed (success → `ci-passed`; failure, timed_out, startup_failure →
  `ci-failed`; `head_branch` is the branch). Routed to the people bound
  to `installation.id`.
- **Linear, Sentry, PagerDuty** (`POST /sand/ingress/{platform}/{token}`):
  the person's own URL, minted by `POST /sand/listener-webhooks/{platform}`
  (desktop or box credential) with a signing secret; the signature is
  checked when the service sends one (`Linear-Signature`,
  `Sentry-Hook-Signature`, `X-PagerDuty-Signature v1=`), the token stands
  alone otherwise (`signed=false` in the log line). No card mints this
  yet; the route exists for the agent's Shell (`curl` with the box's
  bearer) and a later card.

## What the founder must create

**Slack** (api.slack.com/apps → Create New App → from scratch):
- Bot token scopes: `app_mentions:read`, `channels:history`,
  `channels:read`, `groups:history`, `groups:read`, `reactions:read`,
  `users:read`, `chat:write`.
- Event Subscriptions: request URL
  `https://api.simeonlabs.com/sand/ingress/slack/events` (the route
  answers the challenge once `CLAIDOR_SLACK_SIGNING_SECRET` is set);
  bot events `app_mention`, `message.channels`, `message.groups`,
  `reaction_added`.
- OAuth redirect URL: `https://api.simeonlabs.com/sand/slack/callback`.
- Display name **Simeon** (that is what "@Simeon" in the copy means).
- Render: `CLAIDOR_SLACK_APP_ID`, `CLAIDOR_SLACK_CLIENT_ID`,
  `CLAIDOR_SLACK_CLIENT_SECRET`, `CLAIDOR_SLACK_SIGNING_SECRET`.

**GitHub** (Settings → Developer settings → GitHub Apps → New, a *second*
App, not the sign-in OAuth app nor the repository-benefits App):
- Webhook URL `https://api.simeonlabs.com/sand/ingress/github/events`,
  a webhook secret.
- Setup URL `https://api.simeonlabs.com/sand/github/callback`, **Redirect
  on update** on (GitHub forwards `state` and `installation_id` there).
- Repository permissions: Pull requests read, Issues read, Checks read,
  Metadata read. Subscribe to events: Pull request, Pull request review,
  Pull request review comment, Pull request review thread, Issue comment,
  Issues, Check suite, Installation, Installation repositories.
- Render: `CLAIDOR_SAND_GITHUB_APP_SLUG` (the App's URL slug),
  `CLAIDOR_SAND_GITHUB_WEBHOOK_SECRET`.

**Microsoft Teams**: nothing; there is no bot, so the trigger is accepted,
stored and never fires — Coming Soon.

Until then: the connect card's page answers 503 with the sentence naming
the empty key (`SLACK_NOT_REGISTERED`, `GITHUB_NOT_REGISTERED`), the
subscriptions route answers `not-linked` / `not-connected` (which the
Routine panel shows as "Slack isn't connected to your Simeon account"),
and the ingress routes answer 503 with the same sentence; every refusal
is a `sand.listeners.*_refused` log line with `reason`.

## Log lines

Server, structlog: `sand.listeners.subscribed` (what a box registered and
both statuses), `sand.listeners.ingress` (platform, kind, users, relayed,
fired), `sand.listeners.ingress_refused` (reason), `sand.listeners.fire_enqueued`
(run_uuid, automation_id, source or scheduled_for), `sand.listeners.cron_fired`,
`sand.listeners.run_completed` (status, error), `sand.listeners.automation_upserted`
(next_fire_at), `sand.listeners.slack_connected` / `github_connected`,
`sand.listeners.slack_install_refused` / `github_install_refused`.

Box, `/tmp/sand-host.log`: `[sand-listener-integrations] slack connect
opens https://api.simeonlabs.com/sand/slack/install` when the card is
clicked; the relay's own status lands in the Routine panel.

## Measured offline

`server/tests/sand/test_listeners.py` (22 tests with `test_connect.py`):
subscriptions round trip with resolved, unresolved and non-member
channels and covered/uncovered repos; a signed Slack mention reaching the
subscribed poll and the fire queue, acked away, `publish` called for both
topics (fakeredis + a mock); a reaction by the owner as `isSelf`; a signed
GitHub `pull_request` reaching both queues, completed, acked, an unknown
run 404; installation webhooks recording repos; the RPC round trip with
the shape the sync reads, idempotent create, invalid_argument; a due cron
fired once with its slot and revision and never twice while pending; a
minted Linear webhook firing a Linear routine, a bad signature refused;
the dashboard reads and the anonymous install redirect.

`desktop/tests/listeners-served.test.mjs`: the real
`createBackendRelaySources` and `SandAutomationFireConsumer` against an
in-process server answering these bodies — registration body, statuses
into the panel's copy, delivery and ack, a fire run for its event and
completed and acked, a stale-revision fire refused; the connect reads;
the brief; the wiring. `listeners-coming-soon.test.mjs` still measures
`SAND_LISTENER_RELAY_SERVED=0`.

## Not yet run on a Mac

Nothing here has. The lines to read, in order:

1. Render's log after a box connects: `sand.listeners.subscribed` with
   the box's channels and `slack_status`.
2. Click Connect on a Slack listener card: the browser lands on
   `/sand/slack/install`; with no key it says the sentence; with the app
   registered it reaches Slack's consent page and comes back to "Slack is
   connected to Simeon"; within five seconds the agent resumes
   (`listener-connect-watcher.ts`).
3. Say "@Simeon hi" in a channel the bot is in: `sand.listeners.ingress
   platform=slack … fired=1`, then in `/tmp/sand-host.log` a `[claidor]
   model=` line for the routine's hidden turn.
4. A cron routine after the sync: `sand.listeners.automation_upserted
   next_fire_at=…`, a minute past it `sand.listeners.cron_fired fires=1`,
   the box's `[claidor] model=` line. If it never fires, read
   `next_fire_at` in `sand_automations` and whether the worker runs the
   `sand.listeners.fire_due_crons` actor (`polar/tasks.py` imports it).

## Known limits

- Slack channels the bot cannot see (`conversations.list` needs the bot
  invited for private channels) resolve as `not-found` until it is.
- GitHub subscription coverage is read from the App's own webhooks; an
  installation bound before any webhook arrived counts as covering every
  repo (optimistic) until the first `installation_repositories` event.
- A pending fire expires after two hours; a box off for a day gets one
  cron run, not every missed slot.
- Tokens (Slack bot token, webhook secrets) are stored as text, the way
  `oauth_accounts` stores theirs.
- The migration's `down_revision` is `desktop_box_credential_0925`; the
  other builds of this batch may add migrations with the same parent, and
  the merge decides the chain.
