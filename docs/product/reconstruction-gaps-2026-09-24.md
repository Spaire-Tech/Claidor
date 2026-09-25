# What does not work in the reconstruction, audited 24 September 2026

The founder: "check the reconstruction to find all fails right now in the
repo that we didn't identify, things like generate image for avatar don't
work, upload image for avatar don't work, voice note don't work and I'm
100% sure many other."

Five audits were run over the tree in one afternoon: every backend call the
host side makes, every backend call and IPC channel the Mac side makes, the
three named features traced end to end, every production binding that
supplies less than the code uses, and every open item the documents already
record. Every claim below carries a file and line. The pinned 0.18.0
renderer is not in the repository, so its side was read from the recovered
`frontend/` sources and the 163 IPC claims in
`desktop/manifests/reconstruction/renderer-closure.json`, not from its
bytes. Nothing here was run on a Mac.

The shape of it: **Claidor serves fourteen HTTP routes under
`/desktop/api/` plus three sign-in routes at the root, and no Connect RPC at
all.** The reconstruction still calls about sixty `aiserver.v1.*` methods
across seven services. Every one goes to `https://api.simeonlabs.com/aiserver.v1.<Service>/<Method>`
(`desktop/source/shared/node/cursor-backend/cursor-inference.ts:155-159`),
gets a 404, which Connect reports as `Unimplemented`, and before each one the
interceptor first asks `DashboardService/GetUserPrivacyMode`
(`cursor-inference.ts:136-138`), so every dead call is two dead calls. Most
degrade quietly. The ones that do not are listed first.

## Fixed today

| What | Where | The bug |
|---|---|---|
| **Pressing the mic or "Generate" avatar could sign you out.** | `desktop/source/electron-main/account/cursor-auth.ts:277-283` | `getValidAccessToken()` with no backend named defaulted to `https://api2.cursor.sh`. Dictation (`cursor-auth-wiring.ts:191`) and avatar generation (`adapters/avatar-images.ts:72`) name none. When the access token was within five minutes of expiry, the refresh went to Cursor's host, got a non-2xx, and `runRefreshAccessToken` revoked the credentials and showed "Simeon couldn't confirm your sign-in". Now the default is the configured backend. `tests/token-refresh-backend.test.mjs` fails against the old code. |
| **Every dictation came back in English.** | `desktop/source/electron-main/account/claidor-transcribe.ts:5,34` | The composer's mic sends no language; the manager filled in `en-US`; the server passes the two letters to OpenAI, which then transcribes French speech as English. No language is sent now, and OpenAI detects it. |
| **The agent's prompt had no memory, no automations, no workflows, no channels and an empty roster.** | `desktop/source/host/host-runner-composition.ts` (`createSystemPromptAssembly`) | Every store was `() => null` and the directory `() => []`, while `bindSessionOwnedRunner` handed the real stores to a runner that only kept them. So "remember that I prefer French" was saved to disk and never read back into a prompt, and the agent was never told who its teammates were. The prompt now reads `session.memory`, `session.db` (frozen memory snapshot), the user and project memory, `session.automations`, `session.workflows`, `session.channels` and the live roster. The memory section is frozen until a compaction (`resolveFrozenMemoryPrompt`); the epoch was a constant 0, which would have frozen the first rendering for ever; it is now the count of summaries. `tests/prompt-stores-wired.test.mjs`. |
| **A computerUse subagent had only a Shell tool** (earlier today) | `host-runner-composition.ts` (`createTurnToolsetFactoryProvider`) | The computer, screenshot and browser tool deps were only ever applied by the retired `createRunStep` path. The shell's provider offers them now; the agent gets Screenshot and RequestBoxHelp too. |

## The three the founder named

**Generate an avatar image.** The chain is complete and calls something
Claidor serves: editor → `preload.ts:149` → `main-edge.ts:140` →
`media/avatar-images.ts:17` → `claidor-generate-image.ts:48` → `POST
/desktop/api/proxy/v1/images/generations` →
`server/polar/desktop/capabilities.py:355-470` → OpenAI `gpt-image-1`. Where
it can break: signed out (throws sign-in required); the sign-out bug above;
the server answering 503 "The image service is not configured" when
`CLAIDOR_OPENAI_API_KEY` is empty on Render; 402 when the hourly or monthly
allowance is spent; or OpenAI's own refusal for `gpt-image-1` (typically 403
"organization must be verified"), passed through verbatim. The editor shows
the server's sentence as `edge/handler-failed: …`. **The server log line
`desktop.proxy.upstream_refused` for that call says which.** Nothing in the
code is missing.

