<h1 align="center">
  <img src="public/logo.png" alt="Maties" width="96"><br>
  Maties
</h1>

<p align="center">
  <strong>A desktop assistant for office work, signed in with Claidor.</strong><br/>
  Built on the LobsterAI desktop app (NetEase Youdao, MIT) and the OpenClaw agent engine.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows-4493F8?style=flat-square" alt="Supported platforms: macOS and Windows" />
  <img src="https://img.shields.io/badge/Electron-40-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron 40" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 18" />
</p>

Maties is a desktop agent that works in a person's real environment: local files, terminal commands, browser workflows, Word, Excel and PowerPoint documents, PDFs, email, chat channels and scheduled jobs. It is meant for office workers who are not technical: they sign in once with their Claidor account and never see a model provider, an API key or a base URL.

Cowork is the product and session layer. OpenClaw is the runtime and gateway underneath it. Maties keeps local persistence, permissions, UI state, artifacts, agents, memory and channel bindings in the desktop app, and uses OpenClaw to run the agent.

## How Maties reaches the models

Maties holds no keys. The app signs the person in through the Claidor web app (`https://app.claidor.com`), receives an access token from the Claidor API (`https://api.claidor.com/desktop`), and sends every model request through Claidor's metered proxy. Claidor counts the tokens against the account's monthly allowance and picks the model the person chose in the chat box. The server side lives in `server/polar/desktop` of this repository.

Test mode (the hidden switch in Settings → About) points the app at a local Claidor: API `http://127.0.0.1:8000`, web app `http://127.0.0.1:3000`. `MATIES_SERVER_BASE_URL` overrides the API address in development.

## Features

### Desktop Cowork Sessions

Run long-form agent tasks against local projects and files. Maties streams progress, keeps session history, renders tool output, and asks for approval before sensitive actions such as file operations, terminal commands or network access.

### Multiple Agents

Create agents with their own identity, model choice, skills, working directory and channel bindings. Six presets ship with the app: Document Writer, Spreadsheet Analyst, Presentation Builder, Meeting Notes, Research Assistant and Email Assistant.

### Skills

Seventeen skills are bundled (`SKILLs/skills.config.json`): Word documents, Excel spreadsheets, PowerPoint slides, PDF, web search, browser automation (Playwright), email (IMAP/SMTP), weather, Remotion video, web game and frontend design, canvas design, plan creation, local tools, and the skill, skin and skill-vetting creators.

### MCP Servers

Connect external tools and data sources through Model Context Protocol servers. Maties stores user-configured servers locally and syncs enabled servers into OpenClaw.

### Scheduled Tasks

Create recurring work either by conversation or through the scheduled task screen: daily digests, inbox summaries, website checks, weekly reports.

### Chat channels

