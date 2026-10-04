# Simeon on the web

The Mac app's window, served at `app.simeonlabs.com/app`, with the page
standing in for Electron. Same agents, same cloud computer, same memory as
the Mac; nothing to download.

## How it works

On a Mac the window talks to Electron main (`window.desktop`) and, through
the node-agent-coordinator, to the host in the person's cloud computer
(`window.coordinatorPort`). The coordinator's half is `fetch`: a POST per
command to the box's gateway and SSE for its events, through the API's proxy
at `/sand-box/{box}/p/1340`. So the browser runs it as is:

- `bridge.ts` installs the app's own preload (`source/electron-preload/preload.ts`)
  over a fake `ipcRenderer`, runs the app's own port server
  (`source/node-agent-coordinator/renderer-port-server.ts`) on a
  `MessageChannel`, and swaps the window's `<webview>` (the computer panel)
  for an `<iframe>`.
- `gateway.ts` runs the coordinator's gateway client
  (`source/node-agent-coordinator/gateway/`) in the page: the broker's
  `EnsureSandBox` for the box's address, then commands and the event stream
  through the proxy. The host refuses requests that carry a browser
  `Origin`; the proxy strips it (`server/simeon/sand/box_proxy.py`), so the
  guard keeps protecting direct access while proxied, token-checked calls go
  through.
- `api.ts` is the door to Simeon Labs' server. The person is signed in on
  the web app with its cookie; the page trades it once for the Mac's token
  pair (`POST /auth/web-session`, `server/simeon/desktop/app_sign_in.py`),
  keeps it in `sessionStorage` for the tab, and refreshes it at
  `/oauth/token` as the Mac does.
- `backend.ts` answers what the window asks Electron main for: the account
  and the models from the server; pinned agents, the default model, sidebar
  sections, onboarding and secrets from the host in the box, where the Mac
  keeps them too; theme, time zone and the window's small persistence from
  this browser.

The computer panel: the window draws it in Electron's `<webview>`, which
`bridge.ts` swaps for an `<iframe>` on the box's noVNC page through the
proxy (the agent pane's Computer tab, its preview and the full-size view).
The frame's load stands in for the message the Mac's preload sends from
inside the webview once the screen is up (`sand:vnc-session`, phase
`rfb_connect`), which is what takes the window's spinner off the picture.

Connected apps (MCP): the manager that answers the window on a Mac from
Electron main runs in the box too, so the window's calls go to it through
the gateway (`desktopMcp`, `host/host-gateway-api.ts`, the `window` facade
in `host/extensions/mcp/mcp-service.ts`): the catalog, installs, accounts,
tools, instructions. A sign-in starts in the box as well: the vendor is
registered with the server's hosted callback
(`GET /desktop/mcp-oauth/callback`, `server/simeon/desktop/app_sign_in.py`)
instead of the Mac's loopback, the page opens the vendor in a new tab, the
vendor sends the person back to the server, the server to
`/app/connected.html` on the web app, and the bridge there hands the box
the code (`completeMcpOAuth`). The box stores the credential, its auth watch
sees it and the window in the first tab hears of it on the host's `mcp-auth`
channel (`sand:mcp-auth-event`). Apps Simeon Labs' own server serves (Gmail,
Slack, …) sign in through the server as on a Mac; the box's credential may
now start and end those (`apps.py`).

Credentials have two writers since then, the Mac and the box; each refreshes
the sign-ins it finished and sends the other side a copy without the refresh
token (`serializeVendorMcpStoreForPeer`, `serializeAccountMcpStoreForPeer`),
and a shared install keeps the newer credential event on either side
(`credentialAtMs` in `vendor-mcp/installs.ts`; `updatedAtMs` in the account
store), so a sign-in on the web reaches the Mac, a sign-out anywhere reaches
everywhere, and a rotating refresh token is spent by one party. The box
refreshes its own stale tokens before answering the Mac's pull of its store.

A vendor registered by hand in its console (`clientId` in the catalog) must
also list the hosted callback as a redirect URI; a dynamically registered
one registers it on every sign-in.

Not on the web, by design: the local-exec daemon (the agent's hands on the
person's own Mac), WebAuthn, voice calls, the updater, the egress tunnel.
Each answers "needs Simeon on your Mac" in the shape the window draws.

## Building and running

```sh
cd desktop
npm run web:build     # builds into clients/apps/web/public/app (committed)
npm run web           # serves it on 127.0.0.1:4174 with a stand-in server and box
npm run web -- --real # serves it against the API on 127.0.0.1:8000
npm test              # tests/app-web.test.mjs among the rest
```

The window is the same patched renderer the website hosts under
`sites/simeonlabs.com/public/app/<digest>/`; `build-web.mjs` copies its
assets, bundles `bridge.ts` with esbuild (`node:crypto` shimmed, the gateway
client's one Node import), and rewrites the page's policy to allow the API.
The web app serves `/app` from `public/app` (`clients/apps/web/next.config.mjs`,
the rewrite and its own CSP). After changing anything here, run
`npm run web:build` and commit `clients/apps/web/public/app`.

The stand-in server (`serve-web.mjs`) answers the cookie trade, the profile,
the models, the broker and the box's gateway from the website's scripted
backend (`demo/backend.ts`), so the whole page runs, sign-in to a streaming
reply, before any real server is involved. It stands in for connected apps
too: a small catalog, the manager's answers, a pretend vendor at
`/vendor/authorize`, the hosted callback and the box's completion, so the
whole sign-in runs in a browser from Connect to Connected.
