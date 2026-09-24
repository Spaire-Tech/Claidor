/**
 * Vendor connectors sign in and serve tools (24 September 2026). Until now
 * InstallPlugin in the box wrote an install file and stopped: no server row,
 * no needsAuth, no card, and on the Mac the browser opened on a sign-in that
 * nothing ever finished. Now a vendor connector is an account row for the MCP
 * manager, its sign-in is started by checkAuthStatus and finished by the
 * loopback on the Mac, the credential is copied to the box, and tools are
 * listed and called over streamable HTTP by our own client.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const sse = (messages, headers = {}) =>
  new Response(messages.map((message) => `event: message\ndata: ${JSON.stringify(message)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream", ...headers } });

const FIGMA = "https://mcp.figma.com/mcp";

/** A vendor that discovers, registers, exchanges a code, refreshes, and serves two tools over SSE. */
function vendorFixture({ token = "tok-1", expiresIn = 3600, refreshed = "tok-2", requireToken = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const text = String(url);
    const method = init?.method ?? "GET";
    calls.push({ url: text, method, body: init?.body, headers: init?.headers ?? {} });
    if (text.includes("oauth-protected-resource")) return json({ authorization_servers: ["https://auth.figma.com"] });
    if (text.includes("oauth-authorization-server")) return json({ authorization_endpoint: "https://auth.figma.com/authorize", token_endpoint: "https://auth.figma.com/token", registration_endpoint: "https://auth.figma.com/register" });
    if (text.endsWith("/register")) return json({ client_id: "simeon-client" });
    if (text.endsWith("/token")) {
      const form = new URLSearchParams(String(init?.body));
      if (form.get("grant_type") === "authorization_code") return json({ access_token: token, refresh_token: "refresh-1", expires_in: expiresIn });
      if (form.get("grant_type") === "refresh_token") return json({ access_token: refreshed, expires_in: 3600 });
      return json({ error: "unsupported_grant_type" }, 400);
    }
    if (text === FIGMA) {
      const auth = init?.headers?.authorization ?? "";
      if (requireToken && !auth.startsWith("Bearer tok")) return new Response("", { status: 401 });
      const request = JSON.parse(String(init?.body));
      if (request.method === "initialize") return json({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "figma" } } }, 200, { "mcp-session-id": "sess-1" });
      if (request.method === "notifications/initialized") return new Response("", { status: 202 });
      if (request.method === "tools/list") return sse([{ jsonrpc: "2.0", id: request.id, result: { tools: [{ name: "get_file", description: "Read a file", inputSchema: { type: "object" } }, { name: "get_node" }] } }]);
      if (request.method === "tools/call") return json({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: `called ${request.params.name} with ${JSON.stringify(request.params.arguments)}` }], isError: false } });
      return json({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "no such method" } });
    }
    return json({ error: "unexpected" }, 500);
  };
  return { calls, fetchImpl };
}

test("a vendor connector has a stable numeric server id and reads back as a plugin id", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/catalog.ts", "vendor-ids");
  try {
    const { vendorMcpServerId, vendorMcpPluginIdForServerId, VENDOR_MCP_SERVER_ID_BASE, VENDOR_MCP_CONNECTORS } = module;
    const id = vendorMcpServerId("figma");
    assert.match(id, /^\d+$/);
    assert.ok(Number(id) > VENDOR_MCP_SERVER_ID_BASE);
    assert.equal(vendorMcpPluginIdForServerId(id), "figma");
    assert.equal(vendorMcpPluginIdForServerId(Number(id)), "figma");
    assert.equal(vendorMcpServerId("nope"), undefined);
    assert.equal(vendorMcpPluginIdForServerId("12"), undefined);
    assert.equal(vendorMcpPluginIdForServerId(String(VENDOR_MCP_SERVER_ID_BASE + VENDOR_MCP_CONNECTORS.length + 1)), undefined);
    const ids = VENDOR_MCP_CONNECTORS.map((item) => vendorMcpServerId(item.id));
    assert.equal(new Set(ids).size, ids.length, "every connector has its own id");
  } finally {
    await dispose();
  }
});

