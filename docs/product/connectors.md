# Connectors — what is already built, and the three ways in

14 September 2026. The note of record for Stage 8 (`plan.md`). It
replaces nothing: `docs/maties/connectors.md` is the September 11 design
note and its sections 3–7 are still right about the middleman. This one
says what survived the desktop reset, what `github.com/cursor/plugins`
actually contains, and what the founder now has to choose between —
which is three things, not two.

---

## 1. What is built and running

**The server half is done and careful.** `server/polar/connectors/` —
1,129 lines across four files, mounted from `desktop/endpoints.py`:

| Route | What it does |
|---|---|
| `GET /desktop/connectors` | the person's connections, cached 60s in Redis |
| `POST /desktop/connectors/{slug}/link` | a one-use sign-in link |
| `DELETE /desktop/connectors/{slug}` | disconnect |
| `* /desktop/connectors/mcp/{slug}` | the engine's MCP conversation, forwarded |

The proxy route is the interesting one. It streams, it filters the
client's headers to an allowlist that carries no identity, it applies the
provider's headers **last**, and it drops the client's query string
entirely — because the provider accepts its `x-pd-*` headers as query
parameters too, so forwarding a query string would hand back the override
the header allowlist had just taken away. There is deliberately no table
of connections on our side: Pipedream holds the accounts, Redis holds an
answer for a minute. A cache that is wrong for a minute is a different
thing from a record that is wrong for ever.

**The gate.** `ENTITLED_PLANS` is empty on purpose and a staff email
allowlist is the only yes today, read from settings on every call.

## 2. What the desktop reset took, and where it still is

The 13 September reset put `desktop/` back to upstream. Four connector
files went with it, and all four are recoverable from `3e1224d5`:

```
desktop/src/shared/connections/catalog.ts          318 lines (+ test)
desktop/src/main/libs/connectors/connectorsClient.ts    179 (+ test)
desktop/src/main/libs/connectors/connectorsService.ts   204
desktop/src/main/libs/connectors/connectorMcpServers.ts  76 (+ test)
desktop/public/logos/apps/*                         53 files
```

`catalog.ts` is the sixty-five cards in eleven groups, each with a `kind`
— `account` (40), `channel`, `browser`, `local`, `soon` — so every card
can do something honest. Thirty-eight carry an `appSlug`.

Nothing in the app today mentions connectors. Recovering these four files
is the first hour of the stage, not a rebuild.

## 3. `github.com/cursor/plugins`, actually read

Cloned and inspected, not assumed. It is **not** a service catalogue; it
is a plugin repo, and the part that matters is `third_party/`.

- **63 services**, each a directory with `.cursor-plugin/plugin.json`
  (displayName, description, category, keywords, tags, homepage),
  `mcp.json`, `README.md`, and its own `LICENSE`.
- **MIT**, per plugin, Copyright 2026 Cursor.
- **62 of 63 carry an `mcp.json`**: 59 HTTP, 2 stdio.
- **Only 13 of 63 ship a logo.** Not the logo source the catalogue needs;
  the 53 under `3e1224d5` are.
- Its own categories are only two — `integrations` (56) and
  `productivity` (7). The nine-to-eleven groups are ours, from
  `catalog.ts`.

**Overlap with our thirty-eight is seven**: fathom, github, gmail,
hubspot, intercom, todoist, zoom. So it brings **54 services we do not
have** — Salesforce, Outlook, Teams, OneDrive, X, Brex, Mercury, Xero,
Docusign, Calendly, Ahrefs, Semrush and the rest — and it is **missing 31
of ours**, including Slack, Notion, Linear, Jira, Asana, Figma, Stripe,
Shopify, Dropbox and the Google Docs/Sheets/Slides set.

Neither list is a superset. Together they are about ninety services.

### The four auth shapes in their `mcp.json`

