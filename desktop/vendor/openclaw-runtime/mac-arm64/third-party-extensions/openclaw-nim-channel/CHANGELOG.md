# Changelog

English | [中文](./CHANGELOG.zh-CN.md)

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `nimToken` documentation and spec now recommend `appKey|accid|token`; legacy `appKey-accid-token` remains supported for backward compatibility

## [1.0.3] - 2026-04-10

### Fixed

- Fix plugin installation failure on OpenClaw 2026.4.9: plugin API version compatibility check now uses semver range (`^2026.4.5`) instead of exact version to allow forward compatibility with newer OpenClaw patch releases

## [1.0.2] - 2026-04-01

### Fixed

- Fix plugin installation failure on OpenClaw 2026.3.28: `npm install failed` followed by `package.json missing openclaw.hooks`
- Bundle runtime dependencies (`@yxim/nim-bot`, `zod`) via `bundledDependencies` to eliminate external npm registry dependency during isolated plugin install
- Remove `peerDependencies` declaration for `openclaw` to prevent peer dependency resolution failures in OpenClaw's sandboxed install environment

## [1.0.0] - 2026-03-27

### Added

- **Streaming output support**: P2P and team messages support block streaming for real-time response delivery; QChat messages use complete message delivery (streaming force-disabled to prevent fragmentation)
- **Multi-instance configuration**: Support up to 3 NIM instances running simultaneously with different accounts or AppKeys; each instance maintains independent connection and policies
- `nimToken` shorthand credential: supports preferred `appKey|accid|token` format and legacy `appKey-accid-token`, takes priority over individual `appKey`/`account`/`token` fields (recommended)
- Technical documentation: [`BLOCK_STREAMING_CONFIG.md`](./BLOCK_STREAMING_CONFIG.md) for block streaming setup and [`STREAMING_GUIDE.md`](./STREAMING_GUIDE.md) for real-time streaming data usage

### Changed

- **BREAKING**: Requires OpenClaw **2026.3.24 or later** for streaming and multi-instance support
- **BREAKING**: `channels.nim` configuration changed from single object to **array format** to support multiple instances
- **BREAKING**: Only **bot accounts** are supported; regular personal accounts are no longer supported
- **BREAKING**: Recommended to use `nimToken` shorthand format (`appKey|accid|token`; legacy `appKey-accid-token` still supported); individual `appKey`/`account`/`token` fields deprecated but still supported
- QChat messages force-disable streaming output and text chunking for complete message delivery (prevents message fragmentation in circle groups)

### Fixed

- Login `aiBot` parameter changed from `1` to `2` to correctly identify as AI Bot

## [0.4.0] - 2026-03-18

### Added

- **Name resolver module** (`name-resolver.ts`): resolves user nicknames, team names, and QChat channel names via NIM SDK V2 API with in-memory TTL cache (5 min)
- Conversation labels now display human-readable names: `云信·单聊·<nickname>`, `云信·群聊·<team name>`, `云信·圈组·<channel name>` instead of raw IDs
- `fromNick` field on `NimMessageEvent` — extracts sender nickname directly from SDK message objects
- `mentionAccids` field on `QChatInboundMessage` — exposes the list of @-mentioned account IDs
- QChat inbound @-mention resolution: replaces `@accid` with `@nickname` in message body before dispatching to agent
- QChat inbound system events with resolved display names (matching the bot.ts pattern)
- Session recording via `core.channel.session.recordInboundSession()` for NIM P2P and team messages

### Changed

- **Breaking:** Reply dispatch migrated from `createNimReplyDispatcher` + `dispatchReplyFromConfig` to `createNormalizedOutboundDeliverer` + `dispatchReplyWithBufferedBlockDispatcher` (aligned with QChat pattern)
- **Breaking:** P2P and team messages now use `ChatType: "direct"` and `PeerKind: "dm"` uniformly; team peer IDs prefixed with `team-` for disambiguation
- **Breaking:** QChat inbound `ChatType` changed from `"group"` to `"direct"`; peer IDs prefixed with `qchat-`; `GroupSubject` removed from QChat context payload
- **Breaking:** QChat `From` field simplified from `nim:qchat:<accid>` to `nim:<accid>`
- `SenderName` now displays resolved nicknames instead of raw account IDs
- `ConversationLabel` uses human-readable conversation labels (e.g. `云信·群聊·<name>`) instead of raw IDs
- Agent envelope formatting removed from bot.ts — `Body` now passes raw text directly
- System event labels updated to use resolved display names

### Removed

- `reply-dispatcher.ts` usage — replaced by inline `createNormalizedOutboundDeliverer`
- Message content preview from system event labels (privacy improvement)

## [0.4.0-beta.3] - 2026-03-12

### Changed

- Fixed `link_web` example value from `wss://your-link.example.com` to `weblink.netease.im:443` in README CLI and JSON examples to match NIM SDK's expected format (host:port, not WebSocket URL)

## [0.4.0-beta.2] - 2026-03-10

### Added

- Private deployment CLI configuration examples in README — added `openclaw config set` commands for all privatization fields (`weblbsUrl`, `link_web`, `nos_uploader`, `nos_downloader_v2`, `nosSsl`, `nos_accelerate`, `nos_accelerate_host`)

## [0.4.0-beta.1] - 2026-03-09

### Added

