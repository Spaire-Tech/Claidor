# Swen in this repository

This directory is Swen, Claidor's desktop assistant. It started as a
vendored copy of LobsterAI (NetEase Youdao, MIT licence, `LICENSE` in
this directory), the desktop app that runs the OpenClaw agent engine
underneath a window. It was added with

    git subtree add --prefix=desktop https://github.com/netease-youdao/LobsterAI.git main --squash

from upstream commit `7592cd03` (version 2026.9.4, bundling OpenClaw
v2026.6.1) on 9 September 2026, and then reshaped into Swen. Because the
reshaping touched hundreds of files, a later `git subtree pull` from
upstream will conflict widely; treat upstream as a source of patches to
port by hand, not as a branch to merge.

## Where Swen talks to

Only Claidor's two hosts, and nowhere else:

- API: `https://api.claidor.com`, account protocol under `/desktop`
  (`src/main/libs/endpoints.ts`; the server side is
  `server/polar/desktop`). Sign-in, token refresh, profile, quota, the
  model list, the metered model proxy, and the stubs the app asks for
  (update check, skill store, kit store, client activities and banners:
  they answer « nothing newer » / « empty »).
- Web app: `https://app.claidor.com` (`src/renderer/services/endpoints.ts`):
  where the browser sign-in happens and where the account links open.

Test mode (Settings → About, hidden switch) uses `http://127.0.0.1:8000`
and `http://127.0.0.1:3000`. `SWEN_SERVER_BASE_URL` overrides the API
address in development. The deep link scheme is `swen://` (sign-in
fallback `swen://auth/callback?code=…`), the app id `com.claidor.swen`,
the client header `X-Swen-Client-Version`.

## What changed from LobsterAI

Identity: LobsterAI → Swen everywhere (`package.json`, `electron-builder.json`,
copy, storage keys such as `swen-language`, `swen.sqlite`). The tray and
app icons under `build/`, `resources/tray` and `public/logo.png` are
generated placeholders (a letter S) until a designed icon exists. The MIT
notices stay in `LICENSE`, in the source headers that carried them, and on
the About screen.

Language: English only. The Chinese dictionaries in
`src/renderer/services/i18n.ts` and `src/main/i18n.ts` were deleted;
`LanguageType` still lists `'zh'` so old configs and the many
`=== 'en'` comparisons compile, but `getLanguage()` always returns
`'en'` and the language selector is gone from Settings. Every Chinese
string, prompt, comment and test fixture was translated or replaced.
Text heuristics that recognised Chinese phrases (media mention tokens,
allow/deny words, plan headings) now recognise the English ones.

Chat channels: Telegram and Discord are offered. WeChat, WeCom, DingTalk,
Feishu, QQ, NetEase IM, NetEase Bee, POPO, and the upstream email channel
(NetEase's hosted « Claw » mail service, keys from claw.163.com; the
plain IMAP/SMTP email *skill* stays) are retired in
`src/shared/platform/constants.ts` (`retired: true`): still in the
`Platform` type, never listed, never offered, their OpenClaw plugins
removed from `package.json`. Their gateway code (`src/main/im/nim*`,
`dingtalk*`, `qq*`, `weixin*`, …) is still in the tree, translated,
unreachable from the UI. It was kept because deleting it means surgery
across the gateway manager; delete it when a channel round comes.

Removed or switched off: image and video generation (the
`lobster-media-generation` extension and the Seedance/Seedream skills are
deleted; the media picker in the prompt bar is behind
`SWEN_MEDIA_GENERATION_ENABLED = false`), Youdao Note, the DeepSeek
Harness (DSH) settings tab, voice input (Youdao speech recognition, behind
`SWEN_VOICE_INPUT_ENABLED = false`; the main-process ASR code remains),
credit campaigns and daily check-in (the server answers « no activity »),
the Windows Computer Use kit (its runtime zip and bundle were downloaded
from NetEase's CDN; `isComputerUseKitSupportedPlatform()` returns false
until Claidor hosts the files), usage analytics to Youdao (events now go
to `/desktop/api/analytics/events` on Claidor, which acknowledges and
keeps nothing, and only when the person allows statistics in Settings),
the MCP marketplace from Youdao (Claidor serves the fifteen-server
catalogue from `server/polar/desktop/mcp_marketplace.json`),
the Qichacha MCP bundle, the provider and API-key screens (the Model tab
is now `SwenAccountSection`: sign in, usage this month, available models;
the provider config is still saved and read by the engine sync, so an
enterprise config or an old profile still works), the upstream docs,
specs, Chinese README, and the upstream `.github` workflows.

Skills: seventeen bundled (`SKILLs/skills.config.json`). Deleted:
stock-analyzer, stock-announcements, stock-explorer, content-planner,
article-writer, daily-trending, technology-news-search, music-search,
films-search, seedance, seedream, youdaonote.

Presets: six English office presets in `src/main/presetAgents.ts`
(Document Writer, Spreadsheet Analyst, Presentation Builder, Meeting
Notes, Research Assistant, Email Assistant).

Still NetEase-shaped but inert: the DeepSeek Harness (DSH) main-process
code and the `dsh` block in `package.json` (runtime archives on NetEase's
CDN) have no entry point left in the UI; the model-provider registry in
`src/shared/providers/constants.ts` still lists Chinese providers
(Youdao Zhiyun, Qianfan, …) that no screen shows; the retired channel
gateways keep their NetEase URLs. Delete these when a channel or engine
round comes.

Added, not from upstream: the personal library (`docs/swen/library.md`).
An index of the person's documents built on the machine: the contract in
`src/shared/library/contentConstants.ts`, the tables in
`src/main/library/libraryMigrations.ts`, the store, indexer and document
worker under `src/main/library/content/`, the `search_library` tool in
`openclaw-extensions/search-library` calling back over the loopback
bridge (`/library/search`), and Settings → Library
(`src/renderer/components/library/`). The embedding model
(`Xenova/bge-small-en-v1.5`, quantised) is fetched at build time by
`scripts/fetch-embedding-model.cjs` into `resources/embedding-model/`
(git-ignored, pinned revision and checksums) and shipped as an extra
resource; the app never downloads it.

Not done yet: no Slack, Teams, WhatsApp or iMessage channel (the founder's
plan lists them; none is added). No signed build, no release, no update
feed. The account links on the web app open its home page because the
web app has no account pages for the desktop yet.

## Safety of the engine, unchanged from upstream

Read before relying on its safety claims: on the OpenClaw engine it
writes the engine's command-approval file to "security: full, ask:
off", delete protection is a system-prompt instruction, commands from
chat channels are auto-approved, and sandboxing is off outside
enterprise accounts (`src/main/libs/openclawConfigSync.ts`,
`src/main/libs/agentEngine/openclawApprovalBridge.ts`).

## Building

It builds on its own (`README.md` here: Run From Source, Developing,
Packaging) with its own `package.json`; it is not part of the `clients/`
pnpm workspace. Node 24 is required (`engine-strict`).