```jsonc
// 1. a bare HTTP endpoint — the MCP client discovers OAuth       (gmail)
{ "type": "http", "url": "https://gmailmcp.googleapis.com/mcp/v1" }

// 2. a token the person pastes                                   (github)
{ "type": "http", "url": "https://api.githubcopilot.com/mcp/",
  "headers": { "Authorization": "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}" } }

// 3. an OAuth client id and scopes, baked in                          (x)
{ "type": "http", "url": "https://api.x.com/mcp",
  "auth": { "CLIENT_ID": "…", "scopes": ["tweet.read", …] } }

// 4. stdio                                                    (playwright)
{ "command": "npx", "args": ["-y", "@playwright/mcp@latest"] }
```

## 4. The finding that changes the stage

**The engine already does MCP OAuth.**
`openclaw/src/agents/mcp-oauth.ts` uses the official MCP SDK's `auth()`
— dynamic client registration, PKCE, token and discovery-state storage
under the state dir, a loopback redirect at
`http://127.0.0.1:8989/oauth/callback` — and
`openclaw/src/agents/mcp-transport.ts` imports
`createMcpOAuthClientProvider`, so it is wired into the transport, not
sitting unused. There is a CLI for it too (`src/cli/mcp-cli.ts`).

So there is a third way in, and it needs no middleman and no per-service
code on our side.

## 5. The three routes

| | **A — Pipedream** | **B — the browser** | **C — direct MCP** |
|---|---|---|---|
| Sign-in | their hosted page | the agent's own browser, once | the vendor's own consent page |
| Tools | Pipedream's MCP per service | none until built | the vendor's own MCP server |
| Our code | **built** | not built | config only |
| Per-service work | slug mapping | a login recipe each | copy one `mcp.json` |
| Cost | per connected account | none | none |
| Breadth | Pipedream's catalogue | anything with a login | 62 services today |
| Risk | a bill, and a middleman between the person and their mail | brittle, and the browser is unverified in this tree | depends on vendors shipping MCP; Google's Gmail endpoint is real but new |

They are not exclusive. `catalog.ts` already carries a `kind` per card,
which is exactly the field that says which route a service takes. A
service can move from C to A later by changing one entry.

## 6. What is route-independent

Roughly the larger half of the stage, and none of it waits on the
decision:

1. Recover the four files from `3e1224d5`.
2. Merge the two catalogues into one — ~90 services, our eleven groups,
   the 53 logos we have, descriptions from `plugin.json` where ours are
   thin.
3. The connect card, the tick, the disconnect, the price card for
   somebody not entitled.
4. One MCP entry per connected service written into the engine's config
   (`openclawConfigSync.ts` already syncs `mcp.servers`).

Only *where the sign-in window points* and *what URL the MCP entry holds*
differ by route, and both are one field in the catalogue.

## 7. The decision, and how C actually works

**14 September: the founder chose C.** Direct to the vendor's own MCP
endpoint, the engine doing OAuth. Pipedream stays built and is the
fallback for services with no MCP of their own.

What that means in code, all of it established by reading the engine:

**The config we write** (`openclaw/src/config/types.mcp.ts`, lines 36–58)
— tokens are stored in OpenClaw state, never in config:

```jsonc
{ "url": "https://…/mcp", "transport": "streamable-http",
  "auth": "oauth", "oauth": { "scope": "…" } }
```

**The flow.** `mcp-transport.ts` builds an OAuth client provider whenever
`auth === "oauth"`, so the tools work once there are tokens. Getting the
tokens is a two-step the CLI drives (`openclaw/src/cli/mcp-cli.ts`,
`mcp login`):

1. `runMcpOAuthLogin({ serverName, serverUrl, onAuthorizationUrl })`
   returns `"redirect"` and hands back an authorization URL.
2. The person approves; the provider redirects with a code.
3. The same call again with `authorizationCode` returns `"authorized"`,
   and the tokens are written under the state dir.
4. `mcp reload` disposes cached runtimes so the next turn uses them.