test("the install store carries a credential, survives a re-install, and is replaced whole by the host", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/installs.ts", "vendor-store");
  const root = await mkdtemp(path.join(os.tmpdir(), "caisra-vendor-store-"));
  try {
    const { upsertVendorMcpInstall, setVendorMcpCredential, clearVendorMcpCredential, loadVendorMcpInstalls, replaceVendorMcpInstalls, vendorMcpInstallsPath } = module;
    upsertVendorMcpInstall(root, { id: "figma", url: FIGMA, connected: false });
    assert.equal(setVendorMcpCredential(root, "nope", { accessToken: "x", tokenEndpoint: "t", clientId: "c" }), undefined);
    const stored = setVendorMcpCredential(root, "figma", { accessToken: "tok", refreshToken: "r", expiresAtMs: 5, tokenEndpoint: "https://auth.figma.com/token", clientId: "simeon" });
    assert.equal(stored.connected, true);
    assert.equal(loadVendorMcpInstalls(root)[0].credential.accessToken, "tok");
    upsertVendorMcpInstall(root, { id: "figma", url: FIGMA, connected: false });
    assert.equal(loadVendorMcpInstalls(root)[0].credential.refreshToken, "r", "re-install keeps the credential");
    assert.equal(loadVendorMcpInstalls(root)[0].connected, true);
    const written = JSON.parse(await readFile(vendorMcpInstallsPath(root), "utf8"));
    assert.equal(written[0].credential.clientId, "simeon");
    assert.equal(clearVendorMcpCredential(root, "figma"), true);
    assert.equal(clearVendorMcpCredential(root, "figma"), false);
    assert.equal(loadVendorMcpInstalls(root)[0].credential, undefined);
    assert.equal(loadVendorMcpInstalls(root)[0].connected, false);
    const replaced = replaceVendorMcpInstalls(root, [{ id: "notion", url: "https://mcp.notion.com/mcp", credential: { accessToken: "n", tokenEndpoint: "t", clientId: "c" } }, { bogus: true }]);
    assert.deepEqual(replaced.map((item) => item.id), ["notion"]);
    assert.equal(loadVendorMcpInstalls(root)[0].connected, true);
  } finally {
    await rm(root, { recursive: true, force: true });
    await dispose();
  }
});

test("installed live connectors are account rows with one slot; the merge keeps the base scope", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/display.ts", "vendor-display");
  const root = await mkdtemp(path.join(os.tmpdir(), "caisra-vendor-display-"));
  try {
    const { vendorAccountServersFromInstalls, withVendorAccountServers, VENDOR_MCP_CACHE_SCOPE } = module;
    const rows = vendorAccountServersFromInstalls([
      { id: "figma", url: FIGMA, connected: false },
      { id: "notion", url: "https://mcp.notion.com/mcp", connected: true, credential: { accessToken: "t", tokenEndpoint: "e", clientId: "c" } },
      { id: "gmail", url: "https://nowhere", connected: false },
      { id: "unknown", url: "https://nowhere", connected: false },
    ]);
    assert.deepEqual(rows.map((row) => row.serverIdentifier), ["figma", "notion"]);
    assert.equal(rows[0].name, "Figma");
    assert.match(rows[0].id, /^\d+$/);
    assert.deepEqual(rows[0].config, { url: FIGMA, type: "http" });
    assert.equal(rows[0].accounts[0].hasToken, false);
    assert.equal(rows[1].accounts[0].hasToken, true);
    assert.equal(rows[0].pluginId, "figma");

    assert.equal(await withVendorAccountServers(Promise.resolve(null), () => root), null);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path.join(root, "vendor-mcp-installs.json"), JSON.stringify([{ id: "figma", url: FIGMA, connected: false }]));
    const merged = await withVendorAccountServers(Promise.resolve({ servers: [{ id: "1" }], cacheScope: "acct", unavailable: true }), () => root);
    assert.equal(merged.cacheScope, "acct");
    assert.equal(merged.unavailable, undefined);
    assert.deepEqual(merged.servers.map((row) => row.id ?? row.serverIdentifier).slice(-1), [merged.servers.at(-1).id]);
    assert.equal(merged.servers.length, 1, "an unavailable base contributes no rows");
    const both = await withVendorAccountServers(Promise.resolve({ servers: [{ id: "1" }], cacheScope: "acct" }), () => root);
    assert.equal(both.servers.length, 2);
    const failed = await withVendorAccountServers(Promise.reject(new Error("no backend")), () => root);
    assert.equal(failed.cacheScope, "acct", "a failed read keeps the last scope so pending sign-ins are not cancelled");
    assert.equal(failed.servers.length, 1);
    const fresh = await mkdtemp(path.join(os.tmpdir(), "caisra-vendor-display-2-"));
    writeFileSync(path.join(fresh, "vendor-mcp-installs.json"), JSON.stringify([{ id: "figma", url: FIGMA, connected: false }]));
    assert.equal((await withVendorAccountServers(null, () => fresh)).cacheScope, VENDOR_MCP_CACHE_SCOPE);
    await rm(fresh, { recursive: true, force: true });
  } finally {
    await rm(root, { recursive: true, force: true });
    await dispose();
  }
});

