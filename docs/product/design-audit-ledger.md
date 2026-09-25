# Design audit ledger

One row per finding of `design-audit-2026-09-24.md`. Nothing is closed
until its row says so. Columns:

- **state**: `unverified` (one auditor's reading), `confirmed` (three
  refuters, at most one refuting), `refuted`.
- **cluster**: the root cause the finding shares with others; filled in
  during clustering, after verification. `-` until then.
- **disposition**, the founder's rule of 25 September 2026: "if something
  can actually be enabled in the current system by changing a true/false
  flag, feature gate, config, or on/off setting, don't mark it Coming
  Soon. Turn it on and make it work." So exactly one of:
  - `fixed` — enabled, wired or corrected, with the commit;
  - `coming-soon` — genuinely cannot work with what we have (depends on a
    Cursor or cloud service, or on something not built), and every place
    a person can see or reach it says Coming Soon;
  - `known-limit` — a founder decision or an accepted limit, named in a
    record, with no user-visible leak;
  - `needs-mac` — fixed or enabled in code, not yet measured on a Mac;
  - `-` — not yet decided.
  A `coming-soon` row must say what unavailable service or unbuilt
  thing it depends on; "it was off" is never that reason.

| id | area | severity | kind | state | cluster | disposition | title | first evidence |
|---|---|---|---|---|---|---|---|---|
| F-001 | chat-turn | blocking | unwired | confirmed | hidden-turn-cap | fixed | Hidden-turn model-call cap (40) is never wired on the production path: every nudge, intro and automation runs with the 5,000 budget | `desktop/source/host/host-runner-composition.ts` |
| F-002 | chat-turn | major | risk | unverified | - | - | Every model call is hard-aborted at 45 s including the streamed body, so a long Terra effort-high step cannot complete and is retried | `desktop/source/host/extensions/inference/provider-session.ts` |
| F-003 | chat-turn | minor | design-violation | unverified | - | - | Silent per-step model swap: on any 'rate limit'-shaped error the loop falls back from Terra to Luna without a system line in the thread | `desktop/source/host/extensions/inference/provider-session.ts` |
| F-004 | chat-turn | minor | dead-service | confirmed | dead-cursor-services | fixed | Every turn and every nudge first calls Cursor's GetUserPrivacyMode Connect RPC against api.simeonlabs.com, which is not served | `desktop/source/host/runner/turn-run-shell.ts` |
| F-005 | chat-turn | minor | unwired | unverified | - | - | The claidor executor never reports a request id, so the transcript, tray errors and telemetry carry none | `desktop/source/host/host-runner-composition.ts` |
| F-006 | chat-turn | note | hardcoded | unverified | - | - | The Agent is configured with model id 'gpt-5.5-high-fast' while the wire runs gpt-5.6-terra | `desktop/source/host/host-runner-composition.ts` |
| F-007 | chat-turn | minor | design-violation | confirmed | cloud-agents-channels | coming-soon | The agent's prompt still offers cloud agents (`cursor-agent` cards, 'launching a cloud agent') and channel delivery, both unserved, with no explanation | `desktop/source/host/runner/tools/send-message-schema.ts` |
| F-008 | chat-turn | minor | docs-wrong | unverified | - | - | Text does not arrive 'as texts': no split into up to three bubbles one second apart (BUBBLE_GAP_MS) | `docs/product/direction.md` |
| F-009 | chat-turn | note | docs-wrong | unverified | - | - | direction.md's 'nine kinds, list closed' is contradicted by the host's fourteen SendMessage/transport kinds | `desktop/source/host/runner/tools/send-message-encoding.ts` |
| F-010 | chat-turn | minor | design-violation | unverified | - | - | SAND_CLAIDOR_FULL_AGENT=off hatch is live, env-only, and still ships the audited flaws plus a 'Router error:' bubble and a Codex/Claude Code-flavoured prompt | `desktop/source/shared/inference-router.ts` |
| F-011 | chat-turn | note | dead-service | unverified | - | - | Dead executors for Codex (chatgpt.com), Claude Code and OpenRouter remain compiled into the host with a 'Settings → Router' key field and 'Simeon Reconstructed' headers | `desktop/source/host/extensions/inference/provider-session.ts` |
| F-012 | chat-turn | minor | risk | unverified | - | - | On a model error the box log receives the full system prompt (12,000 chars: memory, user info, roster) and every tool schema | `desktop/source/host/extensions/inference/provider-session.ts` |
| F-013 | chat-turn | note | spend | confirmed | hidden-turn-cap | known-limit | Reply-nudge budget: up to 4 hidden runs per user turn (3 REPLY_NUDGE + 1 CLOSING_SEND_NUDGE) plus ensureHiddenTurnReply on the intro, each unbounded by the hidden cap today | `desktop/source/host/extensions/transcript/turn-runtime.ts` |
| F-014 | agents-and-subagents | blocking | design-violation | unverified | - | - | A Task child runs on the parent's conversation state and writes its checkpoints into the parent's agent store and transcript | `desktop/source/host/host-runner-composition.ts` |
| F-015 | agents-and-subagents | major | spend | confirmed | hidden-turn-cap | fixed | The 40-call hidden-turn budget is dead on the production path: `hidden` never reaches the owner input | `desktop/source/host/host-runner-composition.ts` |
| F-016 | agents-and-subagents | major | design-violation | unverified | - | - | The agent's prompt says it holds the Screenshot tool while AGENT_SCREENSHOT_TOOL = false withholds it (the blindness failure, undeclared) | `desktop/source/host/host-runner-composition.ts` |
| F-017 | agents-and-subagents | major | unwired | confirmed | asks-once-memory | known-limit | The executor subagent is on by default (sand_multitask default true) and an executor child's ExternalShell/ExternalRead can never be allowed: no permission surface exists for the child's id | `desktop/source/shared/node/experiments/experiment-config.gen.ts` |
| F-018 | agents-and-subagents | major | design-violation | unverified | - | - | getRemoteBoxAvailable compares a Promise to false and is always true, so box tools and computerUse are offered with Docker off | `desktop/source/host/host-runner-composition.ts` |
| F-019 | agents-and-subagents | major | unwired | confirmed | memory | fixed | Grok Bot's per-turn memory extraction and episode summaries never run: the shell adapter host has no memoryStore | `desktop/source/host/runner/production-turn-run-shell-adapter.ts` |
| F-020 | agents-and-subagents | minor | unwired | confirmed | hidden-turn-cap | fixed | The closing-send nudge can never fire: onLatestPromptMessages is not passed, so latestPromptMessages() is always [] | `desktop/source/host/host-runner-composition.ts` |
| F-021 | agents-and-subagents | minor | unwired | confirmed | auto-review-enforce | fixed | Subagent launch auto-review and MessageSubagent steer review are not wired on the production path | `desktop/source/host/runner/turn-agent-composition.ts` |
| F-022 | agents-and-subagents | minor | dead-service | unverified | - | - | The agent is offered the CloudAgent tool and the cloud-agents-enabled brief although cloud agents are known-unserved | `desktop/source/host/runner/system-prompt.ts` |
| F-023 | agents-and-subagents | minor | unwired | unverified | - | - | Chrome prewarm (prepareRemoteBox) has no caller; the child's prompt says it happens | `desktop/source/host/runner/computer-use.ts` |
| F-024 | agents-and-subagents | minor | unwired | unverified | - | - | resolveBoxBrowser and getBoxWindowIndex are not supplied, so the child is told to `echo $DISPLAY` although the local box's window index is known | `desktop/source/host/runner/runner-prompt-glue.ts` |
| F-025 | agents-and-subagents | minor | unwired | unverified | - | - | CheckSubagent promises a transcript path and tool-call counts the production child cannot provide | `desktop/source/host/runner/sand-agent-runner.ts` |
| F-026 | agents-and-subagents | minor | naming | unverified | - | - | The child runner's getConversationId() is the parent's id (inherited getAgentId), so the child carries a mixed identity | `desktop/source/host/host-runner-composition.ts` |
| F-027 | agents-and-subagents | minor | design-violation | unverified | - | - | Task resume and readonly do not reach the child; MessageSubagent's text promises a resume that recreates a blank runner | `desktop/source/host/runner/subagent-runtime.ts` |
| F-028 | agents-and-subagents | minor | unwired | unverified | - | - | The prompt glue never learns whether browserUse is offered, so prompt and Task configs disagree when the gate is on | `desktop/source/shared/node/experiments/experiment-config.gen.ts` |
| F-029 | agents-and-subagents | note | risk | refuted | hidden-turn-cap | known-limit | Agent-created teammates are minted as origin 'user' with an introduction pending | `desktop/source/host/host-runner-composition.ts` |
| F-030 | agents-and-subagents | note | docs-wrong | unverified | - | - | The child-audit record's cost accounting is incomplete: the prompt shrank, the child's context did not | `docs/product/computer-use-child-audit-2026-09-24.md` |
| F-031 | routines-automations | blocking | design-violation | confirmed | routines-away | fixed | Routines only fire while the app and the local Docker box are running; nothing fires with the Mac shut, and the agent's brief tells the person the opposite | `desktop/source/host/extensions/automations/sand-trigger-hub.ts` |
| F-032 | routines-automations | blocking | dead-service | confirmed | listeners-coming-soon | coming-soon | The agent is offered six event-listener trigger types (Slack, GitHub, Teams, Linear, Sentry, PagerDuty) that can never fire on Simeon, and saving one reports success | `desktop/source/host/runner/tools/sand-state-tool.ts` |
| F-033 | routines-automations | major | naming | confirmed | listeners-coming-soon | fixed | Listener 'connect' opens cursor.com, and the routines copy says Claidor and @Cursor to the person and the agent | `desktop/source/host/extensions/automations/listener-integrations.ts` |
| F-034 | routines-automations | minor | hardcoded | confirmed | routine-write-review | fixed | Auto-review of routine writes is pinned 'off' in every mode table, so the confirm card promised in the brief and tool description never appears | `desktop/source/host/runner/sand-auto-review.ts` |
| F-035 | routines-automations | minor | dead-service | confirmed | listeners-coming-soon | fixed | The box POSTs /sand/automation-events/poll to api.simeonlabs.com every ~30 s forever, even with zero routines, because the 404 never sets drainedWhileUnschedulable | `desktop/source/host/extensions/automations/sand-automation-fire-consumer.ts` |
| F-036 | routines-automations | minor | risk | confirmed | listeners-coming-soon | fixed | Cron-only routines are scheduled locally only after a cloud RPC has failed; with no credential in the box they never fire | `desktop/source/host/extensions/automations/sand-automation-cloud-sync.ts` |
| F-037 | routines-automations | minor | risk | confirmed | routines-away | known-limit | A scheduled or event-fired routine that fails never tells the person; only manual 'Run now' failures raise a tray | `desktop/source/host/extensions/transcript/automation-run-path.ts` |
| F-038 | routines-automations | note | docs-wrong | confirmed | routines-away | fixed | Record says grep desktop/src for maty; that path no longer exists, and the sentence should point at desktop/source | `CLAUDE.md` |
| F-039 | routines-automations | note | docs-wrong | confirmed | listeners-coming-soon | fixed | reconstruction-gaps says listeners show 'error' with 30 s backoff; Teams/Linear/Sentry/PagerDuty listeners show nothing at all | `docs/product/reconstruction-gaps-2026-09-24.md` |
| F-040 | routines-automations | note | unwired | confirmed | listeners-coming-soon | fixed | onFailure for cloud sync is an empty body; the tray map it guards is never written | `desktop/source/host/extensions/automations/extension.ts` |
| F-041 | routines-automations | note | docs-wrong | confirmed | routines-away | fixed | Spend guard pauses every enabled routine after three days unread and draws a widget card; the record does not mention this second, independent guard | `desktop/source/host/extensions/transcript/sand-automation-spend-guard.ts` |
| F-042 | routines-automations | note | unwired | confirmed | routines-away | known-limit | SAND_BOX_BOOT_STARTED_AT_MS is never set by the local Docker launcher, so boxUptimeMs telemetry is always absent | `desktop/source/host/extensions/automations/extension.ts` |
| F-043 | workflows-channels-listeners | blocking | dead-service | confirmed | listeners-coming-soon | coming-soon | Slack/GitHub listener routines are advertised to the agent but can never fire: the relay posts to /sand/* routes Simeon Labs' server does not serve | `desktop/source/host/automations/automation.ts` |
| F-044 | workflows-channels-listeners | blocking | unwired | confirmed | listeners-coming-soon | coming-soon | The listener connect card is never drawn and the agent is never told the platform is disconnected: the connection read throws and surfaceListenerConnectCards swallows it | `desktop/source/host/runner/tools/listener-connect-cards.ts` |
| F-045 | workflows-channels-listeners | major | risk | refuted | listeners-coming-soon | fixed | Routine panel shows the raw relay error 'relay /sand/listener-subscriptions returned 404' as the listener status | `desktop/source/host/extensions/automations/backend-relay-source.ts` |
| F-046 | workflows-channels-listeners | major | dead-service | confirmed | listeners-coming-soon | fixed | 'Connect' for GitHub/Slack listeners opens cursor.com/dashboard | `desktop/source/host/extensions/automations/listener-integrations.ts` |
| F-047 | workflows-channels-listeners | major | dead-service | confirmed | listeners-coming-soon | coming-soon | Microsoft Teams, Linear, Sentry and PagerDuty triggers are in the prompt but have no local source at all | `desktop/source/host/automations/automation.ts` |
| F-048 | workflows-channels-listeners | major | design-violation | confirmed | routines-away | fixed | A routine dies when the app quits, while the prompt and the design both promise it runs when the person is away | `desktop/source/host/extensions/automations/sand-automation-cloud-sync.ts` |
| F-049 | workflows-channels-listeners | minor | docs-wrong | confirmed | routines-away | fixed | Records say Routines 'does nothing yet' and 'none can be created'; the code creates and fires cron routines while the app is open | `docs/product/direction.md` |
| F-050 | workflows-channels-listeners | major | unwired | unverified | - | - | Workflow SKILL.md files never reach the model as skills: resolveAgentSkills is optional and the production composition never supplies it; agentSkillsFromWorkflows has no caller | `desktop/source/host/runner/agent-adapters.ts` |
| F-051 | workflows-channels-listeners | minor | design-violation | unverified | - | - | 'Import local skills' scans the box's home, not the person's Mac, and looks for Cursor/Claude files | `desktop/source/host/extensions/transcript/workflow-commands.ts` |
| F-052 | workflows-channels-listeners | note | dead-service | unverified | - | - | Managed skills (including Teach's learn-from-demonstration) come from Cursor's GetManagedSkills and are never populated | `desktop/source/host/extensions/managed-setup/production.ts` |
| F-053 | workflows-channels-listeners | minor | naming | confirmed | listeners-coming-soon | fixed | Agent-readable strings name Cursor: '@Cursor' Slack bot, 'Cursor Slack app', 'cursor-agent cards', cursor.com/agents links | `desktop/source/host/automations/automation.ts` |
| F-054 | workflows-channels-listeners | minor | naming | confirmed | listeners-coming-soon | fixed | 'Claidor account' in prompt and status strings the agent and the person read | `desktop/source/host/automations/automation.ts` |
| F-055 | workflows-channels-listeners | minor | unwired | confirmed | cloud-agents-channels | coming-soon | SendMessage still offers a `channel` target and secret-request 'channel-credential', but no channel delivery is ever registered and both channel platforms are coming-soon | `desktop/source/host/extensions/transcript/transcript-manager.ts` |
| F-056 | workflows-channels-listeners | note | design-violation | confirmed | cloud-agents-channels | fixed | Two different CONNECTOR_MANIFESTS lists (discord/slack vs slack/github) feed the prompt and the Mac channels view | `desktop/source/shared/channels.ts` |
| F-057 | workflows-channels-listeners | note | design-violation | confirmed | cloud-agents-channels | fixed | The Mac gateway accepts a channel token typed by the person (connectChannel) | `desktop/source/host/extensions/transcript/transcript-manager.ts` |
| F-058 | workflows-channels-listeners | note | spend | confirmed | listeners-coming-soon | fixed | With any listener routine saved, the box POSTs to two unserved endpoints every 30 s for ever | `desktop/source/host/extensions/automations/backend-relay-source.ts` |
| F-059 | memory | blocking | unwired | confirmed | memory | fixed | Post-turn memory extraction never runs: the production turn shell hands the settle no memoryStore | `desktop/source/host/runner/production-turn-run-shell-adapter.ts` |
| F-060 | memory | blocking | unwired | confirmed | memory | fixed | Even with a store, the legacy extraction arm can never fire: isMemorableExchange is defined and never passed | `desktop/source/host/runner/turn-settle.ts` |
| F-061 | memory | major | unwired | confirmed | memory | known-limit | Memory synthesis ('dreaming') is gated off and its gate pin can never fire under Simeon | `desktop/source/host/extensions/memory/extension.ts` |
| F-062 | memory | blocking | unwired | confirmed | memory | fixed | User memory and project memory are never built: the memory extension has no createUserMemory/createProjectMemory | `desktop/source/host/host-runner-composition.ts` |
| F-063 | memory | major | unwired | confirmed | memory | fixed | Deleting one memory from the pane never deletes: argument key mismatch (memoryId vs id) | `desktop/source/host/extensions/transcript/transcript-manager.ts` |
| F-064 | memory | major | unwired | confirmed | memory | needs-mac | Memory list/delete/clear have no route from the Mac, and the host's 'memory' SSE channel is dropped by the coordinator | `desktop/source/host/gateway-protocol.ts` |
| F-065 | memory | major | docs-wrong | confirmed | memory-sync | coming-soon | Memory sync to Simeon Labs' server is served, never called, and could not accept the app's memory files if it were | `server/polar/desktop/endpoints.py` |
| F-066 | memory | major | design-violation | confirmed | memory | fixed | If memory extraction ran, it would run on the loop model at high effort with the reply-reminder middlewares, not Luna at low | `desktop/source/host/host-runner-composition.ts` |
| F-067 | memory | major | design-violation | confirmed | memory | fixed | An agent's own update_state memory write does not reach its prompt until a compaction, which needs ~180k tokens | `desktop/source/host/runner/sand-memory.ts` |
| F-068 | memory | minor | naming | confirmed | memory | fixed | Two note prefixes: update_state's 'note' tier is never recognised as a note | `desktop/source/host/extensions/memory/agent-state.ts` |
| F-069 | memory | minor | unwired | confirmed | memory | fixed | MemoryService.setActiveAgent is called with an object where a string is expected, so it emits on every watch | `desktop/source/host/extensions/transcript/run-lifecycle.ts` |
| F-070 | memory | minor | risk | confirmed | memory | known-limit | Deleting an agent leaves its user-memory and project-memory shards behind | `desktop/source/host/extensions/session/agent-session.ts` |
| F-071 | memory | minor | risk | confirmed | memory | fixed | The legacy extraction prompt has no rule against recording secrets or credentials | `desktop/source/host/runner/sand-memory.ts` |
| F-072 | memory | note | unmeasured | confirmed | memory | fixed | Nothing in the memory path writes a [claidor] log line; synthesis telemetry goes to an unserved Cursor sink | `desktop/source/host/extensions/memory/production.ts` |
| F-073 | memory | note | spend | confirmed | memory | known-limit | If dreaming is ever switched on: two model calls per synthesis plus a daily temporal review per agent, retried up to 3 times | `desktop/source/host/extensions/memory/memory-synthesis-service.ts` |
| F-074 | memory | note | unwired | confirmed | memory | fixed | MEMORY_UI_LIMIT and the user/project prompt limits are defined and never used; the pane list is capped at 100 | `desktop/source/host/runner/sand-memory.ts` |
| F-075 | memory | minor | docs-wrong | confirmed | memory | fixed | model-roles-measured.md's memory row is wrong today: no memory role runs, and the one that could would be Terra/high | `docs/product/model-roles-measured.md` |
| F-076 | cards-and-widgets | blocking | unwired | unverified | - | - | request_box_help (box hand-off card) is never on the production toolset | `desktop/source/host/runner/tools/turn-toolset.ts` |
| F-077 | cards-and-widgets | major | spend | unverified | - | - | Auto-review runs in shadow: a Luna call per Shell/Computer action, never an approval card | `desktop/source/host/extensions/auto-review/auto-review-service.ts` |
| F-078 | cards-and-widgets | major | naming | unverified | - | - | The agent's brief and box reference docs say Claidor and Cursor | `desktop/source/host/runner/system-prompt.ts` |
| F-079 | cards-and-widgets | major | dead-service | unverified | - | - | The brief orders repository work to CloudAgent and offers the cursor-agent card, though cloud agents are unserved | `desktop/source/host/runner/system-prompt.ts` |
| F-080 | cards-and-widgets | major | design-violation | unverified | - | - | 'Computer asks once' is not what the local-execution gate does by default | `desktop/source/shared/local-tool-permission.ts` |
| F-081 | cards-and-widgets | major | design-violation | confirmed | cloud-agents-channels | coming-soon | secret-request stores the value in a plain-JSON channel file that only channel connectors read | `desktop/source/host/runner/tools/send-message-tool.ts` |
| F-082 | cards-and-widgets | major | unwired | unverified | - | - | The form, draft-composer, virtual-card and cookie-origin cards the permissions design relies on have no tool in the tree | `docs/product/sources/caisra-permissions.md` |
| F-083 | cards-and-widgets | major | unwired | unverified | - | - | Artifacts-as-files: no docx/pptx/xlsx skill in the tree and no 'Documents You Make' section in the brief | `desktop/source/host/extensions/managed-setup/cursor-skills-marketplace.ts` |
| F-084 | cards-and-widgets | minor | docs-wrong | unverified | - | - | Records say auto-review is fixed; neither says it runs in shadow | `CLAUDE.md` |
| F-085 | cards-and-widgets | major | docs-wrong | unverified | - | - | The Settings paths the agent is told to name do not agree with each other or with the product | `desktop/source/shared/local-tool-permission-machinery.ts` |
| F-086 | cards-and-widgets | major | risk | unverified | - | - | The first Allow card after launch can be posted without the account-scope stamp | `desktop/source/node-agent-coordinator/main.ts` |
| F-087 | cards-and-widgets | note | risk | unverified | - | - | Chronological card sort only runs when the reply carries an Allow card | `desktop/source/node-agent-coordinator/main.ts` |
| F-088 | cards-and-widgets | minor | dead-service | unverified | - | - | Local-tool permission ceiling is fetched from a Cursor Dashboard RPC on every auth change | `desktop/source/electron-main/account/cursor-profile.ts` |
| F-089 | cards-and-widgets | minor | docs-wrong | unverified | - | - | cards-plan.md and direction.md describe kinds, files and tools that are not in the tree | `docs/product/cards-plan.md` |
| F-090 | cards-and-widgets | minor | unwired | confirmed | routine-write-review | fixed | Routine writes are never reviewed: automationWrite is 'off' in every mode table | `desktop/source/host/runner/sand-auto-review.ts` |
| F-091 | cards-and-widgets | minor | design-violation | unverified | - | - | The brief tells the agent to use a Screenshot tool that is withheld, with no explanation | `desktop/source/host/host-runner-composition.ts` |
| F-092 | cards-and-widgets | note | design-violation | unverified | - | - | Dead settings 'Router' panel source offers Claude Code, Codex and an OpenRouter API key | `desktop/scripts/lib/router-renderer-patch.mjs` |
| F-093 | cards-and-widgets | note | docs-wrong | unverified | - | - | Permissions design names widget options the schema does not have (multiSelect) and a stale test comment | `docs/product/sources/caisra-permissions.md` |
| F-094 | cards-and-widgets | note | dead-service | unverified | - | - | Legacy 'permission-request' kind still encodable and described as no longer actionable | `desktop/source/host/runner/tools/sand-permission-request.ts` |
| F-095 | cards-and-widgets | note | docs-wrong | unverified | - | - | direction.md contradicts itself on whether the computer asks once | `docs/product/direction.md` |
| F-096 | keys-and-auth | major | docs-wrong | unverified | - | - | Box keeps a server-revoked token for minutes after each Mac refresh; nothing re-reads inference.json on a 401 | `server/polar/desktop/service.py` |
| F-097 | keys-and-auth | major | risk | unverified | - | - | Any non-2xx from /oauth/token signs the person out and deletes the keychain entries | `desktop/source/electron-main/account/cursor-auth.ts` |
| F-098 | keys-and-auth | major | naming | unverified | - | - | The browser sign-in page says 'Caisra' on every sign-in | `server/polar/desktop/app_sign_in.py` |
| F-099 | keys-and-auth | minor | naming | unverified | - | - | Sign-in and auth error strings, and the agent's brief, still say 'Claidor' | `desktop/source/electron-main/account/cursor-auth.ts` |
| F-100 | keys-and-auth | major | dead-service | unverified | - | - | The host asks Cursor's DashboardService/GetMe for the person's name; the agent never learns it and every renewal logs a failure | `desktop/source/host/extensions/auth/user-full-name-service.ts` |
| F-101 | keys-and-auth | minor | dead-service | unverified | - | - | Every auth-status delivery fires dead Cursor RPCs (team ceiling, privacy mode, access status, PR prefs, structured logs) | `desktop/source/electron-main/account/cursor-auth-wiring.ts` |
| F-102 | keys-and-auth | major | risk | unverified | - | - | Vendor OAuth refresh tokens and client secrets sit in plaintext JSON with default file mode, and are copied into the box | `desktop/source/shared/node/vendor-mcp/installs.ts` |
| F-103 | keys-and-auth | minor | risk | unverified | - | - | sand-secrets.json (keychain-encrypted sign-in tokens) is written without 0o600 | `desktop/source/electron-main/secrets/secret-store.ts` |
| F-104 | keys-and-auth | note | dead-service | unverified | - | - | Cursor's Sentry DSN (metrics.cursor.sh) is still in the tree; the adapter is never installed, so it is dead — but 'sentryEnabled' defaults on outside the packaged build | `desktop/source/shared/observability/sentry.ts` |
| F-105 | keys-and-auth | note | dead-service | unverified | - | - | Refresh and poll requests carry Cursor's Auth0 client_id and read Cursor's MDM policy from the Mac | `desktop/source/electron-main/account/cursor-auth.ts` |
| F-106 | keys-and-auth | minor | docs-wrong | unverified | - | - | The box's 'waiting for credential' message says 'no desktop required', which is false on local Docker | `desktop/source/host/extensions/auth/auth-service.ts` |
| F-107 | keys-and-auth | note | design-violation | unverified | - | - | Dashboard 'Create a token for the app' tells the person to set CLAIDOR_ACCESS_TOKEN on a server that no longer exists | `clients/apps/web/src/components/Settings/ConnectAppSettings.tsx` |
| F-108 | keys-and-auth | note | dead-service | unverified | - | - | Legacy /desktop/login still redirects to caisra://auth/callback | `server/polar/desktop/endpoints.py` |
| F-109 | keys-and-auth | note | unwired | unverified | - | - | /auth/poll reads x-maties-client-version, a header the app never sends | `server/polar/desktop/endpoints.py` |
| F-110 | keys-and-auth | minor | design-violation | unverified | - | - | Alternative-provider credential paths (Codex ChatGPT login, Claude Code, OpenRouter key from box secrets) remain in the host executor | `desktop/source/host/extensions/inference/provider-session.ts` |
| F-111 | keys-and-auth | minor | risk | unverified | - | - | Sign-out leaves inference.json on disk and the keep-fresh timer running | `desktop/source/electron-main/account/cursor-auth.ts` |
| F-112 | keys-and-auth | note | risk | unverified | - | - | Box secrets and connector credentials are persisted in plaintext inside the box's data volume | `desktop/source/host/extensions/secrets/secrets-service.ts` |
| F-113 | keys-and-auth | note | risk | unverified | - | - | The gateway bearer token is passed to the container as a docker --env | `desktop/source/electron-main/box/local-docker-host-connector.ts` |
| F-114 | keys-and-auth | note | dead-service | unverified | - | - | 1Password provisioning code is present with Anysphere's launcher signing identity; unreachable outside dev controls | `desktop/source/electron-main/onepassword/onepassword-cli-runtime.ts` |
| F-115 | keys-and-auth | note | docs-wrong | unverified | - | - | docs/product/app-sign-in.md still says the round trip was never run and names api.claidor.com | `docs/product/app-sign-in.md` |
| F-116 | keys-and-auth | note | dead-service | confirmed | dead-cursor-services | fixed | Every Connect RPC to our host carries x-cursor-checksum, x-ghost-mode and the bearer, after a privacy lookup that 404s | `desktop/source/shared/node/cursor-backend/cursor-inference.ts` |
| F-117 | models-and-spend | blocking | unwired | confirmed | hidden-turn-cap | fixed | Hidden-turn budget of 40 never reaches the executor: the production owner input drops `hidden` | `desktop/source/host/host-runner-composition.ts` |
| F-118 | models-and-spend | major | spend | unverified | - | - | Auto-review classifier runs in shadow by default: one Luna call per Shell/MCP/computer action, verdict discarded | `desktop/source/host/runner/sand-auto-review.ts` |
| F-119 | models-and-spend | major | unwired | unverified | - | - | The model picker's choice never reaches the executor; the loop's model is decided only by box env | `desktop/source/host/host-runner-composition.ts` |
| F-120 | models-and-spend | minor | design-violation | unverified | - | - | Luna is offered in the picker as the agent's model, against pricing.py's own rule | `desktop/source/electron-main/models/claidor-model-catalog.ts` |
| F-121 | models-and-spend | minor | docs-wrong | unverified | - | - | Claude Sonnet fallback is unreachable; the only fallback is Luna on a rate-limit regex, unannounced | `desktop/source/host/extensions/inference/provider-session.ts` |
| F-122 | models-and-spend | minor | spend | unverified | - | - | The proxy serves withheld models (Astra 10x, Opus 5x) to any bearer that names them | `server/polar/desktop/endpoints.py` |
| F-123 | models-and-spend | minor | dead-service | confirmed | dead-cursor-services | fixed | A Cursor Connect RPC (GetUserPrivacyMode) is attempted on api.simeonlabs.com at the start of every turn | `desktop/source/host/runner/turn-run-shell.ts` |
| F-124 | models-and-spend | major | risk | unverified | - | - | `CLAIDOR_FETCH_TIMEOUT_MS = 45_000` aborts the whole streamed model call, not just the connect | `desktop/source/host/extensions/inference/provider-session.ts` |
| F-125 | models-and-spend | note | spend | confirmed | hidden-turn-cap | known-limit | Every reply nudge and closing nudge is a fresh full turn on Terra at effort high with the whole brief | `desktop/source/host/extensions/transcript/turn-runtime.ts` |
| F-126 | models-and-spend | note | unmeasured | unverified | - | - | Hourly credit brake makes the 5,000-step asked cap unreachable; how the 402 reads in the chat is unmeasured | `server/polar/config.py` |
| F-127 | models-and-spend | minor | naming | unverified | - | - | User-facing error strings say Claidor and expose env-variable names | `desktop/source/host/extensions/transcript/agent-run-error.ts` |
| F-128 | models-and-spend | note | dead-service | unverified | - | - | Dead providers (codex, claude-code, openrouter) and the Router panel: unreachable, but still shipped as code, SDK and strings | `desktop/source/host/extensions/inference/provider-session.ts` |
| F-129 | models-and-spend | minor | docs-wrong | unverified | - | - | Four capability prices are live and metering although pricing.py says nobody should be charged against them yet | `server/polar/desktop/pricing.py` |
| F-130 | models-and-spend | minor | design-violation | unverified | - | - | Usage tab: monthly allowance under a 'Weekly usage' label; picker shows a 1.05M context while the loop compacts at 200k | `desktop/source/electron-main/account/cursor-profile.ts` |
| F-131 | models-and-spend | note | hardcoded | refuted | memory | known-limit | Machinery sessions still request Cursor model ids that are silently remapped | `desktop/source/host/extensions/memory/production.ts` |
| F-132 | models-and-spend | note | naming | unverified | - | - | A Cursor pricing link survives in error actions | `desktop/source/host/extensions/transcript/agent-run-error.ts` |
| F-133 | models-and-spend | note | spend | unverified | - | - | The escape-hatch coordinator turn and group-chat turns run with no model-call budget | `desktop/source/host/extensions/inference/provider-session.ts` |
| F-134 | box-and-computer | major | risk | unverified | - | - | Box exec daemon on 127.0.0.1:1337 with static bearer "local"; any local process can run commands in the box and read the account token | `desktop/source/electron-main/box/local-docker-host-connector.ts` |
| F-135 | box-and-computer | major | risk | unverified | - | - | noVNC/websockify on 127.0.0.1:6080/6081 with no credential: any web page on the Mac can drive the agent's logged-in desktop | `desktop/source/electron-main/box/local-docker-host-connector.ts` |
| F-136 | box-and-computer | major | unwired | unverified | - | - | The reconstructed box-exec-daemon supports no computer-use, no write, no MCP load, and rejects paths outside /workspace — and the container is told to use the mounted daemon | `desktop/source/box-exec-daemon/server.ts` |
| F-137 | box-and-computer | major | dead-service | unverified | - | - | Settings offers "Simeon's remote computer": the toggle routes to Cursor's GrokBotService/EnsureSandBox and strands the person | `desktop/scripts/lib/router-renderer-patch.mjs` |
| F-138 | box-and-computer | major | docs-wrong | unverified | - | - | Agent-readable app-ui.md says "Sign In with Claidor", five Settings tabs, Plugins/Marketplace, Update Track and Team Setup | `desktop/source/host/runner/box-reference-docs.ts` |
| F-139 | box-and-computer | major | docs-wrong | unverified | - | - | Agent-readable debugging-the-box.md points at a nonexistent "computer needs Docker" prompt, names anyrun as the default and the wrong container | `desktop/source/host/runner/box-reference-docs.ts` |
| F-140 | box-and-computer | minor | dead-service | unverified | - | - | Host-side box lifecycle (update/reset/image check) still calls Cursor's GrokBotService and retries at every host start | `desktop/source/host/extensions/box-lifecycle/extension.ts` |
| F-141 | box-and-computer | minor | docs-wrong | unverified | - | - | Reset/Update semantics told to the agent (snapshot restore, fresh instance) do not match the local box (docker restart / rm keeping both volumes) | `desktop/source/electron-main/box/local-docker-host-connector.ts` |
| F-142 | box-and-computer | major | spend | unverified | - | - | `--restart unless-stopped`: after a crash (no clean quit) the box comes back on its own and keeps spending until its token expires | `desktop/source/electron-main/box/local-docker-host-connector.ts` |
| F-143 | box-and-computer | major | risk | unverified | - | - | The box image is Cursor's mutable ECR tag, unpinned and not owned | `desktop/source/electron-main/box/local-docker-host-connector.ts` |
| F-144 | box-and-computer | minor | unwired | unverified | - | - | ForeverBox captureScreenshot is never supplied; the escape-hatch Screenshot/Computer tools answer "still starting up" | `desktop/source/host/extensions/forever-box/forever-box-service.ts` |
| F-145 | box-and-computer | minor | design-violation | unverified | - | - | Escape-hatch tool descriptions and the brief name tools that do not exist here (watchVideo/videoReview) and misdescribe WebFetch | `desktop/source/host/runner/system-prompt.ts` |
| F-146 | box-and-computer | minor | docs-wrong | unverified | - | - | computer-stream-measured.md still documents `[CaisraScreen]` lines; the preload prints `[SimeonScreen]` | `docs/product/computer-stream-measured.md` |
| F-147 | box-and-computer | note | docs-wrong | unverified | - | - | CLAUDE.md's "host re-reads an expired file every 30 s" is not what the renewer does | `desktop/source/host/extensions/auth/credential-renewer.ts` |
| F-148 | box-and-computer | minor | risk | unverified | - | - | Gateway token and desktop access token sit in plaintext on the Mac and in `docker inspect` | `desktop/source/electron-main/box/local-docker-host-connector.ts` |
| F-149 | box-and-computer | note | design-violation | unverified | - | - | The local-tool approval ask carries no machine identity | `desktop/source/host/extensions/transcript/routed-agent-tools.ts` |
| F-150 | box-and-computer | minor | dead-service | unverified | - | - | openCloudAgent still opens https://cursor.com/agents/… | `desktop/source/electron-main/main-edge.ts` |
| F-151 | box-and-computer | note | unmeasured | unverified | - | - | Every agent gets its own fork desktop (start-window) in one container on an amd64-emulated image | `desktop/source/host/box/box-windows.ts` |
| F-152 | connectors-mcp | major | design-violation | confirmed | connectors-mcp | fixed | Agent is told to ask for API keys and tokens in chat (tool descriptions) | `desktop/source/host/runner/tools/sand-mcp-management-tools.ts` |
| F-153 | connectors-mcp | major | risk | confirmed | connectors-mcp | fixed | Vendor and custom-server credentials stored plaintext and copied whole to the box | `desktop/source/shared/node/vendor-mcp/installs.ts` |
| F-154 | connectors-mcp | major | docs-wrong | confirmed | connectors-mcp | fixed | Kit/skill/MCP store routes have no reader in the reconstruction; record says the pipe is live | `server/polar/desktop/endpoints.py` |
| F-155 | connectors-mcp | major | risk | confirmed | connectors-mcp | fixed | HTTP MCP client body read has no timeout; an open SSE stream hangs discovery or a tool call | `desktop/source/shared/node/vendor-mcp/http-mcp-client.ts` |
| F-156 | connectors-mcp | minor | dead-service | confirmed | connectors-mcp | fixed | Plugin-skills service still polls Cursor's Dashboard RPCs in the box | `desktop/source/host/extensions/mcp/plugin-skills.ts` |
| F-157 | connectors-mcp | minor | dead-service | confirmed | connectors-mcp | coming-soon | Skill publish still talks to Cursor and shows a Claidor-branded failure | `desktop/source/host/extensions/mcp/skill-publish.ts` |
| F-158 | connectors-mcp | minor | dead-service | confirmed | connectors-mcp | fixed | Team plugin popularity IPC calls Cursor GetMe and GetTeamPluginPopularity | `desktop/source/electron-main/adapters/mcp-oauth.ts` |
| F-159 | connectors-mcp | note | dead-service | confirmed | connectors-mcp | fixed | fetchPluginServers still calls Cursor getPluginMcpConfig and has no caller | `desktop/source/shared/node/mcp/mcp-marketplace.ts` |
| F-160 | connectors-mcp | minor | dead-service | confirmed | connectors-mcp | - | Composio path is unwired on the desktop and unconfigured on the server, yet recorded as working | `desktop/source/electron-main/mcp/desktop-mcp-manager.ts` |
| F-161 | connectors-mcp | minor | docs-wrong | confirmed | connectors-mcp | fixed | Pipedream connectors router is mounted with no app caller; direction.md §8 not marked superseded | `server/polar/desktop/endpoints.py` |
| F-162 | connectors-mcp | minor | naming | refuted | connectors-mcp | fixed | Agent-readable and user-visible strings still say 'Claidor account' | `desktop/source/host/runner/system-prompt.ts` |
| F-163 | connectors-mcp | minor | risk | confirmed | connectors-mcp | known-limit | Custom MCP config is served unredacted to the settings editor | `desktop/source/shared/node/account-mcp/local-client.ts` |
| F-164 | connectors-mcp | minor | risk | confirmed | connectors-mcp | fixed | No RFC 8707 resource parameter in authorize and token requests | `desktop/source/shared/node/vendor-mcp/oauth.ts` |
| F-165 | connectors-mcp | minor | risk | confirmed | connectors-mcp | fixed | OAuth discovery, registration and token fetches have no timeout | `desktop/source/shared/node/vendor-mcp/oauth.ts` |
| F-166 | connectors-mcp | note | unwired | confirmed | connectors-mcp | - | Dropbox own-app key not yet in the catalogue | `desktop/source/shared/node/vendor-mcp/catalog.ts` |
| F-167 | connectors-mcp | minor | naming | confirmed | connectors-mcp | fixed | Figma card asserts 'Simeon Labs has applied' without a record of it | `desktop/source/shared/node/vendor-mcp/catalog.ts` |
| F-168 | connectors-mcp | minor | risk | confirmed | connectors-mcp | known-limit | Eighteen connector logos are fetched from Google's favicon service | `desktop/source/shared/node/vendor-mcp/logos.ts` |
| F-169 | connectors-mcp | minor | docs-wrong | confirmed | connectors-mcp | fixed | Record gives the wrong Mac path for account-mcp-config.json | `docs/product/account-mcp-local-measured.md` |
| F-170 | connectors-mcp | minor | docs-wrong | confirmed | connectors-mcp | fixed | AddMcpServer tells the agent stdio servers are unsupported and HTTP runs 'on the backend' | `desktop/source/host/runner/tools/sand-mcp-management-tools.ts` |
| F-171 | connectors-mcp | note | unwired | confirmed | connectors-mcp | fixed | Custom server `auth` block (CLIENT_ID/CLIENT_SECRET) is parsed, stored and never used | `desktop/source/shared/node/account-mcp/store.ts` |
| F-172 | connectors-mcp | minor | spend | confirmed | connectors-mcp | fixed | Every Mac-side MCP listing first pulls two stores from the box | `desktop/source/electron-main/mcp/desktop-mcp-manager.ts` |
| F-173 | connectors-mcp | minor | risk | confirmed | connectors-mcp | fixed | Custom servers vanish from the box listing when the inference token is expired | `desktop/source/shared/node/cursor-backend/account-mcp.ts` |
| F-174 | connectors-mcp | minor | spend | confirmed | connectors-mcp | fixed | Auth watch can fire a refresh POST every 5 s for 15 minutes | `desktop/source/shared/node/mcp/mcp-auth-watch.ts` |
| F-175 | connectors-mcp | minor | risk | confirmed | connectors-mcp | known-limit | Removing a connector never revokes the vendor token | `desktop/source/shared/node/vendor-mcp/backend-exec.ts` |
| F-176 | connectors-mcp | note | risk | confirmed | connectors-mcp | known-limit | Loopback callback is a fixed port shared with any local process | `desktop/source/shared/node/mcp/mcp-oauth-loopback.ts` |
| F-177 | connectors-mcp | note | dead-service | confirmed | connectors-mcp | fixed | Cursor's Dashboard backend still built as the last MCP fallback on both sides | `desktop/source/electron-main/mcp/desktop-mcp-manager.ts` |
| F-178 | connectors-mcp | note | design-violation | confirmed | connectors-mcp | fixed | Prompt and direction.md disagree on how a connector is proposed | `desktop/source/host/runner/system-prompt.ts` |
| F-179 | connectors-mcp | note | risk | confirmed | connectors-mcp | fixed | Meta-tool factory in turn-toolset drops object input schemas | `desktop/source/host/runner/tools/turn-toolset.ts` |
| F-180 | connectors-mcp | note | docs-wrong | confirmed | connectors-mcp | fixed | Catalogue is 39 entries in 11 groups, 22 of them coming soon; direction.md still counts fifteen | `docs/product/direction.md` |
| F-181 | connectors-mcp | note | naming | confirmed | connectors-mcp | fixed | routed MCP bridge names itself grok-bot-plugins on the Claude Code hatch | `desktop/source/node-agent-coordinator/routed-mcp-bridge.ts` |
| F-182 | connectors-mcp | note | unwired | refuted | connectors-mcp | known-limit | connectThroughVendorMcp and replaceVendorMcpInstalls are unused leftovers | `desktop/source/shared/node/vendor-mcp/oauth.ts` |
| F-183 | skills-kits-role-agents | blocking | unwired | unverified | - | - | Agent skill catalogue never reaches the prompt: resolveAgentSkills unwired and rules resolver dead | `desktop/source/host/runner/turn-agent-composition.ts` |
| F-184 | skills-kits-role-agents | major | dead-service | unverified | - | - | Managed-setup extension runs Cursor DashboardService RPCs on every turn and every credential renewal | `desktop/source/host/host-production-extensions.ts` |
| F-185 | skills-kits-role-agents | major | dead-service | unverified | - | - | Renderer Skills surface: catalogue, plugin-skill sync and publish all go to Cursor and fail silently or blame Claidor | `desktop/source/host/host-gateway-api.ts` |
| F-186 | skills-kits-role-agents | blocking | unwired | unverified | - | - | Skill store, kit store and mcp-marketplace routes have no caller in the reconstruction | `server/polar/desktop/endpoints.py` |
| F-187 | skills-kits-role-agents | major | docs-wrong | unverified | - | - | direction.md §6 and what-exists.md describe kit/role-agent code that is not in the tree | `docs/product/direction.md` |
| F-188 | skills-kits-role-agents | blocking | design-violation | unverified | - | - | docx/pptx/xlsx/pdf skills and the 'Documents You Make' section do not exist in this tree | `docs/product/artifacts-decision.md` |
| F-189 | skills-kits-role-agents | minor | design-violation | unverified | - | - | The workflows sentence names only the user library folder; managed and plugin skill folders are never named | `desktop/source/shared/workflow-model.ts` |
| F-190 | skills-kits-role-agents | major | design-violation | unverified | - | - | Import-local-skills runs inside the box, not on the person's Mac | `desktop/source/host/extensions/session/agent-session.ts` |
| F-191 | skills-kits-role-agents | major | design-violation | unverified | - | - | Onboarding 'create an agent' offers Grok Bot's 32 templates, name+description only, no kit | `desktop/frontend/src/recovered/features/onboarding/signed-in/suggestions.ts` |
| F-192 | skills-kits-role-agents | minor | design-violation | unverified | - | - | Marketplace plugins we serve never carry skills, yet the brief tells the agent plugins bundle skills | `desktop/source/shared/node/vendor-mcp/marketplace.ts` |
| F-193 | skills-kits-role-agents | minor | naming | unverified | - | - | Agent-readable and user-visible strings in the skills/connector path still say Claidor | `desktop/source/host/runner/system-prompt.ts` |
| F-194 | skills-kits-role-agents | minor | docs-wrong | unverified | - | - | Server docstrings for the skill/kit store describe the LobsterAI app and 'Maties' | `server/polar/desktop/skill_store.py` |
| F-195 | skills-kits-role-agents | note | hardcoded | unverified | - | - | Cursor-era skill constants left in the budget code; loop-protect flag never set | `desktop/source/packages/agent/prompts/skill-catalog-budget.ts` |
| F-196 | skills-kits-role-agents | note | risk | unverified | - | - | The box image is Cursor's public ECR tag; any skills in the box come from it | `desktop/source/electron-main/box/local-docker-host-connector.ts` |
| F-197 | renderer-patches-branding | blocking | docs-wrong | unverified | - | - | npm run verify cannot pass on a packaged app since the renderer patch: provenance is pre-patch and never regenerated | `desktop/scripts/verify.mjs` |
| F-198 | renderer-patches-branding | major | docs-wrong | unverified | - | - | npm run package:diagnostic throws: the renderer-extension provenance it validates is schemaVersion 2 with keys it forbids | `desktop/scripts/lib/macos-package-verification.mjs` |
| F-199 | renderer-patches-branding | major | docs-wrong | unverified | - | - | Settings 'router provider' patch is a no-op but the provenance record, name-measured.md and product-name.test.mjs present it as shipped | `desktop/scripts/lib/router-renderer-patch.mjs` |
| F-200 | renderer-patches-branding | major | design-violation | unverified | - | - | The brand pass never renames 'Cursor' or cursor.com; the pinned renderer keeps Cursor-branded copy and dead cursor.com links | `desktop/scripts/lib/router-renderer-patch.mjs` |
| F-201 | renderer-patches-branding | major | design-violation | unverified | - | - | The founder's twenty-one avatars are not in the app the founder runs; the packaged app still draws Grok Bot's faces with no note in-app | `desktop/scripts/import-avatars.mjs` |
| F-202 | renderer-patches-branding | minor | docs-wrong | unverified | - | - | name-measured.md contradicts itself and the code on CFBundleExecutable/CFBundleName, the header mark size and 'Caisra' copy | `docs/product/name-measured.md` |
| F-203 | renderer-patches-branding | minor | docs-wrong | unverified | - | - | building-the-app.md, named as the current map, still says Caisra.app and CFBundleDisplayName = Caisra | `docs/product/building-the-app.md` |
| F-204 | renderer-patches-branding | minor | docs-wrong | unverified | - | - | CLAUDE.md says the bare words Bot/Bots were left; the patch replaces them | `CLAUDE.md` |
| F-205 | renderer-patches-branding | minor | docs-wrong | unverified | - | - | CLAUDE.md says Liquid Glass covers the message hover actions; the code and its test exclude them | `CLAUDE.md` |
| F-206 | renderer-patches-branding | minor | unmeasured | unverified | - | - | Header-card and Liquid Glass CSS are appended blind: a selector that misses the pinned markup no-ops silently | `desktop/scripts/lib/router-renderer-patch.mjs` |
| F-207 | renderer-patches-branding | minor | risk | unverified | - | - | The brand pass is an unanchored split/join over every chunk: it can rename non-copy uses of 'Grok Bot' and quoted 'Bot' protocol values | `desktop/scripts/lib/router-renderer-patch.mjs` |
| F-208 | renderer-patches-branding | minor | dead-service | unverified | - | - | Shipped Settings keeps Grok Bot's three tabs, and the Updates tab checks Cursor's feed unless the env guard holds | `desktop/scripts/lib/router-renderer-patch.mjs` |
| F-209 | renderer-patches-branding | note | design-violation | unverified | - | - | Gate defaults: browserUse off and multitask on, with no Simeon decision recorded for either | `desktop/source/shared/node/experiments/simeon-gate-defaults.ts` |
| F-210 | renderer-patches-branding | minor | design-violation | confirmed | cloud-agents-channels | fixed | Agent-readable text still says Cursor and points at cursor.com services that do not exist here | `desktop/source/host/automations/automation.ts` |
| F-211 | renderer-patches-branding | minor | design-violation | unverified | - | - | Unshipped frontend/ still carries a Router with Claude Code/Codex/OpenRouter providers and an API-key field, and tests pin it | `desktop/tests/router-settings.test.mjs` |
| F-212 | renderer-patches-branding | note | docs-wrong | unverified | - | - | NOTICE.md and desktop/README.md describe the tree as a Grok Bot reconstruction with a Git-LFS DMG that building-the-app.md says was never there | `desktop/NOTICE.md` |
| F-213 | renderer-patches-branding | note | risk | unverified | - | - | Two build-time env vars rename the product silently and verify accepts whatever they say | `desktop/scripts/lib/config.mjs` |
| F-214 | renderer-patches-branding | note | risk | unverified | - | - | Onboarding's sixteen third-party tool logos ship as letter tiles | `desktop/scripts/make-runtime-assets.mjs` |
| F-215 | renderer-patches-branding | note | risk | unverified | - | - | https deep links from cursor.com are still accepted from argv | `desktop/source/shared/deep-link.ts` |
| F-216 | electron-main-app | major | risk | unverified | - | - | Statsig exposure events go to Cursor's api3.cursor.sh whenever a bootstrap cache exists (copied from Grok Bot's folder on first launch) | `desktop/source/shared/node/experiments/statsig-bootstrap.ts` |
| F-217 | electron-main-app | major | risk | unverified | - | - | Startup data-root migration renames ~/.cursor/sand (a real Grok Bot's data root) into ~/.caisra, or shares it live, and may kill its local-exec daemon | `desktop/source/electron-main/startup/startup-data-root-migration.ts` |
| F-218 | electron-main-app | minor | risk | unverified | - | - | Chromium sandbox off for every window: unconditional --no-sandbox plus sandbox:false with webviewTag:true | `desktop/source/electron-main/main.ts` |
| F-219 | electron-main-app | minor | naming | unverified | - | - | HTTPS deep links are still Cursor's: https://cursor.com/sand/link/… is accepted from argv and open-url | `desktop/source/shared/deep-link.ts` |
| F-220 | electron-main-app | minor | dead-service | unverified | - | - | 'Open cloud agent' sends the person to https://cursor.com/agents/<id> in the system browser | `desktop/source/electron-preload/preload.ts` |
| F-221 | electron-main-app | note | hardcoded | unverified | - | - | DevTools is permanently denied in every packaged build because membership requires isAnysphereUser, which Simeon's profile hard-codes false | `desktop/source/electron-main/devtools-gate.ts` |
| F-222 | electron-main-app | minor | unwired | unverified | - | - | Main-process crash reporter is defined but never wired; uncaught exceptions are swallowed to stderr and the app keeps running | `desktop/source/electron-main/telemetry/desktop-process-crash-telemetry.ts` |
| F-223 | electron-main-app | note | risk | unverified | - | - | Renderer crash has no recovery: render-process-gone only reports (disabled) telemetry, nothing reloads the window | `desktop/source/electron-main/telemetry/renderer-lifecycle-telemetry.ts` |
| F-224 | electron-main-app | minor | docs-wrong | unverified | - | - | CLAUDE.md and the Actions workflow describe a Mac build (npm run mac:build, dist:mac:arm64, build-whisper.sh) that no longer exists | `CLAUDE.md` |
| F-225 | electron-main-app | minor | docs-wrong | unverified | - | - | desktop/README.md and building-the-app.md name the wrong app and the wrong product (Grok Bot 0.18 Reconstructed.app, Caisra.app, a Cursor/Claude Code/Codex/OpenRouter router) | `desktop/scripts/lib/config.mjs` |
| F-226 | electron-main-app | note | dead-service | unverified | - | - | Inference-router leftovers: the edge still probes ~/.claude/.credentials.json, ~/.codex/auth.json and ANTHROPIC_API_KEY, and the provider list still names claude-code/codex/openrouter | `desktop/source/shared/inference-router.ts` |
| F-227 | electron-main-app | note | hardcoded | unverified | - | - | Dev run (npm start / electron .) defaults every backend to Cursor: api2.cursor.sh and cursor.com | `desktop/source/shared/node/cursor-token.ts` |
| F-228 | electron-main-app | minor | design-violation | unverified | - | - | 'Move to Applications' dialog promises updates the app cannot install | `desktop/source/electron-main/startup/startup-move-check.ts` |
| F-229 | electron-main-app | note | risk | unverified | - | - | Ad-hoc signature changes every build, so macOS re-keys Keychain (safeStorage) and TCC grants each package | `desktop/scripts/lib/codesign.mjs` |
| F-230 | electron-main-app | note | unmeasured | unverified | - | - | Packager adds no NS*UsageDescription keys; mic/camera/screen prompts depend on whatever the 0.18.0 shell's Info.plist carries | `desktop/scripts/package-macos.mjs` |
| F-231 | electron-main-app | note | risk | unverified | - | - | Local Docker box start at launch swallows every error | `desktop/source/electron-main/main-production-services.ts` |
| F-232 | electron-main-app | note | dead-service | unverified | - | - | Desktop telemetry, product analytics and process metrics are dead-but-armed: if SAND_DISABLE_TELEMETRY is anything but '1' they post Connect RPCs our server does not serve every 3 s | `desktop/scripts/lib/build-asar.mjs` |
| F-233 | electron-main-app | note | hardcoded | unverified | - | - | Windows installer trust is pinned to Anysphere's signing certificate | `desktop/source/electron-main/update/win32-installer.ts` |
| F-234 | speech-and-media | blocking | unwired | unverified | - | - | GenerateImage succeeds, is metered, and then tells the model it failed | `desktop/source/packages/agent/tools/core/generate-image.ts` |
| F-235 | speech-and-media | major | design-violation | unverified | - | - | The GenerateImage tool contradicts the brief on how a picture is shown | `desktop/source/packages/agent/tools/core/generate-image.ts` |
| F-236 | speech-and-media | major | dead-service | unverified | - | - | 'watchVideo' is advertised to the agent, not offered, and silently dispatches computerUse instead | `desktop/source/host/runner/system-prompt.ts` |
| F-237 | speech-and-media | minor | unwired | unverified | - | - | Chat accepts a 200 MB video attachment that no path can consume | `desktop/source/shared/media/attachment-limits.ts` |
| F-238 | speech-and-media | major | risk | unverified | - | - | Microphone usage description is neither set nor read; if inherited it names Grok Bot | `desktop/scripts/package-macos.mjs` |
| F-239 | speech-and-media | minor | docs-wrong | unverified | - | - | Server docstrings still describe the en-US language force and an OpenClaw speech caller | `server/polar/desktop/capabilities.py` |
| F-240 | speech-and-media | minor | spend | unverified | - | - | Avatar Generate draws at auto quality for a thumbnail | `desktop/source/shared/node/cursor-backend/claidor-generate-image.ts` |
| F-241 | speech-and-media | minor | unmeasured | unverified | - | - | Image usage returned by the server is dropped before the turn meter | `desktop/source/host/extensions/attachments/generate-image-service.ts` |
| F-242 | speech-and-media | minor | naming | unverified | - | - | User-visible sign-in errors say Claidor | `desktop/source/electron-main/account/cursor-auth.ts` |
| F-243 | speech-and-media | minor | naming | unverified | - | - | A profile without a name is called 'Grok' by the host | `desktop/source/host/extensions/session/session-summaries.ts` |
| F-244 | speech-and-media | minor | risk | unverified | - | - | sand-media:// serves any local audio or video file on disk | `desktop/source/electron-main/media/media-protocol.ts` |
| F-245 | speech-and-media | note | docs-wrong | unverified | - | - | Dead Cursor-era strings and branches remain inside the GenerateImage tool | `desktop/source/packages/agent/tools/core/generate-image.ts` |
| F-246 | speech-and-media | note | naming | refuted | memory | known-limit | Summarization model constant is named gemini-2.5-flash | `desktop/source/shared/agents/sand-agent-model.ts` |
| F-247 | speech-and-media | note | risk | unverified | - | - | Token refresh falls back to api2.cursor.sh when neither backend variable is set | `desktop/source/electron-main/account/cursor-auth.ts` |
| F-248 | server-desktop-api | major | naming | unverified | - | - | Sign-in confirmation page still says Caisra | `server/polar/desktop/app_sign_in.py` |
| F-249 | server-desktop-api | minor | naming | unverified | - | - | App-side user-facing strings and tool descriptions still say Claidor | `desktop/source/electron-main/account/cursor-auth.ts` |
| F-250 | server-desktop-api | minor | naming | unverified | - | - | The agent's brief still names cursor.com | `desktop/source/host/runner/system-prompt.ts` |
| F-251 | server-desktop-api | major | unwired | unverified | - | - | Host asks Cursor's GetMe for the person's name; the served profile route is never used for it | `desktop/source/host/extensions/auth/user-full-name-service.ts` |
| F-252 | server-desktop-api | major | unwired | confirmed | memory-sync | coming-soon | Memory sync is served and nothing feeds it; memory lives only in the box's Docker volume | `server/polar/desktop/endpoints.py` |
| F-253 | server-desktop-api | minor | dead-service | unverified | - | - | About twenty LobsterAI-era routes, a vendored skills tree and their tests serve a client that no longer exists | `server/polar/desktop/endpoints.py` |
| F-254 | server-desktop-api | minor | dead-service | unverified | - | - | Pipedream connector routes and four Render secrets remain for a superseded integration | `server/polar/desktop/endpoints.py` |
| F-255 | server-desktop-api | minor | dead-service | unverified | - | - | Every Connect RPC the app still makes goes to api.simeonlabs.com and 404s, on both Mac and box, with telemetry on in the box | `desktop/source/shared/node/cursor-backend/cursor-inference.ts` |
| F-256 | server-desktop-api | minor | risk | unverified | - | - | A copied Grok Bot data folder can turn the Statsig client on against Cursor's event proxy | `desktop/source/shared/node/experiments/cursor-experiments.ts` |
| F-257 | server-desktop-api | minor | risk | unverified | - | - | No rate limit on the sign-in poll, the refresh, the feedback sheet or the proxy | `server/polar/rate_limit.py` |
| F-258 | server-desktop-api | minor | risk | unverified | - | - | The PKCE verifier travels in a GET query string and lands in uvicorn access logs | `server/polar/desktop/app_sign_in.py` |
| F-259 | server-desktop-api | minor | docs-wrong | unverified | - | - | Records say 'fourteen HTTP routes under /desktop/api/' and list routes as never-called that are now called | `docs/product/reconstruction-gaps-2026-09-24.md` |
| F-260 | server-desktop-api | minor | docs-wrong | unverified | - | - | Transcription docstring and test pin the en-US the app no longer sends | `server/polar/desktop/capabilities.py` |
| F-261 | server-desktop-api | minor | unwired | unverified | - | - | Client version header the server reads is one the app never sends | `server/polar/desktop/endpoints.py` |
| F-262 | server-desktop-api | minor | design-violation | unverified | - | - | The configured fallback is Claude Sonnet on the server and Luna in the executor | `server/polar/desktop/pricing.py` |
| F-263 | server-desktop-api | minor | design-violation | unverified | - | - | A monthly allowance drawn into a meter the pinned renderer titles 'Weekly usage' | `desktop/source/electron-main/account/cursor-profile.ts` |
| F-264 | server-desktop-api | minor | naming | unverified | - | - | Known-unserved features still open Cursor URLs from the user's view | `desktop/source/electron-main/main-edge.ts` |
| F-265 | server-desktop-api | note | docs-wrong | unverified | - | - | Docstrings say a refused provider call 'still costs' the person; the row is written at 0 credits | `server/polar/desktop/endpoints.py` |
| F-266 | server-desktop-api | minor | naming | unverified | - | - | Dead sign-in flow keeps the caisra:// deep link and its test | `server/polar/desktop/endpoints.py` |
| F-267 | server-desktop-api | note | risk | unverified | - | - | Composio proxy admits session ids are not bound to accounts, and the key is still required on Render | `server/polar/desktop/composio.py` |
| F-268 | files-attachments-artifacts | major | design-violation | unverified | - | - | Attached-files note tells the agent a box path is on the user's computer | `desktop/source/host/runner/system-prompt.ts` |
| F-269 | files-attachments-artifacts | major | unwired | unverified | - | - | Staging into /workspace/uploads fails silently and the fallback instruction is wrong | `desktop/source/host/extensions/attachments/box-staging.ts` |
| F-270 | files-attachments-artifacts | minor | design-violation | unverified | - | - | The box copy of an attachment is named by its hash, and the note never gives the original filename | `desktop/source/host/extensions/attachments/box-staging.ts` |
| F-271 | files-attachments-artifacts | blocking | unwired | unverified | - | - | No docx/pptx/xlsx/pdf skill exists in the tree and the brief has no 'Documents You Make' section | `docs/product/artifacts-decision.md` |
| F-272 | files-attachments-artifacts | major | unwired | unverified | - | - | Large tool-output spill to files is not wired in production | `desktop/source/host/runner/runner-prompt-glue.ts` |
| F-273 | files-attachments-artifacts | major | unwired | unverified | - | - | The brief delegates videos to watchVideo/videoReview subagents that are never offered | `desktop/source/host/runner/system-prompt.ts` |
| F-274 | files-attachments-artifacts | major | unwired | unverified | - | - | A box file over 25 MB attached with SendMessage becomes a dead card while the agent reads 'Message sent' | `desktop/source/shared/media/attachment-limits.ts` |
| F-275 | files-attachments-artifacts | minor | design-violation | unverified | - | - | CopyFromBox drops files into the Mac home folder root, not Downloads or a file card | `desktop/source/host/local-exec/local-exec-machine.ts` |
| F-276 | files-attachments-artifacts | minor | risk | unverified | - | - | Copy tools and the once-Allow have no sensitive-file reviewer | `desktop/source/host/extensions/local-exec/gateway-local-exec-sand-box.ts` |
| F-277 | files-attachments-artifacts | minor | risk | unverified | - | - | SendMessage attachment ingests any absolute path the host can read, including the mounted inference token | `desktop/source/host/extensions/attachments/attachments-service.ts` |
| F-278 | files-attachments-artifacts | minor | risk | unverified | - | - | Image reads have loose containment on both sides | `desktop/source/host/extensions/attachments/attachments-service.ts` |
| F-279 | files-attachments-artifacts | minor | risk | unverified | - | - | The Read tool's PDF text cache never invalidates and grows without bound | `desktop/source/packages/agent/tools/core/read/read.ts` |
| F-280 | files-attachments-artifacts | minor | design-violation | unverified | - | - | The attachments section of the brief still names Cursor cloud agents and cursor.com in this build | `desktop/source/host/runner/system-prompt.ts` |
| F-281 | files-attachments-artifacts | minor | risk | unverified | - | - | Link previews leak every pasted hostname to Google's favicon service | `desktop/source/host/extensions/attachments/attachments-service.ts` |
| F-282 | files-attachments-artifacts | note | docs-wrong | unverified | - | - | artifacts-audit.md describes the removed LobsterAI attachment model as 'ours' | `docs/product/artifacts-audit.md` |
| F-283 | files-attachments-artifacts | note | unmeasured | unverified | - | - | No offline tests cover staging, the attachment edge, file transfer, download naming or the spill | `desktop/tests/pdf-read.test.mjs` |
| F-284 | files-attachments-artifacts | note | dead-service | unverified | - | - | durable-file-policy only serves box-store-sync, whose client cannot be constructed | `desktop/source/host/durable-file-policy.ts` |
| F-285 | files-attachments-artifacts | note | design-violation | unverified | - | - | File-transfer tools speak of 'the single computer connected today' with no registry | `desktop/source/host/runner/tools/sand-file-transfer-tools.ts` |
| F-286 | web-and-search | major | unwired | unverified | - | - | WebSearch throws away every cited page: the agent gets Luna's summary and no URLs | `desktop/source/packages/agent/tools/core/web-search.ts` |
| F-287 | web-and-search | major | design-violation | unverified | - | - | Site-visit tracking records every host the agent's browser opens and ships it to the backend over Cursor's AnalyticsService — against the stated privacy rationale, and to a route that 404s | `desktop/source/host/extensions/inference/capability-tools.ts` |
| F-288 | web-and-search | minor | dead-service | unverified | - | - | Bot-wall detection is wired only to telemetry; neither the agent nor the person is told a page was a challenge screen | `desktop/source/host/runner/bot-block-detection.ts` |
| F-289 | web-and-search | minor | risk | unverified | - | - | Local web fetch has no redirect re-check or DNS pinning, unlike the link-preview fetcher beside it | `desktop/source/shared/node/web-fetch.ts` |
| F-290 | web-and-search | minor | risk | unverified | - | - | Search may never search: `tool_choice: auto` lets Luna answer from memory and the tool still labels it 'Web search results' | `server/polar/desktop/capabilities.py` |
| F-291 | web-and-search | minor | unwired | unverified | - | - | Server refusals of a search (too long, monthly 402, hourly 40201) reach the model as 'An error occurred while searching the web' | `desktop/source/packages/agent/tools/core/web-search.ts` |
| F-292 | web-and-search | note | spend | unverified | - | - | The search door meters on a price nobody has checked, while the file says nobody should be charged until someone has | `server/polar/desktop/pricing.py` |
| F-293 | web-and-search | minor | docs-wrong | unverified | - | - | capabilities-measured.md names `SAND_CLAIDOR_FULL_AGENT=1` as the proving run; that flag has been on by default since 22 September | `docs/product/capabilities-measured.md` |
| F-294 | web-and-search | note | docs-wrong | unverified | - | - | agent-contract.md cites `MANAGED_WEB_SEARCH_POLICY_PROMPT` as live; the reconstruction has no such prompt and no 'never claim you searched' line | `docs/product/agent-contract.md` |
| F-295 | web-and-search | minor | risk | unverified | - | - | A hung search can hold the turn for ten minutes: no client-side deadline on the search call, 600 s on the server | `desktop/source/host/extensions/inference/capability-tools.ts` |
| F-296 | web-and-search | note | hardcoded | unverified | - | - | `DEFAULT_SAND_MODEL` ("gpt-5.5-high-fast") is not in the server catalogue | `desktop/source/host/host-runner-composition.ts` |
| F-297 | onboarding-first-run | major | unwired | unverified | - | - | Intro stays owed when its run throws, so it re-runs on every open | `desktop/source/host/extensions/transcript/agent-lifecycle.ts` |
| F-298 | onboarding-first-run | major | spend | confirmed | hidden-turn-cap | known-limit | The intro is two hidden turns, so its cap is 80 model calls, not 40 | `desktop/source/host/extensions/transcript/agent-lifecycle.ts` |
| F-299 | onboarding-first-run | major | hardcoded | unverified | - | - | The default agent name is 'Grok' in six places; a fallback agent on a fresh box is named Grok | `desktop/source/shared/agents/agents.ts` |
| F-300 | onboarding-first-run | major | design-violation | unverified | - | - | The first message becomes the agent's name (Grok Bot's seeding kept) | `desktop/source/host/extensions/transcript/send-acceptance.ts` |
| F-301 | onboarding-first-run | major | unwired | unverified | - | - | Docker missing at first launch: nothing tells the person, and the brief promises a prompt that does not exist | `desktop/source/electron-main/main-production-services.ts` |
| F-302 | onboarding-first-run | major | dead-service | unverified | - | - | Managed setup (managed skills, skill catalogue, team rules) calls Cursor's DashboardService at Simeon Labs' host | `desktop/source/host/extensions/managed-setup/production.ts` |
| F-303 | onboarding-first-run | minor | dead-service | unverified | - | - | Product analytics posts onboarding and agent-created events to Cursor's AnalyticsService at our host, gate on by default | `desktop/source/shared/node/analytics/product-analytics.ts` |
| F-304 | onboarding-first-run | minor | naming | unverified | - | - | Sign-in error strings still say Claidor | `desktop/source/electron-main/account/cursor-auth.ts` |
| F-305 | onboarding-first-run | minor | design-violation | unverified | - | - | Settings offers a 'remote computer' that does not exist and speaks in Docker/VM plumbing | `desktop/scripts/lib/router-renderer-patch.mjs` |
| F-306 | onboarding-first-run | note | unwired | unverified | - | - | cheapIntroductionMessages, fallbackIntroductionText and the greeting prompt have no callers but are tested | `desktop/source/shared/agents/onboarding.ts` |
| F-307 | onboarding-first-run | minor | design-violation | unverified | - | - | The kickstart prompt fights the brief's hidden-wake rule and asks for more than one question and more than one connector ask | `desktop/source/host/runner/system-prompt.ts` |
| F-308 | onboarding-first-run | minor | unwired | unverified | - | - | Intro is skipped, not deferred, when inference is not ready at creation | `desktop/source/host/extensions/transcript/agent-lifecycle.ts` |
| F-309 | onboarding-first-run | minor | design-violation | unverified | - | - | The voice brief in the system prompt is a paraphrase, not the founder's wording | `desktop/source/host/runner/system-prompt.ts` |
| F-310 | onboarding-first-run | minor | docs-wrong | unverified | - | - | CLAUDE.md calls agent-lifecycle.ts 'the pristine reconstruction'; it is modified | `desktop/source/host/extensions/transcript/agent-lifecycle.ts` |
| F-311 | onboarding-first-run | note | risk | unverified | - | - | Copied Grok Bot user data likely cannot decrypt under Simeon's safeStorage key; 'nobody signs in again' is unmeasured | `desktop/source/electron-main/startup/desktop-user-data-bootstrap.ts` |
| F-312 | onboarding-first-run | note | risk | unverified | - | - | The box container restarts on its own after a crash or reboot and runs a Cursor-owned moving image tag | `desktop/source/electron-main/box/local-docker-host-connector.ts` |
| F-313 | onboarding-first-run | note | naming | unverified | - | - | The agent's brief carries an unconditional 'Origin' section with cursor.com links | `desktop/source/host/runner/system-prompt.ts` |
| F-314 | onboarding-first-run | note | dead-service | unverified | - | - | Dev/unpackaged sign-in falls back to cursor.com when the CAISRA env is absent | `desktop/source/electron-main/account/cursor-auth.ts` |
| F-315 | onboarding-first-run | note | design-violation | unverified | - | - | The first-run flow the person meets is the pinned Grok Bot six-step onboarding | `desktop/source/shared/observability/telemetry.ts` |
| F-316 | prompt-and-brief | major | dead-service | unverified | - | - | Cloud-agent section and CloudAgent tool are live because isCloudAgentsDisabledByTeam is never defined | `desktop/source/host/extensions/experiments/extension.ts` |
| F-317 | prompt-and-brief | major | dead-service | confirmed | listeners-coming-soon | fixed | Routines section advertises Slack/GitHub/Teams/Linear/Sentry/PagerDuty listeners and names Cursor | `desktop/source/host/automations/automation.ts` |
| F-318 | prompt-and-brief | major | design-violation | confirmed | routines-away | fixed | Prompt promises routines run while the user is away; the loop runs in a Docker box on the Mac | `desktop/source/host/automations/automation.ts` |
| F-319 | prompt-and-brief | major | dead-service | unverified | - | - | 'Your user is <name>' section depends on Cursor's GetMe RPC and can never render | `desktop/source/host/extensions/auth/user-full-name-service.ts` |
| F-320 | prompt-and-brief | major | design-violation | unverified | - | - | Prompt tells the agent it holds a read-only Screenshot tool it does not have | `desktop/source/host/host-runner-composition.ts` |
| F-321 | prompt-and-brief | major | design-violation | unverified | - | - | ExternalShell wording says every action on the user's computer raises an approval card | `desktop/source/host/runner/system-prompt.ts` |
| F-322 | prompt-and-brief | major | design-violation | unverified | - | - | The founder's voice brief is not in the prompt verbatim; Grok Bot's Tone section stands in for it | `desktop/source/host/runner/system-prompt.ts` |
| F-323 | prompt-and-brief | major | naming | unverified | - | - | Agent-readable strings say Claidor, pinned by a test | `desktop/source/host/runner/system-prompt.ts` |
| F-324 | prompt-and-brief | major | naming | unverified | - | - | Cursor-specific sections survive in the brief: Origin, cursor.com links, cursor-agent card type | `desktop/source/host/runner/system-prompt.ts` |
| F-325 | prompt-and-brief | major | docs-wrong | unverified | - | - | app-ui.md reference doc describes a Settings the shipped renderer does not have | `desktop/source/host/runner/box-reference-docs.ts` |
| F-326 | prompt-and-brief | major | docs-wrong | unverified | - | - | debugging-the-box.md tells the agent the shipped default is an anyrun pod and names the wrong container | `desktop/source/host/runner/box-reference-docs.ts` |
| F-327 | prompt-and-brief | major | spend | unverified | - | - | Prompt cost: ~90 KB system prompt per call, a third of it for features that do not exist | `desktop/source/host/runner/system-prompt.ts` |
| F-328 | prompt-and-brief | major | spend | unverified | - | - | Multitask mode is on by bundled default: every non-trivial ask is dispatched to an executor subagent on the full model | `desktop/source/shared/node/experiments/experiment-config.gen.ts` |
| F-329 | prompt-and-brief | minor | unwired | unverified | - | - | watchVideo / videoReview subagents are instructed but never offered | `desktop/source/host/runner/system-prompt.ts` |
| F-330 | prompt-and-brief | major | design-violation | unverified | - | - | Plugin/MCP tool descriptions tell the agent to ask the user for API keys in chat | `desktop/source/host/runner/tools/sand-mcp-management-tools.ts` |
| F-331 | prompt-and-brief | major | design-violation | unverified | - | - | No brief section decides documents-as-files; docx/xlsx/pptx are never named | `desktop/source/host/runner/system-prompt.ts` |
| F-332 | prompt-and-brief | minor | design-violation | refuted | memory | known-limit | Subagent prompts still carry the agent's profile, memory and routines sections and name update_state they cannot call | `desktop/source/host/runner/system-prompt-assembly.ts` |
| F-333 | prompt-and-brief | minor | design-violation | unverified | - | - | The brief tells the agent to name Auto-review and the block reason to the user | `desktop/source/host/runner/system-prompt.ts` |
| F-334 | prompt-and-brief | minor | docs-wrong | unverified | - | - | Prompt says only remote http/sse MCP servers are supported, executed on the backend | `desktop/source/host/runner/tools/sand-mcp-management-tools.ts` |
| F-335 | prompt-and-brief | minor | unwired | unverified | - | - | First-run intro asks the agent to send a 'connector card' or 'connectors prompt' it has no message type for | `desktop/source/shared/agents/onboarding.ts` |
| F-336 | prompt-and-brief | minor | docs-wrong | unverified | - | - | agent-contract.md and brief-audit.md describe the LobsterAI brief and are not marked superseded | `docs/product/agent-contract.md` |
| F-337 | prompt-and-brief | note | design-violation | unverified | - | - | The reconstruction's message kinds differ from the nine decided kinds | `desktop/source/host/runner/tools/send-message-schema.ts` |
| F-338 | prompt-and-brief | minor | docs-wrong | unverified | - | - | 'Use poppler-utils to read PDFs' contradicts the pdf.js Read path | `desktop/source/host/runner/prompt-collector-glue.ts` |
| F-339 | prompt-and-brief | note | design-violation | unverified | - | - | Dead Settings 'Routing' panel with Claude Code, Codex and an OpenRouter API-key field remains in the packager | `desktop/scripts/lib/router-renderer-patch.mjs` |
| F-340 | permissions-and-review | blocking | design-violation | confirmed | auto-review-enforce | fixed | Auto-review can never block or draw a card: every surface is permanently in shadow mode on the box | `desktop/source/host/runner/sand-auto-review.ts` |
| F-341 | permissions-and-review | major | spend | confirmed | auto-review-enforce | fixed | Every reviewable action pays a full classifier run whose verdict is thrown away (shadow spend) | `desktop/source/packages/agent/tools/core/shell/create-shell-tool.ts` |
| F-342 | permissions-and-review | major | docs-wrong | confirmed | auto-review-enforce | fixed | CLAUDE.md and the 24-September gaps record present auto-review as fixed and gating; the code only logs | `CLAUDE.md` |
| F-343 | permissions-and-review | major | unwired | confirmed | auto-review-enforce | fixed | Production shell no-ops beginAutoReviewUserMessageEpoch and setActiveTurnRequestSource: approval cards never expire on the next message and park forever | `desktop/source/host/host-runner-composition.ts` |
| F-344 | permissions-and-review | major | unwired | confirmed | asks-once-memory | fixed | SandLocalToolPermissionController.beginTurn has no caller: a denied or unanswered Mac ask is 'abandoned' for that agent forever | `desktop/source/host/extensions/local-tool-permission/local-tool-permission-controller.ts` |
| F-345 | permissions-and-review | minor | dead-service | confirmed | box-telemetry | known-limit | Action audit forwards to Cursor's RecordSandAuditEvents; off by default it only writes a per-agent audit.jsonl in the box that nothing reads or shows | `desktop/source/host/extensions/action-audit/extension.ts` |
| F-346 | permissions-and-review | note | risk | confirmed | box-telemetry | fixed | audit.jsonl stores every shell command verbatim, unredacted, including anything typed as an inline secret | `desktop/source/host/extensions/action-audit/action-audit-service.ts` |
| F-347 | permissions-and-review | minor | risk | confirmed | auto-review-enforce | fixed | Classifier deadline mismatch: 10 s wrapper around a 30 s executor; in enforce a slow verdict rejects the action with no card and no retry path | `desktop/source/packages/agent/utils/smart-mode-classifier-measurement.ts` |
| F-348 | permissions-and-review | minor | design-violation | confirmed | asks-once-memory | needs-mac | The Allow card is Grok Bot's four-way prompt, not the founder's three-way card, and the brief tells the agent every Mac action raises a card | `desktop/frontend/src/recovered/features/permissions/local-tool/view.tsx` |
| F-349 | permissions-and-review | note | docs-wrong | confirmed | asks-once-memory | needs-mac | Model-facing messages point to 'Settings → Agent → Execution on Local Computer'; the design source says Settings → General → Local execution | `desktop/source/shared/local-tool-permission-machinery.ts` |
| F-350 | permissions-and-review | note | dead-service | confirmed | dead-cursor-services | fixed | Team ceiling for local execution is fetched from Cursor's GetTeamAdminSettings on every auth-status change (404, swallowed) | `desktop/source/electron-main/account/cursor-auth-wiring.ts` |
| F-351 | permissions-and-review | note | dead-service | confirmed | dead-cursor-services | known-limit | Sand access is asked of Cursor's GetSandAccessStatus and runs on 'unknown' | `desktop/source/electron-main/account/access.ts` |
| F-352 | permissions-and-review | note | dead-service | confirmed | auto-review-enforce | fixed | The box host polls Cursor's Statsig bootstrap (aiserver.v1.AnalyticsService/BootstrapStatsig) on api.simeonlabs.com every ~5 minutes; auto-review's only enforce lever hangs off it | `desktop/source/shared/node/experiments/statsig-bootstrap.ts` |
| F-353 | permissions-and-review | note | design-violation | confirmed | routine-write-review | fixed | Routine create/change is never reviewed in any mode (automationWrite is hard 'off') | `desktop/source/host/runner/sand-auto-review.ts` |
| F-354 | permissions-and-review | note | risk | confirmed | auto-review-enforce | needs-mac | The auto-review card's 'Always allow' appends the classifier's proposed rule to the person's allow-instructions, with no confirmation of the rule text | `desktop/frontend/src/recovered/features/conversation/cards/transcript-card/auto-review-actions.ts` |
| F-355 | data-and-persistence | major | docs-wrong | unverified | - | - | Copied Grok Bot user-data folder cannot be decrypted after the rename; 'nobody signs in again' is unproven and likely false | `desktop/source/electron-main/startup/desktop-user-data-bootstrap.ts` |
| F-356 | data-and-persistence | major | risk | unverified | - | - | Startup data-root migration renames the real Grok Bot's ~/.cursor/sand into ~/.caisra | `desktop/source/electron-main/startup/startup-data-root-migration.ts` |
| F-357 | data-and-persistence | major | risk | unverified | - | - | Every app build force-removes the box container; only two volumes survive, so box browser logins and installs are wiped on each update | `desktop/source/electron-main/box/local-docker-host-connector.ts` |
| F-358 | data-and-persistence | major | unwired | confirmed | memory-sync | coming-soon | Memory is never synced to Simeon Labs' server; it lives only in the box's Docker volume | `server/polar/desktop/endpoints.py` |
| F-359 | data-and-persistence | major | risk | unverified | - | - | Plaintext OAuth and channel credentials sit in the box data root, which is aliased into the model-visible /home/box/agent-data | `desktop/source/host/host-paths.ts` |
| F-360 | data-and-persistence | major | risk | unverified | - | - | settings.json is read-modify-written by several processes with no lock and a fixed per-pid temp name | `desktop/source/shared/node/settings/sand-settings-store.ts` |
| F-361 | data-and-persistence | minor | risk | unverified | - | - | A corrupt or version-mismatched settings.json is silently replaced by defaults | `desktop/source/shared/node/settings/sand-settings-store.ts` |
| F-362 | data-and-persistence | major | unmeasured | unverified | - | - | Box data root in the container depends on an environment the image sets, not this code | `desktop/source/host/host-paths.ts` |
| F-363 | data-and-persistence | major | risk | unverified | - | - | The box image is Cursor's mutable public ECR tag sand-box-latest | `desktop/source/electron-main/box/local-docker-host-connector.ts` |
| F-364 | data-and-persistence | minor | docs-wrong | unverified | - | - | Record says the account-MCP store is under Application Support; the code keeps it in ~/.caisra | `docs/product/account-mcp-local-measured.md` |
| F-365 | data-and-persistence | minor | docs-wrong | unverified | - | - | Chat-UI source record claims per-machine local-tool permission; the store holds one global value | `docs/product/sources/caisra-chat-ui-logic.md` |
| F-366 | data-and-persistence | note | hardcoded | unverified | - | - | Dev and lab builds keep data under ~/.cursor/sand-dev and ~/.cursor/sand-lab (Grok Bot's directory) | `desktop/source/host/host-paths.ts` |
| F-367 | data-and-persistence | note | dead-service | unverified | - | - | Sentry is wired to Cursor's DSN but never initialised, so secure-storage warnings go nowhere | `desktop/source/shared/observability/sentry.ts` |
| F-368 | data-and-persistence | minor | dead-service | unverified | - | - | Product analytics posts every event to Cursor's AnalyticsService Connect RPC, which Claidor 404s | `desktop/source/shared/node/analytics/product-analytics.ts` |
| F-369 | data-and-persistence | minor | dead-service | unverified | - | - | Box-store sync and state backstop stay bound to Cursor's agent store; Reset/Update copy in the agent's brief describes snapshots that do not exist | `desktop/source/host/host-production-extensions.ts` |
| F-370 | data-and-persistence | minor | risk | unverified | - | - | Deleting an agent leaves its connector-secrets files behind | `desktop/source/host/extensions/session/session-paths.ts` |
| F-371 | data-and-persistence | minor | risk | unverified | - | - | Credential-bearing JSON files are written with the default mode while the token files use 0600 | `desktop/source/shared/node/vendor-mcp/installs.ts` |
| F-372 | data-and-persistence | minor | risk | unverified | - | - | Box-secrets keys remain listed when their ciphertext cannot be decrypted, and the push then fails silently | `desktop/source/electron-main/secrets/user-secrets-store.ts` |
| F-373 | data-and-persistence | note | design-violation | unverified | - | - | Notifications are hard-forced off and the store rewrites settings.json on every read | `desktop/source/shared/node/settings/sand-settings-store.ts` |
| F-374 | data-and-persistence | note | dead-service | confirmed | listeners-coming-soon | fixed | Automations cloud sync client targets Cursor's AutomationsService; routines live only in the box volume | `desktop/source/host/extensions/automations/extension.ts` |
| F-375 | data-and-persistence | minor | dead-service | unverified | - | - | The local-exec daemon's credential and stale-connection refresh call routes Claidor does not serve | `desktop/source/electron-main/box/box-host-connector.ts` |
| F-376 | logging-telemetry-privacy | major | dead-service | confirmed | box-telemetry | fixed | Box host structured-log telemetry ships every console line (incl. [claidor] model= tool args and the 12,000-char system prompt on model-error) to AnalyticsService/SubmitLogs, which Simeon Labs' server does not serve; whether the box env disables it is not in the repo | `desktop/source/host/extensions/telemetry/host-telemetry-service.ts` |
| F-377 | logging-telemetry-privacy | major | dead-service | refuted | box-telemetry | fixed | BoxLogShipper reads every /tmp/*.log in the box (including /tmp/sand-host.log unless SAND_HOST_LOG_FILE names it) and ships the lines to the unserved SubmitLogs RPC | `desktop/source/host/extensions/telemetry/host-telemetry-service.ts` |
| F-378 | logging-telemetry-privacy | major | dead-service | confirmed | box-telemetry | fixed | Product analytics gate sand_product_analytics defaults ON in the bundled table (comment says 'Default OFF'), so the box host ships TrackEvents to the unserved AnalyticsService | `desktop/source/shared/node/experiments/experiment-config.gen.ts` |
| F-379 | logging-telemetry-privacy | minor | dead-service | refuted | box-telemetry | known-limit | Host OTLP trace exporter targets `${SAND_BACKEND_URL}/v1/traces` with the bearer and a hard-coded `x-ghost-mode: false`; the route does not exist on the server | `desktop/source/host/extensions/telemetry/host-telemetry-service.ts` |
| F-380 | logging-telemetry-privacy | minor | risk | confirmed | box-telemetry | fixed | Sentry DSN still points at Cursor's ingest (metrics.cursor.sh) in three processes; only the absence of an installed adapter / env keeps crash reports from leaving | `desktop/source/shared/observability/sentry.ts` |
| F-381 | logging-telemetry-privacy | minor | docs-wrong | confirmed | box-telemetry | fixed | Record claim 'Telemetry, Sentry, metrics … off by env in the packaged build' is true for the Mac only; the box host runs the same telemetry stack and the record does not say so | `docs/product/reconstruction-gaps-2026-09-24.md` |
| F-382 | logging-telemetry-privacy | minor | dead-service | confirmed | dead-cursor-services | fixed | Privacy-mode lookup (DashboardService/GetUserPrivacyMode) precedes every Connect RPC on both sides, always 404s, and re-fires every 10 s with a console line | `desktop/source/shared/node/cursor-backend/cursor-inference.ts` |
| F-383 | logging-telemetry-privacy | minor | dead-service | confirmed | dead-cursor-services | fixed | Settings 'Privacy mode' reads a Cursor RPC that 404s and reports 'on' by fallback — a promise the product does not implement | `desktop/source/electron-main/account/cursor-profile.ts` |
| F-384 | logging-telemetry-privacy | note | risk | refuted | box-telemetry | known-limit | Codebase Telemetry extension is in the production graph and would snapshot /workspace and /home/box to the backend; only the missing csnaps binary stops it | `desktop/source/host/host-production-extensions.ts` |
| F-385 | logging-telemetry-privacy | note | dead-service | confirmed | dead-cursor-services | fixed | Action audit, post-turn labeling and mobile push still target unserved Cursor RPCs with a privacy lookup each; labeling only surfaces as a [claidor] diagnostic line | `desktop/source/host/extensions/action-audit/action-audit-backend.ts` |
| F-386 | logging-telemetry-privacy | minor | risk | confirmed | box-telemetry | known-limit | /tmp/sand-host.log holds user content in clear: tool args (SendMessage text, Shell commands), child results, and the full system prompt with memory on any model error, with no rotation in our tree | `desktop/source/host/extensions/inference/provider-session.ts` |
| F-387 | logging-telemetry-privacy | note | risk | confirmed | box-telemetry | known-limit | vendor-mcp-signin.log records the OAuth client id and whether a secret exists — no secrets — but lives beside the store that holds access/refresh tokens and client secrets in plain JSON | `desktop/source/shared/node/vendor-mcp/backend-exec.ts` |
| F-388 | logging-telemetry-privacy | note | dead-service | confirmed | box-telemetry | fixed | Statsig client is constructed with Cursor's client key and log-event proxy api3.cursor.sh; only the URL allowlist (/rgstr) and the 404 bootstrap keep it silent | `desktop/source/shared/node/experiments/statsig-bootstrap.ts` |
| F-389 | logging-telemetry-privacy | note | risk | confirmed | box-telemetry | known-limit | Server-side: Send Feedback message text and the provider's refusal body are written to Render's structlog; nothing else of user content is logged by the proxy | `server/polar/desktop/endpoints.py` |
| F-390 | logging-telemetry-privacy | minor | unwired | confirmed | electron-main-app | - | No production surface lets the person see any log: the box tail lives only in the dev controls window, and the Mac's computer-stream.log / vendor-mcp-signin.log are found only by path | `desktop/source/electron-main/dev/dev-controls-window.ts` |
| F-391 | logging-telemetry-privacy | note | dead-service | confirmed | box-telemetry | fixed | Desktop structured-log spill and host crash-marker persist telemetry to disk that can never be delivered | `desktop/source/electron-main/telemetry/desktop-structured-log-spill.ts` |
| F-392 | sharing-cloud-dead-services | major | unwired | confirmed | dead-cursor-services | fixed | CloudAgent tool is offered on every turn and the brief orders all repository work through it, but no cloud-agent service exists | `desktop/source/host/host-runner-composition.ts` |
| F-393 | sharing-cloud-dead-services | major | spend | refuted | dead-cursor-services | known-limit | About 6.7k characters of cloud-agent instructions and a `cursor-agent` message type are sent to the model on every turn for a dead feature | `desktop/source/host/runner/system-prompt.ts` |
| F-394 | sharing-cloud-dead-services | minor | naming | confirmed | dead-cursor-services | fixed | The agent's brief still says 'Claidor account' and 'Sign In with Claidor' | `desktop/source/host/runner/system-prompt.ts` |
| F-395 | sharing-cloud-dead-services | minor | naming | refuted | dead-cursor-services | known-limit | Cloud-agent text the model reads names cursor.com and 'the Cursor agent'; the name record calls these real addresses | `desktop/source/host/extensions/cloud-agents/cloud-agents-service.ts` |
| F-396 | sharing-cloud-dead-services | minor | dead-service | confirmed | dead-cursor-services | fixed | Cloud-agents extension calls DashboardService on every host start | `desktop/source/host/extensions/cloud-agents/extension.ts` |
| F-397 | sharing-cloud-dead-services | minor | spend | confirmed | dead-cursor-services | fixed | CloudAgent 'watch' arms a five-hour poll of a 404 RPC every 10 s and ends in a hidden revival turn | `desktop/source/host/cloud-agents/cloud-agent-tool.ts` |
| F-398 | sharing-cloud-dead-services | minor | spend | refuted | dead-cursor-services | known-limit | With auto-review on, a doomed CloudAgent launch still pays a Luna classifier call | `desktop/source/host/host-runner-composition.ts` |
| F-399 | sharing-cloud-dead-services | note | docs-wrong | confirmed | dead-cursor-services | fixed | Record understates the CloudAgent failure mode: a 404 launch throws, it does not become tool text | `docs/product/reconstruction-gaps-2026-09-24.md` |
| F-400 | sharing-cloud-dead-services | minor | docs-wrong | confirmed | dead-cursor-services | - | Local group chats answer with a text-only Luna call that has no memory, roster, tools or brief; the decision is unrecorded | `desktop/source/host/extensions/transcript/group-chat-glue.ts` |
| F-401 | sharing-cloud-dead-services | note | design-violation | confirmed | dead-cursor-services | fixed | The egress tunnel the design struck is still wired end to end, dormant behind an env flag | `docs/product/direction.md` |
| F-402 | sharing-cloud-dead-services | note | dead-service | refuted | dead-cursor-services | known-limit | Host self-upgrade is on by default with no origin; 'Update computer' can only answer no-bundle-source | `desktop/source/host/extensions/host-upgrade/extension.ts` |
| F-403 | sharing-cloud-dead-services | note | dead-service | confirmed | dead-cursor-services | coming-soon | Sharing is gated off and every entry answers a canned sentence, but a packaged build would poll api.simeonlabs.com if the gate flipped | `desktop/source/shared/node/experiments/experiment-config.gen.ts` |
| F-404 | coordinator-and-gateway | major | dead-service | unverified | - | - | Box host telemetry is on inside the container and ships /tmp/*.log (the [claidor] prompt/model-error lines) to a Connect RPC our server does not serve, every 2–3 s | `desktop/source/electron-main/box/local-docker-host-connector.ts` |
| F-405 | coordinator-and-gateway | minor | naming | unverified | - | - | Sign-in and account errors still say Claidor, not Simeon | `desktop/source/electron-main/account/cursor-auth.ts` |
| F-406 | coordinator-and-gateway | minor | dead-service | unverified | - | - | openCloudAgent opens https://api.simeonlabs.com/agents/<id> (or cursor.com when unset) — a dead link on our own API host | `desktop/source/electron-main/main-edge.ts` |
| F-407 | coordinator-and-gateway | minor | dead-service | confirmed | listeners-coming-soon | fixed | Listener 'connect' still goes to Cursor's DashboardService and Cursor's dashboard URL | `desktop/source/host/extensions/automations/listener-integrations.ts` |
| F-408 | coordinator-and-gateway | note | unwired | unverified | - | - | Coordinator's MCP OAuth forwarder completes into a host no-op | `desktop/source/node-agent-coordinator/main.ts` |
| F-409 | coordinator-and-gateway | minor | docs-wrong | unverified | - | - | Record says getForeverBoxStatus has a 15 s gateway deadline; the coordinator applies deadlines only to sendPrompt and roster reads | `docs/product/computer-stream-measured.md` |
| F-410 | coordinator-and-gateway | note | risk | unverified | - | - | Gateway /health answers before the bearer check | `desktop/source/host/gateway-server.ts` |
| F-411 | coordinator-and-gateway | minor | risk | unverified | - | - | Gateway token also travels as a docker --env, readable via docker inspect | `desktop/source/electron-main/box/local-docker-host-connector.ts` |
| F-412 | coordinator-and-gateway | major | risk | unverified | - | - | The box image is Cursor's floating tag, matched by name only | `desktop/source/electron-main/box/local-docker-host-connector.ts` |
| F-413 | coordinator-and-gateway | minor | dead-service | unverified | - | - | Coordinator POSTs the desktop bearer to a non-existent /sand-box/local-exec-daemon-credential route every 30 s; the record calls it a ConnectError | `desktop/source/electron-main/box/box-host-connector.ts` |
| F-414 | coordinator-and-gateway | note | dead-service | unverified | - | - | Mac and box both poll BootstrapStatsig on api.simeonlabs.com every ~5 min; Statsig log-event proxy still points at api3.cursor.sh | `desktop/source/shared/node/experiments/cursor-experiments.ts` |
| F-415 | coordinator-and-gateway | note | risk | unverified | - | - | Update feed defaults to api2.cursor.sh/updates and is off only by an env default the build injects | `desktop/source/electron-main/update/update-feed.ts` |
| F-416 | coordinator-and-gateway | note | risk | unverified | - | - | A live Anysphere Sentry DSN remains in the tree (dormant) | `desktop/source/shared/observability/sentry.ts` |
| F-417 | coordinator-and-gateway | minor | design-violation | unverified | - | - | Unreachable provider branches and a Codex/Claude credential probe stay on the main edge and preload | `desktop/source/shared/inference-router.ts` |
| F-418 | coordinator-and-gateway | note | spend | unverified | - | - | The text-only hatch is still enterable from the shell environment and doubles model calls when no SendMessage lands | `desktop/source/node-agent-coordinator/inference-router.ts` |
| F-419 | coordinator-and-gateway | minor | risk | unverified | - | - | reactToMessage is answered locally whenever a stale hatch transcript holds the entry id, even on the host path | `desktop/source/node-agent-coordinator/inference-router.ts` |
| F-420 | coordinator-and-gateway | minor | risk | unverified | - | - | First Allow card can be posted unstamped if the account slot fetch has not settled | `desktop/source/node-agent-coordinator/main.ts` |
| F-421 | coordinator-and-gateway | note | risk | unverified | - | - | Card-carrying transcript replies are re-sorted by timestamp on the host path too | `desktop/source/node-agent-coordinator/permission-scope-stamp.ts` |
| F-422 | coordinator-and-gateway | minor | unmeasured | unverified | - | - | Roster payloads carry every agent's avatar PNG on every agents event (slim avatars off) | `desktop/source/node-agent-coordinator/gateway/gateway-client.ts` |
| F-423 | coordinator-and-gateway | note | design-violation | unverified | - | - | Egress tunnel toggles are still served although only the retired cloud model needs them | `desktop/source/electron-main/main-edge.ts` |
| F-424 | coordinator-and-gateway | note | naming | unverified | - | - | Internal error strings still name 'Sand' and Anysphere | `desktop/source/electron-main/coordinator/coordinator-port-ipc-guard.ts` |
| F-425 | coordinator-and-gateway | note | hardcoded | unverified | - | - | https deep links are still claimed for cursor.com | `desktop/source/shared/deep-link.ts` |
| F-426 | docs-vs-code | major | docs-wrong | unverified | - | - | start-here.md describes the LobsterAI tree that was replaced on 18 September; nearly every concrete claim in it is false today | `docs/product/start-here.md` |
| F-427 | docs-vs-code | major | docs-wrong | unverified | - | - | what-exists.md's inventory names desktop/src files that do not exist; its "read this before saying anything is missing" table would send a reader to nothing | `docs/product/what-exists.md` |
| F-428 | docs-vs-code | minor | docs-wrong | unverified | - | - | building-the-app.md still says the bundle is Caisra.app, CFBundleDisplayName Caisra, LSEnvironment api.claidor.com | `docs/product/building-the-app.md` |
| F-429 | docs-vs-code | minor | docs-wrong | unverified | - | - | name-measured.md contradicts itself on CFBundleExecutable/CFBundleName and states the header mark at 88 px where the code ships 52 px | `docs/product/name-measured.md` |
| F-430 | docs-vs-code | major | design-violation | unverified | - | - | User-visible and agent-visible strings still say Claidor, and product-name.test.mjs pins them, against the 23 September rebrand | `desktop/source/electron-main/account/cursor-auth.ts` |
| F-431 | docs-vs-code | major | dead-service | unverified | - | - | Quota/upgrade error buttons open cursor.com checkout and pricing pages | `desktop/source/host/extensions/transcript/agent-run-error.ts` |
| F-432 | docs-vs-code | major | docs-wrong | unverified | - | - | CLAUDE.md says the host honours SAND_FEATURE_GATE_OVERRIDES for teach-a-task; nothing carries that variable into the box and the Mac ignores it when packaged | `CLAUDE.md` |
| F-433 | docs-vs-code | major | spend | unverified | - | - | Auto-review runs in shadow: one Luna call per Shell command whose verdict never blocks or draws a card | `desktop/source/shared/sand-auto-review-instructions.ts` |
| F-434 | docs-vs-code | minor | docs-wrong | unverified | - | - | model-roles-measured.md still says auto-review is 'left alone; effectively off' | `docs/product/model-roles-measured.md` |
| F-435 | docs-vs-code | minor | docs-wrong | unverified | - | - | account-mcp-local-measured.md and connectors-signin-measured.md tell the Mac reader to cat a path under Application Support; the stores are in ~/.caisra | `docs/product/account-mcp-local-measured.md` |
| F-436 | docs-vs-code | minor | docs-wrong | unverified | - | - | computer-stream-measured.md's line table names `[CaisraScreen]`; the tag in the code is `[SimeonScreen]` | `docs/product/computer-stream-measured.md` |
| F-437 | docs-vs-code | major | docs-wrong | unverified | - | - | The macOS CI workflow and CLAUDE.md's `npm run mac:build` describe the LobsterAI build; neither script exists in the current tree | `CLAUDE.md` |
| F-438 | docs-vs-code | major | docs-wrong | confirmed | hidden-turn-cap | fixed | spend-guards.md says the intro runs with 'no tools'; hidden only sets the call budget and the kickstart prompt still nudges 'offer any choice as a question widget' | `docs/product/spend-guards.md` |
| F-439 | docs-vs-code | minor | docs-wrong | unverified | - | - | reconstruction-gaps.md and CLAUDE.md say Claidor serves 'fourteen HTTP routes under /desktop/api/'; endpoints.py declares about thirty-three | `docs/product/reconstruction-gaps-2026-09-24.md` |
| F-440 | docs-vs-code | minor | docs-wrong | unverified | - | - | app-sign-in.md still says several call paths refresh against api2.cursor.sh and sign the person out; that was fixed 24 September and the record was not amended | `docs/product/app-sign-in.md` |
| F-441 | docs-vs-code | minor | dead-service | refuted | listeners-coming-soon | known-limit | Known-unserved Cursor surfaces still leak live links into the user's view: cloud-agent link, listener 'integrations' URL, https://cursor.com deep links, api2.cursor.sh DNS probe | `desktop/source/electron-main/main-edge.ts` |
| F-442 | docs-vs-code | minor | design-violation | unverified | - | - | The agent's brief still carries Cursor addresses (cursor.com/codebase, /opt/cursor/artifacts) for a cloud-agent feature that is unserved | `desktop/source/host/runner/system-prompt.ts` |
| F-443 | docs-vs-code | note | docs-wrong | unverified | - | - | Dated counts in the records have drifted: tracked files, test totals | `CLAUDE.md` |
| F-444 | docs-vs-code | note | docs-wrong | unverified | - | - | Two file paths in CLAUDE.md are not where the file is | `CLAUDE.md` |
| F-445 | tests-and-build | blocking | design-violation | unverified | - | - | npm run verify cannot pass on any npm run package output: the renderer inventory check compares patched chunks against the pristine provenance | `desktop/scripts/verify.mjs` |
| F-446 | tests-and-build | major | design-violation | unverified | - | - | npm run package:diagnostic is broken by the renderer patch record it now produces (schemaVersion 2, extra keys, patched non-settings chunks) | `desktop/scripts/lib/macos-package-verification.mjs` |
| F-447 | tests-and-build | major | docs-wrong | unverified | - | - | .github/workflows/desktop_mac.yml builds a tree that no longer exists (build-whisper.sh, dist:mac:arm64, pnpm/OpenClaw, Node 24) | `.github/workflows/desktop_mac.yml` |
| F-448 | tests-and-build | minor | docs-wrong | unverified | - | - | CLAUDE.md names `npm run mac:build` as the free Mac build; no such script exists | `CLAUDE.md` |
| F-449 | tests-and-build | minor | docs-wrong | unverified | - | - | docs/product/building-the-app.md (named as the current map) says Caisra.app, CFBundleDisplayName Caisra and api.claidor.com; the code says Simeon.app, Simeon and api.simeonlabs.com | `docs/product/building-the-app.md` |
| F-450 | tests-and-build | minor | docs-wrong | unverified | - | - | desktop/README.md describes an inference router with Cursor as default, Claude Code/Codex, an OpenRouter API key field, and 'Remote mode remains the default' | `desktop/README.md` |
| F-451 | tests-and-build | minor | unmeasured | unverified | - | - | The pinned-renderer anchor-presence tests never run in the build loop: nothing sets GROK_BOT_PINNED_RENDERER, though bootstrap leaves the renderer at a known path | `desktop/tests/renderer-marks-patch.test.mjs` |
| F-452 | tests-and-build | minor | unmeasured | unverified | - | - | The header-card and Liquid Glass CSS selectors are never checked against the pinned stylesheet or markup; a wrong class name ships silently | `desktop/tests/renderer-header-card.test.mjs` |
| F-453 | tests-and-build | note | docs-wrong | unverified | - | - | The renderer patch record claims three features that are no-ops (settings-router-provider, settings-local-docker-vm, usage-current-provider) and carries 3,000 characters of dead Settings source with an API-key input | `desktop/scripts/lib/router-renderer-patch.mjs` |
| F-454 | tests-and-build | minor | unmeasured | unverified | - | - | The brand pass replaces Grok Bot / New Bot / Caisra / Bot(s) only; 'Cursor' and 'Anysphere' in the pinned renderer are never renamed and no test or count records whether any remain | `desktop/scripts/lib/router-renderer-patch.mjs` |
| F-455 | tests-and-build | minor | unmeasured | unverified | - | - | verify.mjs does not check the renamed executable, LSEnvironment hosts, the Dock .icns, or that the renderer patch record exists | `desktop/scripts/verify.mjs` |
| F-456 | tests-and-build | note | docs-wrong | unverified | - | - | runner_image.yml triggers on desktop/scripts/patches/** which does not exist; the runner Dockerfile still describes the OpenClaw patch set | `.github/workflows/runner_image.yml` |
| F-457 | tests-and-build | note | design-violation | unverified | - | - | npm run check typechecks frontend/ (not shipped) as a gate on packaging the pinned renderer | `desktop/package.json` |
| F-458 | tests-and-build | note | unmeasured | unverified | - | - | Fixes covered only by source-regex anchors, not behaviour: GPU default, updater guard on clean main, intro-runs-once, narration sentence, composition wiring (subagent shell, onAvatarChanged, box-scoped flag, prompt stores), Screenshot bisect | `desktop/tests/hardware-acceleration-default.test.mjs` |
| F-459 | tests-and-build | note | unmeasured | unverified | - | - | Fixes with no test at all in desktop/tests: dictation language no longer forced, Help Center/feedback are tested but sign-in round trip, LSEnvironment, the Dock icon copy and the icns are not | `desktop/scripts/package-macos.mjs` |
| F-460 | tests-and-build | note | unmeasured | unverified | - | - | simeon-logo IoU tests skip by default and depend on pngjs and a container-only Chromium path, neither declared in package.json | `desktop/tests/simeon-logo.test.mjs` |
| F-461 | tests-and-build | note | docs-wrong | unverified | - | - | renderer-file-url.test.mjs's crossorigin guard skips in the build loop; CLAUDE.md says it 'fails if it comes back' | `desktop/tests/renderer-file-url.test.mjs` |
| F-462 | tests-and-build | note | design-violation | unverified | - | - | publication-packaging.test.mjs pins the dead alternative providers (OpenRouter key error, Codex chatgpt.com, queryClaude) and the Mac-hatch prompt as required source, so removing what the design ended fails check | `desktop/tests/publication-packaging.test.mjs` |
| F-463 | tests-and-build | note | docs-wrong | unverified | - | - | caisra-ignition-activation.mjs records unboundBindings: [] and runnerRealTurn: supported without running any check, so the packaged host-production-bindings.json is a statement, not a measurement | `desktop/scripts/caisra-ignition-activation.mjs` |
| F-464 | security | major | risk | unverified | - | - | Box exec daemon on the Mac's loopback (1337) takes the fixed bearer "local" | `desktop/source/box-exec-daemon/server.ts` |
| F-465 | security | major | risk | unverified | - | - | noVNC/websockify on 6080/6081 has no credential in the local path | `desktop/source/host/box/loopback-sand-box.ts` |
| F-466 | security | major | risk | unverified | - | - | The full desktop session token sits in the box where the agent's Shell can read it | `desktop/source/electron-main/box/local-docker-host-connector.ts` |
| F-467 | security | major | risk | unverified | - | - | Vendor connector tokens are plaintext at default file mode on the Mac and copied whole (refresh token, client secret) into the box | `desktop/source/shared/node/vendor-mcp/installs.ts` |
| F-468 | security | minor | risk | unverified | - | - | Custom MCP server headers (API keys) stored plaintext at default mode | `desktop/source/shared/node/account-mcp/store.ts` |
| F-469 | security | major | risk | unverified | - | - | The [claidor] log lines print tool arguments and results unredacted, including text typed into the box browser | `desktop/source/host/extensions/inference/provider-session.ts` |
| F-470 | security | major | risk | unverified | - | - | Chromium sandbox disabled for the whole app, including the agent browser webviews | `desktop/source/electron-main/main.ts` |
| F-471 | security | major | design-violation | unverified | - | - | CopyToBox / ExternalRead reach the whole home directory with no per-file card once local execution is "always" | `desktop/source/host/local-exec/local-exec-daemon.ts` |
| F-472 | security | blocking | dead-service | refuted | cloud-agents-channels | coming-soon | The secret card can store only a channel credential, and channels do not exist here | `desktop/source/host/extensions/transcript/widget-responses.ts` |
| F-473 | security | major | naming | unverified | - | - | The sign-in confirmation page says Caisra | `server/polar/desktop/app_sign_in.py` |
| F-474 | security | minor | risk | unverified | - | - | Gateway /health answers before the bearer check | `desktop/source/host/gateway-server.ts` |
| F-475 | security | note | risk | unverified | - | - | Gateway bearer passed as a docker --env | `desktop/source/electron-main/box/local-docker-host-connector.ts` |
| F-476 | security | minor | risk | unverified | - | - | WebFetch follows redirects into the local network after checking only the first URL | `desktop/source/packages/agent/tools/core/web-fetch.ts` |
| F-477 | security | minor | risk | unverified | - | - | The Mac-local hatch's WebFetch has no local-network rejection at all | `desktop/source/host/extensions/transcript/routed-agent-tools.ts` |
| F-478 | security | minor | risk | unverified | - | - | Renderer-driven fetches from the main process: link metadata and plugin logos | `desktop/source/electron-main/attachments/attachments.ts` |
| F-479 | security | major | risk | unverified | - | - | Composio proxy trusts any session id / connected-account id the client names | `server/polar/desktop/composio.py` |
| F-480 | security | minor | dead-service | unverified | - | - | openCloudAgent still opens cursor.com from the app | `desktop/source/electron-main/main-edge.ts` |
| F-481 | security | note | risk | unverified | - | - | Every page in the agent's browser and the noVNC page has confirm() forced to true | `desktop/source/electron-preload/preload-browser-base.ts` |
| F-482 | security | note | docs-wrong | unverified | - | - | Record claims the vendor store lives under Application Support, then corrects itself; CLAUDE.md now agrees | `docs/product/connectors-signin-measured.md` |
| F-483 | security | minor | risk | unverified | - | - | Fork desktop router (1339) and egress tunnel port (8790) are published without a stated need | `desktop/source/electron-main/box/local-docker-host-connector.ts` |

## Cluster notes

### hidden-turn-cap (25 September 2026)

Root: `createAgentOwnerInput` dropped `runOptions.hidden`, so every hidden
turn ran with the asked cap of 5,000; and nothing set the runner's
latest-prompt-messages getter, so the closing-send nudge and post-turn
labelling read an empty list. Refuters: F-001, F-117 (3/3 stand), F-020
(3/3 stand; also kills post-turn labelling), F-298 (evidence and wiring
stand, design refutes: the cap was decided per turn, so an intro that
nudges is 40 + 40 by design; severity note), F-013 and F-125 (evidence
and wiring stand, design refutes: Grok Bot's own nudge mechanism,
chosen on 22 September; known limits, the "unbounded" half is F-001),
F-029 (wiring and design refute: the teammate's intro runs once when the
person opens it, by design), F-438 (evidence and wiring stand, design
refutes the widget half; the "no tools" row corrected in
spend-guards.md). Fixed: `hidden` forwarded to the owner input;
`setLatestPromptMessagesGetter` on the runner, bound by the agent's
shell; the `[claidor] model=` line ends with `budget=<limit>` and
`hidden=true` on a hidden turn. Needs a Mac: a nudge or intro line
reading `budget=40 hidden=true`.

### memory (25 September 2026)

Root: the production shell's host carried no `memoryStore`,
`episodeProgress` or `isMemorableExchange`, so `shouldRemember` was false
on every turn and nothing was ever remembered from conversation; and the
memory extension had no `createUserMemory`/`createProjectMemory`, so the
user's and the projects' shared shards were written by `UpdateState` and
never read. Refuters, one pass of three lenses per finding: F-019, F-059,
F-060, F-062, F-063, F-064, F-066, F-067, F-068, F-069, F-071, F-072,
F-073, F-074, F-075 stand; F-061 stands (dreaming's gate pin needs
Cursor's Statsig bootstrap; reachable by `SAND_FEATURE_GATE_OVERRIDES`,
but synthesis and legacy extraction are mutually exclusive in
`turn-settle`, so turning it on switches extraction off: a founder
decision, v1 keeps Grok Bot's legacy extraction, known limit); F-070
stands on evidence, design refutes the framing (a user fact recorded by
a since-deleted agent is still a user fact; the real defect is its
provenance name, a decision, not an `rm`); F-131 and F-246 refuted
(dead constants; the provider drops the id and runs Luna); F-332 refuted
(Grok Bot's own assembly; a child now reads the subagent prompt).
F-065, F-252 and F-358 are one item, memory sync to Simeon Labs' server:
a server contract change plus a box extension, no producer, moved to
their own cluster `memory-sync` for the founder to decide. Fixed: the
adapter forwards the three memory deps and the composition passes them
for the agent's own shell (a child never writes into the agent's
memory); the settle's executor is a hidden summarization session on
Luna, not the agent's Terra/high session; `shared-memory.ts` reads the
user and project shards with provenance and the extension serves both
factories; `deleteAgentMemory` looks the memory up by `id`; the
coordinator's method table carries the three memory rows and the
`memory` SSE family; a memory change clears the frozen prompt snapshot;
one note prefix; `setActiveAgent(session.id)`; a secrets rule in the
extraction prompt; the assembly reads its limits from the constants; a
`[claidor] memory extraction added=N removed=M` (or `failed <reason>`)
line per memorable turn. `tests/memory-wired.test.mjs` measures it
offline. Needs a Mac: that line in `/tmp/sand-host.log` after a turn
that says something worth remembering, and whether the pinned renderer's
memory pane lists, deletes and clears through the new rows (F-064).

### memory-sync (25 September 2026)

F-065, F-252, F-358: memory sync to Simeon Labs' server. The founder's
decision: Coming Soon. Depends on what is not built: a producer in the
host that ships the box's memory files, and a server contract that
accepts them as the app writes them (the served route takes a different
shape). No person-visible surface exists for it in the app (grepped
`desktop/source` for memory sync: only the server route and internal
summaries), so there is nothing to label; if one is added, it says
Coming Soon. Memory stays in the box's Docker volume. Dreaming stays off,
also by the founder's word: v1 keeps the legacy extraction.

### routine-write-review (25 September 2026)

F-034, F-090, F-353: `automationWrite: "off"` in every auto-review mode
table, typed as the literal `"off"`. Refuter: evidence and wiring stand
(the path behind it is complete: state tool → `reviewSandAutomationWrite`
→ the Luna classifier → the `auto-review-approval` card on surface
`automation_write` → the runner's resolve route); design refuted in
part: it is Grok Bot's shipped not-yet-rolled-out state, verbatim from
`ce9fc2d8`, and the brief says "may ask", so the copy was not false. The
founder's rule applies anyway: a switch with no missing service behind
it. Fixed: the surface follows the others (shadow, enforce, local
override); `tests/routine-write-review.test.mjs`; cards-plan row 14 no
longer says Missing. In production this is a shadow classification (one
Luna call, one `[claidor] auto-review action=sand_automation_write` line)
until `sand_auto_review` enforces, which is the auto-review cluster's
decision for every surface at once. Needs a Mac: whether the pinned
renderer draws the card for this surface.

### listeners-coming-soon (25 September 2026)

Root: a listener routine (Slack, GitHub, Teams, Linear, Sentry,
PagerDuty) fires through Cursor's relay (`/sand/listener-subscriptions`,
`/sand/listener-events/poll`, `/sand/automation-events/poll`,
`AutomationsService`, the dashboard's Slack/GitHub connections); Simeon
Labs' server serves none of it and no flag turns it on. **Coming Soon**,
dependency: that relay and the Slack/GitHub account connections. Refuters:
F-032, F-043, F-044, F-047, F-033, F-317, F-053, F-054, F-039, F-035,
F-036, F-040, F-374, F-058 stand (with corrections: the fire consumer
polled with zero routines, F-035; the relay only started once a listener
existed, F-043); F-046/F-407 stand on evidence, unreachable today (the
connect card is never drawn); F-045 refuted (no screen shows the relay
error string; folded); F-441 split: the cloud-agent link goes to the
cloud-agents cluster, the https deep link and the DNS probe are dead code
on a local Docker box (known limit). Fixed, at every reach point
(`shared/listener-availability.ts`): the update_state tool refuses a
listener trigger with the Coming Soon sentence and keeps taking cron;
the agent's brief offers cron only and names what is coming soon (Grok
Bot's listener text is kept behind `SAND_LISTENER_RELAY_SERVED=1`, about
10 KB less prompt); the connect URL is null, not cursor.com, with the
sentence logged; cloud absence is seeded so a cron routine is scheduled
locally from the first pass and the Connect client is never called; the
relay sources are not started and the fire consumer does not poll, so
the box no longer POSTs two unserved endpoints every 30 s; `@Cursor`,
"Cursor Slack app" and "Claidor account" are gone from the strings the
agent reads. `tests/listeners-coming-soon.test.mjs`. Not measurable
here: the pinned renderer's Routine panel copy (its bytes are not in the
tree); if it names listeners, that is the brand pass's next needle.

### routines-away (25 September 2026)

Root: the only scheduler is the hub's 15 s poll inside the box, and the
box stops on quit (the spend brake of 23 September), so nothing fires
with Simeon closed or the Mac asleep, while the brief promised "run even
when the user is away". F-031, F-048, F-318 are one row. First ledgered Coming Soon; the
founder answered the same day: "`SAND_KEEP_BOX_RUNNING_ON_QUIT=1` should
be the intended behavior for routines. The Mac can be awake while the app
itself is closed. The routine should still execute. The spend concern
should be handled by the routine/box lifecycle … if the Mac itself is
asleep/off, you can't expect a local computer to execute something."
**Fixed** on that word: quitting Simeon keeps the local Docker box when
an enabled routine exists (the box is asked `listAllAutomations` on its
own wire at quit) and stops it when none does; the Mac mints the box's
own renewal credential (`POST /desktop/api/box/renewal-credential`, a
child `desktop_sessions` row that follows the app's refresh and dies on
sign-out) and writes it into the token file, and the box's auth service
trades it at `POST /sand-box/inference-credential` (Grok Bot's own
renewal path) when the file goes stale, so a box older than an hour with
the app closed still calls the model; the brief says a routine fires
while this computer is awake, open or closed, and not while it is asleep
or off, and that a routine wake runs on the small model-call budget.
Spend with the app closed: the hidden-turn budget, the proxy's hourly
cap, the user-away guard. `tests/routine-box-lifecycle.test.mjs`,
`server/tests/desktop/test_box_credential.py`. Needs a Mac: quit with a
routine enabled, wait past the hour, read the renewal line in the box
log. Running with the Mac asleep or off stays a known limit (physics);
running elsewhere needs a headless executor (the maty queue has none).
Also fixed: 
CLAUDE.md's maty paragraph (F-038, F-049: routines can be created and
cron ones fire; `desktop/src` is the renderer's staging folder),
direction.md's routine sentences, spend-guards.md (F-041, the user-away
guard row), reconstruction-gaps (F-039, F-374). Known limits: F-037
(background failures reach run history and the agent's status reminder,
not a tray; Grok Bot's own rule), F-042 (a telemetry field nobody
receives).

### cloud-agents-channels (25 September 2026)

Root: a cloud agent is Cursor's BackgroundComposerService and a
messaging channel needs a Slack or Discord connector plus a relay;
Simeon Labs' server serves neither and no connector manifest is
`available`. **Coming Soon**, dependencies named. Refuters: F-007 stands,
severity up to major (the brief steered every repository task to a
CloudAgent launch that failed every time, because the experiments
extension has no `isCloudAgentsDisabledByTeam`, so the prompt's
"disabled" branch never ran); F-055, F-056 (the gateway's manifests
carried no `availability`, so the recovered Channels view failed closed
and drew nothing), F-081 stand; F-057 stands on evidence, design refuted
(the token field is Grok Bot's own settings surface, not a chat paste;
the defect is host hardening); F-472 refuted on mechanism (the kind is
hard-coded, the value is always stored; the defect is F-081's:
stored, unconsumed, agent misinformed) and merged; F-210 partly
duplicate (two of its seven items are internal identifiers). Fixed, at
every reach point (`shared/cloud-agents-availability.ts`): the
SendMessage tool no longer offers `cursor-agent` or `secret-request` and
refuses either with the Coming Soon sentence; a `channel` the model set
is dropped, not refused, so the text lands in the chat; the CloudAgent
tool is not built and the brief's cloud-agent sections are off, its
disabled section saying coming soon instead of "disabled by your team's
admin", the `## Origin` block with them; the gateway's channel manifests
are the shared ones with `availability`, so the Channels tab can draw
Coming Soon; `connectChannel` takes no credential for a coming-soon
platform; the secret store writes 0600; the secret ack no longer says a
connection links. `SAND_CLOUD_AGENTS_SERVED=1` restores Grok Bot's
cloud-agent paths. name-measured.md's "left on purpose" entries
corrected. `tests/cloud-agents-channels-coming-soon.test.mjs`. **Founder's decision, the same day:** "coding/repository work is
deliberately excluded until a future cloud-agent system exists", so
Grok Bot's disabled branch stays as written: the agent does not take on
repository work itself and says cloud agents are coming soon. Needs a Mac: the Channels tab drawing Coming Soon
rows.

### auto-review-enforce (25 September 2026)

Root: the box host built its experiment service bare; only the Mac
wrapped its own in `applySimeonGateDefaults`, so no row of Simeon's gate
table ever reached the loop, `sand_auto_review` read its bundled false,
and every surface resolved to shadow: one Luna call per shell command,
computer action and routine write, verdict discarded, no card. Refuters:
F-340 (blocking), F-341, F-343, F-347, F-352, F-354 stand; F-021 stands
(the subagent launch reviewer was never handed to the production input);
F-342 stands on two of three records. Fixed: the host wraps its service;
`sand_auto_review: true` and `sand_product_analytics: false` in
`simeon-gate-defaults.ts`; the production shell bumps the auto-review
user-message epoch on a new message, so a parked approval retires
(F-343); `subagentReview` is on the projection input (F-021); the
classifier has two attempts of 30 s (F-347); CLAUDE.md, model-roles and
the gaps record say enforce (F-342). Still not classified: MCP calls (the
approval-provider projection is absent, a build). Needs a Mac: a blocked
command's card, whether the pinned renderer draws the surface and shows
the proposed rule before "Always allow" (F-354).

### asks-once-memory (25 September 2026)

Root: "asks once, then not again" had no memory. The card's Always allow
wrote the box's settings and the Mac pushed its own `ask` back on every
transport connect; nothing called `beginTurn`, so a refused command stayed
refused for the agent's life, even after Always allow (F-344, the
controller checks refusals before the standing permission). Fixed: the
resync adopts the box's `always`/`never` into the Mac's settings when the
Mac still says `ask` (a choice made in Settings still wins); `beginTurn`
runs with the epoch. F-017 (an executor child cannot be asked in `ask`
mode; it works after Always allow) is a known limit; F-348's card copy
and F-349's Settings tab name need the pinned renderer read on a Mac.

### box-telemetry (25 September 2026)

Root: the packaged Mac carries `SAND_DISABLE_TELEMETRY` in its main; the
container never got it, so the host buffered console lines (2,048 chars
each), crash markers and product events and posted them to Simeon Labs'
server every 3 s for a 404. Refuters corrected the findings' premise: no
Connect client in the tree posts to a Cursor host (all go to
`SAND_BACKEND_URL`); the two real Cursor egress candidates were Sentry
(dead by wiring) and Statsig's `/rgstr` (F-388, which read the allowlist
backwards: `/rgstr` is the allowed route, reachable on a Mac that migrated
Grok Bot's cache). Fixed: `SAND_DISABLE_TELEMETRY=1`,
`SAND_DISABLE_ANALYTICS=1`, `SAND_BOX_LOG_SHIP_DISABLED=1` on the
container (schema 10 replaces old ones); Statsig logs nothing unless
Connect is served and the migrated folder never brings
`sand-statsig-bootstrap.json`; the Sentry DSN is empty; the local audit
line is redacted (F-346); the gaps record's four rows. Known limits:
the `[claidor]` stdout channel is the log by decision (F-386), the
vendor credential sits in plain JSON on both sides (F-387), the server's
refusal line keeps 1,000 chars of the provider body (F-389), traces never
sample (F-379), codebase telemetry is gated off (F-384). F-390 (a Help
menu item that shows a person their logs) moves to the electron-main-app
cluster: a small build. Needs a Mac: `docker exec simeon-box env | grep
SAND_DISABLE`.

### dead-cursor-services (25 September 2026)

Root: one Connect transport with one dead pre-flight
(`GetUserPrivacyMode`, cached 10 s, before every RPC and at every turn),
and cloud surfaces that 9d0e61c7 had already put behind
`isCloudAgentsServed()` when the findings were written. Fixed: the
pre-flight and the ghost-mode lookup are skipped unless
`SAND_CONNECT_SERVED=1` (F-004, F-116, F-123, F-382); the Mac answers
privacy mode and the permission ceiling locally (F-383, F-350); the
mobile-push sender (a transcript fragment per transition to a 404) is
not built (F-385); the team-admin prefetch and the cloud-agent watcher
are off (F-396, F-397); the brief says cloud agents are coming soon, not
"your team's admin disabled them" (F-392; the founder keeps repository
work excluded until a cloud-agent system exists); "Claidor account" is
Simeon account everywhere the agent or a person reads it (F-394); the
struck egress tunnel's port is not published (F-401); sharing says
Coming Soon and needs a served switch (F-403, dependency: Cursor's
`/sand/xuser` relay). Refuted as stale or dormant: F-393, F-395, F-397,
F-398, F-402. **A founder decision is owed, F-400:** local group chats
answer each member with a text-only Luna call (f278ec79, 19 September,
co-authored by the founder), not the Grok Bot loop; the 22 September
"I want literally everything" decision came after, and no record names
the carve-out. Keep it (spend) or run rooms on the loop.

### connectors-mcp (25 September 2026)

Refuters: 29 of 31 stand (F-162 already fixed by 5aca8256; F-182 has
test callers). Four roots. **Cursor's Dashboard client was still a live
caller** (plugin skills daily, skill publish, team popularity, the
marketplace's dead fetcher, the last MCP fallback on both sides):
`createSandCursorBackendClient` now answers every call with
Unimplemented at once and sends nothing unless `SAND_CONNECT_SERVED=1`
(F-156, F-158, F-177; every caller already catches); skill publish says
"coming soon in Simeon" (F-157, dependency: Cursor's team marketplace);
the dead fetcher is gone (F-159). **The hand-rolled OAuth and MCP client
was open at the edges**: every sign-in fetch has a 10 s deadline
(F-165), the RFC 8707 `resource` rides on authorize, exchange and
refresh (F-164), the reply body read is bounded and a stream that
outlives it is cancelled (F-155), a refresh the vendor refuses for good
drops the refresh token instead of re-posting it every 5 s (F-174), a
custom server's own CLIENT_ID skips registration (F-171), a failed box
pull holds off 30 s (F-172), the local store is read without a model
token (F-173), an object schema is carried (F-179). **"Never a key in the
chat" had no runtime for MCP**: the six tool sentences and the catalog
flow now say the user enters a secret in Settings → MCP, never in the
chat (F-152). **The store crossed to the box whole**: the box view drops
the refresh token and the client secret, and a row that won on age alone
without a credential never drops the authority's (F-153). Records:
direction.md §6 and §8, what-exists, the gaps record, the endpoint
docstrings, the account-mcp path, the catalogue counts (21 live, 18
coming soon, 11 groups) (F-154, F-161, F-169, F-180); the Figma card
claims nothing unrecorded (F-167); wording (F-170, F-181). Known limits:
plaintext local config in the editor (F-163), Google's favicon service
for 18 logos (F-168), no revocation on removal (F-175, a build), the
fixed loopback port bounded to denial by PKCE (F-176). **Three founder
items:** F-160 Composio (proxied by the server, unwired, needs
`COMPOSIO_API_KEY`: wire it or delete it), F-166 the Dropbox App key for
`catalog.ts`, F-178 the connector proposal card of direction.md §5: built the same
day at the founder's word ("Agent proposes a connector → user sees a
connector proposal card"): `ProposeConnector` emits a `connector` card
with `variant: "propose"` and the agent's reason, the pinned renderer's
card offers Add, and the brief proposes with it and never in text
(`tests/connector-proposal.test.mjs`; needs a Mac: the card drawn, Add
installing and signing in, the agent resumed). `tests/connectors-mcp-hardening.test.mjs`.
