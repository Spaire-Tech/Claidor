# Changelog

Docs: https://docs.openclaw.ai

## 2026.6.1

### Highlights

- Agents and CLI-backed runtimes recover more cleanly from interrupted tool calls, stale session bindings, compaction handoffs, and media delivery retries. (#88129, #88136, #88141, #88162, #88182)
- Channels and mobile delivery are steadier across Telegram, WhatsApp, iMessage, Slack, Discord, Microsoft Teams, Google Chat, Google Meet, and iOS realtime Talk. (#88096, #88105, #88183, #88231)
- Provider and plugin requests now bound more timers, retries, OAuth/device-code lifetimes, media downloads, local service probes, and generated-content polling paths before they can hang a run.
- Skills, session metadata, gateway runtime state, plugin metadata, memory watchers, and store writes do less repeated work on hot paths while keeping config, dispatch, and Linux file-watch behavior stable. (#89185, #89188, #85351) Thanks @RomneyDa and @NianJiuZst.
- Skills and plugin loading now handle stale disabled snapshots and loader failures more clearly, so channel turns avoid disabled SecretRefs and operators get better recovery guidance. (#79072, #79173) Thanks @zeus1959.
- Workboard, SecretRef plugin manifests, hosted iOS push relay, and external Copilot/Tokenjuice packaging add broader orchestration, integration, and plugin delivery surfaces. (#82326, #87469, #87796, #88107, #88117)
- Skill Workshop now has a fuller Control UI flow with proposal lists, today actions, revision handoff, searchable file previews, review states, locale coverage, and reusable session routing.
- Chat and Control UI startup paths keep sends alive through history loading, stream deltas incrementally, skip markdown work while streaming, keep drafts local while typing, clear the composer after sends, trace first-output latency, prioritize first connect, and expose calmer composer controls. (#88772, #88825, #88998, #89030, #89106) Thanks @vincentkoc and @sallyom.
- Provider coverage and model metadata now include MiniMax M3, account OAuth endpoints, Google/Vertex catalog fixes, OpenRouter SQLite model caching, Copilot Claude 1M capabilities, Foundry reasoning alignment, and OpenAI response replay guards. (#88480, #88512, #88851, #88860)
- iMessage monitor state, inbound queues, and plugin install ledgers moved toward SQLite-backed state so restarts and local monitors recover with less duplicate filesystem scanning. (#88794, #88797)
- Release, CI, Docker, E2E, plugin install, and diagnostics lanes now cap more logs, response bodies, readiness probes, artifact checks, status polling, child workflow waits, docker package cleanup, quiet test stalls, and rollback snapshots so failures report bounded proof instead of stalling. (#88966) Thanks @RomneyDa.

### Changes

- Docs: add a dedicated Skill Workshop guide covering governed skill creation, reviewable proposals, CLI, Gateway, agent tool behavior, approval policy, support files, and recovery, and refresh the ClawHub showcase cards. (#88734) Thanks @shakkernerd and @vyctorbrzezowski.
- Skills: let the `skill_workshop` agent tool apply, reject, and quarantine explicit proposals through the guarded review flow. Thanks @shakkernerd.
- Skills: let proposals carry approved support files under standard skill folders, with scanner, hash, and rollback safeguards. Thanks @shakkernerd.
- Skills: let pending proposals be revised in place with versioned, dated proposal frontmatter before approval. Thanks @shakkernerd.
- Skills: add Skill Workshop with pending proposals, CLI/Gateway review actions, rollback metadata, and the `skill_workshop` agent tool. Thanks @shakkernerd.
- Skill Workshop: add the Control UI navigation, styled dashboard, proposal today view, revision dialog, file preview modal, searchable preview files, reusable session handoff, and localized strings.
- Plugins: externalize Tokenjuice as the official `@openclaw/tokenjuice` plugin with npm and ClawHub publish metadata.
- Plugins: externalize the GitHub Copilot agent runtime as the official `@openclaw/copilot` plugin with npm and ClawHub publish metadata.
- iOS: add hosted push relay defaults, realtime Talk playback, and a guarded WebSocket ping path for more reliable mobile sessions. (#88096, #88105, #88231)
- iOS: support native iPad display layouts.
- Workboard: add orchestration primitives and agent coordination tools for multi-agent planning and run tracking. (#87469)
- Workboard: wire task-backed board runs and show task comments in the edit modal.
- Code mode: add internal namespaces for scoped agent/global sessions and exact namespace tool dispatch. (#88043)
- Code mode: add MCP API files and docs for code-mode integrations.
- Control UI: add a Dreaming-tab agent selector and propagate the selected agent through Dreaming status, diary, and diary actions. (#78748) Thanks @stevenepalmer.
- Control UI: add calmer chat composer controls, local draft typing state, and first-output latency instrumentation for active chat entry. (#88772, #88998) Thanks @vincentkoc.
- Plugins: add a SecretRef provider integration manifest contract and extract shared LLM core packages for provider/plugin reuse. (#82326, #88117)
- Plugins: persist the plugin install index in SQLite so installed package lookup survives reloads with less filesystem scanning. (#88794)
- Providers: add MiniMax M3 model support. (#88860)
- Doctor: add disk space health checks and stabilize post-upgrade JSON probes.
- Channels: store inbound queues in SQLite and migrate iMessage monitor state to SQLite-backed tracking. (#88797)
- Skills: add the core skills index and centralize skills runtime loading, status, filtering, and prompt formatting.

### Fixes

- Release/CI/E2E: fail early when Crabbox sparse-sync full checkouts do not have enough local disk, with guidance for moving the sync root.
- Build: render independent CLI startup metadata help snapshots concurrently to cut cold build-all metadata time.
- Plugins: stop timed-out package-boundary prep steps by process group so descendant TypeScript/helper processes do not survive local check cleanup.
- Control UI: serve static assets asynchronously after safe-open checks so large UI files do not block Gateway request handling.
- Scripts/UI: forward direct wrapper SIGHUP shutdown to child processes so terminal hangups do not leave wrapped dev commands running.
- Gateway: return the post-expiration pending-work revision from node drains so reconnecting nodes do not observe stale queue revisions after expired items are pruned.
- Release/CI/E2E: keep temporary full-sync checkouts alive while slow Crabbox leases boot, so sparse worktree runs do not lose their sync source before file-list generation.
- Release/CI/E2E: normalize inherited Linux `C.UTF-8` locale settings before raw AWS macOS Crabbox bootstrap commands, avoiding macOS locale warnings during package-manager hydration.
- Release/CI/E2E: keep gateway watch regression checks from copying large static plugin assets inside the measured idle window.
- Update: keep core updates nonblocking when a missing external plugin repair download stalls, while still blocking installed active plugin payload smoke failures.
- Agents/providers: keep streaming tool-call argument parsing record-shaped when providers emit valid non-object JSON such as `null` or arrays.
- Release/CI/E2E: reset incremental log readers when watched log files rotate without shrinking, so same-size replacements do not hide new readiness or RPC lines.
- Talk: preserve explicit `null` payloads on controller-created turn and output-audio lifecycle events.
- Agents/TUI: keep local custom provider runs from loading plugin runtime and auth alias metadata when plugins are disabled.
- Agents/TUI: restore in-flight TUI run switch-back behavior, keep no-policy native hook fallback available, guard vanished workspaces, and keep lightweight isolated subagents lightweight.
- Agents/media: keep async image, music, and video generation starts from ending the Codex turn, so mixed requests can continue with summaries or other work while media renders in the background.
- Agents/Codex: keep public OpenAI API-key profiles from being treated as native Codex app-server auth while preserving persisted Codex OAuth sessions.
- Agents/Codex: stream Codex app-server final-answer partials to live reply previews, preserve ACP metadata in SQLite, prefer real tool results over synthetic repair output, prevent aborted app-server turn handles from lingering, migrate legacy OpenAI Codex `lastGood` auth state, and preserve workspace/session metadata through ACP runtime refactors. (#88405, #88724, #88730) Thanks @vincentkoc.
- Control UI: keep collapsed tool cards labeled with the tool name and action instead of generic output text. Thanks @shakkernerd.
- Agents/Codex: surface Skill Workshop guidance in Codex app-server prompts when `skill_workshop` is available. Thanks @shakkernerd.
- Skill Workshop: restore and localize the Control UI board/today view switcher so review workflows keep their intended layout toggle across locales. Thanks @shakkernerd.
- Agents/auth: write auth profiles atomically, dispatch auth failures by type, add force re-login recovery, preserve workspaces during state-only uninstall, and compact before oversized turns so recovery paths avoid partial state. (#89181) Thanks @RomneyDa.
- Skills: skip disabled skill env overrides from stale persisted snapshots so disabled skill `apiKey` SecretRefs cannot abort embedded or channel turns. (#79072, #79173) Thanks @zeus1959.
- Skill Workshop: render the Control UI tab from filtered navigation state and keep filtered fallback routing stable.
- CLI: avoid live catalog validation during `openclaw agents add`, so adding a secondary agent no longer depends on provider catalog availability. (#76284, #88314) Thanks @zhangguiping-xydt.
- CLI: keep `plugins list --json` on the snapshot-only path so plugin sweeps avoid loading the full runtime status graph.
- CLI/desktop: bridge WSL clipboard operations through the shell, recognize manual-update launchd jobs, and keep machine-readable startup output parseable during progress setup. (#88764, #88689) Thanks @alexzhu0.
- Plugins: make PixVerse external-plugin ClawHub metadata explicit and keep it out of bundled dist builds.
- Plugins: clarify plugin loader failure guidance so missing or incompatible plugin packages point operators at the right repair path.
- Plugins: preserve npm plugin roots after blocked installs, skip plugin-local `openclaw` peer symlinks during rollback snapshots, relink those peers after restore, isolate cached tool runtime siblings, and isolate web-provider factory failures so one bad plugin does not poison sibling runtime paths. (#77237, #88807)
- Cron: keep SQLite cron migrations compatible with legacy run-log tables, archived job stores, diagnostic cron names, and legacy one-shot delete-after-run behavior. (#88285)
- Cron: keep update delivery validation scoped, harden restart state, and retire MCP runtimes on isolated cron cleanup.
- Memory: serialize QMD update/embed writes per store, reduce Linux watcher fan-out, retry transient FileProvider-backed reads, preserve phase signals on read errors, harden envelope metadata sanitization, reattach Linux native watchers when directories are recreated, and rewrite generated transcript paths on rollover so memory/search state survives concurrent gateway and CLI activity. (#66339, #85931, #89185, #89188, #85351) Thanks @openperf, @amittell, @RomneyDa, and @NianJiuZst.
- Memory: keep vector-disabled FTS indexes from resolving embedding providers during sync and search.
- Providers: bound generated media downloads from OpenAI, Runway, xAI, MiniMax, BytePlus, DashScope-compatible, FAL, OpenRouter, Google, Vydra, and Comfy providers.
- Providers: resolve Google defaults to `google-generative-ai`, register Vertex static catalog rows, align Foundry reasoning metadata, skip DeepSeek V4 thinking params on Foundry fallback, use MiniMax account OAuth endpoints, preserve Copilot Claude 1M capabilities, suppress disabled Ollama reasoning output, forward Gemini stop sequences, strip Kimi-incompatible Anthropic cache markers, keep OpenAI stop-finished tool calls, and avoid replay ids when the Responses store is disabled. (#88480, #88512, #76612) Thanks @coder999999999, @BryanTegomoh, and @vliuyt.
- Providers: cap GitHub Copilot OAuth request timeouts before creating abort signals.
- Cron: retry recurring jobs after transient model rate limits before waiting for the next scheduled slot.
- Agents/Codex: keep live session locks during cleanup, recover interrupted CLI tool transcripts, preserve Codex auth and compaction session identity, clear orphan tool state, cap app-server idle timers, and keep media completion delivery retryable. (#88129, #88136, #88141, #88162, #88182)
- Chat/UI: show Gateway chat failures as visible assistant messages in the Control UI instead of only setting an invisible error state.
- Channels: cap Telegram, Discord, WhatsApp, Signal, Feishu, Google Chat, Microsoft Teams, QQBot, Nostr, Zalo, Zalouser, and Nextcloud-style request/retry timers; preserve SMS approval reply routes; and retry WhatsApp QR login 408 timeouts. (#88183)
- Security/config parsing: reject unsafe OAuth/token lifetimes, retry-after delays, inbound timestamps, response body sizes, command timeout config, sandbox observer token TTLs, and gateway WebSocket calls after close.
- Providers/media: cap local service, model, usage, queue, generated media, TTS, music, workflow polling, and provider OAuth request timers across hosted and local providers.
- Release/CI/E2E: bound release candidate reads, beta smoke REST calls, plugin npm verification commands, changelog restore, cross-OS process groups, kitchen-sink and bundled plugin readiness probes, secret-provider probes, Telegram credential timeouts, Control UI i18n and CLI startup metadata generation, Vitest routing, dependency guard admin approvals, child workflow failure detection, quiet Node test shard stalls, docker package cleanup, and mainline test flakes. (#88127, #88137, #88155, #88160, #88966) Thanks @RomneyDa.
- Release/CI/E2E: keep Kitchen Sink live plugin MCP probes resolving source-checkout workspace packages and align the live gauntlet with current Kitchen Sink diagnostics.
- Release/CI/E2E: run the secret-provider integration proof through the repo pnpm runner so native macOS and Windows validation use the hydrated package-manager shim.
- Release/CI/E2E: run the Telegram desktop proof gateway through the repo pnpm runner so native macOS proof uses the hydrated package-manager shim.
- Docs/CI: run Mintlify anchor checks through the repo pnpm runner so docs link validation works when pnpm is only available through the hydrated package-manager shim.
- Agents: keep configured fallback model metadata typed so provider params, context-token caps, and media input limits do not break changed-gate typechecks.
- Agents: accept hidden `sessions_send` body aliases before validation while keeping the model-facing `message` schema canonical. (#88229) Thanks @zhangguiping-xydt.
- Chat/UI: preserve startup chat sends during history loading, unblock the initial Control UI chat send, stream chat deltas incrementally, skip markdown parsing while streaming, keep drafts local while typing, guard composer rerenders, honor Chromium executable overrides, and detect system Chromium for E2E. (#88998) Thanks @vincentkoc.
- Channels: stop schema-padded poll modifiers from turning normal `send` actions into invalid poll sends. (#89601) Thanks @codezz.
- Channels: preserve long Feishu streaming replies, send visible fallbacks when accepted Feishu turns produce no final reply, tolerate iMessage self-chat timestamp skew, preserve colon-prefixed slash commands in mention parsing, decode Nostr `npub` allowlists correctly, and suppress raw provider errors during channel delivery. (#87896)
- Config/status/doctor: skip unresolved shell references in state-dir dotenv files, resolve gateway auth secrets during deep status audits, respect explicit PI runtime policy, report runtime tool-schema errors, and keep post-upgrade JSON stable. (#88288)
- Gateway/session state: list commands from the Gateway plugin registry, harden MCP loopback tool schemas, hide phantom agent-store rows from `sessions.list`, make task persistence failures explicit, and carry session UUIDs on interactive dispatch events.
- Gateway/plugins: narrow plugin lookup memoization to the stable plugin/runtime inputs, avoiding repeated lookup work without mixing disabled or filtered plugin state.
- OpenAI/TTS: handle speed directives for OpenAI TTS voices. (#74089)
- CI/Crabbox: keep default runner capacity on the Azure credit-backed on-demand D4 lane with the Azure SSH port and a Git-independent full check job, so broad validation avoids low-priority spot quota stalls, hydrate port mismatches, non-Git hydrated workspaces, and stale AWS region hints.
- CI/Crabbox: route Crabbox wrapper and Testbox workflow edits to their regression tests so changed-test gates do not silently run zero specs.
- CI/workflows: route workflow sanity helper edits to their guard tests and cover composite-action input interpolation checks.
- CI/tooling: route CI scope, dependency, changelog, and docs helper edits to their owner tests instead of silently skipping changed-test coverage.
- CI/tooling: route package, release, and install helper edits to their owner tests so changed-test gates cover publish and installer script changes.
- CI/tooling: route shared script library edits through their owner tests so lock, process, safety, and scan helpers do not skip changed-test coverage.
- CI/tooling: skip expensive import-graph scans once a changed diff already requires broad fallback, keeping local changed-test planning fast while still collecting explicit owner tests.
- CI/tooling: route script edits through conventional owner tests when matching `test/scripts` or `src/scripts` coverage already exists.
- CI/tooling: honor option terminators in the memory FD repro script so follow-on arguments are not reparsed.
- Release/CI/E2E: assert plugin lifecycle runtime inspect output instead of only capturing it.
- Release/CI/E2E: make gateway-network prove the advertised health RPC and retry early WebSocket closes without burning full open timeouts.
- Release/CI/E2E: honor option terminators across release, Parallels smoke, plugin gauntlet, and extension-memory scripts.
- Release/CI/E2E: fail plugin gateway gauntlet QA chunks when the requested suite summary is missing or invalid.
- Performance: prebuild QA runtime probes with generated plugin assets but without CLI startup metadata.
- Performance: skip declaration bundling for runtime-only CLI startup and gateway watch build profiles.
- Performance: reuse prepared provider handles, strict tool schemas, gateway runtime metadata, session maintenance config, plugin metadata, bundled skill allowlists, package-local plugin artifacts, single-entry store writes, and validated/serialized session prompt blobs.
