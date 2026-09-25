# The eight "coming soon" features, served overnight (25–26 September 2026)

The founder, going to bed: "work independently and do all … channels,
video, listeners, cloud computer, cloud agents, then skill publish,
sharing and memory … always assume that we already have it. dont try to
build ANYTHING without checking if we dont have it already."

This is the morning read. Each feature has its own record (linked), the
contract map is `cursor-dependencies-map.md`, and nothing here has run on
a Mac or against Render: every record names the log line that would show
it working.

## What is on the branch

| Feature | Reused | Built | Record |
|---|---|---|---|
| Foundation | the app's Connect clients, the `/desktop` auth rows | `polar/sand/`: Connect JSON helper, `unimplemented` catch-all, `/sand/notify` SSE bus on Redis, DashboardService pre-flights; per-service served switches in the app | `cursor-dependencies-map.md` |
| Channels (Discord, Slack) | every transcript-manager hook, the channel and secret stores, the cards, the brief; `ws` already bundled | `host/extensions/channels/`: Discord Gateway + Slack Socket Mode connectors in the box, no server | `channels-served.md` |
| Video | the two subagent types, attachment prep, the context part, `_proxy` metering | Gemini on the proxy (`…/v1beta/models/{model}:streamGenerateContent`), the executor speaking it by hand, the subagents registered | `video-served.md` |
| Listeners | the whole automations client, the notify-bus client, APScheduler cron pattern | the five relay routes, AutomationsService, Slack/GitHub install + ingress, Linear/Sentry/PagerDuty webhooks, the cron worker, five tables | `listeners-served.md` |
| Cloud computer | the whole remote runtime on the Mac, the box credential routes | GrokBotService broker, `/sand-box/local-exec-*`, a reverse proxy to the box's four ports, a Docker Engine host provider | `cloud-computer-served.md` |
| Cloud agents | the CloudAgent tool, manager, poll loop, card; the maty queue and runner | BackgroundComposerService + AvailableModels as a projection over maty; follow-ups, cancel, artifacts; the runner's `Executor` seam | `cloud-agents-served.md` |
| Skill publish | `SandSkillPublishService`, the plugin sync and loader; organizations as teams; S3 | GetTeams/PublishPlugin/UnpublishPlugin/GetEffectiveUserPlugins, inline plugin content, two tables | `skill-publish-served.md` |
| Sharing | the whole cross-user-sharing client, the room projection | the `/sand/xuser` + `/sand/share-rooms` relay, four tables, signed invite links | `sharing-served.md` |
| Memory sync | the server's routes and merge, the runner's memory-in/out | the app's names accepted, fact-list merge, tombstones, and the client the hooks were waiting for (`host/extensions/memory-sync/`) | `memory-sync-served.md` |

Two things found on the way that every feature depended on:

- **Every Connect call the app made was binary protobuf.** `@connectrpc/connect-node`
  defaults `useBinaryFormat: true`; `createSandBackendTransport` never
  set it. Fixed (`cursor-inference.ts`, `cursor-marketplace-client.ts`);
  measured by two builds independently.
- **The box's own renewal credential was never minted** (the fast-path
  connector dropped the method; fixed in the morning's first commit).

Verification at the merge: `tsc` clean; desktop suite 395 pass, 0 fail;
server `tests/sand` + `tests/desktop` 338 pass with the six pre-existing
model-catalogue failures in `test_endpoints.py`; `tests/maty` has two
pre-existing claim-lock failures. The migration chain is one line:
`desktop_box_credential_0925 → sand_listeners_0925 → desktop_share_rooms_0925 → sand_cloud_agents_0925 → sand_boxes_0925 → sand_plugins_0925`.

## What only the founder can do

1. **Deploy.** Merge to `main` (Render deploys it), apply the migrations
   (`alembic upgrade head`), and package the app (`npm run package`).
   The app's served switches default on, so an app built from this
   branch against the old server would hit `unimplemented` and fall back;
   deploy the server first.
2. **Keys on Render:** `CLAIDOR_GEMINI_API_KEY` (video). Without it the
   video child answers "The model service is not configured."
3. **Slack app** (listeners, and the Slack channel connector needs a
   person's own app anyway): scopes and events are listed verbatim in
   `listeners-served.md`; set `CLAIDOR_SLACK_CLIENT_ID`,
   `CLAIDOR_SLACK_CLIENT_SECRET`, `CLAIDOR_SLACK_SIGNING_SECRET`.
4. **A second GitHub App** for listeners: `CLAIDOR_SAND_GITHUB_APP_SLUG`,
   `CLAIDOR_SAND_GITHUB_WEBHOOK_SECRET`.
5. **A VM with Docker** reachable from Render for the cloud computer:
   `CLAIDOR_BOX_HOST_PROVIDER=docker`, `CLAIDOR_BOX_DOCKER_HOST`, and the
   host bundle at `CLAIDOR_BOX_HOST_BUNDLE_URL` (from `npm run package`).
   Until then Settings → remote answers one sentence and stays on local
   Docker. Optional: wildcard DNS `*.boxes.simeonlabs.com` + the Caddy
   config in the record.
6. **The maty runner** must be deployed with `CLAIDOR_MATY_RUNNER_TOKEN`
   for a cloud agent to run at all.
7. **Two web pages that do not exist:** `app.simeonlabs.com/agents/<bcId>`
   (the cloud-agent card's link) and `app.simeonlabs.com/share/<token>`
   (the invite link; the person can paste it into Simeon's join box
   meanwhile).
8. **Decisions:** Gemini prices in `pricing.py` are marked to confirm;
   whether the Anthropic skill catalogue should appear in every agent's
   plugin sync; Microsoft Teams stays Coming Soon (no bot exists).

## Known limits, recorded in each feature's file

Video is inline only (15 MB a file). Cloud agents run on the Render
runner (read memory, call a model, reply); no checkout, branch or PR
until the box executor exists behind the runner's `Executor` seam. A fact
deleted on one machine while the other appends to the same memory file
can return through the union. The cloud computer's E2B provider is a
stub (`e2b` is not in the lockfile and its hostnames do not fit the
tunnel rule).