**Upload an avatar image.** Also complete and local: file picker
(`media/avatar-images.ts:17`, decoded on the Mac, 25 MB cap) → crop in the
renderer → `setAgentAvatarBytes` over the coordinator → the box's gateway
(`gateway-client.ts:288`) → `host-gateway-api.ts:551` → `avatar.png` in the
agent's directory → read back inline as `avatarDataUrl` in every roster
summary (`host/agents/agent-avatar.ts:53-58`). The only remote hop is the
box, so with Docker off or a cold box it fails with `gateway
setAgentAvatarBytes unreachable (…)`, shown in the editor. If it fails with
a warm box, the error line is the finding. **Neither path touches
Cursor.**

**Voice note.** There is no voice-note attachment in this app and no
text-to-speech playback: `grep -rli "audio/speech|text-to-speech|tts|speechSynthesis"`
over the desktop sources finds only a comment. The served
`/api/proxy/v1/audio/speech` has no caller. The composer's mic is
**dictation**: `MediaRecorder` in the renderer → `transcribeAudio` →
`claidor-transcribe.ts:42` → `/desktop/api/proxy/v1/audio/transcriptions`
(served, shapes match, `tests/claidor-capabilities.test.mjs`). Three
things can make it "not work": the English-only bug above (fixed); the
renderer swallowing every error into "An error occurred with voice input"
(`frontend/src/…/voice.tsx:99-108`, and the pinned renderer is presumed the
same), so a 503 or 402 from the server is invisible on screen; and macOS
microphone permission, which needs `NSMicrophoneUsageDescription` in the
packaged `Info.plist`. The packager keeps the 0.18.0 shell's plist
(`scripts/package-macos.mjs:66-78`) and nobody has read whether that key is
in it. **On the Mac:**

```
plutil -extract NSMicrophoneUsageDescription raw "/Applications/Simeon.app/Contents/Info.plist"
```

If that prints an error, `getUserMedia` is refused before any prompt and the
key has to be added in `package-macos.mjs`.

## Broken, with cause, not fixed today

Ranked by what a person clicking around hits first.

1. **Model picker.** `getAvailableModels` (`main-edge.ts:114`) calls
   `AiService.AvailableModels` over Connect
   (`electron-main/models/cursor-model-catalog.ts:12-16`) and the error goes
   straight to the renderer. Claidor serves `/desktop/api/models/available`
   and `/api/proxy/v1/models`, both unused. The fix is a translation from
   Claidor's list to the `AvailableModelsResponse` shape the renderer reads;
   which screen of the pinned renderer calls it is not established.
2. **Settings → Usage & Billing** shows Cursor's page with nothing in it.
   `getUsageSummary` is behind `sand_usage_page` (default off,
   `experiment-config.gen.ts:187`) and returns `null`
   (`cursor-auth-wiring.ts:169`); on, it would call four `DashboardService`
   methods, none served. The Settings patch that was to replace the tab is a
   no-op: in `scripts/lib/router-renderer-patch.mjs` `REGISTRY_AFTER ===
   REGISTRY_BEFORE` (`:9`) and `patchOriginalSettingsPanel` returns its
   input (`:306-308`), while the provenance file still lists
   `settings-router-provider` and `usage-current-provider` as features
   (`:392`). `/desktop/api/user/quota` and `/api/models/pricing-catalog` are
   served and never called.
3. **Account avatar is always initials; the account name is local only.**
   Profile comes from `DashboardService.GetMe` (`account/cursor-profile.ts:116`),
   not served; `profilePictureUrl` is always empty
   (`account/cursor-avatar.ts:22-29`); rename is saved locally and the
   `UpdateUserName` 404 swallowed. `/desktop/api/user/profile` is served and
   unused. There is no profile-picture upload anywhere.
4. **Reading a PDF always throws** "Read PDF worker is not bound"
   (`packages/agent/tools/core/read/read.ts:374`): no `pdfTextExtractor` is
   passed by any composition, and `scripts/host-production-activation.mjs:41-48`
   records pdf-worker as absent from the shipped carrier.
5. **Auto-review rejects every action it is asked about.**
   `DashboardService/ClassifySandAutoReview` is not served and the classifier
   fails closed (`host/runner/sand-auto-review-classifier-run.ts:66-68`);
   with `sand_auto_review` off by default it is rarely asked.