- Private deployment (privatization) configuration via `NIMOtherOptionsPrivateConfig`: supports custom LBS URL (`weblbsUrl`), WebSocket link address (`link_web`), NOS upload URL (`nos_uploader`), NOS download URL format (`nos_downloader_v2`), NOS HTTPS toggle (`nosSsl`), CDN accelerate URL (`nos_accelerate`), and CDN accelerate host (`nos_accelerate_host`)
- All privatization parameters are exposed under `advanced` config, except data reporting fields (`compassDataEndpoint`, `enableCompass`) which are intentionally excluded

### Changed

- Configuration examples in README converted from YAML to JSON to match OpenClaw's actual config format

## [0.3.0-beta.6] - 2026-03-06

### Added

- QChat (`qchat`) policy system: `open` / `allowlist` / `disabled`, with fine-grained `allowFrom` entries supporting `serverId`, `serverId|channelId`, `serverId|channelId|accountId`, `serverId||accountId` formats
- QChat server invite auto-accept, controlled by `qchat.policy` and `allowFrom`
- QChat reply-to message support (replies reference the original message)
- Team group chat (`team`) policy with group + sender allowlist, supporting regular team (高级群) and super team (超大群) type filtering
- Delivery-time policy re-check in QChat — guards against in-flight dispatches when config changes mid-conversation
- `qchat-send.ts` hard gate (`qchatReplyEnabled`) — blocks all outbound sends when policy is disabled
- Chinese README (`README.zh-CN.md`) with bidirectional language links

### Changed

- **Breaking:** Config structure reorganized — `p2pPolicy`/`allowFrom`/`teamPolicy`/`teamAllowFrom`/`mediaMaxMb`/`textChunkLimit`/`debug` moved into nested `p2p`, `team`, `advanced`, `qchat` sub-objects
- **Breaking:** QChat config simplified — removed `qchat.enabled`, `qchat.serverIds`, `qchat.serverPolicy`; replaced with `qchat.policy` + `qchat.allowFrom`
- QChat now starts automatically when NIM credentials are configured (no longer requires `qchat.enabled: true`)
- Server IDs for subscription are derived from `qchat.allowFrom` entries automatically
- Friend request auto-accept now updates on config reload via `updateP2pPolicy()` instead of using stale closure values
- Removed message content (text preview) from `[nim] sending reply` log for privacy

### Fixed

- **QChat messages processed despite policy block**: stale closure captured `qchatPolicy` at startup and never updated on config reload, causing old gateway instances to dispatch messages with outdated `policy: open`
- **QChat listener accumulation on config reload**: `stop()` only unsubscribed servers but never removed `nim.qchatMsg.on("message")` event listeners, causing the same message to be processed multiple times by old + new listeners on the shared NIM SDK instance
- **`allowlist` with empty `allowFrom` treated as `open`**: for QChat server invites, `serverPolicy` was derived from `derivedServerIds.length > 0` instead of the actual `qchat.policy` value — `disabled` and `allowlist` with empty list both incorrectly resolved to `"open"`
- **`allowlist` with empty `allowFrom` enabled replies**: `setQchatReplyEnabled()` only checked for literal `"disabled"`, not `"allowlist"` with empty list
- **Delivery-time re-check only caught `disabled`**: QChat delivery guard checked `livePolicy === "disabled"` but missed `"allowlist"` with empty list; now uses full `isQChatAllowed()` check
- **Friend request auto-accept used stale config**: `p2pPolicy` and `allowFrom` captured once in `createNimClient` closure, never updated when config reloaded (NIM client is cached)
- **P2P `allowlist` with empty `allowFrom` not treated as disabled**: missing early return for empty list case in `isNimP2pAllowed()`
- **Team policy missing `isTeam` guard**: team policy check ran unconditionally regardless of session type

## [0.0.3] - 2026-02-03

### Fixed

- Fixed plugin SDK imports from `clawdbot/plugin-sdk` to `openclaw/plugin-sdk`
- Fixed type references from `ClawdbotConfig` to `OpenClawConfig`
- Fixed type references from `ClawdbotPluginApi` to `OpenClawPluginApi`

## [0.0.2] - 2026-02-03

### Fixed

- Added `openclaw.plugin.json` manifest file (renamed from `clawdbot.plugin.json`)

## [0.0.1] - 2026-02-03

### Added

- Initial release as `openclaw-nim` (rebranded from `moltbot-nim`)
- NetEase IM (NIM) channel plugin for OpenClaw
- Message sending and receiving support
- Media file handling (images, audio, video, files)
- Long message chunking support
- DM (direct message) policy configuration
- Multi-account support via config
- Zod schema validation with numeric string coercion

### Changed

enclaw.plugin.json`manifest file (renamed from`clawdbot.plugin.json`)

## [0.0.1] - 2026-02-03

### Added

- Initial release as `openclaw-nim` (rebranded from `moltbot-nim`)
- NetEase IM (NIM) channel plugin for OpenClaw
- Message sending and receiving support
- Media file handling (images, audio, video, files)
- Long message chunking support
- DM (direct message) policy configuration
- Multi-account support via config
- Zod schema validation with numeric string coercion

### Changed

- Package renamed from `moltbot-nim` to `openclaw-nim`
- Plugin ID changed to `openclaw-nim`
- Data directory changed from `~/.moltbot-nim` to `~/.openclaw-nim`

---

## Pre-release History (as moltbot-nim)

### [0.1.x] - 2026-01

- Initial development as `moltbot-nim`
- Basic NIM SDK integration
- Channel plugin architecture
