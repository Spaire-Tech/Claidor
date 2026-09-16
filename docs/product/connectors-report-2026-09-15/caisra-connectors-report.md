# Caisra — Connectors Report

> **CONFIDENTIAL — Bass only.** Private builder report for **Caisra Agents**. Do not redistribute.
>
> Generated: **Tue Sep 15, 2026 ~11:30 PM PT**. Catalog source: Cursor public marketplace `initialPlugins` (330). Live MCP: GetMcpTools. Skills: on-box managed + plugin caches.

---

## Executive summary

- **Caisra Agents** reach outside services through **connectors** (user-facing word for MCP servers). Connectors ship inside **plugins** (marketplace bundles of MCP servers + optional skills/rules/commands).
- This account’s **live connected connector count: 1** — Notion (`user-Notion`, status `ready`, 44 tools), from plugin `notion-workspace` (id **404**), with **14 plugin skills** cached on the box.
- Public marketplace catalog size: **330 plugins** (marketplace `cursor-public` / id 34). Of those: **271** declare ≥1 MCP server, **236** ship ≥1 skill.
- **FEATURED** curated set (6): Google Drive, Google Calendar, Gmail, Granola, Slack, Notion.
- Host plumbing tools (`SearchPlugins`, `GetPlugin`, `InstallPlugin`, `GetMcpServerStatus`, `GetDynamicTools`, `AuthenticateMcpServer`, …) are documented in managed skill `add-connector` and `/workspace/agent-system-contract.md` §24 — **not exposed to this executor subagent**. Catalog was recovered from marketplace HTML; install/auth state inferred from GetMcpTools + plugin cache + `settings.json`.
- Distinction that matters for builders:
  - **Plugin** = installable marketplace bundle (account-scoped, synced).
  - **Connector** = the MCP server the user talks about.
  - **Plugin skills** = SKILL.md packs that ride with a plugin.
  - **Cursor-managed skills** = platform skills under `/home/box/*/managed-skills/` (add-connector, no-connector-fallback, shopping, …) — not tied to a plugin install.

---

## Mechanism (end-to-end)

### Vocabulary (say this to users)

| Say to user | Plumbing |
|---|---|
| connector | MCP server |
| (avoid) | plugin, plugin id, MCP |

### Happy path: discover → install → auth → tools

1. **Figure out the service** (ask once if unnamed).
2. **`SearchPlugins`** (read-only, no confirm). Empty query = full catalog. Each hit: stable plugin id, `installed` flag, connectors/skills summary.
3. Branch:
   - **`installed=yes`** → don’t reinstall. `GetPlugin` / `GetMcpServerStatus`. If `needsAuth` → step 5. Else already connected; optionally `SetMcpInstructions` or `RestartMcpServers`.
   - **`installed=no`** → `GetPlugin` (only place that resolves **setup fields**, secrets, full connector+skill lists) → **confirm question widget** (“Add the \<name\> connector?”) → **end turn** → on next turn `InstallPlugin` with plugin id + `values` for setup fields.
   - **Nothing matches** → custom path (below) or say unavailable / box browser.
4. **Tools & skills appear on the NEXT message**, not the install turn.
5. **Auth**: connect card is **host-authored**. Emitted by `InstallPlugin` / `AddMcpServer` / `AuthenticateMcpServer`. Never paste OAuth links. Never compose a connector card via SendMessage. After card is up: finish unrelated work, **end turn**; user authorizes in place; agent resumes automatically.
6. Before calling tools: **`GetMcpTools` / `GetDynamicTools`** schema-check, then `CallMcpTool` / `CallDynamicTool`.

### Custom connectors (`AddMcpServer`)

- Remote HTTPS MCP: confirm widget → `AddMcpServer` with `url` + optional `headers` (token never in URL).
- Local command (`npx` / `uvx`): confirm → `command`/`args`/`env`; runs on the box and is shared across this user’s agents; Shell-install deps first.
- No connector + no endpoint + no command → tell user it isn’t connectable yet; websites → box browser (`no-connector-fallback`).

### Uninstall / restart / instructions

- Install / uninstall / restart / authenticate **change the account** → confirm with question widget first (explicit yes).
- Connect card itself is the user’s tap — no extra confirm.
- **`SetMcpInstructions`**: saves per-connector usage preference (how Caisra Agents should use it). Preference only — **no widget**.
- Settings also track `mcpCustomInstructions` / `mcpCustomInstructionsByServerId` / `mcpDisabledToolsByServerId` / `mcpBoxServers` (this account: all empty).

### MCP server states

Do **not** treat `needsAuth`, `error`, or `loading` as usable. Auth-pending: start `AuthenticateMcpServer` with stable server id (+ `account_label` if shown). **Do not** fall back to box browser for the same service while its auth is pending.

### Team / marketplace install modes (Cursor product)

From Cursor docs: team marketplace plugins can be **Default Off**, **Default On**, or **Required** (`team-default` / `team-required` still read `installed=yes` — nothing to install).

### No-connector fallback (order)

1. **`SearchPlugins`** for any service the task touches — prefer installable/connected connector (CSV/query) over reading charts off screen.
2. If connector exists but needs auth → `AuthenticateMcpServer` (not browser).
3. If no connector: box browser/desktop **without** a go-ahead widget when the user already asked for the outcome.
4. Sign-in: `ListCredentials` for current URL against 1Password vault **“Shared with …”** (titles/sites only; values never enter context) → credential-request fill → else `request_box_help` for SSO/passkey/captcha/payment.
5. Box CLIs (`gh`, `glab`, …): set up proactively; hand off device codes via `request_box_help`.
6. Some connectors post as an **app** not as the user — prefer box browser (signed-in as user) for send/reply-as-user; use connector for reads. Connector custom instructions carry this guidance when present.

### Auto-review / escalation order

1. Risky Shell / MCP / computerUse / CloudAgent (and similar) auto-checked; most pass.
2. On block: **adapt** to genuinely safer path (smaller scope, read vs write, sanctioned tool) — **not** cookie scraping, token-file reads, hand-driving signed-in browser to bypass, base64/rename tricks, or internal APIs when a sanctioned tool exists.
3. If block is necessary: **same-action retry** with approval flags (`request_smart_mode_approval` / `requestSmartModeApproval` + exact block reason) → user approval card.
4. One approval at a time; denied/expired → stop and report.
5. Public web: WebFetch block → browser/`curl` of same public page is a normal fallback.

### Connector cards

- Host-authored only (`InstallPlugin` / `AddMcpServer` / `AuthenticateMcpServer`).
- Available in 1:1 chat surface; degrade in external channels / rooms.

---

## This account — live state

| Item | Value |
|---|---|
| Installed plugins (box cache) | `notion-workspace` (404) |
| Live MCP servers (GetMcpTools) | `user-Notion` = **ready** (44 tools) |
| Custom MCP (`mcpBoxServers`) | none |
| Custom MCP instructions | none |
| Disabled tools by server | none |
| Plugin skills cached | 14 (all Notion) |
| Managed skills | 20 |

### Live Notion tool surface (`user-Notion`)

`notion-ai-search`, `notion-check-mcp-next-steps`, `notion-convert-page-to-skill`, `notion-create-attachment`, `notion-create-comment`, `notion-create-database`, `notion-create-file-upload`, `notion-create-folder`, `notion-create-pages`, `notion-create-view`, `notion-download-attachment`, `notion-download-skill`, `notion-duplicate-page`, `notion-fetch`, `notion-get-async-task`, `notion-get-comments`, `notion-get-session-status`, `notion-get-teams`, `notion-get-users`, `notion-list-favorite-pages`, `notion-list-private-pages`, `notion-list-recent-pages`, `notion-list-session-events`, `notion-list-shared-pages`, `notion-move-pages`, `notion-query-data-sources`, `notion-query-meeting-notes`, `notion-query-multiple-data-sources`, `notion-query-sessions`, `notion-read-session-event`, `notion-search`, `notion-search-agents`, `notion-search-sessions`, `notion-search-skills`, `notion-send-message-to-session`, `notion-show-advanced-analysis-next-steps`, `notion-spawn-session`, `notion-stop-session`, `notion-update-data-source`, `notion-update-folder`, `notion-update-page`, `notion-update-view`, `notion-upload-skill`, `notion-wait-session`

---

## Deep sections — installed + top first-party

### Notion (`notion-workspace`, id 404) — **INSTALLED / CONNECTED**

- **What it does:** Notion Skills + Notion MCP (`https://mcp.notion.com/mcp`, HTTP) — search/read/create/update workspace content, tasks, databases, agents/sessions, skills.
- **Categories:** FEATURED, PRODUCTIVITY, DOCUMENTS_AND_FILES
- **Connectors:** 1 (`notion` → runtime server id `user-Notion`)
- **Skills (14):**
  - `create-database-row` — Insert a new row into a specified Notion database using natural-language property values. Handles property name matching and validation.
  - `create-page` — Create a new Notion page, optionally under a specific parent. Automatically structures content based on page type (meeting notes, project pages, etc.).
  - `create-task` — Create a new task in the user's Notion tasks database with sensible defaults for due date, status, owner, and project.
  - `database-query` — Query a Notion database by name or ID and return structured, readable results with optional filters and sorting.
  - `find` — Quickly find pages or databases in Notion by title keywords. Returns precise matches rather than comprehensive results.
  - `knowledge-capture` — Transform conversations and discussions into structured documentation pages in Notion. Captures insights, decisions, and knowledge from chat context with proper organization and linking.
  - `meeting-intelligence` — Prepare meeting materials by gathering context from Notion, enriching with research, and creating both an internal pre-read and external agenda saved to Notion.
  - `research-documentation` — Search across your Notion workspace, synthesize findings from multiple pages, and create comprehensive research documentation with proper citations and actionable insights.
  - `search` — Search the user's Notion workspace using the Notion MCP server. Use for finding pages, databases, and content by keywords or natural-language queries.
  - `spec-to-implementation` — Turn product or tech specs into concrete Notion tasks. Breaks down spec pages into detailed implementation plans with clear tasks, acceptance criteria, and progress tracking.
  - `tasks-build` — Build a task from a Notion page URL. Fetches task details, marks it in progress, implements the work, and updates status in Notion.
  - `tasks-explain-diff` — Generate a rich Notion document explaining code changes. Creates comprehensive documentation with background, intuition, code walkthrough, and verification steps.
  - `tasks-plan` — Create an implementation plan from a Notion task or specification. Breaks down requirements into actionable steps with estimates and dependencies.
  - `tasks-setup` — Set up a Notion task board for tracking tasks. Guides users through using a template or connecting an existing board.
- **Publisher:** Notion (verified)
- **Git:** https://github.com/makenotion/cursor-notion-plugin

### FEATURED catalog (not all installed here)

#### Google Drive (`google-drive`, id 45893413)
- Search, read, create, and share files.
- MCP: `google-drive` · Skills: **0**

