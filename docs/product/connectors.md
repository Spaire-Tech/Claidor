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
