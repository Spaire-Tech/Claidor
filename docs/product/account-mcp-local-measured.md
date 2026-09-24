# Custom MCP servers and account plugins live on the Mac (24 September 2026)

`docs/product/reconstruction-gaps-2026-09-24.md` item 6: "Custom MCP servers
and account plugins cannot be added. Reads return `{unavailable: true}`;
writes (`InstallUserPlugin`, `SetMcpConfig`, `UninstallUserPlugin`) throw."

## What was there

Grok Bot kept the account's MCP configuration on Cursor's server. The
reconstruction still called those RPCs from
`shared/node/cursor-backend/account-mcp.ts` (`GetAvailableMcpServers`,
`GetMcpConfig`, `SetMcpConfig`, `InstallUserPlugin`, `UninstallUserPlugin`,
`UpdateUserPluginInstall`), with a Connect client built at
`electron-main/mcp/desktop-mcp-manager.ts` and
`host/extensions/mcp/mcp-service.ts`; and every non-vendor HTTP server's
tools went through `shared/node/cursor-backend/backend-mcp-exec.ts`
(`ListSandMcpTools`, `ExecuteSandMcpTool`, `CheckHttpMcpStatus`,
`CompleteMcpOAuth`, …). Simeon Labs' server serves none of these and will
not. A second fault sat in front of the first: the manager's `addServer`
parses the JSON an `AddMcpServer` carries with `options.parseServerConfig`,
which neither composition supplied, so the tool threw `parse is not a
function` before any RPC was reached.

## What changed

The pattern is the one the vendor connectors got the same day
(`connectors-signin-measured.md`), extended to the general case.

- **`shared/node/account-mcp/store.ts`** — the store, `account-mcp-config.json`
  beside `vendor-mcp-installs.json`: custom servers by name (a `url` with
  optional `headers`, or a `command` with `args`/`env`), installed plugins
  by decimal id, and the credential a custom URL server's sign-in left, by
  server id. Server ids are random decimals in 100,000–899,999, below the
  vendor band and inside int32, because both the Mac and the box allocate.
  Every entry carries `updatedAtMs`; a removal is a tombstone;
  `mergeAccountMcpStores` takes the newer entry per name (a tie keeps the
  local copy). The config parser that was private to `account-mcp.ts` lives
  here now (`parseAccountMcpServerConfigValue`); the types are re-exported
  from where they were.
- **`shared/node/account-mcp/local-client.ts`** — the six RPCs answered
  from the store, as the generated proto messages
  (`GetAvailableMcpServersResponse`, `GetMcpConfigResponse`,
  `McpServerMetadata`, `InstallUserPluginResponse`, …), so
  `account-mcp.ts` reads them exactly as it read the wire. A URL server
  shows one account slot only once a credential is held; until then its
  status is whatever the backend reports when it lists tools.
- **`shared/node/cursor-backend/account-mcp.ts`** — `AccountMcpDependencies`
  names a `rootDir` and, on the Mac, a `syncStore`; `createClient` is
  optional and for tests. `fetchAccountMcpServers`,
  `fetchEffectiveUserPlugins`, `backfillUserPluginInstalls` and the writer
  all go through `accountMcpClient`, which is the local client. No Connect
  client is reachable from this file.
- **`shared/node/account-mcp/backend-exec.ts`** — the backend the manager
  talks to for a custom URL server, between the vendor one and Cursor's:
  tools listed and called over streamable HTTP by
  `vendor-mcp/http-mcp-client.ts` (which now sends the server's configured
  headers and treats the bearer as optional), a 401/403 as needsAuth,
  `checkAuthStatus` probing first (a public server or one with its token in
  `headers` is "already authenticated"), then on the Mac the vendors' OAuth
  flow (discovery, dynamic registration, PKCE, the loopback; pending
  sign-ins in a table of its own), in the box needsAuth with the server's
  URL as the never-opened link. The credential is refreshed on the Mac
  only; logout and account removal tombstone it.
- **Both compositions** — the chain is vendor → account → Cursor on the
  Mac (`desktop-mcp-manager.ts`, `mcp-oauth-loopback-provider.ts`) and in
  the box (`mcp-service.ts`); effective plugins are the vendor installs
  plus the store's; both pass the parser `addServer` was missing.
