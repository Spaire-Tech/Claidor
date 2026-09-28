# Apps under Simeon's name (28 September 2026)

> **Status, same evening: the app side is withdrawn.** The server routes were
> not live (404 on `api.simeonlabs.com`; Render had not deployed), so every app
> card's sign-in went nowhere, and the founder reported the vendor connectors
> broken too, a cause not established. The desktop files are back to their
> state before this change; `server/polar/desktop/apps.py` stays. Before
> re-landing: the routes answer on the live host, `COMPOSIO_API_KEY` is set,
> and one app is signed in and one tool called end to end.

The founder: "for the rest of the connectors, lets use composio. but i want to
white label it. i dont want anywhere to show composio" — then "use composio's
google app for now. dont break anything please. make sure all connectors work."

## What a person sees

The Connect apps sheet has 52 cards and none of them is "Coming soon" any more.

- The 21 vendor connectors that already worked (Notion, Linear, Stripe, Canva, …)
  are unchanged: the vendor's own MCP, the vendor's own sign-in.
- 31 cards are apps served by Simeon Labs' server:
  - the 18 that were "Coming soon": Gmail, Outlook, Google Calendar, Google Drive,
    Asana, Todoist, Zoom, Google Meet, Figma, QuickBooks, HubSpot, Salesforce,
    Intercom, GitHub, Mailchimp, Gusto, Slack, LinkedIn;
  - 13 appended: Google Docs, Sheets, Slides and Tasks, OneDrive, Trello, Xero,
    Shopify, Brex, Pipedrive, Docusign, Klaviyo, Ashby.

  Each is a card with Connect, a connected row, and tools for the agent.

The app slugs were checked on 28 September against composio.dev/toolkits/<slug>:
every one answered 200, and a made-up one answered 404.

## How it works

**Server** (`server/polar/desktop/apps.py`) holds `COMPOSIO_API_KEY`. The app and
the box never see Composio. Each person is `claidor-<user id>` to Composio, the
same id the older forwarder in `composio.py` used.

| Route | Who can call | What it does |
|---|---|---|
| `POST /desktop/api/apps/mcp/{toolkit}` | desktop, box | An MCP server of ours: `initialize`, `tools/list` (the app's featured tools, or its first 80), `tools/call`. It answers 401 when the app is not connected. |
| `GET /desktop/api/apps/{toolkit}/status` | desktop, box | `{connected}`. |
| `POST /desktop/api/apps/{toolkit}/connect` | desktop | The sign-in link. It is made through a tool-router session, which picks the app's managed auth config, and it returns to our page. |
| `DELETE /desktop/api/apps/{toolkit}` | desktop | Disconnect. |
| `GET /desktop/apps/connected` | anyone | "Connected. You can close this tab and go back to Simeon." |
| `GET /desktop/apps/oauth/callback` | anyone | 302 to Composio's callback. This is the redirect URI to register in a provider's console once Simeon Labs brings its own OAuth app. |

Every tool description, result and error passes through `scrub`, which replaces
the provider's name.

**App.** An app is a vendor connector whose `url` is our MCP address (`appsToolkit`
in `vendor-mcp/catalog.ts`). So the Plugins sheet, the connect card, the
agent's InstallPlugin / AuthenticateMcpServer, the tools on the next message,
and the Mac-to-box store copy all use the code that already worked.
`vendor-mcp/backend-exec.ts` handles the differences:

- **Credential.** The bearer is the account's own, from `getServerAccessToken`:
  the app's token on the Mac, the box's own credential in the box. No token is
  stored per app. The row's `credential` is only a "connected" marker
  (`clientId: "simeon-apps"`), kept in step with `/status`.
- **Sign-in.** On the Mac, sign-in asks `/connect` for the link and opens it.
  The auth watch then polls `validateTokens`, which asks `/status`. In the box,
  sign-in draws the card and leaves the browser to the Mac, as for any vendor.
- **Logout.** Logout and delete call the server's disconnect.

## Where the provider can still be seen, and what removes it

- **Google's consent screen** says the provider's name while its managed Google
  app is used. That was the founder's choice for now. It goes away only with
  Simeon Labs' own Google OAuth app. Gmail's read scopes are "restricted", so
  Google requires verification and a yearly security assessment.
- **Other OAuth apps' consent screens** show the provider's name in the same way.
  Each one goes away when Simeon Labs registers its own app with that provider
  and adds it as a custom auth config in the provider's dashboard. The redirect
  URI to register is `https://api.simeonlabs.com/desktop/apps/oauth/callback`.
- **The provider's hosted connect page**, if the link opens one, shows the
  provider's logo and name. Change it under Project Settings → White Labeling in
  the provider's dashboard.
- **The browser's address bar** shows the provider's domain for a moment during
  sign-in, while the managed app is used.

## Needs the founder

- `COMPOSIO_API_KEY` set on Render (the API service).
- Simeon's logo and name in the provider's White Labeling settings.

## Measured, and not

**Measured offline:**

- `server/tests/desktop/test_apps.py`: the routes, with the provider mocked.
- `desktop/tests/vendor-mcp-oauth-shapes.test.mjs`: sign-in, status, the marker,
  tools and disconnect, on the Mac and in the box, against a fake server.

**Not yet run:**

- a real sign-in against the live provider;
- a real tool call;
- anything on a Mac.

The lines to read are:

- `desktop.apps.sign_in_started` on the server;
- `figma sign-in started through Simeon's apps service` (or the app's id) in
  `~/.caisra/vendor-mcp-signin.log`;
- a `[claidor] tool=` line naming an app's tool in `/tmp/sand-host.log`.