test("the HTTP MCP client initializes once, lists tools over SSE, calls a tool, and reads 401 as sign-in", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/http-mcp-client.ts", "vendor-http");
  try {
    const { vendorMcpListTools, vendorMcpCallTool, VendorMcpAuthRequiredError } = module;
    const { calls, fetchImpl } = vendorFixture();
    const tools = await vendorMcpListTools({ url: FIGMA, accessToken: "tok-1", fetch: fetchImpl });
    assert.deepEqual(tools.map((tool) => tool.name), ["get_file", "get_node"]);
    assert.equal(tools[0].description, "Read a file");
    const methods = calls.map((call) => JSON.parse(String(call.body)).method);
    assert.deepEqual(methods, ["initialize", "notifications/initialized", "tools/list"]);
    assert.equal(calls[2].headers["mcp-session-id"], "sess-1", "the session id from initialize is sent back");
    assert.equal(calls[0].headers.authorization, "Bearer tok-1");
    const result = await vendorMcpCallTool({ url: FIGMA, accessToken: "tok-1", fetch: fetchImpl, name: "get_file", arguments: { key: "abc" } });
    assert.equal(result.isError, false);
    assert.equal(result.content[0].text, 'called get_file with {"key":"abc"}');
    assert.equal(calls.length, 4, "the second call reuses the session");
    await assert.rejects(() => vendorMcpListTools({ url: FIGMA, accessToken: "bad", fetch: fetchImpl }), VendorMcpAuthRequiredError);
  } finally {
    await dispose();
  }
});