- **The store travels both ways.** The agent's `AddMcpServer`,
  `UninstallMcpServer` and plugin tools run in the box, so the box's copy
  is where those writes land; the vendor pattern (Mac writes, box receives
  a whole replacement) would have wiped them on the next refresh, and the
  connect card, which runs on the Mac, would have found no row. So: the Mac
  sends its store with every `refreshMcp` and `setHostSettings`
  (`mcp-desktop.ts`, the `account_mcp` resync step); the box merges it
  (`replaceAccountMcpStore`, gateway) and answers with the merged copy,
  which the Mac merges into its file; and before each of the Mac's reads
  `account-mcp/box-pull.ts` pulls the box's copy (`refreshMcp` with
  `routedAction: "account-mcp-store"`), at most once per two seconds,
  bounded at three, so a cold box costs a read three seconds and not a
  hang.

## Measured

Offline, `desktop/tests/account-mcp-local.test.mjs`, all against a bundle of
the real modules and, for HTTP, an in-process `http.createServer` speaking
JSON-RPC `initialize` / `tools/list` / `tools/call` with the OAuth discovery,
registration and token endpoints on the same origin:

- set config → get config round-trips through the file; ids are positive
  decimals below the vendor band and survive re-writes; a stdio server keeps
  command, args and env; a removal is a tombstone; a config that is not one
  of ours is refused and nothing is written;
- the merge takes the newer entry per name on either side, a tie keeps the
  local copy, tombstones win over older live entries; the Mac's pull merges,
  throttles and gives up on a slow box without holding the read;
- a custom URL server's tools are listed and called with its configured
  header, the session is reused, the result is the generated `McpResult`;
  a wrong header (401) reads as needsAuth; an unknown server goes to the
  next backend; a server needing no sign-in reports so;
- a 401 yields `requiresAuth` with an authorize URL on the Mac (client
  registered, PKCE, state), never on the box (no discovery, no
  registration; the card's door is the server's URL); the loopback's code
  becomes a credential in the Mac's file only; the state is single use;
  the box serves tools with the copied credential and never spends a
  refresh token on an expired one; the Mac refreshes past expiry; logout
  clears;
- install, update and uninstall of a plugin round-trip; an uninstall is a
  tombstone; a re-install comes back without the old variables;
- the wiring anchors on both sides, the gateway, the loopback, the IPC, the
  adapter, the resync and `account-mcp.ts` itself.

Full suite green with the new file; `tsc --project source/tsconfig.json`
exit 0.

**Not run on a Mac.** In particular not measured: an `AddMcpServer` from a
product turn reaching the box's file and then Settings on the Mac; the
connect card for a custom server (the Mac's `authenticateServer` should
now find the row through the pull); the cost of the pull when Docker is
off (the coordinator leg rejects at once with "no live coordinator
session", which the pull logs and skips); and which screen of the pinned
renderer, if any, lists custom servers with a `command`.

## Left out, and why

- **stdio servers are not run by this change.** A command-configured
  server goes where it always went: the manager lists it through the
  box's own MCP executor (`host/extensions/mcp/box-mcp-exec.ts` →
  `boxLoadMcpServers` → the box's `mcpStateExecutorResource`), which spawns
  it inside the box. That path existed and is untouched; the store only
  makes the row exist. No new stdio client was built, and whether the
  box's executor accepts the config as written is not measured here.
- **The catalog stays the vendor list.** A plugin installed through the
  writer is a record with no servers of its own; nothing in the tree
  produces a non-vendor plugin with servers.
- **`redactSecrets` is ignored** by the local client: the store is on the
  person's own machine, and `headers` (which may carry a token) are read by
  the backend from the file, never placed on a display row.

## To read on a Mac

Ask an agent to add a remote MCP server by URL. Then:

```
cat ~/Library/Application\ Support/Simeon/sand-data/account-mcp-config.json
docker exec simeon-box cat /home/box/sand-data/account-mcp-config.json
docker exec simeon-box grep -i 'account-mcp' /tmp/sand-host.log | tail
```

The two files should agree on the server; if the server needs a sign-in,
the chat shows the connect card, Connect opens the browser, and after
approving, the Mac's file carries a `credentials` entry for the server's
id and the box's file follows within the next refresh.