6. **Custom MCP servers and account plugins cannot be added.** Reads return
   `{unavailable: true}`; writes (`InstallUserPlugin`, `SetMcpConfig`,
   `UninstallUserPlugin`) throw (`shared/node/cursor-backend/account-mcp.ts:118-128`).
   The vendor connectors built 24 September are the exception.
7. **Send Feedback always fails** ("unavailable"; `POST {api}/sand/feedback`,
   `feedback/feedback-report.ts`). **Help → Help Center opens cursor.com**
   (`application-menu.ts:101`). **"Open cloud agent" opens a 404** on
   api.simeonlabs.com (`main-edge.ts:129`).
8. **Cloud agents, remote boxes, mobile push, cloud automations, Slack and
   GitHub listeners, sharing.** All on `BackgroundComposerService`,
   `GrokBotService`, `AutomationsService` and `/sand/*` relays, none served;
   sharing and the notify bus are also gated off. Automations fall back to
   local scheduling (`cloud-service-absence.ts`), which is the intended
   path. Details in the host audit table below.
9. **Sign-out does not revoke the server session**: it only deletes the
   keychain entries (`cursor-auth.ts:298-307`); `/desktop/api/auth/logout` is
   served and never called.
10. **A background Connect stream retries a 404 every 3 s for ever.**
    `WatchSandBoxMigration` is started whatever the box runtime
    (`electron-main/box/box-migration-watcher.ts:12,33`,
    `main-production-services.ts:810`), each attempt with a privacy-mode
    lookup in front of it. Noise, not a failure.
11. **`attachProdBox.*` is exposed to the renderer in every build and
    handled only in dev** (`preload.ts:286-292` vs `dev/dev-wiring.ts:70-79`).
    Dev-only surface.
12. **Feature gates never load.** `AnalyticsService/BootstrapStatsig`
    (`statsig-bootstrap.ts:39`) returns `{}`, so every gate sits at its
    bundled default; `SAND_FEATURE_GATE_OVERRIDES` is ignored in the
    packaged app because `main.ts:217` sets `SAND_PACKAGED=1`
    (`cursor-experiments.ts:39,43`). Off by default and therefore off:
    teach a task, browser-use subagent, dynamic tools, sharing, agent
    network, usage page, auto-review enforce, notify bus, memory dreaming.
    Which of these Cursor's server turned on for a stock user is not
    recorded anywhere in the tree except teach a task.
13. **Two more prompt gaps remain.** MCP custom instructions and discovery
    status for a turn are stubbed (`host-runner-composition.ts:1332-1334`);
    and a subagent reads the parent's root prompt (the prompt glue is built
    once with `isSubagentRunner: false`, `:1313-1315`).
14. **Host diagnostics never reach `/tmp/sand-host.log`.** `reportHostDiagnostic`
    goes only into the structured-log telemetry, shipped through
    `AnalyticsService/SubmitLogs`, not served. Only `[claidor]`, `[sand-host]`
    and `[sand:*]` console lines appear.
15. **Notification settings are forced off** on every read, write and
    resync (`shared/node/settings/sand-settings-store.ts:150-151`,
    `coordinator-resync.ts:7`). Local macOS notifications and the dock badge
    still work (`production-binding-providers.ts:409-448`).

## Working against Claidor

Sign-in, poll and refresh; every model turn (`/api/proxy/v1/responses`);
web search; image generation; dictation; Composio; attachments, paste and
drag-drop (local and gateway only); local macOS notifications; `simeon://`
links (`info`, `plugin-add`, `open`); every coordinator method in
`shared/rpc/coordinator.ts:92-192` except the gated ones above; the local
Docker box; vendor connectors.

## Served by Claidor and never called by the app

`/desktop/api/user/{profile,quota,profile-summary}`, `/api/memory` and
`/api/memory/sync`, `/api/models/available`, `/api/models/pricing-catalog`,
`/api/client-banners/*`, `/api/updates/check*` (updates are off by
`SAND_DISABLE_UPDATES=1` in the packaged build), `/api/skill-store*`,
`/api/kit-store`, `/api/mcp-marketplace`, `/api/analytics/events`,
`/api/enterprise/context`, `/api/client-activities/*`,
`/api/auth/{exchange,refresh,logout}`, `/api/proxy/v1/audio/speech`. Each
is a door the app could be pointed at instead of a Cursor RPC; the model
list and the profile are the two that would change something on screen.

## Host-side Connect calls, by feature