**The gap, and it is ours to fill.** Nothing but the CLI calls those
functions — there is no gateway route for them — and the CLI's own flow
is manual: it prints the URL and tells you to re-run with `--code`. So
the app has to hold the middle: listen for the redirect, catch the code,
and make the second call. Two things we already have make this a
LobsterAI-side job with no engine patch:

- `src/main/libs/authLocalCallbackServer.ts` already does exactly this
  shape for the Claidor browser login.
- `openclawEngineManager` resolves the runtime entry and spawns it with
  `OPENCLAW_STATE_DIR` set, so the same entry runs `mcp login` against
  the same token store.

The SDK's default redirect is `http://127.0.0.1:8989/oauth/callback`,
and `oauth.redirectUrl` can override it per server.

## 8. What this note does not decide
- **Gmail.** Under A it works from day one because Pipedream's audit
  covers it. Under C it is Google's own MCP endpoint and their consent
  screen, which may want a verified client of ours.
- **Whether a service with no MCP anywhere stays "soon"** or gets a
  browser recipe. Twenty-five of the sixty-five were always going to be
  browser or local.

---

## 9. 15 September — read again, and probed

The founder: *"a lot are lies. lets try to understand what connectors
are. based on the mds, then look at our code."* This section is that
reading, with every claim tied to a file or to a live probe run today.

### 9.1 What a connector is, in the sources

`grok-bot.md` §6: *"Connectors are integrations (Notion, Slack, Linear,
GitHub, etc.) packaged as plugins with MCP servers and often skills."*
The lifecycle is search the catalogue → plugin detail → confirm card →
install → host connect card for sign-in → authenticate or reconnect as
status requires. Connected tools become live tool namespaces. The
system contract §24 names the tools: `SearchPlugins`, `GetPlugin`,
`InstallPlugin`, `AddMcpServer`, `AuthenticateMcpServer`,
`GetMcpTools`, `CallMcpTool`. Sign-in is a **host-authored connect
card**; the agent never pastes an auth link.

So a connector is three things: a catalogue entry, an MCP server the
host signs the person into, and (sometimes) a skill telling the agent
how to use it. The sign-in is the host's job. Not the skill's.

### 9.2 What `github.com/cursor/plugins` actually is (cloned today)

64 third-party plugins. Each is `plugin.json` + `mcp.json` + `README`
+ logo. **One of the 64 ships a skill** (`x/skills/x-api-mcp-guide`),
and it is prose for after the connection: check credits, phrase
errors. It does not authenticate anything. The other 91 skills in the
repo belong to Cursor's own developer plugins (`pstack`, `thermos`,
`cursor-team-kit`, …) and have nothing to do with connectors.

**Grok Bot's twenty managed skills are not in this repo.** `routines`,
`add-connector`, `no-connector-fallback`, `shopping`, `flights`,
`send-on-behalf` and the rest live on Grok Bot's box under
`/home/box/agent-data/managed-skills/` (contract §21.2) and are not
published. We have their names and one-line descriptions, nothing
else.

**Answer to the founder's question.** No — a Cursor plugin's skill does
not authenticate, and was never meant to. Sign-in is done by the MCP
client: OAuth discovery, dynamic client registration, PKCE, tokens.
Our engine is that client (`openclaw/src/agents/mcp-oauth.ts`), and it
is the thing that connects a service "in our stuff".

### 9.3 What our code does, file by file

| Layer | File | True state |
|---|---|---|
| Catalogue | `shared/connections/catalog.ts` | 109 cards: 84 accounts (48 direct MCP, 28 Pipedream, 6 token, 2 local), 14 browser, 6 local, 4 channel, 1 soon |
| Shelf | `design/connections/shelf.ts` | only the 48 direct-MCP cards get a Connect button; the count reads "48 services you can sign in to" |
| Connect | `main/libs/connections/connectService.ts` | writes the server, listens on 127.0.0.1:8989, runs the engine's `mcp login`, opens the URL, catches the code, runs `mcp login --code`, `mcp reload` |
| Engine | `openclaw/src/agents/mcp-oauth.ts` | MCP SDK `auth()`: discovery, dynamic registration, PKCE, tokens under the state dir |
| Server | `server/polar/connectors/` | Pipedream Connect: list, link, disconnect, MCP proxy; gated to a staff allowlist |
| Desktop → server | — | **nothing.** The Pipedream client the desktop once had (`3e1224d5`) was not recovered. The 28 Pipedream cards say "Not yet", which is true. |
| Agent tools | — | none. No search, install or authenticate tool. The prompt says: say so once, point at Apps. |