test("on the Mac the backend starts a sign-in, finishes it from the loopback, lists and calls tools, and refreshes", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/backend-exec.ts", "vendor-backend-mac");
  const root = await mkdtemp(path.join(os.tmpdir(), "caisra-vendor-mac-"));
  try {
    const { createVendorMcpBackendExec } = module;
    const { writeFileSync, readFileSync } = await import("node:fs");
    writeFileSync(path.join(root, "vendor-mcp-installs.json"), JSON.stringify([{ id: "figma", url: FIGMA, connected: false }]));
    const changed = [];
    let clock = 1_000_000;
    const { calls, fetchImpl } = vendorFixture({ expiresIn: 100 });
    const fallbackCalls = [];
    const exec = createVendorMcpBackendExec({
      rootDir: () => root,
      fetch: fetchImpl,
      now: () => clock,
      canStartAuth: true,
      onCredentialChanged: (id) => changed.push(id),
      fallback: { listTools: async (ids) => { fallbackCalls.push(ids); return [{ serverIdentifier: "other", status: "connected", tools: [] }]; }, checkAuthStatus: async (args) => ({ id: String(args.serverId), fallback: true }) },
    });
    const serverId = exec.serverIdForPlugin("figma");

    // Not signed in: the row lists as needsAuth and a tool call says so.
    const [listed] = await exec.listTools(["figma"]);
    assert.equal(listed.status, "needsAuth");
    const refused = await exec.executeTool({ serverIdentifier: "figma", toolName: "get_file", args: {}, toolCallId: "c1" });
    assert.equal(refused.result.case, "error");
    assert.match(refused.result.value.error, /AuthenticateMcpServer/);

    // checkAuthStatus starts the sign-in: discovery, registration, an authorize URL with PKCE.
    const status = await exec.checkAuthStatus({ serverId, accountKey: "default", oauthRedirectUri: "http://localhost:8787/callback" });
    assert.equal(status.requiresAuth, true);
    assert.equal(status.hasValidToken, false);
    const authorize = new URL(status.authUrl);
    assert.equal(authorize.origin, "https://auth.figma.com");
    assert.equal(authorize.searchParams.get("client_id"), "simeon-client");
    assert.equal(authorize.searchParams.get("redirect_uri"), "http://localhost:8787/callback");
    const state = authorize.searchParams.get("state");
    assert.match(state, /^vendor-figma-/);

    // The loopback finishes it: code for token, credential stored, listeners told.
    await exec.completeOAuth({ stateId: state, code: "code-1" });
    assert.deepEqual(changed, ["figma"]);
    const stored = JSON.parse(readFileSync(path.join(root, "vendor-mcp-installs.json"), "utf8"))[0];
    assert.equal(stored.credential.accessToken, "tok-1");
    assert.equal(stored.credential.refreshToken, "refresh-1");
    assert.equal(stored.credential.expiresAtMs, clock + 100_000);
    const tokenCall = calls.find((call) => call.url.endsWith("/token"));
    const form = new URLSearchParams(String(tokenCall.body));
    assert.equal(form.get("code_verifier").length > 20, true);
    assert.equal(form.get("code"), "code-1");

    // A second completion with the same state is refused (state is single use).
    await assert.rejects(() => exec.completeOAuth({ stateId: state, code: "code-2" }), /No pending vendor sign-in/);

    // Now the auth watch sees a valid token, tools list, a tool runs, and the result is an McpResult.
    const after = await exec.checkAuthStatus({ serverId, accountKey: "default", oauthRedirectUri: "http://localhost:8787/callback" });
    assert.equal(after.hasValidToken, true);
    const [connected, other] = await exec.listTools(["figma", "other"]);
    assert.equal(connected.status, "connected");
    assert.deepEqual(connected.tools.map((tool) => [tool.name, tool.providerIdentifier, tool.toolName]), [["get_file", "figma", "get_file"], ["get_node", "figma", "get_node"]]);
    assert.equal(other.serverIdentifier, "other");
    assert.deepEqual(fallbackCalls, [["other"]]);
    const ran = await exec.executeTool({ serverIdentifier: "figma", toolName: "get_file", args: { key: "k" }, toolCallId: "c2" });
    assert.equal(ran.result.case, "success");
    assert.equal(ran.result.value.content[0].content.value.text, 'called get_file with {"key":"k"}');
    assert.deepEqual(await exec.validateTokens([{ serverUrl: FIGMA, accountKey: "default" }]), [{ serverUrl: FIGMA, accountKey: "default", hasValidToken: true }]);

    // Past expiry the Mac refreshes with the refresh token and tells listeners.
    clock += 200_000;
    const [again] = await exec.listTools(["figma"]);
    assert.equal(again.status, "connected");
    assert.equal(JSON.parse(readFileSync(path.join(root, "vendor-mcp-installs.json"), "utf8"))[0].credential.accessToken, "tok-2");
    assert.deepEqual(changed, ["figma", "figma"]);

    // Logout clears the credential; a non-vendor id goes to the fallback.
    await exec.logoutAccount({ serverUrl: FIGMA, accountKey: "default" });
    assert.equal(JSON.parse(readFileSync(path.join(root, "vendor-mcp-installs.json"), "utf8"))[0].credential, undefined);
    assert.deepEqual(await exec.checkAuthStatus({ serverId: "12", accountKey: "default", oauthRedirectUri: "x" }), { id: "12", fallback: true });
  } finally {
    await rm(root, { recursive: true, force: true });
    await dispose();
  }
});