| Feature | Calls | On failure |
|---|---|---|
| Privacy mode, per turn and before every RPC | `DashboardService/GetUserPrivacyMode` (`cursor-inference.ts:92-107`) | ~~falls back to no-training; `[sand:privacy] privacy-mode lookup failed`~~ Corrected 25 September: the lookup was cached 10 s, not per RPC; since then it is not made at all unless `SAND_CONNECT_SERVED=1` (the turn shell answers the no-training fallback, the interceptor sends `x-ghost-mode: true`) |
| User's full name in the prompt | `DashboardService/GetMe` (`auth/user-full-name-service.ts:29`) | name stays undefined |
| Post-turn labelling | `InferenceService/RecordAgentPostTurnLabeling` (`sand-labeling.ts:36`) | ~~fire-and-forget~~ Corrected 25 September: unreachable on the production shell (both sessions are `claidor`; the settle host has no `recordPostTurnLabeling`), so no call and no line |
| Cloud agents (the `CloudAgent` tool) | `BackgroundComposerService/*`, `AiService/AvailableModels` (`cloud-agents-service.ts:37-52`) | launch throws (a ConnectError carries no detail); since 25 September the tool is not built at all (`shared/cloud-agents-availability.ts`, Coming Soon) |
| Auto-review classifier | `DashboardService/ClassifySandAutoReview` (`sand-backend-smart-mode-classifier-exec.ts:39`) | rejects |
| Mobile push | `GrokBotService/NotifySandAgentTurnFinished` (`notifications/mobile-push-notifier.ts:4`) | silent |
| Box image update/reset (cloud box only) | `GrokBotService/GetSandBoxRunState`, `RecreateSandBox` (`box-lifecycle-service.ts:2`) | "Couldn't reach the service that updates this computer" |
| Account MCP and plugins | `DashboardService/{GetAvailableMcpServers,GetMcpConfig,SetMcpConfig,InstallUserPlugin,…}` (`account-mcp.ts:83-128`); `ListSandMcpTools`, `ExecuteSandMcpTool` (`backend-mcp-exec.ts:43-74`) | reads `unavailable`; writes throw |
| Plugin skills, skill publish, managed skills, team rules | `GetEffectiveUserPlugins`, `PublishPlugin`, `GetManagedSkills`, `GetTeamRules` (`mcp/plugin-skills.ts:55-66`, `skill-publish.ts:94-134`, `managed-setup/*`) | caught; `[sand:plugin-skills]`, `[sand:skill-publish]` |
| Cloud automations and listeners | `AutomationsService/*` (`sand-automation-cloud-sync.ts:413-509`); `/sand/listener-*`, `/sand/automation-*` (`backend-relay-source.ts:12`, `sand-automation-fire-consumer.ts:84`); `GetSlackUserSettings`, `GetScmConnectionStatus` (`listener-integrations.ts:28-36`) | local scheduling; listeners "error" with 30 s backoff |
| Cloud automations and listeners, corrected 25 September | Slack/GitHub listeners showed `error` with a 30 s backoff once one existed; Teams/Linear/Sentry/PagerDuty triggers were accepted and showed nothing. Since 25 September the tool refuses a listener trigger as Coming Soon, the prompt offers cron only, the relay sources and the fire consumer are not started and cloud absence is seeded (`shared/listener-availability.ts`). Definitions live in the box volume at `/home/box/sand-data/<agent>/automations/<id>/automation.json`, not backed up. Background routine failures surface only in run history and the agent's status reminder, never a tray (Grok Bot's own rule). | Coming Soon |
| Sharing | `/sand/xuser/*`, `/sand/share-rooms/*` (`xuser-relay.ts:15-28`) | gated off; "Couldn't reach the sharing service" |
| Audit, logs, analytics, traces | `RecordSandAuditEvents`, `SubmitLogs`, `TrackEvents`, `POST /v1/traces` | ~~buffered, dropped, silent~~ Corrected 25 September: the host bundle carried no telemetry guard, so `SubmitLogs` (console lines, 2,048 chars each) and `TrackEvents` were posted to api.simeonlabs.com every 3 s and 404ed; the box now runs with `SAND_DISABLE_TELEMETRY=1`, `SAND_DISABLE_ANALYTICS=1`, `SAND_BOX_LOG_SHIP_DISABLED=1` (schema 10). Audit is gated off and writes a local, redacted `audit.jsonl`; traces never sampled (AlwaysOff) |
| Box store sync, copy-in, local-exec connection | `BackgroundComposerService` store RPCs, `/sand-box/inference-credential`, `/sand-box/local-exec-connection` | off unless `SAND_BOX_STORE_SYNC`; local Docker reads a token file instead |

