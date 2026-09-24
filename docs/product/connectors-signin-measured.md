# Connectors sign in and serve tools (24 September 2026)

The founder: "i thought i fixed the connectors, but its still not fixed.
double check please." The agent had said: "Figma is installed, but the
connector hasn't appeared for authorization yet."

## What was there

Two connector managers, one on the Mac (`electron-main/mcp/desktop-mcp-manager.ts`)
and one in the box (`host/extensions/mcp/mcp-service.ts`), both Grok Bot's
`SandMcpManager` around a "backend exec" that was Cursor's dashboard:
tool listing, tool calls, the OAuth start (`checkAuthStatus`), the OAuth
finish (`completeOAuth`), token checks. Claidor serves none of it. The
vendor store (`shared/node/vendor-mcp/`, 15 September) added our own
catalogue of vendor-hosted MCP servers and, on install:

- in the box (`connectVendorMcp`), wrote an install file and stopped;
- on the Mac, wrote the file and opened the vendor's sign-in page.

Nothing anywhere exchanged the code the browser came back with, stored a
token, or turned the vendor's URL into a server with tools. Searched for
`connected: true`, `completeOAuth`, `VendorMcpOAuthPending` and
`loadVendorMcpInstalls` across `desktop/source` on 24 September: the
install file was read in two places, both only to mark a plugin
"installed". And since product turns run in the box (22 September),
InstallPlugin took the box path: the agent then asked for the plugin's
servers, which come from Cursor's account list, empty here, so no row was
"needsAuth", no card was drawn, and the agent wrote the sentence above.

#185 ("resume agent after MCP OAuth") fixed a step downstream of a
sign-in that never started.

## What changed

Everything after install now runs on the manager's own code paths, with
one object of ours behind them.

- **`vendor-mcp/backend-exec.ts`**: an implementation of the backend the
  manager talks to for HTTP servers, for the vendor connectors, wrapping
  the old Cursor one for anything else. `listTools` and `executeTool`
  speak MCP to the vendor over streamable HTTP with the bearer token;
  `checkAuthStatus` reports a valid token or starts a sign-in (Mac only:
  discovery, dynamic registration, PKCE, an authorize URL);
  `completeOAuth` exchanges the loopback's code for a token; logout and
  account removal clear it. `canStartAuth: false` in the box: it only
  reads the store and reports needsAuth with the vendor's URL as the
  never-opened link, which is what draws the connect card.
- **`vendor-mcp/http-mcp-client.ts`**: the MCP client. Initialize once,
  `notifications/initialized`, `tools/list` with pagination, `tools/call`;
  JSON or SSE replies; `Mcp-Session-Id`; a 401 or 403 is
  `VendorMcpAuthRequiredError`; a 404 on a known session re-initializes
  once.
- **`vendor-mcp/display.ts`**: an installed live connector is an account
  row for the manager (numeric id from `vendorMcpServerId`, identifier the
  plugin id, HTTP config the vendor's URL, one `default` slot whose
  `hasToken` is whether a credential is held). The merge keeps the base
  scope, and the last seen scope across a failed read, because a scope
  change cancels every pending sign-in watch.
- **`vendor-mcp/installs.ts`**: the store carries a `credential` (access
  token, refresh token, expiry, token endpoint, client id). The Mac is the
  only writer. `replaceVendorMcpInstalls` is what the box does with the
  copy it receives.
- **`vendor-mcp/catalog.ts`**: `vendorMcpServerId(pluginId)`, a stable
  decimal above 900,000, because `mcp-server-id.ts` refuses any server id
  that is not a positive decimal string.
- **`vendor-mcp/oauth.ts`**: the pending sign-in carries its `state`, a
  process table holds pending sign-ins for fifteen minutes (the manager
  starts one, the loopback finishes it, different objects in the same
  process), `exchangeVendorMcpCode`, `refreshVendorMcpGrant`.
- **Mac**: the manager's backend is the vendor one with `canStartAuth:
  true`; the loopback's `completeOAuth` goes to it first; the Plugins
  overlay's install starts the sign-in at once (`mcp-desktop.ts`,
  `sand:mcp-install`); every `refreshMcp` to the host carries the store
  (`readVendorMcpStore`), the resync pushes it on every transport connect
  (`vendor_mcp` step), and a credential change on the Mac pushes it again
  (`onVendorCredentialChanged`).
- **Box**: `refreshMcp` and `setHostSettings` accept `vendorMcpStore` and
  write it to the box's sand root, then restart the manager.

The sequence for the agent's InstallPlugin: install writes the file in
the box → reload → the row lists as needsAuth → `newNeedsAuthRows` →
connect card with the numeric id → Connect runs on the Mac
(`sand:mcp-auth` → `authenticateServer` → vendor `checkAuthStatus` →
authorize URL → loopback registered → browser) → callback →
`completeOAuth` → credential stored → the Mac's auth watch sees
`hasValidToken` → completion → `refreshHostMcp` with the store → the box
writes it, restarts, resumes the agent (#185) → tools on the next
message.

## Measured

Offline, `desktop/tests/vendor-mcp-connect.test.mjs`: the ids, the store,
the rows and the merge, the HTTP client against a scripted vendor
(initialize, SSE list, call, 401), the Mac backend end to end (start, code
exchange with PKCE, single-use state, list, call, refresh past expiry,
logout, fallback), the box backend (no request ever made, expired reads
as needsAuth), and the wiring anchors. Full suite green.

**Not run on a Mac.** In particular, not measured: that Figma's, Notion's
and Linear's servers accept dynamic registration with a loopback
redirect today (they did on 15 and 19 September per the catalogue's
note); the SSE shape of each vendor's reply; the box reaching the vendor
over the container's egress; and the renderer's handling of a `started`
result from the install path.

## To read on a Mac

Ask an agent to install Figma. The chat should show the connect card at
once. Press Connect; the browser should open Figma's authorization page.
After approving:

```
cat ~/Library/Application\ Support/Simeon/sand-data/vendor-mcp-installs.json
docker exec simeon-box cat /home/box/sand-data/vendor-mcp-installs.json
docker exec simeon-box grep -i 'vendor-mcp' /tmp/sand-host.log | tail
```

The first two should agree and carry a credential; the third should show
`credential stored` on the Mac side only (the box logs list failures).
Then ask the agent to use a Figma tool and read the `[claidor] tool=`
line.