Reach the desktop agent from Telegram and Discord. Different accounts or channels can be bound to different agents. (The upstream email channel was NetEase's hosted mail service and is retired; the email skill, which speaks plain IMAP and SMTP, stays.)

### Rich Artifacts

Preview and manage generated HTML, SVG, images, Mermaid diagrams, code, Markdown, text and documents inside the app.

### Local Memory And Data

Sessions and app data live locally in SQLite. OpenClaw workspace memory uses files such as `MEMORY.md`, `USER.md`, `SOUL.md` and daily notes, so durable preferences and project context carry across sessions.

## What was removed from the upstream app

Maties is English-only and built for a Western office. Compared with LobsterAI it drops:

- the Chinese messengers (WeChat, WeCom, DingTalk, Feishu, QQ, NetEase IM, NetEase Bee, POPO) and the NetEase-hosted email channel: their code is retired in `src/shared/platform/constants.ts` and never offered, and their OpenClaw plugins are not bundled;
- image and video generation, Youdao Note, the DeepSeek Harness runtime screen, voice input (Youdao speech recognition), credit campaigns and daily check-ins, the Windows Computer Use kit (its runtime was downloaded from NetEase's CDN), and usage analytics to Youdao (usage events now go to Claidor's API, which discards them, and only when the person allows statistics in Settings);
- the provider and API-key screens: the Model tab is now the Maties account screen (sign in, usage this month, available models);
- the Chinese-specific skills (stock research, Chinese content writing, music and film search, Seedance and Seedream media generation, Youdao Note, tech news);
- the Chinese dictionary of the interface. `LanguageType` still lists `'zh'` for compatibility, but the app always runs in English.

## Run From Source

Requirements:

- Node.js `>=24.15.0 <25` (`.npmrc` sets `engine-strict`)
- npm
- git and pnpm, needed on the first run to build the pinned OpenClaw runtime from the sibling `../openclaw` checkout

```bash
cd desktop
npm install
```

First development run:

```bash
npm run electron:dev:openclaw
```

Daily development after the pinned OpenClaw runtime exists:

```bash
npm run electron:dev
```

The renderer dev server runs at `http://localhost:5175`. The Claidor API must be running (`cd ../server && uv run task api`) and the app must be in test mode to reach it.

## Developing

```bash
npm run build              # production renderer bundle
npm run compile:electron   # Electron main/preload TypeScript build
npm test                   # Vitest
npm run lint               # ESLint across src
npx eslint --ext ts,tsx --report-unused-disable-directives --max-warnings 0 <files>
```

### OpenClaw Runtime

The pinned OpenClaw version and third-party plugin list live in `package.json` under `openclaw`.

```bash
npm run openclaw:runtime:host                       # build the current-platform runtime
OPENCLAW_SRC=/path/to/openclaw npm run electron:dev:openclaw
OPENCLAW_FORCE_BUILD=1 npm run electron:dev:openclaw
OPENCLAW_SKIP_ENSURE=1 npm run electron:dev:openclaw
```

## Packaging

The installers are built on their own OS (macOS, Windows, Linux): native modules are compiled for the host, and the `dist:*` scripts build the OpenClaw runtime for the requested target only.

```bash
npm ci
npx rimraf dist dist-electron
npm run dist:mac            # macOS, host architecture
npm run dist:mac:x64
npm run dist:mac:arm64
npm run dist:mac:universal
npm run dist:win            # Windows x64
npm run dist:linux
```

The app id is `com.claidor.maties`, the product name `Maties`, and the deep link scheme `maties://` (used as the sign-in fallback when the loopback callback cannot start). The icons under `build/` and `public/logo.png` are placeholders until a designed icon exists.

Updates, the skill store and the kit store are asked from the Claidor API under `/desktop`; until Claidor publishes releases and catalogues they answer « nothing newer » and « empty ».

## Project Map

| Path | Purpose |
| --- | --- |
| `src/main/main.ts` | Electron lifecycle, IPC registration, auth, logging, runtime startup and service wiring |
| `src/main/libs/endpoints.ts` | The Claidor addresses the main process talks to |
| `src/main/libs/openclawEngineManager.ts` | OpenClaw gateway process, runtime state, ports, logs, restart and repair |
| `src/main/libs/openclawConfigSync.ts` | Renders models, agents, channel bindings, skills, MCP and workspace instructions into OpenClaw config |
| `src/main/libs/agentEngine/openclawRuntimeAdapter.ts` | Translates OpenClaw gateway events into Cowork stream events |
| `src/main/coworkStore.ts` | Cowork sessions, messages, config, agents, memory metadata and SQLite CRUD |
| `src/main/presetAgents.ts` | The six office presets |
| `src/shared/platform/constants.ts` | The chat-channel registry, with the retired platforms marked |
| `src/renderer/components/cowork/` | Main Cowork UI, prompt input, session detail, permissions, tool display |
| `src/renderer/components/settings/MatiesAccountSection.tsx` | The account screen (sign in, usage, models) |
| `src/renderer/services/endpoints.ts` | The Claidor web pages the renderer opens |
| `src/renderer/services/i18n.ts` | The English dictionary and `t()` helper |
| `SKILLs/` | Bundled skills |

## Security And Data

- Renderer windows use context isolation, disabled Node integration and sandboxing.
- Renderer-to-main access goes through preload IPC APIs.
- Sensitive tool actions are permission-gated and logged.
- App data is stored locally in `maties.sqlite` under Electron `userData`.
- OpenClaw state, workspace memory, generated config and gateway logs live under `userData/openclaw`.

Read `CLAIDOR-NOTES.md` before relying on the engine's safety claims: the upstream app writes the engine's command-approval file to « security: full, ask: off », delete protection is a system-prompt instruction, commands from chat channels are auto-approved, and sandboxing is off outside enterprise accounts.

## License

[MIT License](LICENSE). Maties is derived from LobsterAI, built by [NetEase Youdao](https://www.youdao.com/); the MIT notices are kept in `LICENSE` and in the source.