## Mac-side Connect calls, by feature

| Feature | Calls | On failure |
|---|---|---|
| Profile, teams, rename, privacy, admin ceiling | `DashboardService/{GetMe,GetTeams,UpdateUserName,GetUserPrivacyMode,GetTeamAdminSettings…}` (`account/cursor-profile.ts:116-129`) | local fallbacks; `ClientAction` and PR-review preferences reject to the renderer |
| Access state | `GetSandAccessStatus` (`account/access.ts:68`) | `unknown`; the recovered renderer treats it as an error for the access cover |
| Usage, trial | four `DashboardService` methods (`cursor-profile.ts:125-127`) | gated off, `null` |
| Models | `AiService/AvailableModels` (`models/cursor-model-catalog.ts:12`) | error to the renderer |
| Remote box | `GrokBotService/{EnsureSandBox,RecreateSandBox,…}` (`box/box-host-connector.ts:78-108`); `POST /sand-box/local-exec-daemon-credential` (`:121`) | `ConnectError`; local Docker is the only runtime that works |
| Migration watch | `GrokBotService/WatchSandBoxMigration` (`box-migration-watcher.ts:33`) | retries every 3 s for ever |
| Account MCP | as above (`mcp/desktop-mcp-manager.ts:71,78`); team popularity (`mcp-team-popularity.ts:4-6`) | reads empty; writes reject |
| Experiments | `AnalyticsService/BootstrapStatsig` (`statsig-bootstrap.ts:39`), every 5 min | `{}` |
| Feedback | `POST {api}/sand/feedback` | "unavailable" |
| Telemetry, Sentry, metrics | `AnalyticsService/*`, `metrics.cursor.sh` | off by env in the packaged Mac build; the Sentry DSN is empty since 25 September; the box's env carries the guards since schema 10 |

## Production bindings that supply less than the code uses

Beyond the prompt stores (fixed): `cancelThisRun: () => {}` at the shell
tail overrides the real cancel for the MCP connector card
(`production-turn-run-shell-adapter.ts:171,273`); `isCloudAgentsDisabledByTeam`
is asked of an experiments API that has no such method
(`host-runner-composition.ts`, `experiments/extension.ts:17-25`), so always
false; `NoopConversationActionReceiver`; the runner-context and session
loggers are `() => {}` (already recorded in CLAUDE.md); a standalone box
(no `SAND_USE_EXISTING_BOX_EXEC_DAEMON=1`) throws
`SandBoxNoMonitorAvailableError` on every computer-use call
(`host/box/production.ts:93-105`), which the local Docker box avoids by
setting it; `scripts/caisra-ignition-activation.mjs:115-117` writes
`unboundBindings: []` and `runnerRealTurn: supported` without running the
checks that would list the PDF blocker.

## Skipped tests (7)

Three renderer patch tests skip without `GROK_BOT_PINNED_RENDERER`; two
`renderer-file-url` tests skip without a `dist/` from
`npm run build:clean-source`; two `simeon-logo` tests skip without
`CAISRA_PLAYWRIGHT`. None skip on a failure.

## What to read on the Mac after the rebuild

- Sign-out on mic or Generate: should not happen any more. If it does, the
  status line says "Simeon couldn't confirm your sign-in" and the culprit is
  a refresh that went somewhere other than `api.simeonlabs.com`.
- Dictation in French: the text should come back in French.
- Memory in the prompt: after "remember that I prefer French", the next turn's
  system prompt carries a Memory section; the `[claidor] model=` line's
  prompt token count grows by the size of that section.
- Roster in the prompt: with two agents, either one can name the other
  without being told.
- Avatar generate: the editor's error sentence, or the server's
  `desktop.proxy.upstream_refused` line.
- Mic permission: the `plutil` line above.

## Fixed the same day, directly from the reconstruction

The founder, on reading the list above: "i need you to fix all of this.
directly from the reconstruction." Each fix keeps the function the renderer
or the agent already calls, and the shape it already reads, and points it at
a route Simeon Labs' server serves or at a store on the Mac; no Cursor RPC is
called on any path touched. Every item has a node test; typecheck is clean
and the suite is at 290 passing. None of it has run on a Mac.