test("in the box the backend never opens a sign-in: no credential is needsAuth with the connect card's door, an expired one too", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/backend-exec.ts", "vendor-backend-box");
  const root = await mkdtemp(path.join(os.tmpdir(), "caisra-vendor-box-"));
  try {
    const { createVendorMcpBackendExec } = module;
    const { writeFileSync } = await import("node:fs");
    const { calls, fetchImpl } = vendorFixture();
    const exec = createVendorMcpBackendExec({ rootDir: () => root, fetch: fetchImpl, now: () => 5_000_000, canStartAuth: false });
    const serverId = exec.serverIdForPlugin("figma");
    writeFileSync(path.join(root, "vendor-mcp-installs.json"), JSON.stringify([{ id: "figma", url: FIGMA, connected: false }]));
    const status = await exec.checkAuthStatus({ serverId, accountKey: "default", oauthRedirectUri: "http://localhost:8787/callback" });
    assert.deepEqual(status, { id: serverId, isAvailable: true, requiresAuth: true, hasValidToken: false, authUrl: FIGMA, error: "" });
    assert.equal(calls.length, 0, "the box made no request");

    writeFileSync(path.join(root, "vendor-mcp-installs.json"), JSON.stringify([{ id: "figma", url: FIGMA, credential: { accessToken: "tok-old", refreshToken: "r", expiresAtMs: 1, tokenEndpoint: "https://auth.figma.com/token", clientId: "c" } }]));
    const [expired] = await exec.listTools(["figma"]);
    assert.equal(expired.status, "needsAuth", "the box does not spend the refresh token");
    assert.equal(calls.length, 0);

    writeFileSync(path.join(root, "vendor-mcp-installs.json"), JSON.stringify([{ id: "figma", url: FIGMA, credential: { accessToken: "tok-1", tokenEndpoint: "https://auth.figma.com/token", clientId: "c" } }]));
    const [live] = await exec.listTools(["figma"]);
    assert.equal(live.status, "connected");
    assert.equal(live.tools.length, 2);
    const uninstalled = await exec.checkAuthStatus({ serverId: exec.serverIdForPlugin("notion"), accountKey: "default", oauthRedirectUri: "x" });
    assert.equal(uninstalled.isAvailable, false);
  } finally {
    await rm(root, { recursive: true, force: true });
    await dispose();
  }
});

test("both managers, the loopback, the gateway and the resync are wired to the vendor backend and the store", async () => {
  const read = (file) => readFile(path.join(repoRoot, file), "utf8");
  const host = await read("source/host/extensions/mcp/mcp-service.ts");
  assert.match(host, /createVendorMcpBackendExec\(\{ rootDir: getSandRootDir, fallback: cursorBackendMcpExec, canStartAuth: false/);
  assert.match(host, /accountServersProvider: \(\) => withVendorAccountServers\(fetchAccountMcpServers\(accountMcpDeps\), getSandRootDir\)/);
  assert.match(host, /replaceVendorMcpStore: \(installs: unknown\) => replaceVendorMcpInstalls\(getSandRootDir\(\), installs\)/);
  const gateway = await read("source/host/host-gateway-api.ts");
  assert.match(gateway, /refreshMcp: async \(\{ completion, routedAction, routedArgs, vendorMcpStore \}: any\)/);
  assert.match(gateway, /const \{ vendorMcpStore, \.\.\.settingsArgs \} = args \?\? \{\};/);
  const mac = await read("source/electron-main/mcp/desktop-mcp-manager.ts");
  assert.match(mac, /canStartAuth: true/);
  assert.match(mac, /withVendorAccountServers\(fetchAccountMcpServers\(accountMcpDeps\), vendorRoot\)/);
  assert.doesNotMatch(mac, /connectThroughVendorMcp/, "install no longer opens the browser on its own");
  const loopback = await read("source/electron-main/mcp/mcp-oauth-loopback-provider.ts");
  assert.match(loopback, /completeOAuth: \(args\) => vendorExec\.completeOAuth\(args\)/);
  const ipc = await read("source/electron-main/mcp/mcp-desktop.ts");
  assert.match(ipc, /vendorServerIdForPlugin\?\.\(request\.entryId\)/);
  assert.match(ipc, /vendorMcpStore = deps\.readVendorMcpStore\?\.\(\)/);
  const resync = await read("source/electron-main/coordinator/coordinator-resync.ts");
  assert.match(resync, /step\("vendor_mcp"/);
  const adapter = await read("source/electron-main/adapters/mcp-oauth.ts");
  assert.match(adapter, /readVendorMcpStore: \(\) => loadVendorMcpInstalls\(getSandRootDir\(\)\)/);
  assert.equal((adapter.match(/onVendorCredentialChanged: \(\) => \{ void context\.mcpHost\.refreshMcp\(undefined\); \}/g) ?? []).length, 2);
});
