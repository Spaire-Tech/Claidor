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
proxy. The pinned window ships with the computer button compiled out
(`sand-chat-header__computer` is behind a constant false in the bundle), so
the swap is ready for the day it returns and cannot be exercised today.

Not on the web, by design: the local-exec daemon (the agent's hands on the
person's own Mac), WebAuthn, voice calls, the updater, the egress tunnel.
Each answers "needs Simeon on your Mac" in the shape the window draws.
Connected apps (MCP) are managed from the Mac for now: the manager runs in
Electron main, not in the box.

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
reply, before any real server is involved.