| Item above | What was done | Where |
|---|---|---|
| 1 Model picker | `getAvailableModels` reads `/desktop/api/models/available` and returns a generated `AvailableModelsResponse`; the Cursor call is no longer bound | `electron-main/models/claidor-model-catalog.ts`, `main-production-services.ts`; `tests/claidor-model-picker.test.mjs` |
| 2 Usage & Billing | weekly usage and the summary come from `/desktop/api/user/quota`; the gate `sand_usage_page` is on for our build, applied where the gate is read (the generated table is untouched) | `account/cursor-profile.ts`, `shared/node/experiments/simeon-gate-defaults.ts`, `adapters/experiments.ts`, `adapters/account-edge.ts`; `tests/claidor-account.test.mjs` |
| 3 Account avatar and name | the profile reads `/desktop/api/user/profile`; the picture is the Google `avatarUrl`; rename stays local | `account/cursor-profile.ts` |
| 4 PDF | an in-process extractor on pdf.js, bundled into the host bundle (the box mounts one file and has no node_modules); 50 MB and 500 pages caps; both Read tools bound; the activation script detects the binding instead of recording fail-closed | `host/runner/pdf-text-extractor.ts`, `pdf-dom-polyfill.ts`, `scripts/build-caisra.mjs`, `caisra-ignition-activation.mjs`, `host-production-activation.mjs`; `tests/pdf-read.test.mjs` |
| 5 Auto-review | the classifier asks the cheap model through Simeon Labs' proxy (the summarization session, so Luna at low effort) for a JSON verdict with a reason and returns the generated result the callers read; one `[claidor] auto-review action=… verdict=…` line per call | `host/extensions/auto-review/simeon-smart-mode-classifier-exec.ts`, `extension.ts`; `tests/auto-review-classifier.test.mjs` |
| 6 Custom MCP servers and plugins | the account MCP configuration is a store on the Mac (`account-mcp-config.json`), two-way with the box (last writer wins per entry, tombstones), URL servers listed and called over streamable HTTP with the vendor OAuth flow, stdio servers left to the box's existing executor and not measured | `shared/node/account-mcp/*`, `cursor-backend/account-mcp.ts`, the MCP wiring on both sides; `tests/account-mcp-local.test.mjs`; `docs/product/account-mcp-local-measured.md` |
| 7 Feedback, Help, cloud-agent link | Send Feedback posts to the new `POST /desktop/api/feedback` (logged server-side); Help Center opens simeonlabs.com; the cloud-agent link is left, cloud agents being unserved | `feedback/feedback-report.ts`, `server/polar/desktop/endpoints.py`, `application-menu.ts`; `tests/claidor-feedback-help.test.mjs`, `server/tests/desktop/test_endpoints.py` |
| 9 Sign-out | POSTs `/desktop/api/auth/logout` with the token still in hand, then deletes the keychain entries; a failure never blocks the local sign-out | `account/claidor-sign-out.ts`, `cursor-auth.ts` |
| 10 Migration watcher | not built on a local Docker box | `box/box-recovery.ts`; `tests/box-migration-watch-runtime.test.mjs` |
| 11 attachProdBox | packaged builds register handlers that answer disabled | `dev/dev-wiring.ts`; `tests/attach-prod-box-packaged.test.mjs` |
| 13 Prompt gaps | the prompt glue and assembly are built per identity, so a computerUse or browserUse child gets its own computer or browser sections and no SendMessage or MCP sections; the per-turn MCP snapshot (connected connectors, custom instructions, discovery failed) is refreshed at every turn start | `host/host-runner-composition.ts`; `tests/agent-self-service-wired.test.mjs`, `tests/prompt-stores-wired.test.mjs` |
| 14 Host diagnostics | a clipped `[claidor] diagnostic kind=…` line reaches `/tmp/sand-host.log` | `host/sand-host.ts` |
| (bindings) connector-card cancel | the owner input's real cancel wins over the shell tail's no-op | `host/runner/production-turn-run-shell-adapter.ts` |

Not done, because the service behind each does not exist and would be a
build of its own: cloud boxes and cloud agents (8), Slack and GitHub
listeners and sharing (8), Cursor's feature-gate server (12; gates keep
their bundled defaults, `sand_usage_page` is the one we set), and the
notification config forced off (15; local macOS notifications work).

What to read on the Mac after the rebuild, in addition to the list above:
the model picker's list; Settings → Usage with numbers; the account menu
with the Google picture; a PDF read by the agent; a risky shell command with
auto-review enabled in Settings, and its `[claidor] auto-review` line; a
custom MCP server added by the agent showing in Settings.