#### Google Calendar (`google-calendar`, id 45893411)
- Search events and schedule meetings.
- MCP: `google-calendar` · Skills: **0**

#### Gmail (`gmail`, id 45893410)
- Search, read, draft, and manage email.
- MCP: `gmail` · Skills: **0**

#### Granola (`granola`, id 5609)
- Your meetings in your workflow. Granola gives Cursor access to what your team discussed, decided, and committed to.
- MCP: `granola` · Skills: **3**
  - `granola-context` — Look up what was discussed or decided in meetings. Use when someone asks about a past discussion, needs to recall a decision, or references something that was t
  - `granola-prep` — Prepare for an upcoming meeting by pulling context from previous ones. Use when someone mentions they have a meeting coming up, or asks to be prepped for a conv
  - `granola-review` — Check current work against meeting decisions before submitting. Use when someone wants to verify their implementation, draft, or plan matches what was agreed.

#### Slack (`slack`, id 674)
- Slack MCP server. Search channels, send messages, and perform other Slack actions through MCP-compatible clients.
- MCP: `slack` · Skills: **6**
  - `block-kit` — Help developers build and validate Block Kit layouts for Slack messages, modals, and Home tabs. Provides authoritative block references and validates with the b
  - `create-slack-app` — Guide developers through creating a Slack app or agent using the Slack CLI and Bolt (JS or Python). Handles prerequisites, sandbox setup, authentication, projec
  - `slack-api` — Discover, navigate, and call Slack Web API methods (the family.method endpoints at slack.com/api like chat.postMessage, conversations.history, users.info, views
  - `slack-cli` — Use the Slack CLI to create, run, and manage Slack apps from the terminal. Use whenever the developer wants to log in, add a team, switch workspaces, or authent
  - `slack-messaging` — Guidance for composing well-formatted, effective Slack messages using standard markdown
  - `slack-search` — Guidance for effectively searching Slack to find messages, files, channels, and people

#### Notion (`notion-workspace`, id 404) **INSTALLED**
- Notion Skills + Notion MCP server packaged as a Cursor plugin.
- MCP: `notion` · Skills: **14**

### Other high-value first-party / popular connectors

#### Slack (`slack`, id 674)
- Slack MCP server. Search channels, send messages, and perform other Slack actions through MCP-compatible clients.
- Categories: FEATURED, PRODUCTIVITY · MCP×1 · Skills×6
- Skills: `block-kit`, `create-slack-app`, `slack-api`, `slack-cli`, `slack-messaging`, `slack-search`

#### Linear (`linear`, id 512)
- The product development system for teams and agents. Manage issues, projects, documents, and everything else across your Linear workspace.
- Categories: PRODUCTIVITY · MCP×1 · Skills×0

#### Figma (`figma`, id 657)
- Plugin that includes the Figma MCP server and Skills for common workflows
- Categories: PRODUCTIVITY, DESIGN · MCP×1 · Skills×14
- Skills: `figma-code-connect`, `figma-create-new-file`, `figma-design-to-code`, `figma-generate-design`, `figma-generate-diagram`, `figma-generate-library`, `figma-generative-plugins`, `figma-implement-motion`, `figma-shaders`, `figma-swiftui`, `figma-use`, `figma-use-figjam`, `figma-use-motion`, `figma-use-slides`

#### Granola (`granola`, id 5609)
- Your meetings in your workflow. Granola gives Cursor access to what your team discussed, decided, and committed to.
- Categories: FEATURED, PRODUCTIVITY, SALES · MCP×1 · Skills×3
- Skills: `granola-context`, `granola-prep`, `granola-review`

#### GitHub (`github`, id 48677658)
- Manage repos, issues, pull requests, and Actions.
- Categories: — · MCP×1 · Skills×0

#### Composio (`composio`, id 32661537)
- Connect and operate 1000+ external apps from Cursor via the Composio MCP server. Managed OAuth, intelligent tool routing, and a remote sandbox for bulk data processing.
- Categories: AGENT_ORCHESTRATION · MCP×1 · Skills×2
- Skills: `composio-activity-summary`, `composio-mcp`

#### Supabase (`supabase`, id 652)
- Access your Supabase projects and perform tasks like managing tables, fetching config, and querying data.
- Categories: INFRASTRUCTURE · MCP×1 · Skills×2
- Skills: `supabase-postgres-best-practices`, `supabase`

#### Sentry (`sentry`, id 579)
- Sentry Plugin for Cursor to help with debugging including MCP and skill capabilities.
- Categories: INFRASTRUCTURE · MCP×1 · Skills×7
- Skills: `sentry-create-alert`, `sentry-debug-issue`, `sentry-feature-setup`, `sentry-get-started`, `sentry-instrument`, `sentry-otel-exporter-setup`, `sentry-snapshots-cocoa`

#### GitLab (`gitlab`, id 1220)
- Connect Cursor to GitLab with the GitLab MCP server. Plan, track, and manage issues, merge requests, and pipelines from your editor.
- Categories: PRODUCTIVITY · MCP×1 · Skills×1
- Skills: `gitlab-ci-author`

#### Stripe (`stripe`, id 408)
- Stripe plugin for Cursor to help with Stripe integrations including best practices, API/SDK upgrade guidance, and the Stripe MCP server.
- Categories: PAYMENTS · MCP×1 · Skills×7
- Skills: `connect-recommend`, `stripe-apps`, `stripe-best-practices`, `stripe-directory`, `stripe-docs`, `stripe-projects`, `upgrade-stripe`

#### Prisma (`prisma`, id 353)
- The official Prisma plugin for Cursor: MCP server integration, rules, skills, and automation for database development
- Categories: DATA_ANALYTICS · MCP×2 · Skills×40
- Skills: `prisma-cli-db-execute`, `prisma-cli-db-pull`, `prisma-cli-db-push`, `prisma-cli-db-seed`, `prisma-cli-debug`, `prisma-cli-dev`, `prisma-cli-format`, `prisma-cli-generate`, `prisma-cli-init`, `prisma-cli-migrate-deploy`, `prisma-cli-migrate-dev`, `prisma-cli-migrate-diff`, `prisma-cli-migrate-reset`, `prisma-cli-migrate-resolve`, `prisma-cli-migrate-status`, `prisma-cli-studio`, `prisma-cli-validate`, `prisma-client-api-client-methods`, `prisma-client-api-constructor`, `prisma-client-api-filters`…

#### Vercel (`vercel`, id 649)
- Build and deploy web apps and agents
- Categories: INFRASTRUCTURE · MCP×1 · Skills×33
- Skills: `access-protected-vercel-deployment`, `ai-gateway`, `ai-sdk`, `auth`, `bootstrap`, `build-agents`, `cdn-caching`, `chat-sdk`, `deployments-cicd`, `env-vars`, `eve`, `knowledge-update`, `marketplace`, `microfrontends`, `next-cache-components`, `next-forge`, `next-upgrade`, `nextjs`, `react-best-practices`, `routing-middleware`…

#### PostHog (`posthog`, id 730)
- Access PostHog analytics, feature flags, experiments, error tracking, and insights directly from Cursor
- Categories: DATA_ANALYTICS · MCP×1 · Skills×73
- Skills: `analyzing-experiment-session-replays`, `assessing-heatmaps`, `auditing-endpoints`, `auditing-experiments-flags`, `auditing-warehouse-data-health`, `authoring-log-alerts`, `authoring-signals-scouts`, `cleaning-up-stale-feature-flags`, `configuring-experiment-analytics`, `configuring-experiment-rollout`, `consuming-endpoints-from-client-code`, `copying-flags-across-projects`, `creating-an-endpoint`, `creating-experiments`, `creating-replay-vision-scanners`, `debugging-local-replay`, `debugging-signals-pipeline`, `diagnosing-endpoint-performance`, `diagnosing-experiment-results`, `diagnosing-failed-warehouse-syncs`…

---

## Skills inventory

### A) Cursor-managed skills (platform — always present)

| Skill id | Description (short) |
|---|---|
| `add-connector` | Walk through connecting a new MCP connector — search the catalog, install, and authenticate. |
| `export-bot-template` | Create a shareable copy of this bot's setup. Use when the user wants to share or export this bot. |
| `flight-booking` | When the user asks you to find, compare, book, change, or check in for a flight, look up an itinerary, or fetch a boarding pass, before you search any airline o |
| `food-ordering` | When the user asks you to order food for delivery or pickup, reorder a usual meal, get a specific dish brought to them, or says they are hungry and wants you to |
| `restaurant-booking` | When the user asks you to book, reserve, or hold a restaurant table, check what times a named restaurant has open, or find somewhere with a table for a given ni |
| `restaurant-recommendations` | When the user asks where or what to eat out, wants restaurant ideas or a comparison for a date, group, trip, or occasion, or asks for the best places matching t |
| `rideshare` | When the user asks you to get them a ride, call a car, or book an Uber, Lyft, Bolt, Grab, or another rideshare for now or for a set time, before you open the se |
| `scheduling` | When the user mentions their calendar, a meeting, their availability, coordinating a time with other people, a recurring reminder, an appointment to book, or an |
| `shopping` | When the user asks you to buy, order, reorder, or compare a product on Amazon or any other retail site, or sends a product link to purchase, before you open the |
| `learn-from-demonstration` | Turn a screen-recorded demonstration on your computer into a reusable skill. Use when a teach recording finishes. |
| `routines` | When the user asks for anything recurring, scheduled, or event-driven — a reminder, digest, monitor, "let me know when", or a change to an existing routine — be |
| `code-changes` | When the user asks for a new code project or app, a feature, a bug fix, a refactor, or an investigation of how code behaves in a repository, before you start on |
| `box-desktop` | When a task needs your own desktop or browser — a website with no connector, a GUI app, a sign-in only the user can complete — before you dispatch the first bro |
| `no-connector-fallback` | When a service the user needs has no connector, a connector is missing or needs installing or auth, a box CLI such as `gh` needs a login, or a browser workflow  |
| `in-chat-forms` | REQUIRED before any typed web step (login, checkout address, phone, OTP) and before request_box_help for those steps. Prefer request_user_form when fields look  |
| `channels` | When you are woken by an [inbound] message or reaction from an outside messaging channel, or the user asks to connect or disconnect one. |
| `group-chat-turns` | When a user message starts with a [room "…"] tag: you are taking a turn in a group chat room, not your private chat, so read this before replying. |
| `purchases` | When the user asks you to buy, book, order, or pay for something — read before you start shopping or booking, not only at checkout. |
| `send-on-behalf` | When the user asks you to write, draft, reply to, or send an email or message as them on an outside platform (Slack, email, another chat app). |
| `skill-authoring` | When you notice a reusable multi-step task worth saving, or the user asks you to save, change, or delete a skill. |

Paths (either symlink tree): `/home/box/sand-data/managed-skills/skills/<id>/SKILL.md` (also mirrored under `agent-data`).

**Connector-specific managed skills:**
- `add-connector` — full install/auth walkthrough.
- `no-connector-fallback` — browser / 1Password Shared vault / CLI fallback + plugin management norms.

### B) Plugin skills (this account)

| Skill id | Plugin | Name |
|---|---|---|
| `plugin-404-create-database-row` | `notion-workspace` (404) | `create-database-row` |
| `plugin-404-create-page` | `notion-workspace` (404) | `create-page` |
| `plugin-404-create-task` | `notion-workspace` (404) | `create-task` |
| `plugin-404-database-query` | `notion-workspace` (404) | `database-query` |
| `plugin-404-find` | `notion-workspace` (404) | `find` |
| `plugin-404-knowledge-capture` | `notion-workspace` (404) | `knowledge-capture` |
| `plugin-404-meeting-intelligence` | `notion-workspace` (404) | `meeting-intelligence` |
| `plugin-404-research-documentation` | `notion-workspace` (404) | `research-documentation` |
| `plugin-404-search` | `notion-workspace` (404) | `search` |
| `plugin-404-spec-to-implementation` | `notion-workspace` (404) | `spec-to-implementation` |
| `plugin-404-tasks-build` | `notion-workspace` (404) | `tasks-build` |
| `plugin-404-tasks-explain-diff` | `notion-workspace` (404) | `tasks-explain-diff` |
| `plugin-404-tasks-plan` | `notion-workspace` (404) | `tasks-plan` |
| `plugin-404-tasks-setup` | `notion-workspace` (404) | `tasks-setup` |

### C) Skills packed in marketplace (catalog-wide)

- Plugins with skills: **236** / 330
- Plugins with MCP connectors: **271** / 330
- Highest skill counts (examples): scandit-sdk (74), posthog (73), twilio-developer-kit (57), kraken-cli (51), prisma (40), vercel (33), …

---

## Catalog table — all 330 marketplace plugins

| id | name | installed? | categories | connectors | skills | what it does |
|---|---|---|---|---:|---:|---|
| 404 | `notion-workspace` / Notion | yes | FEATURED,PRODUCTIVITY,DOCUMENTS_AND_FILES | 1 | 14 | Notion Skills + Notion MCP server packaged as a Cursor plugin. |
| 7851 | `scandit-sdk` / Scandit | no | — | 0 | 74 | AI agent skills for integrating the Scandit Data Capture SDK — product selection, documentation, and implementation guid |
| 730 | `posthog` / PostHog | no | DATA_ANALYTICS | 1 | 73 | Access PostHog analytics, feature flags, experiments, error tracking, and insights directly from Cursor |
| 9105 | `twilio-developer-kit` / Twilio | no | INFRASTRUCTURE | 1 | 57 | Twilio Skills and MCP provide procedural knowledge for AI coding agents — which APIs to use, in what order, and what to  |
| 26159727 | `kraken-cli` / Kraken | no | PAYMENTS | 1 | 51 | Agent-first CLI for trading crypto, stocks, forex, and derivatives on Kraken. Paper trading by default; live trading opt |
| 9717366 | `pstack` / pstack | no | — | 0 | 47 | if you want to go fast, go deep first. pstack helps you write less, but higher quality code. rigorous agent workflows yo |
| 56235003 | `elevenlabs` / ElevenLabs | no | — | 1 | 42 | ElevenLabs voice AI — text-to-speech, voice agents, and speech engine skills, agent management via the ElevenLabs hosted |
| 353 | `prisma` / Prisma | no | DATA_ANALYTICS | 2 | 40 | The official Prisma plugin for Cursor: MCP server integration, rules, skills, and automation for database development |
| 649 | `vercel` / Vercel | no | INFRASTRUCTURE | 1 | 33 | Build and deploy web apps and agents |
| 4457 | `cockroachdb` / CockroachDB | no | INFRASTRUCTURE | 3 | 32 | CockroachDB plugin for Cursor — explore schemas, write optimized SQL, debug queries, and manage distributed database clu |
| 680 | `compound-engineering` / Compound Engineering | no | AGENT_ORCHESTRATION | 0 | 32 | Brainstorm, plan, debug, review, and compound learnings with AI agents |
| 51244788 | `dynatrace` / Dynatrace | no | — | 1 | 30 | Dynatrace observability skills. DQL query patterns, application and infrastructure monitoring, log analysis, problem inv |
| 8006 | `harness` / Harness | no | PRODUCTIVITY | 1 | 30 | Harness Skills + Harness MCP server packaged as a Cursor plugin. Build, debug, deploy, and govern via Harness from Curso |
| 47679354 | `meta-vr` / Meta Reality Labs | no | — | 1 | 29 | Agent skills for Meta Quest and Horizon OS development. Helps Claude assist with Quest app debugging, performance analys |
| 6392 | `azure` / Azure | no | INFRASTRUCTURE | 1 | 27 | Microsoft Azure MCP and Skills integration for cloud resource management, deployments, and Azure services. Manage your A |
| 786 | `amplitude` / Amplitude | no | DATA_ANALYTICS | 1 | 26 | Use Amplitude like an expert - instrument analytics, discover product opportunities, analyze charts, create dashboards,  |
| 4331 | `elastic` / Elastic | no | DATA_ANALYTICS | 1 | 26 | Elastic skills and documentation — Elasticsearch, Kibana, Observability, Security, Cloud, ES\|QL, OpenTelemetry, and MCP |
| 26098678 | `aws-core` / AWS Core | no | INFRASTRUCTURE | 1 | 24 | Build, deploy, and operate applications on AWS. Skills to author infrastructure-as-code (CDK, CloudFormation), use core  |
| 63834585 | `dart-flutter` / Dart and Flutter | no | — | 1 | 24 | Official Cursor plugin for Dart and Flutter that installs Flutter/Dart Skills and Dart MCP server for building natively  |
| 1090 | `webflow` / Webflow | no | PRODUCTIVITY | 1 | 22 | Production-ready agent skills for Webflow - CMS management, site auditing, asset optimization, and safe publishing |
| 3780 | `encore` / Encore | no | INFRASTRUCTURE | 1 | 21 | Build backends in TypeScript and Go with automatic infrastructure. Includes MCP integration for inspecting services, que |
| 1295 | `render` / Render | no | INFRASTRUCTURE | 1 | 21 | Deploy, debug, and monitor applications on Render. Includes skills, rules, commands, an agent, MCP config, and hooks for |
| 4450 | `astronomer-data` / Astronomer | no | DATA_ANALYTICS | 0 | 21 | Data engineering plugin - warehouse exploration, pipeline authoring, Airflow integration |
| 3970 | `shopify-plugin` / Shopify | no | PAYMENTS | 0 | 21 | Shopify developer tools for Cursor — search Shopify docs, generate and validate GraphQL, Liquid, and UI extension code.  |
| 710 | `clerk` / Clerk | no | INFRASTRUCTURE | 1 | 20 | Clerk authentication toolkit for Cursor - setup guides, MCP server, and specialized skills for frameworks, mobile apps,  |
| 26087977 | `revenuecat-play-billing` / RevenueCat Play Billing | no | PAYMENTS | 0 | 20 | Deep Google Play subscription lifecycle skills for the RevenueCat Android SDK — purchases, plan and price changes, payme |
| 734 | `glean` / Glean | no | PRODUCTIVITY,DOCUMENTS_AND_FILES | 1 | 19 | Official Glean plugin — search documents, Slack, and email; explore code across repos; find experts and stakeholders; pr |
| 741 | `planetscale` / PlanetScale | no | INFRASTRUCTURE | 1 | 19 | An authenticated hosted MCP server that accesses your PlanetScale organizations, databases, branches, schema, and Insigh |
| 6199 | `sagemaker-ai` / AWS SageMaker | no | AGENT_ORCHESTRATION | 1 | 19 | Build, train, and deploy AI models with deep AWS AI/ML expertise brought directly into your coding assistants, covering  |
| 735 | `huggingface-skills` / Hugging Face | no | DATA_ANALYTICS | 1 | 18 | Agent Skills for AI/ML tasks including dataset creation, model training, evaluation, and research paper publishing on Hu |
| 677 | `cursor-team-kit` / Cursor Team Kit | no | — | 0 | 18 | Internal engineering team workflows for CI, code review, shipping, control-cli, control-ui, verify-this, test reliabilit |
| 56634535 | `catalyst-by-zoho` / Catalyst by Zoho | no | — | 1 | 16 | AI agent skill for Catalyst by Zoho — full-stack serverless cloud platform. Covers all services, SDKs, CLI, architecture |
| 5648 | `mem0` / Mem0 | no | — | 1 | 16 | Mem0 memory layer for AI applications. Add persistent memory, personalization, and semantic search using the Mem0 Platfo |
| 41749318 | `observe` / Observe by Snowflake | no | DATA_ANALYTICS | 1 | 16 | Agent skills and MCP configuration for deploying and managing Observe's observability infrastructure |
| 53566285 | `mailgun-cursor` / Mailgun | no | INBOX_AND_COLLABORATION | 1 | 15 | Mailgun workflows for Cursor: sending, deliverability triage, DNS verification, suppressions, templates, Inspect, Optimi |
| 8279 | `sinch-cursor-plugin` / Sinch | no | — | 1 | 15 | Ship faster with Sinch in Cursor - SMS, WhatsApp, RCS, voice, email, verification, numbers, and more, all with the help  |
| 800 | `launchdarkly` / LaunchDarkly | no | PRODUCTIVITY | 2 | 14 | LaunchDarkly agent skills and mcp server for feature flag management, AI configuration, and skill authoring |
| 657 | `figma` / Figma | no | PRODUCTIVITY,DESIGN | 1 | 14 | Plugin that includes the Figma MCP server and Skills for common workflows |
| 32766883 | `ramp` / Ramp | no | PAYMENTS,FINANCE_AND_LEGAL | 1 | 14 | Connect Cursor to Ramp via MCP and drive spend analysis, approvals, transaction cleanup, and vendor workflows. |
| 26087976 | `revenuecat` / RevenueCat | no | PAYMENTS | 1 | 14 | Configure your RevenueCat integration and access data from your RevenueCat projects. |
| 32610026 | `zoominfo` / ZoomInfo | no | SALES | 1 | 14 | Connect AI agents to ZoomInfo's verified GTM context graph: 100M companies, 300M professional contacts, buyer intent sig |
| 684 | `superpowers` / Superpowers | no | AGENT_ORCHESTRATION | 0 | 14 | Core skills library: TDD, debugging, collaboration patterns, and proven techniques |
| 42859383 | `resolve-ai` / Resolve AI | no | — | 1 | 13 | Use Resolve for investigations, incidents, and production context. |
| 7624 | `datarobot-agent-skills` / DataRobot | no | AGENT_ORCHESTRATION | 0 | 13 | A collection of DataRobot agent skills for model training, deployment, predictions, monitoring, and more. |
| 20992516 | `netlify-skills` / Netlify | no | INFRASTRUCTURE | 0 | 13 | Netlify platform skills — functions, edge functions, blobs, database, identity, image CDN, forms, config, CLI, framework |
| 760 | `endorlabs` / Endor Labs Agent Kit | no | — | 1 | 12 | Endor Labs Agent Kit setup and security workflow agents and skills for Cursor. |
| 55065452 | `tuist` / Tuist | no | — | 1 | 12 | Work with Tuist projects from Cursor: migrate Xcode projects to generated workspaces, debug generation, and query builds |
| 23114788 | `arize-skills` / Arize | no | AGENT_ORCHESTRATION | 0 | 12 | Add Arize AX observability to LLM applications — auto-instrumentation, trace export, dataset management, experiment work |
| 49339676 | `remotion` / Remotion | no | — | 0 | 12 | Remotion video creation skills — best practices, animations, audio, captions, 3D, and more for building programmatic vid |
| 26119850 | `confidence` / Confidence by Spotify | no | DATA_ANALYTICS | 2 | 11 | Access Confidence feature flags, experiments, and migration tools directly from Cursor. |
| 53497710 | `context-dev` / Context.dev | no | RESEARCH | 1 | 11 | Search, scrape, crawl, extract, parse, monitor, and process the live web with Context.dev. |
| 3777 | `firebase` / Firebase | no | INFRASTRUCTURE | 1 | 11 | The official Firebase Cursor plugin. Prototype, build, and run modern apps with Firebase's backend and AI infrastructure |
| 53576511 | `crowdstrike-falcon-foundry` / CrowdStrike Falcon Foundry | no | — | 0 | 11 | CrowdStrike Falcon Foundry development skills for building cybersecurity applications on the Falcon platform. Includes U |
| 4902 | `appwrite-plugin` / Appwrite | no | INFRASTRUCTURE | 2 | 10 | The Appwrite plugin for Cursor includes skills and MCP servers, allowing AI agents to access your projects and correctly |
| 9297 | `subtext` / Subtext | no | AGENT_ORCHESTRATION | 2 | 10 | Review Subtext session recordings and manage privacy rules |
| 26723531 | `databricks` / Databricks | no | — | 0 | 10 | Databricks skills for the CLI, Apps, Lakebase, Model Serving, Lakeflow Jobs, Spark Declarative Pipelines, Declarative Au |
| 789 | `firecrawl` / Firecrawl | no | DATA_ANALYTICS | 0 | 10 | Web scraping, crawling, and search for AI agents. Gives Cursor full access to web content through the Firecrawl CLI. |
| 9294 | `chainguard` / Chainguard | no | — | 4 | 9 | Secure container images and hardened library dependencies powered by Chainguard. Query images, check advisories, manage  |
| 407 | `cloudflare` / Cloudflare | no | INFRASTRUCTURE | 4 | 9 | Skills for the Cloudflare developer platform: Workers, Durable Objects, Agents SDK, MCP servers, Wrangler CLI, and web p |
| 32922580 | `1inch-mcp` / 1inch | no | PAYMENTS | 1 | 9 | Quote and execute intent-based (Fusion) and cross-chain token swaps, build and manage limit orders, and call any 1inch p |
| 26098679 | `aws-data-analytics` / AWS Data Analytics | no | DATA_ANALYTICS | 1 | 9 | Data lake, analytics, search, and ETL workflows with S3 Tables, AWS Glue, Athena, Amazon Redshift, and Amazon OpenSearch |
| 2804 | `circle` / Circle | no | PAYMENTS | 1 | 9 | Ship stablecoin apps faster. Best-practice skills for USDC payments, cross-chain transfers, wallets, and smart contracts |
| 20784535 | `sonarqube` / SonarQube | no | — | 1 | 9 | Automatically enforce SonarQube code quality and security in the agent coding loop — 7,000+ rules, secrets scanning, age |
| 3795 | `dbt` / dbt Labs | no | DATA_ANALYTICS | 0 | 9 | Agent skills for dbt: data modeling, analytics engineering, semantic layer metrics, unit testing, job troubleshooting, a |
| 704 | `phantom-connect` / Phantom | no | PAYMENTS | 2 | 8 | Give your agent a wallet. Swap, sign, and manage addresses across Phantom's supported chains — and tap into Phantom's do |
| 48668144 | `agentmail` / AgentMail | no | INBOX_AND_COLLABORATION | 1 | 8 | AI-native email infrastructure for coding agents. Create inboxes, send and receive emails, manage threads, and automate  |
| 22025095 | `airtable` / Airtable | no | PRODUCTIVITY | 1 | 8 | Airtable is the database and operations layer for your agents — whether running product, marketing, sales, ops, HR, or a |
| 26098676 | `aws-agents` / AWS Agents | no | AGENT_ORCHESTRATION | 1 | 8 | Build, deploy, and operate AI agents on AWS. Skills for scaffolding agents with Amazon Bedrock AgentCore (Strands, LangG |
| 669 | `neon-postgres` / Neon Postgres | no | INFRASTRUCTURE | 1 | 8 | Manage your Neon projects, databases, and branches with the Neon agent skills and the Neon MCP Server |
| 4339 | `pinecone` / Pinecone | no | INFRASTRUCTURE | 1 | 8 | Pinecone vector database integration for Cursor. Create and manage indexes, upsert data, and run semantic searches via t |
| 26156871 | `dataverse` / Microsoft Dataverse | no | — | 0 | 8 | Microsoft Dataverse plugin for coding agents — powering CRUD, bulk data operations, advanced queries, schema lifecycle,  |
| 7194 | `gsap-skills` / GSAP | no | PRODUCTIVITY | 0 | 8 | Official GSAP skills for Cursor, Claude and other AI agents — core animations, timelines, ScrollTrigger, plugins, utilit |
| 2729 | `omni-analytics` / Omni | no | DATA_ANALYTICS | 0 | 8 | Explore, query, model, embed, and manage Omni Analytics through the REST API and embed SDK. Includes 8 skills for model  |
| 729 | `clickhouse-cursor-plugin` / ClickHouse | no | DATA_ANALYTICS | 1 | 7 | ClickHouse Cursor plugin: skills (ClickHouse best practices), rules and MCP. |
| 233 | `convex` / Convex | no | INFRASTRUCTURE | 1 | 7 | Official Convex plugin for Cursor - reactive backend development with TypeScript, including rules, skills, MCP integrati |
| 1291 | `jfrog` / JFrog | no | INFRASTRUCTURE | 1 | 7 | JFrog Platform integration with MCP, security skills, Agent Package Resolution, supply-chain best practices, and JFrog A |
| 60302089 | `knock` / Knock | no | — | 1 | 7 | Notify users across email, in-app, and more |
| 55650410 | `mcp-mail` / Superhuman Mail | no | INBOX_AND_COLLABORATION | 1 | 7 |  |
| 47739056 | `meticulous` / Meticulous | no | — | 1 | 7 | Agent skills for Meticulous visual regression testing — review test runs, investigate replays, debug diffs. |
| 21010834 | `monday-crm` / Monday.com | no | PRODUCTIVITY | 1 | 7 | Seven skills for monday CRM users — first-run setup, morning briefings, forecast dashboards, board diagnosis, bulk data  |
| 3277 | `mongodb` / MongoDB | no | INFRASTRUCTURE | 1 | 7 | Connect to any MongoDB deployment (Community, Enterprise Advanced, local dev container via Atlas CLI or Atlas clusters)  |
| 26126658 | `roboflow` / Roboflow | no | — | 1 | 7 | Roboflow computer vision skills and MCP tools for datasets, annotation, training, workflows, inference, and deployment. |
| 579 | `sentry` / Sentry | no | INFRASTRUCTURE | 1 | 7 | Sentry Plugin for Cursor to help with debugging including MCP and skill capabilities. |
| 408 | `stripe` / Stripe | no | PAYMENTS | 1 | 7 | Stripe plugin for Cursor to help with Stripe integrations including best practices, API/SDK upgrade guidance, and the St |
| 3165 | `tavily` / Tavily | no | — | 1 | 7 | Web search, content extraction, crawling, deep research, and URL discovery. MCP tools plus skills; CLI for terminal agen |
| 57280658 | `crowdstrike-falcon-fusion` / CrowdStrike Falcon Fusion | no | — | 0 | 7 | CrowdStrike Falcon Fusion skills for authoring, deploying, and executing Fusion workflows. Includes live action discover |
| 12836227 | `revolut-x` / Revolut X | no | PAYMENTS | 0 | 7 | Use the Revolut X CLI (revx) for crypto trading, market data, monitoring, and grid bot strategies |
| 6391 | `forge-skills` / Atlassian Forge | no | PRODUCTIVITY | 2 | 6 | Forge app builder skill bundle with Forge MCP integration for building, deploying, and troubleshooting Atlassian Forge a |
| 52586767 | `airwallex-dev` / Airwallex Developer | no | PAYMENTS | 1 | 6 | Airwallex integration skills for Cursor. Code-generation workflows that scaffold, configure, and wire Airwallex APIs int |
| 717 | `atlassian` / Atlassian MCP | no | PRODUCTIVITY | 1 | 6 | Atlassian plugin for Cursor with MCP and skills for Jira, Confluence, triage, backlogs, status reports, and more. |
| 3317 | `aws-serverless` / AWS Serverless | no | INFRASTRUCTURE | 1 | 6 | Design, build, deploy, test, and debug serverless applications with AWS Serverless services. |
| 4793 | `bright-data` / Bright Data | no | DATA_ANALYTICS | 1 | 6 | Web search, content extraction, structured data, and browser automation powered by Bright Data's web intelligence platfo |
| 2507579 | `buildkite` / Buildkite | no | — | 1 | 6 | Buildkite MCP server and skills for common CI/CD workflows (designing pipelines, troubleshooting builds plus agent runti |
| 32197178 | `canva` / Canva | no | PRODUCTIVITY,DESIGN | 1 | 6 | Create, edit, review, resize, and brand-check Canva designs with the Canva MCP server. |
| 21020287 | `devtools-for-agents` / Chrome Devtools for Agents | no | — | 1 | 6 | Help your agent build, debug, and verify your code correctly. With Chrome DevTools for agents, your AI agent can interac |
| 53761261 | `dropbox` / Dropbox | no | — | 1 | 6 | The Dropbox plugin for Cursor connects your Dropbox files directly to Cursor, so you can search, reference, and organize |
| 1410 | `firetiger` / Firetiger | no | AGENT_ORCHESTRATION | 1 | 6 | Cursor plugin for Firetiger agentic operations plugin with skills and MCP access. |
| 39789426 | `gitbook` / GitBook | no | PRODUCTIVITY | 1 | 6 | Create, configure, and author GitBook documentation sites — site orchestration via the GitBook REST API, Git Sync setup, |
| 33865099 | `magic-patterns` / Magic Patterns | no | — | 1 | 6 | Use Magic Patterns (magicpatterns.com) from Cursor: prototype ideas, generate UI inspiration, upload local UI, and integ |
| 47235838 | `mongodb-atlas` / MongoDB Atlas | no | — | 1 | 6 | Connect to MongoDB Atlas clusters only through the Atlas Managed MCP Server. Sign in with your Atlas account to explore  |
| 60310094 | `pi-security` / Pi Security | no | — | 1 | 6 | Use Pi Security in Cursor IDE to investigate findings, review security posture, plan remediation, and get guidance while |
| 674 | `slack` / Slack | no | FEATURED,PRODUCTIVITY | 1 | 6 | Slack MCP server. Search channels, send messages, and perform other Slack actions through MCP-compatible clients. |
| 21002971 | `app-builder` / Adobe Developer App Builder | no | PRODUCTIVITY | 0 | 6 | Development, customization, testing, and deployment skills for Adobe App Builder projects. Covers project initialization |
| 7620 | `ctx` / Tabnine Context Engine | no | AGENT_ORCHESTRATION | 0 | 6 | Context Engine CLI (ctx-cli) as focused skills — guided tenant onboarding, code & knowledge-graph search, service invest |
| 32632546 | `forge` / Forge | no | — | 0 | 6 | Forge — Work orders, journey progress, artifacts, ForgeScore, dev activity, and project context for AI-assisted developm |
| 44746620 | `revyl` / Revyl | no | — | 0 | 6 | Installs the Revyl CLI and signs you in so Cursor can run and verify mobile apps on cloud devices. |
| 53543399 | `hostinger-cursor-plugin` / Hostinger | no | — | 8 | 5 |  |
| 52586766 | `airwallex-agentos` / Airwallex AgentOS | no | PAYMENTS | 2 | 5 | Bring Airwallex's global financial infrastructure to Cursor. Orchestrate actions across your account in plain language,  |
| 59964755 | `aave-mcp` / Aave | no | PAYMENTS | 1 | 5 | Connects Cursor to Aave's official MCP server for live V3 and V4 markets, wallet positions, governance, and non-custodia |
| 32913266 | `apify` / Apify | no | DATA_ANALYTICS | 1 | 5 | Official Apify agent skills for web scraping, data extraction, and automation |
| 1092 | `box` / Box | no | PRODUCTIVITY | 1 | 5 | Box Plugin for Cursor — search, read, and manage content in Box, build Box Platform integrations, and leverage Box AI fo |
| 56366542 | `customerio` / Customer.io | no | DATA_ANALYTICS,SALES | 1 | 5 | Connect Cursor to Customer.io with the official MCP connector and skills for Journeys, Pipelines, Design Studio, and SDK |
| 60857816 | `dash` / Dash Security | no | — | 1 | 5 | Discover your AI estate, assess supply-chain and shadow AI risk, investigate agent sessions, and track AI spend through  |
| 842 | `etoro` / eToro | no | — | 1 | 5 | eToro API integration for Cursor — rules, skills, and live API documentation for building on the eToro Public API. Cover |
| 55648771 | `euler-for-partners` / EULER for Partners | no | — | 1 | 5 | Self-service skills for partners that orchestrate the EULER MCP: view your own performance scorecard, onboarding and cer |
| 59966080 | `incident-io` / incident.io | no | INFRASTRUCTURE | 1 | 5 | Makes your agent fluent in incident.io: responding to and investigating incidents, working with on-call schedules and es |
| 6848 | `opsera-devsecops` / Opsera | no | AGENT_ORCHESTRATION | 1 | 5 | Opsera DevSecOps Agent — AI-powered architecture analysis, security scanning, compliance auditing, and SQL security for  |
| 5188 | `resend` / Resend | no | PRODUCTIVITY | 1 | 5 | Skills and MCP server for the Resend email platform — sending, receiving, templates, CLI, React Email, and deliverabilit |
| 39669369 | `amd-skills` / AMD | no | — | 0 | 5 | AMD's verified Agent Skills in one plugin: route image/audio through local AI on Ryzen AI, serve LLMs on AMD Instinct GP |
| 32704904 | `apollo` / Apollo.io | no | SALES | 1 | 4 | Prospect, enrich leads, load outreach sequences, and query sales analytics with Apollo.io — one-click MCP server integra |
| 55646269 | `basedash` / Basedash | no | — | 1 | 4 | One-click Basedash MCP for analyzing governed company data and managing dashboards and charts. |
| 14371557 | `chatprd` / ChatPRD | no | PRODUCTIVITY | 1 | 4 | Product requirements in your editor. Write PRDs from code context, implement from specs, and verify your changes match r |
| 1411 | `datadog` / Datadog | no | INFRASTRUCTURE | 1 | 4 | Use Datadog directly in Cursor through a preconfigured Datadog MCP server. Query logs, metrics, traces, dashboards, and  |
| 55648770 | `euler-for-partner-managers` / EULER for Partner Managers | no | — | 1 | 4 | Skills for partner-relationship managers (customer-admin scope) that orchestrate the EULER MCP: generate a Quarterly Bus |
| 47475084 | `githits` / GitHits | no | — | 1 | 4 | The code context layer for AI coding agents |
| 57763987 | `linq` / Linq | no | — | 1 | 4 | Build iMessage, RCS, and SMS messaging on Linq. Conventions, guided quickstarts, and MCP access to the Linq API for the  |
| 26115160 | `lovable` / Lovable | no | — | 1 | 4 | Drive Lovable from Cursor: create projects, send work to the Lovable agent, manage Lovable Cloud databases, and deploy,  |
| 11976 | `mixpanel-mcp` / Mixpanel | no | DATA_ANALYTICS | 1 | 4 | Mixpanel skills for Cursor — tracking implementation, metric investigation, and more. |
| 3508 | `pendo-analytics` / Pendo | no | DATA_ANALYTICS | 1 | 4 | Bring Pendo analytics into Cursor with skills for account health, feature adoption, session replays, and feedback analys |
| 63383076 | `riverside` / Riverside | no | PRODUCTIVITY | 1 | 4 | Connects Cursor to Riverside — search recordings by what was said in them, edit video timelines, and publish clips to so |
| 1198 | `sanity` / Sanity | no | PRODUCTIVITY | 1 | 4 | Sanity plugin for Cursor with MCP server, agent skills, agent rules, and commands. |
| 761 | `wix` / Wix | no | PRODUCTIVITY | 1 | 4 | Build, manage, and deploy Wix sites and apps directly from Cursor. Includes CLI development skills for creating dashboar |
| 62459237 | `grok-voice` / Grok Voice | no | — | 0 | 4 | Add Grok voice to an app: realtime speech-to-speech, speech-to-text dictation, text-to-speech read-aloud, and a log-driv |
| 698 | `parallel` / Parallel | no | AGENT_ORCHESTRATION | 0 | 4 | Web search, content extraction, deep research, and data enrichment powered by parallel-cli. |
| 6344 | `temporal` / Temporal | no | INFRASTRUCTURE | 0 | 4 | Comprehensive skill for the entire Temporal lifecycle — developing applications, using the Temporal CLI, running and man |
| 650 | `deploy-on-aws` / AWS Deployments | no | INFRASTRUCTURE | 3 | 3 | Deploy applications to AWS with architecture recommendations, cost estimates, and IaC deployment. Generate validated AWS |
| 9345 | `aikido-cursor-plugin` / Aikido | no | — | 1 | 3 |  |
| 3167 | `antimetal` / Antimetal | no | DATA_ANALYTICS | 1 | 3 | Bring Antimetal's software investigation intelligence into your editor. Triage problems, investigate root causes, and ap |
| 64134776 | `artie` / Artie | no | AGENT_ORCHESTRATION | 1 | 3 | Artie real-time CDC pipelines via MCP |
| 26107310 | `asana` / Asana | no | PRODUCTIVITY | 1 | 3 | Connect Cursor to Asana. Create tasks, update projects, search your workspace, and manage work — directly from the edito |
| 546 | `browserstack` / Browserstack | no | INFRASTRUCTURE | 1 | 3 | BrowserStack integration for Cursor. Test websites and mobile apps on real devices, run automated tests, debug failures, |
| 60856333 | `cello` / Cello | no | — | 1 | 3 | Launch and manage your User Referral and Partner program with Cello — for developers and growth teams. |
| 58578698 | `cursor-supermemory` / Supermemory | no | — | 1 | 3 | Persistent AI memory for Cursor — powered by Supermemory |
| 63853950 | `descript` / Descript | no | PRODUCTIVITY | 1 | 3 | Edit video and audio by editing text. Import media, create projects, and use AI to edit — all from your agent. |
| 5636 | `exa` / Exa | no | DATA_ANALYTICS | 1 | 3 | Web search and content extraction powered by Exa AI |
| 5609 | `granola` / Granola | no | FEATURED,PRODUCTIVITY,SALES | 1 | 3 | Your meetings in your workflow. Granola gives Cursor access to what your team discussed, decided, and committed to. |
| 651 | `hex` / Hex | no | DATA_ANALYTICS | 1 | 3 | AI analytics and data collaboration - connect Cursor to your Hex workspace with MCP |
| 14372196 | `heygen` / HeyGen | no | — | 1 | 3 | Create HeyGen avatar videos, personalized video messages, and translated / dubbed videos. Build a persistent digital ide |
| 2050 | `postman` / Postman | no | DATA_ANALYTICS | 1 | 3 | Full API lifecycle management for Cursor. Sync collections, generate OpenAPI specs, discover APIs, run tests and Flows,  |
| 10089 | `sonatype-cursor-plugin` / Sonatype | no | — | 1 | 3 | AI-powered dependency intelligence. Check vulnerabilities, find safer versions, and make better dependency decisions usi |
| 6394 | `spottercode` / ThoughtSpot | no | DATA_ANALYTICS | 1 | 3 | ThoughtSpot developer documentation — search Visual Embed SDK, REST API v2, and developer guides through MCP-compatible  |
| 762 | `zapier` / Zapier | no | PRODUCTIVITY | 1 | 3 | Connect 9,000+ apps to your AI workflow. Discover, enable, and execute Zapier actions directly from your client. |
| 739 | `runlayer` / Runlayer | no | AGENT_ORCHESTRATION | 0 | 3 | Simpler, safer way to run MCPs, Skills, and Agents. Discover what's running, enforce security policies in real time, pro |
| 14021272 | `scylladb` / ScyllaDB | no | INFRASTRUCTURE | 0 | 3 | Official ScyllaDB agent skills. Bundles guided skills for ScyllaDB Cloud setup, CQL data modeling, and Vector Search; ea |
| 13566132 | `thermos` / Thermos | no | — | 0 | 3 | Thermo-nuclear branch review: deep correctness and security audits plus harsh code-quality rubrics, parallel subagents,  |
| 3793 | `cloudinary` / Cloudinary | no | — | 5 | 2 | Use Cloudinary directly in Cursor. Upload, manage, optimize, and transform images and videos at scale using natural lang |
| 64133030 | `pascal-agent-skills` / Pascal | no | — | 2 | 2 | Create, inspect, validate, and assess furniture layouts with bounded next actions in Pascal through MCP. |
| 7621 | `tabnine` / Tabnine | no | AGENT_ORCHESTRATION | 2 | 2 | Search, explore, and investigate your team's remote repositories using Tabnine's Context Engine. Enables semantic code s |
| 60747522 | `antom-integration` / Antom | no | — | 1 | 2 | Antom payment integration guidance for Cursor: product selection, integration mode (Payment Element / Checkout / API-onl |
| 60856710 | `bird` / Bird | no | — | 1 | 2 | Drive Bird from your coding agent: operate the Bird API from the terminal with the `bird` CLI, send across email, SMS, a |
| 55887870 | `cartesia` / Cartesia | no | — | 1 | 2 | Voice AI for agents: Sonic TTS, Ink STT, voice cloning, and Line voice agents. Hosted Cartesia MCP plus skills that keep |
| 32661537 | `composio` / Composio | no | AGENT_ORCHESTRATION | 1 | 2 | Connect and operate 1000+ external apps from Cursor via the Composio MCP server. Managed OAuth, intelligent tool routing |
| 20988446 | `coralogix-mcp` / Coralogix | no | INFRASTRUCTURE | 1 | 2 | Connects Cursor to the Coralogix Observability MCP Server, letting your AI agent query logs, metrics, traces, and RUM, m |
| 47709840 | `link` / Link | no | PAYMENTS,FINANCE_AND_LEGAL | 1 | 2 | Complete purchases with one-time-use payment credentials from a Link wallet, using spend requests the user has approved. |
| 18281353 | `raisely` / Raisely | no | — | 1 | 2 | Connect Cursor to Raisely. Ships the Raisely MCP server so you can query and manage campaigns, donations, supporters, an |
| 65140224 | `runway` / Runway | no | PRODUCTIVITY | 1 | 2 | Generate images, videos, music, speech, and sound effects with Runway — Gen-4.5, Aleph, Seedance, Kling, GPT Image and m |
| 58735209 | `sideshift` / SideShift | no | — | 1 | 2 | Operate your SideShift company from Cursor—manage campaigns, creators, applications, content, contracts, recruiting, mes |
| 26101348 | `snyk-api-web` / Snyk API & Web | no | — | 1 | 2 | Snyk API & Web MCP Server — onboard scan targets, configure authentication, run DAST scans, and triage findings through  |
| 652 | `supabase` / Supabase | no | INFRASTRUCTURE | 1 | 2 | Access your Supabase projects and perform tasks like managing tables, fetching config, and querying data. |
| 2246 | `svelte` / Svelte | no | PRODUCTIVITY | 1 | 2 | A plugin for all things related to Svelte development, MCP, skills, and more. |
| 9295 | `tierzero` / TierZero | no | PRODUCTIVITY | 1 | 2 | Agentic production engineering for SWE, SRE and DevOps. Resolve and investigate issues against existing observability, C |
| 60857554 | `transcend-agent-governance` / Transcend Agent Governance | no | — | 1 | 2 | Connect Cursor to Transcend Agent Governance for policy-enforced MCP tool access via browser sign-in. |
| 6067 | `workos` / WorkOS | no | INFRASTRUCTURE | 1 | 2 | WorkOS integration skills for AuthKit, SSO, Directory Sync, RBAC, Vault, Audit Logs, migrations, and API references, plu |
| 41762204 | `coderabbit` / CodeRabbit | no | — | 0 | 2 | Run CodeRabbit reviews for code, PR, security, and quality checks, plus guarded autofix for unresolved GitHub PR feedbac |
| 648 | `create-plugin` / Create Plugin | no | AGENT_ORCHESTRATION | 0 | 2 | Scaffold and validate new agent plugins. Handles directory setup, manifest generation, and pre-submission quality checks |
| 6398877 | `modern-web-guidance` / Modern Web Guidance | no | — | 0 | 2 | Modern Web Guidance is an agent skill and CLI tool designed to help AI coding agents build web applications using modern |
| 41082969 | `react-doctor` / React Doctor | no | — | 0 | 2 | Scan, understand, and fix React codebase diagnostics with React Doctor. |
| 6846 | `opensearch-agent-skills` / OpenSearch | no | DATA_ANALYTICS | 4 | 1 | OpenSearch skills to help set up and deploy OpenSearch for a variety of use cases: build search applications with semant |
| 6198 | `databases-on-aws` / AWS Databases | no | INFRASTRUCTURE | 2 | 1 | Expert database guidance for the AWS database portfolio. Design schemas, execute queries, handle migrations, and choose  |
| 52964995 | `manufact` / Manufact | no | — | 2 | 1 | Build, test, and deploy MCP servers and apps with mcp-use and Manufact. Includes the Manufact MCP server, the mcp-use do |
| 25808295 | `mintlify-cursor-plugin` / Mintlify | no | PRODUCTIVITY | 2 | 1 | Comprehensive reference for building Mintlify documentation sites. |
| 768 | `1password` / 1Password | no | — | 1 | 1 | 1Password Developer Environments for Cursor: MCP tools to create, import, and manage project secrets; an agent skill wit |
| 3315 | `amazon-location-service` / Amazon Location Service | no | INFRASTRUCTURE | 1 | 1 | Guide developers through adding maps, places search, geocoding, routing, and other geospatial features with Amazon Locat |
| 59967207 | `ando` / Ando | no | INBOX_AND_COLLABORATION | 1 | 1 | Connect an agent to Ando, the team messaging platform for humans and agents. Wraps the hosted streamable HTTP MCP at htt |
| 3318 | `aws-amplify` / AWS Amplify | no | INFRASTRUCTURE | 1 | 1 | Build full-stack apps with AWS Amplify Gen 2 using guided workflows for authentication, data models, storage, GraphQL AP |
| 47477538 | `browser-use` / Browser Use | no | — | 1 | 1 | Give Cursor a real browser — your Chrome or a Browser Use Cloud browser. Use it whenever a task involves a website or we |
| 406 | `context7-plugin` / Context7 | no | AGENT_ORCHESTRATION | 1 | 1 | Upstash Context7 MCP server for up-to-date documentation lookup. Pull version-specific documentation and code examples d |
| 60860738 | `crustdata` / Crustdata | no | RESEARCH | 1 | 1 | Live B2B data on 1B+ people and 200M+ companies: search, enrich, contacts, jobs, and social posts. |
| 26111414 | `dnb-risk-analytics` / D&B Risk Analytics | no | — | 1 | 1 | Dun & Bradstreet empowers teams to execute risk workflows such as KYC/KYB, entity resolution, screening, alert triage, a |
| 56284038 | `executor` / Executor | no | — | 1 | 1 | A universal tool gateway for AI agents. Connect anything once, then use it across Cursor and every other agent harness. |
| 1220 | `gitlab` / GitLab | no | PRODUCTIVITY | 1 | 1 | Connect Cursor to GitLab with the GitLab MCP server. Plan, track, and manage issues, merge requests, and pipelines from  |
| 63467641 | `golf` / Golf Intelligence by Stracka | no | — | 1 | 1 | Golf Intelligence, by Stracka. The highest-quality golf course dataset for developers building a golf app. 20 years of p |
| 146017 | `grafana-cloud-mcp` / Grafana Cloud | no | DATA_ANALYTICS | 1 | 1 | Hosted MCP server for AI-assisted Grafana Cloud observability — no local installation required. |
| 58735216 | `gumloop` / Gumloop | no | — | 1 | 1 | Connect Cursor to Gumloop's hosted MCP server. |
| 41756884 | `lucid` / Lucid | no | — | 1 | 1 | Ideate, diagram, and align teams by connecting Cursor to Lucid. Search, generate, and manage your technical architecture |
| 21951242 | `magicpath` / MagicPath | no | PRODUCTIVITY | 1 | 1 | Design and build interactive UI on a shared canvas. Bring local code and repositories into MagicPath, install or export  |
| 21022343 | `mainframe` / Mainframe | no | — | 1 | 1 | Create and share short video updates from agent work. |
| 2911 | `miro` / Miro | no | PRODUCTIVITY | 1 | 1 | Secure access to Miro boards. Enables AI to read board context, create diagrams, and generate code with enterprise-grade |
| 63373743 | `monid` / Monid | no | DATA_ANALYTICS | 1 | 1 | Discover and run hundreds of data endpoints — web scraping, people/company enrichment, social media, and search — throug |
| 13750661 | `monk` / Monk.io | no | INFRASTRUCTURE | 1 | 1 | Deploy and operate full applications with Monk — cloud infra, SaaS integrations, and containerized workloads — from one  |
| 38157427 | `onesignal` / OneSignal | no | — | 1 | 1 | Connect Cursor to OneSignal through the OneSignal MCP server. |
| 1089 | `pagerduty` / PagerDuty | no | INFRASTRUCTURE | 1 | 1 | PagerDuty MCP server for Cursor - manage incidents, services, schedules, on-call, and more directly from your IDE. |
| 20785328 | `quiverai` / QuiverAI | no | — | 1 | 1 | Create, refine, and vectorize SVG assets with the hosted QuiverAI MCP server. |
| 29413143 | `railway` / Railway | no | INFRASTRUCTURE | 1 | 1 | Railway agent skills and hosted MCP server for deploying, configuring, monitoring, and troubleshooting apps and infrastr |
| 764 | `semgrep-plugin` / Semgrep | no | — | 1 | 1 | Plugin by Semgrep. Provides security scanning via MCP, hooks, and skills for Cursor. |
| 60864284 | `senselab` / SenseLab | no | — | 1 | 1 | Continual learning for your agents. What one works out carries across sessions, tools and machines, is reinforced by how |
| 6948 | `shadcn` / shadcn/ui | no | AGENT_ORCHESTRATION | 1 | 1 | UI component and design system framework. Search registries, install components as source code, and audit your project. |
| 653 | `snowflake-cursor-plugin` / Snowflake | no | DATA_ANALYTICS | 1 | 1 |  |
| 1292 | `snyk-secure-development` / Snyk | no | — | 1 | 1 | Snyk security scanning, remediation, and dependency health for Cursor |
| 9347 | `sourcegraph-cursor-plugin` / Sourcegraph | no | AGENT_ORCHESTRATION | 1 | 1 |  |
| 55647425 | `treg` / Treg | no | RESEARCH | 1 | 1 | OpenRouter for tools — 2,896 agent-callable endpoints across 60 providers: SEO and SERP data, backlinks, social and tren |
| 5057 | `turbopuffer` / turbopuffer | no | INFRASTRUCTURE | 1 | 1 | Turbopuffer vector and full-text search database integration for Cursor |
| 60858255 | `turso` / Turso | no | INFRASTRUCTURE | 1 | 1 | Manage Turso Cloud (organizations, databases, groups) and run SQL from Cursor via the hosted Turso MCP server — OAuth lo |
| 60855173 | `wordpress-com` / WordPress.com | no | — | 1 | 1 | Build, publish, and manage WordPress.com sites directly from Cursor. |
| 49086599 | `x` / X | no | INBOX_AND_COLLABORATION | 1 | 1 | Search posts, read timelines, pull trends, and manage bookmarks. |
| 3644 | `agent-compatibility` / Agent Compatibility | no | — | 0 | 1 | CLI-backed repo compatibility scans plus agents that audit startup, validation, and docs against reality. |
| 49981383 | `atlassian-twg-cli` / Atlassian Teamwork Graph | no | PRODUCTIVITY | 0 | 1 | Teamwork Graph CLI is Atlassian's agent-first interface to your entire work context: Jira issues, Confluence pages, Bitb |
| 4787 | `auth0` / Auth0 | no | — | 0 | 1 | A single unified Auth0 skill that detects your framework, feature, and tooling, then loads the right reference guides fo |
| 675 | `browse` / Browserbase | no | AGENT_ORCHESTRATION | 0 | 1 | Browser automation for AI agents: navigate, extract, screenshot, and interact with real web pages via a single CLI. |
| 3983 | `chargebee-integration` / Chargebee | no | PAYMENTS | 0 | 1 | Use Chargebee's API integration patterns, webhook handling, SDK usage, and schema references for billing operations in C |
| 3845 | `cli-for-agent` / CLI for Agents | no | — | 0 | 1 | Patterns for designing CLIs that coding agents can run reliably: non-interactive flags, layered help with examples, pipe |
| 701 | `continual-learning` / Continual Learning | no | — | 0 | 1 | Incrementally learns durable user preferences and workspace facts from transcript changes and keeps AGENTS.md up to date |
| 10038 | `corridor` / Corridor | no | — | 0 | 1 | Corridor secures your AI-generated code. To get started, please create an API key at https://app.corridor.dev/settings a |
| 7975 | `cursor-sdk` / Cursor SDK | no | — | 0 | 1 | Build apps, scripts, and automations with the TypeScript SDK. |
| 6643 | `dagster-expert` / Dagster | no | DATA_ANALYTICS | 0 | 1 | Expert guidance for working with Dagster and the dg CLI. |
| 6306 | `docs-canvas` / Docs Canvas | no | CANVAS | 0 | 1 | Render documentation as a navigable canvas. |
| 58732520 | `glean-dev-docs` / Glean Developer Docs | no | PRODUCTIVITY | 0 | 1 | Search the public Glean developer documentation — APIs, SDKs, MCP, and integration guides for building with Glean. |
| 736 | `grafana-assistant` / Grafana Labs | no | DATA_ANALYTICS | 0 | 1 | Skills and rules for developing and using the Grafana Assistant app and CLI. |
| 50420288 | `here.now` / here.now | no | — | 0 | 1 | Publish websites, apps, and files to live URLs at {slug}.here.now or custom domains. Publish HTML apps, documents, image |
| 738 | `langfuse` / Langfuse | no | AGENT_ORCHESTRATION | 0 | 1 | Skills for working with Langfuse — the open-source LLM engineering platform for tracing, prompt management, and evaluati |
| 43019816 | `nvidia-skills` / Nvidia Skills | no | — | 0 | 1 | Skills for NVIDIAs ecosystem spans GPU acceleration, CUDA, AI agents, inference, robotics, Physical AI, Omniverse, and s |
| 9333 | `orchestrate` / Orchestrate | no | — | 0 | 1 | Fan a large task out across parallel cloud agents via the Cursor SDK: planners publish tasks, workers hand off back up,  |
| 58737848 | `postiz` / postiz | no | INBOX_AND_COLLABORATION | 0 | 1 | Social media automation CLI for scheduling posts, managing integrations, uploading media, and tracking analytics across  |
| 6307 | `pr-review-canvas` / PR Review Canvas | no | CANVAS | 0 | 1 | Render PR diffs as review canvases grouped by importance. |
| 733 | `redis-development` / Redis | no | INFRASTRUCTURE | 0 | 1 | Redis development best practices — data structures, query engine, vector search, caching, and performance optimization |
| 55647251 | `superdesign` / Superdesign | no | DESIGN | 0 | 1 | Design or redesign frontend UI, presentations, and marketing graphics on the Superdesign infinite canvas. Uses approved  |
| 63835155 | `infobip-mcp` / Infobip | no | INBOX_AND_COLLABORATION | 12 | 0 | Infobip MCP Servers let you build AI agents to interact with the Infobip platform through the Model Context Protocol (MC |
| 5670 | `zscaler` / Zscaler | no | INFRASTRUCTURE | 2 | 0 | Manage the Zscaler cloud security platform including ZPA (private access), ZIA (internet access), ZDX (digital experienc |
| 60854710 | `agent-plugins` / Monaco | no | SALES | 1 | 0 |  |
| 56809965 | `ahrefs` / Ahrefs | no | RESEARCH | 1 | 0 | Research keywords, backlinks, rankings, and site health. |
| 51597430 | `aleph` / Aleph | no | — | 1 | 0 | Aleph MCP server. Your one source of truth for financial data. |
| 59961146 | `algolia-productivity` / Algolia Productivity | no | — | 1 | 0 | Connect LLM tools to your Algolia account with user-scoped access for internal workflows. |
| 53338791 | `amplemarket` / Amplemarket | no | SALES | 1 | 0 | Search people and companies, enrich leads, run sequences. |
| 62966224 | `appsecmcp` / Palo Alto Networks | no | — | 1 | 0 |  |
| 49104326 | `ashby` / Ashby | no | — | 1 | 0 | Search candidates, prep interviews, and manage pipeline tasks. |
| 7850 | `atlan` / Atlan | no | AGENT_ORCHESTRATION | 1 | 0 | Atlan is the context layer for enterprise AI. Connect Cursor to your organization's context repos — the knowledge, data, |
| 47472300 | `atscale` / AtScale | no | — | 1 | 0 | Query governed business metrics, definitions and context from Cursor via AtScale MCP. |
| 62459236 | `attio` / Attio | no | — | 1 | 0 | Search and update CRM records, lists, notes, and tasks. |
| 2044 | `azure-cosmosdb` / Azure Cosmos DB | no | DATA_ANALYTICS | 1 | 0 | Access your Azure Cosmos DB accounts and perform tasks like managing databases, querying data, vector search, and schema |
| 2046 | `braintrust` / Braintrust | no | DATA_ANALYTICS | 1 | 0 | Connect Cursor to Braintrust for AI-powered access to your projects, experiments, and evaluation logs |
| 56809966 | `brevo` / Brevo | no | INBOX_AND_COLLABORATION | 1 | 0 | Manage contacts, email and SMS campaigns, and CRM deals. |
| 56809967 | `brex` / Brex | no | PAYMENTS | 1 | 0 | Query expenses, receipts, bills, cards, and travel. |
| 56809968 | `calendly` / Calendly | no | INBOX_AND_COLLABORATION | 1 | 0 | Check availability and book, cancel, or reschedule. |
| 45990366 | `checkmarx` / Checkmarx | no | — | 1 | 0 | The Checkmarx MCP Server acts as a translation layer that connects your AI assistant to Checkmarx One APIs, enabling dev |
| 49339687 | `circleback` / Circleback | no | — | 1 | 0 | Search meetings, transcripts, action items, and emails. |
| 50433623 | `circleci` / CircleCI | no | — | 1 | 0 | Debug failing builds, inspect jobs and test results, monitor pipelines, and rerun or cancel workflows across your Circle |
| 49110469 | `clay` / Clay | no | SALES | 1 | 0 | Enrich people and companies, run AI research agents. |
| 5069 | `clickup` / ClickUp | no | PRODUCTIVITY | 1 | 0 | Connect Cursor to your ClickUp workspace — manage tasks, track time, and collaborate without switching context. |
| 56809969 | `coda` / Coda | no | DOCUMENTS_AND_FILES | 1 | 0 | Search docs, read pages, and update tables. |
| 56809970 | `craft` / Craft | no | DOCUMENTS_AND_FILES | 1 | 0 | Search, create, and update documents and daily notes. |
| 56809971 | `customer-io` / Customer.io | no | INBOX_AND_COLLABORATION | 1 | 0 | Build campaigns, manage segments, and query people. |
| 44949530 | `dnb-commercial-graph` / D&B Commercial Graph | no | — | 1 | 0 | Dun & Bradstreet empowers teams to execute workflows such as entity resolution, Sales & Marketing, Finance, Enterprise M |
| 49339688 | `docusign` / Docusign | no | FINANCE_AND_LEGAL | 1 | 0 | Manage envelopes, templates, workflows, and agreements. |
| 48899256 | `falconer` / Falconer | no | — | 1 | 0 | Read, search, and update Falconer documents from Cursor through hosted HTTP MCP. |
| 56809972 | `fathom` / Fathom | no | PRODUCTIVITY | 1 | 0 | Search meetings and pull transcripts and summaries. |
| 56809973 | `fireflies` / Fireflies | no | PRODUCTIVITY,INBOX_AND_COLLABORATION | 1 | 0 | Search meeting transcripts, summaries, and action items. |
| 48677658 | `github` / GitHub | no | — | 1 | 0 | Manage repos, issues, pull requests, and Actions. |
| 45893410 | `gmail` / Gmail | no | FEATURED,INBOX_AND_COLLABORATION | 1 | 0 | Search, read, draft, and manage email. |
| 56809974 | `godaddy` / GoDaddy | no | INFRASTRUCTURE | 1 | 0 | Brainstorm domain names and check availability. |
| 62120239 | `gojiberry` / Gojiberry AI | no | — | 1 | 0 | Connect Cursor to your Gojiberry workspace. Search and update contacts, manage lists and campaigns, refine lead-finding  |
| 47725204 | `gong` / Gong | no | SALES | 1 | 0 | Pull account summaries, deal insights, and call briefs. |
| 45893411 | `google-calendar` / Google Calendar | no | FEATURED,SCHEDULING | 1 | 0 | Search events and schedule meetings. |
| 45893413 | `google-drive` / Google Drive | no | FEATURED | 1 | 0 | Search, read, create, and share files. |
| 56809975 | `guru` / Guru | no | PRODUCTIVITY | 1 | 0 | Search company knowledge and draft verified answers. |
| 62309982 | `harmonic` / Harmonic | no | — | 1 | 0 | Discover, research, and enrich companies and people |
| 5420454 | `higgsfield` / Higgsfield | no | — | 1 | 0 | Generate images, videos, and more using Higgsfield MCP from Cursor. |
| 49339689 | `hubspot` / HubSpot | no | SALES | 1 | 0 | Search and update contacts, companies, deals, and tickets. |
| 62459238 | `hunter` / Hunter | no | — | 1 | 0 | Find and verify emails, discover companies, and save leads. |
| 12838857 | `icepanel` / IcePanel | no | PRODUCTIVITY | 1 | 0 | Cursor Plugin for IcePanel - enables AI assistants to manage models, connections, and more across your IcePanel landscap |
| 57102943 | `inkbox` / Inkbox | no | INBOX_AND_COLLABORATION | 1 | 0 | Give Cursor an Inkbox identity for email, SMS, iMessage, voice calls, contacts, notes, and agent-to-agent tasks. |
| 49339690 | `intercom` / Intercom | no | CUSTOMER_SUPPORT | 1 | 0 | Search conversations, contacts, and Help Center articles. |
| 56809976 | `jotform` / Jotform | no | PRODUCTIVITY | 1 | 0 | Create and edit forms, then read submissions. |
| 52606141 | `juicebox` / Juicebox | no | PRODUCTIVITY | 1 | 0 | Query recruiting analytics, shortlists, and sourcing agents. |
| 56809977 | `klaviyo` / Klaviyo | no | INBOX_AND_COLLABORATION | 1 | 0 | Manage profiles, segments, campaigns, and flows. |
| 56286216 | `kody` / Kody | no | — | 1 | 0 | Personal assistant MCP server with search, execute, packages, jobs, secrets, and integrations. |
| 512 | `linear` / Linear | no | PRODUCTIVITY | 1 | 0 | The product development system for teams and agents. Manage issues, projects, documents, and everything else across your |
| 56809978 | `mailerlite` / MailerLite | no | INBOX_AND_COLLABORATION,CUSTOMER_SUPPORT | 1 | 0 | Manage subscribers, groups, campaigns, and automations. |
| 56809979 | `mem` / Mem | no | PRODUCTIVITY | 1 | 0 | Capture, search, and organize notes and collections. |
| 56809980 | `mercury` / Mercury | no | PAYMENTS | 1 | 0 | Read balances, transactions, statements, and cards. |
| 52632771 | `mobbin` / Mobbin | no | DESIGN | 1 | 0 | Search real-world UI & UX design references for mobile apps, web apps, and websites with Mobbin. |
| 50103284 | `navan` / Navan | no | — | 1 | 0 | Query expenses, travel bookings, policies, and cards. |
| 63841619 | `omneky` / Omneky | no | — | 1 | 0 | Generate and launch ads, manage products, and report performance in Cursor via Omneky MCP |
| 57302028 | `onedrive` / OneDrive | no | — | 1 | 0 | Browse, search, and read Microsoft OneDrive files. |
| 56809981 | `otter` / Otter.ai | no | PRODUCTIVITY | 1 | 0 | Search meeting history and pull full transcripts. |
| 57302029 | `outlook` / Outlook | no | INBOX_AND_COLLABORATION | 1 | 0 | Search, read, and send Microsoft Outlook email, and look up contacts. |
| 57302030 | `outlook-calendar` / Outlook Calendar | no | SCHEDULING | 1 | 0 | List, create, update, and cancel Microsoft Outlook calendar events. |
| 53338793 | `outreach` / Outreach | no | SALES | 1 | 0 | Search sequences, prospects, and Kaia meetings. |
| 6062 | `paper-desktop` / Paper | no | PRODUCTIVITY,DESIGN | 1 | 0 | Design on a canvas that Cursor can read and write to — built on web standards. |
| 13955831 | `paradedb` / ParadeDB | no | INFRASTRUCTURE | 1 | 0 | ParadeDB adds Elastic-quality full-text search, vector retrieval, and aggregations to Postgres, with no second system to |
| 3131 | `plain` / Plain | no | CUSTOMER_SUPPORT | 1 | 0 | Connect Cursor to Plain — manage support threads, customers, tenants, and help center articles directly from your editor |
| 48677659 | `playwright` / Playwright | no | PRODUCTIVITY | 1 | 0 | Navigate, click, screenshot, and test in a real browser. |
| 26177969 | `port` / Port | no | — | 1 | 0 | Port MCP Server Gives Cursor's AI agent full engineering context. Port is your system of record for every service, team, |
| 51168001 | `profound` / Profound | no | PRODUCTIVITY | 1 | 0 | Track AI visibility, sentiment, and citations. |
| 63446691 | `quo` / Quo | no | — | 1 | 0 | Give your agent a phone number. Use Quo to send and review business texts, manage contacts and tasks, and follow up on m |
| 56809982 | `readwise` / Readwise | no | PRODUCTIVITY | 1 | 0 | Search highlights and Reader documents, save articles. |
| 59963775 | `restream` / Restream | no | — | 1 | 0 | Live-code to an audience from Cursor: stream to social, a webinar page, or Slack, record only, or let AI clip the highli |
| 59510268 | `ryze-ai` / Ryze AI | no | — | 1 | 0 | Google Ads, Meta Ads, GA4, Search Console, SEO/GEO/AEO in Cursor — audit, report, optimize ads and rankings |
| 47725205 | `salesforce` / Salesforce | no | SALES | 1 | 0 | Query, create, and update records in your org. |
| 56809983 | `semrush` / Semrush | no | DATA_ANALYTICS,RESEARCH | 1 | 0 | Research keywords, backlinks, traffic, and competitors. |
| 56809984 | `similarweb` / Similarweb | no | DATA_ANALYTICS | 1 | 0 | Analyze website traffic, audiences, and competitors. |
| 56809985 | `smartsheet` / Smartsheet | no | DATA_ANALYTICS,PRODUCTIVITY | 1 | 0 | Query and update sheets, rows, and workspaces. |
| 60293083 | `superme` / SuperMe | no | — | 1 | 0 | Ask people who've been there, get multiple perspectives, and make better decisions about your work. |
| 63354504 | `teams` / Teams | no | PRODUCTIVITY | 1 | 0 | Search, read, and send Microsoft Teams chats and channel messages. |
| 2049 | `thousandeyes` / Cisco ThousandEyes | no | — | 1 | 0 | Connect Cursor to ThousandEyes MCP endpoints for network intelligence workflows. |
| 788 | `tldraw` / tldraw | no | PRODUCTIVITY,DESIGN | 1 | 0 | Draw and visually collaborate with your agents inside Cursor |
| 56809986 | `todoist` / Todoist | no | PRODUCTIVITY | 1 | 0 | Create, find, and complete tasks and projects. |
| 56809987 | `typeform` / Typeform | no | PRODUCTIVITY,INBOX_AND_COLLABORATION | 1 | 0 | Build forms, analyze responses, and manage contacts. |
| 56809988 | `upwork` / Upwork | no | PRODUCTIVITY,INBOX_AND_COLLABORATION | 1 | 0 | Search talent, post jobs, and manage contracts. |
| 60859419 | `usertesting` / UserTesting | no | — | 1 | 0 | Bring real customer feedback into Cursor — create, launch, and retrieve UserTesting results without leaving your editor. |
| 7619 | `vantage` / Vantage | no | INFRASTRUCTURE | 1 | 0 | Query cloud costs, manage cost reports, budgets, alerts, and recommendations across your Vantage workspace |
| 50389919 | `whop` / Whop | no | PAYMENTS | 1 | 0 | Build and run your business end-to-end with Whop. Launch your website, accept payments, run ads, and more—directly in Cu |
| 58954938 | `wonder` / Wonder | no | DESIGN | 1 | 0 | Create and edit designs with Cursor on a canvas where every design is real code. |
| 56809989 | `workable` / Workable | no | PRODUCTIVITY,INBOX_AND_COLLABORATION | 1 | 0 | Search candidates, move pipelines, and manage HR records. |
| 56809990 | `wrike` / Wrike | no | PRODUCTIVITY | 1 | 0 | Search projects, create tasks, and post comments. |
| 59384947 | `x-ads` / X Ads | no | — | 1 | 0 | Manage ad campaigns, create ads, track conversions, and pull performance stats. |
| 56809991 | `xero` / Xero | no | PAYMENTS,DOCUMENTS_AND_FILES | 1 | 0 | Read and write invoices, contacts, reports, and payroll. |
| 65143440 | `zernio` / Zernio | no | — | 1 | 0 | Social media API for developers. Schedule posts, manage ads, automate DMs, run sequences, and more across 14 platforms. |
| 49047809 | `zoom` / Zoom | no | SCHEDULING | 1 | 0 | Search meetings, pull transcripts, and work with Zoom Docs. |
| 9461 | `merge-agent-handler` / Merge | no | AGENT_ORCHESTRATION | 0 | 0 | Connect Cursor to hundreds of enterprise tools (Jira, Salesforce, Slack, Gong, Workday, etc.) via the Merge CLI |
| 41935851 | `zenity-inventory` / Zenity | no | — | 0 | 0 | Reports this device's Cursor MCP servers to Zenity AI Edge on session start. Minimal, self-contained scan; secrets in MC |

---

## Gaps / builder notes (Caisra)

1. **Subagent tool gap:** Executor subagents may not receive `SearchPlugins` / `GetPlugin` / `GetMcpServerStatus` / `GetDynamicTools` / `InstallPlugin`. Parent agent or main chat must drive install/auth; report recovered catalog via marketplace HTML when needed.
2. **Thin install footprint here:** Only Notion is connected. Fleet playbooks that assume Slack/Gmail/Calendar will need connector offers during onboarding (max one ask during fleet-proof beat per Yodo anatomy).
3. **FEATURED set is the natural Cos/Yodo shortlist:** Drive, Calendar, Gmail, Granola, Slack, Notion — align Caisra “minimum connectors” with jobs, not a tour.
4. **Send-as-user vs app-as-bot:** Slack (and similar) may need `send-on-behalf` + browser path when connector posts as app; store guidance via `SetMcpInstructions`.
5. **GitHub:** Marketplace has a `github` MCP plugin, but Cursor docs also treat GitHub as a **native** dashboard integration for Cloud Agents/Bugbot — don’t confuse the two.
6. **Skill layers:** Managed skills govern *how* to connect; plugin skills govern *how to use* a specific product; Notion-native Skills (pages marked `is_skill`) are a third layer inside the workspace.
7. **Auth-pending hard rule:** Never browser-around a `needsAuth` connector — it fails the same sign-in and violates `no-connector-fallback`.
8. **Catalog churn:** 330 plugins as of this scrape; re-pull `initialPlugins` or call `SearchPlugins` with empty query for live counts.

---

## Appendix — Mechanism plumbing names (internal)

Quoted once for builders; avoid in user-facing Caisra prose:

- Host agent product path historically referred to as “Grok Bot” in managed skill text (`no-connector-fallback` 1Password vault name “Shared with Grok Bot”; Auto-review notice attribution).
- Tool names: `SearchPlugins`, `GetPlugin`, `InstallPlugin`, `UninstallPlugin` (implied), `AddMcpServer`, `AuthenticateMcpServer`, `RestartMcpServers`, `GetMcpServerStatus`, `SetMcpInstructions`, `GetMcpTools`, `GetDynamicTools`, `CallMcpTool`, `CallDynamicTool`.
- Runtime server id pattern observed: plugin connector `notion` → MCP server `user-Notion`.

---

*End of report. Full JSON dumps: `/workspace/caisra-connectors-data/`.*