**Nobody has completed a sign-in.** Review item 23 ran `mcp login` for
Todoist and got the real authorization URL; the "Allow" click on the
vendor's page has never been made by anyone, so "Connected" has never
been seen on a card.

### 9.4 The probe: which of the 48 can actually sign in

Every direct-MCP endpoint in the catalogue was asked, today, from this
container: an unauthenticated `initialize`, then the protected-resource
metadata, then the authorization server's metadata, looking for a
`registration_endpoint`. Without one, the engine's dynamic registration
fails and the card cannot connect.

| | Services |
|---|---|
| **Dynamic registration advertised — should connect (37)** | Coda, Craft, Mem, Guru, Readwise, Todoist, Jotform, Typeform, Fathom, Otter, Circleback, Fireflies, Gamma, Brex, Mercury, Navan, Interactive Brokers, Webull, Daloopa, S&P Global, Klaviyo, Customer.io, MailerLite, Meltwater, Profound, Ahrefs, Semrush, Calendly, Attio, Clay, Outreach, Amplemarket, Upwork, Gong, Ashby, Workable, Juicebox |
| **No dynamic registration — a pre-registered client is required (8)** | Gmail, Google Calendar, Google Drive, BigQuery, Zoom, HubSpot, X Ads, Intercom |
| **Answered 200 with no sign-in at all (2)** | Excalidraw, GoDaddy — open servers; "Connect" here would run a sign-in that does not exist |
| **Refused the probe (1)** | Docusign (403) |

The catalogue marks five as `Preregistered`; the probe says eight, and
it missed Intercom. Google's own page for its Gmail MCP server says it
plainly: create a Google Cloud project, configure the consent screen,
create an OAuth client ID and secret, and give them to the MCP client.
That is the same Google audit the Pipedream note was written to avoid.

**The engine has nowhere to put a client id.** `types.mcp.ts` allows
`scope`, `redirectUrl` and `clientMetadataUrl` and nothing else. But
the SDK skips registration whenever the provider already holds
`clientInformation`, and the provider reads that from a file under our
state dir. So a pre-registered client is one of two small changes: seed
that file before `mcp login`, or a patch adding `oauth.clientId` and
`oauth.clientSecret` to the config. Neither exists today.

### 9.5 What is false in what we say

1. **"48 services you can sign in to"** (`shelf.ts`). Ten of the 48
   cannot with what is built; a Connect button on Gmail today ends in
   the engine's sentence "does not support dynamic client
   registration". Honest number: 37, unproven.
2. **`agent-contract.md` §24.2** says Pipedream is "on the server for
   hosted sign-in and a per-service MCP target". The server is. The
   desktop cannot reach it, so for the person it does not exist.
3. **`OAuthRegistration.Preregistered`** is on five cards; it belongs
   on eight, and two cards (Excalidraw, GoDaddy) need no sign-in and
   are drawn as if they did.
4. **The prompt** tells the agent the person connects things "in Apps".
   True only for the 37, and only if the flow that has never been
   completed completes.
5. **Nothing says the sign-in has never worked end to end.** It is the
   most important fact on this page and it was in one review item.

### 9.6 What Grok Bot has that we do not, on this subject

- The agent-side tools (search, detail, install, authenticate) and the
  `add-connector` conversation. Ours can only point at Apps.
- The twenty managed skills. Not public; not in the plugin repo.
- A connect card in the thread. Ours is a button on the Apps shelf.
- Connector status the agent can see (`needsAuth`, `error`, `loading`).
  Ours: the engine reports tools or no tools.
