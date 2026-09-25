/**
 * The account's MCP configuration lives on this machine (24 September 2026).
 * Grok Bot kept it on Cursor's server and the reconstruction still called
 * those RPCs (GetAvailableMcpServers, GetMcpConfig, SetMcpConfig,
 * InstallUserPlugin, UninstallUserPlugin, UpdateUserPluginInstall), which
 * Simeon Labs' server does not serve: reads came back unavailable and every
 * write threw, so no custom server or plugin could be added. Now the six
 * calls read and write `account-mcp-config.json` beside the vendor store, a
 * custom URL server's tools are listed and called over streamable HTTP with
 * the same client and the same OAuth flow as the vendor connectors, and the
 * store travels both ways between the Mac and the box.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
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

const readBody = (request) => new Promise((resolve) => { let body = ""; request.on("data", (chunk) => { body += chunk; }); request.on("end", () => resolve(body)); });

/**
 * A custom MCP server the person might add: streamable HTTP, JSON-RPC
 * initialize / tools/list / tools/call, an `x-api-key` it may insist on,
 * and, when `requireBearer` is set, a 401 until a bearer it issued itself
 * arrives — with the OAuth discovery, registration and token endpoints on
 * the same origin, so the sign-in the vendor connectors use works here too.
 */
async function startCustomMcpServer({ requireBearer = false, apiKey } = {}) {
  const hits = {};
  const count = (key) => { hits[key] = (hits[key] ?? 0) + 1; };
  const issued = new Set();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const json = (status, body, headers = {}) => { response.writeHead(status, { "content-type": "application/json", ...headers }); response.end(JSON.stringify(body)); };
    count(`${request.method} ${url.pathname}`);
    if (request.method === "GET" && url.pathname.startsWith("/.well-known/oauth-protected-resource")) return json(200, { authorization_servers: [origin] });
    if (request.method === "GET" && url.pathname === "/.well-known/oauth-authorization-server") return json(200, { authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, registration_endpoint: `${origin}/register` });
    if (request.method === "POST" && url.pathname === "/register") { await readBody(request); return json(201, { client_id: "simeon-custom" }); }
    if (request.method === "POST" && url.pathname === "/token") {
      const form = new URLSearchParams(await readBody(request));
      if (form.get("grant_type") === "authorization_code" && form.get("code") === "code-ok" && (form.get("code_verifier") ?? "").length > 20) { issued.add("bearer-1"); return json(200, { access_token: "bearer-1", refresh_token: "refresh-1", expires_in: 3600 }); }
      if (form.get("grant_type") === "refresh_token" && form.get("refresh_token") === "refresh-1") { issued.add("bearer-2"); return json(200, { access_token: "bearer-2", expires_in: 3600 }); }
      return json(400, { error: "invalid_grant" });
    }
    if (request.method === "POST" && url.pathname === "/mcp") {
      const body = await readBody(request);
      if (apiKey != null && request.headers["x-api-key"] !== apiKey) { response.writeHead(401, { "www-authenticate": "ApiKey" }); return response.end(); }
      if (requireBearer) {
        const bearer = (request.headers.authorization ?? "").replace(/^Bearer /, "");
        if (!issued.has(bearer)) { response.writeHead(401, { "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"` }); return response.end(); }
      }
      const message = JSON.parse(body);
      count(`rpc ${message.method}`);
      if (message.method === "initialize") return json(200, { jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "custom" } } }, { "mcp-session-id": "custom-session" });
      if (message.method === "notifications/initialized") { response.writeHead(202); return response.end(); }
      if (message.method === "tools/list") return json(200, { jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "echo", description: "Echoes", inputSchema: { type: "object", properties: { text: { type: "string" } } } }, { name: "time" }] } });
      if (message.method === "tools/call") return json(200, { jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: `${message.params.name}: ${JSON.stringify(message.params.arguments)} session=${request.headers["mcp-session-id"] ?? ""}` }], isError: false } });
      return json(200, { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "no such method" } });
    }
    response.writeHead(404); response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, url: `${origin}/mcp`, hits, close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }) };
}

const deps = (root, extra = {}) => ({ getAccessToken: async () => "claidor_da_test", getMachineId: async () => "machine", getBackendUrl: () => "https://api.simeonlabs.com", rootDir: () => root, ...extra });
const readStore = (root) => JSON.parse(readFileSync(path.join(root, "account-mcp-config.json"), "utf8"));

test("SetMcpConfig then GetMcpConfig round-trips through account-mcp-config.json; a removal is a tombstone", async () => {
  const account = await load("source/shared/node/cursor-backend/account-mcp.ts", "account-mcp");
  const root = await mkdtemp(path.join(os.tmpdir(), "caisra-account-mcp-store-"));
  try {
    const { createAccountMcpWriter, fetchAccountMcpServers } = account.module;
    const changes = [];
    const writer = createAccountMcpWriter(deps(root, { onStoreChanged: () => changes.push("changed") }));
    const empty = await writer.getConfigForEdit();
    assert.deepEqual(empty, { config: { mcpServers: {} }, serverIdsByName: {} });
    assert.equal(existsSync(path.join(root, "account-mcp-config.json")), false, "reading an empty store writes nothing");

    // The manager adds a server the way AddMcpServer does: the whole map, spread with the addition.
    await writer.setConfig({ mcpServers: { superpowers: { type: "http", url: "https://mcp.example.com/mcp", headers: { Authorization: "Bearer t0k" } } } }, {});
    const one = await writer.getConfigForEdit();
    assert.deepEqual(one.config.mcpServers, { superpowers: { type: "http", url: "https://mcp.example.com/mcp", headers: { Authorization: "Bearer t0k" } } });
    const superpowersId = one.serverIdsByName.superpowers;
    assert.equal(typeof superpowersId, "bigint");
    assert.match(String(superpowersId), /^[1-9]\d*$/, "a positive decimal id, as mcp-server-id.ts demands");
    assert.ok(Number(superpowersId) >= 100_000 && Number(superpowersId) < 900_000, "below the vendor connectors' band");
    assert.deepEqual(changes, ["changed"]);

    // A stdio server keeps its command, args and env.
    await writer.setConfig({ mcpServers: { ...one.config.mcpServers, local: { command: "npx", args: ["-y", "some-mcp"], env: { TOKEN: "x" } } } }, one.serverIdsByName);
    const two = await writer.getConfigForEdit();
    assert.deepEqual(Object.keys(two.config.mcpServers).sort(), ["local", "superpowers"]);
    assert.equal(two.serverIdsByName.superpowers, superpowersId, "an id survives a re-write");
    assert.deepEqual(two.config.mcpServers.local, { command: "npx", args: ["-y", "some-mcp"], env: { TOKEN: "x" } });
    const written = readStore(root);
    assert.equal(written.version, 1);
    assert.equal(written.servers.superpowers.id, String(superpowersId));
    assert.equal(typeof written.servers.superpowers.updatedAtMs, "number");

    // The rows the manager lists: id, identifier, config, no team, no admin policy.
    const listed = await fetchAccountMcpServers(deps(root));
    assert.equal(listed.unavailable, undefined);
    assert.equal(typeof listed.cacheScope, "string");
    assert.deepEqual(listed.servers.map((row) => [row.id, row.serverIdentifier, "url" in row.config ? row.config.url : row.config.command, row.isTeamServer, row.disabledByTeamAdminPolicy, row.accounts]), [
      [String(two.serverIdsByName.local), "local", "npx", false, false, undefined],
      [String(superpowersId), "superpowers", "https://mcp.example.com/mcp", false, false, undefined],
    ]);

    // Removal, the way removeServer does it: the map without the name, the ids without the name.
    const remaining = { ...two.config.mcpServers }; delete remaining.superpowers;
    const ids = { ...two.serverIdsByName }; delete ids.superpowers;
    await writer.setConfig({ mcpServers: remaining }, ids);
    const three = await writer.getConfigForEdit();
    assert.deepEqual(Object.keys(three.config.mcpServers), ["local"]);
    assert.equal(readStore(root).servers.superpowers.deleted, true, "a removal is a tombstone, so it out-votes an older copy elsewhere");
    assert.deepEqual((await fetchAccountMcpServers(deps(root))).servers.map((row) => row.serverIdentifier), ["local"]);

    // A configuration that is not one of ours is refused, and nothing is written.
    await assert.rejects(() => writer.setConfig({ mcpServers: { bad: { nope: true } } }, {}), /cannot read/);
    assert.deepEqual(Object.keys((await writer.getConfigForEdit()).config.mcpServers), ["local"]);
  } finally {
    await rm(root, { recursive: true, force: true });
    await account.dispose();
  }
});

test("the two copies merge newer-entry-wins per name, tombstones included, on both sides", async () => {
  const store = await load("source/shared/node/account-mcp/store.ts", "account-mcp-merge");
  const pull = await load("source/shared/node/account-mcp/box-pull.ts", "account-mcp-pull");
  const root = await mkdtemp(path.join(os.tmpdir(), "caisra-account-mcp-merge-"));
  try {
    const { setAccountMcpConfig, loadAccountMcpStore, adoptAccountMcpStore, mergeAccountMcpStores, listAccountMcpServers, parseAccountMcpStore } = store.module;
    setAccountMcpConfig(root, { mcpServers: { a: { url: "https://a.example/mcp" }, b: { url: "https://b.example/mcp" } } }, {}, { now: 1_000 });
    const mine = loadAccountMcpStore(root);
    // The other side edited `a` later, removed `b` later, and added `c`; its copy of `a` at 1_000 would be a tie and loses to ours.
    const theirs = parseAccountMcpStore({
      version: 1,
      servers: {
        a: { id: mine.servers.a.id, config: { url: "https://a.example/v2" }, updatedAtMs: 2_000 },
        b: { id: mine.servers.b.id, config: { url: "" }, updatedAtMs: 3_000, deleted: true },
        c: { id: "123456", config: { command: "node", args: ["c.js"] }, updatedAtMs: 500 },
      },
      plugins: { "42": { isEnabled: true, updatedAtMs: 10 } },
      credentials: { [mine.servers.a.id]: { accessToken: "t", tokenEndpoint: "e", clientId: "c", updatedAtMs: 5 } },
    });
    const merged = mergeAccountMcpStores(mine, theirs);
    assert.deepEqual(listAccountMcpServers(merged).map((row) => [row.name, "url" in row.config ? row.config.url : row.config.command]), [["a", "https://a.example/v2"], ["c", "node"]]);
    assert.equal(merged.servers.b.deleted, true);
    assert.equal(listAccountMcpServers(merged)[0].credential.accessToken, "t");
    assert.equal(mergeAccountMcpStores(theirs, mine).servers.a.config.url, "https://a.example/v2", "the newer entry wins whichever side merges");
    const tie = mergeAccountMcpStores(mine, parseAccountMcpStore({ ...theirs, servers: { a: { ...theirs.servers.a, updatedAtMs: 1_000 } } }));
    assert.equal(tie.servers.a.config.url, "https://a.example/mcp", "a tie keeps the local copy");

    // adopt = merge into the file; only a change reports one.
    assert.equal(adoptAccountMcpStore(root, theirs).changed, true);
    assert.equal(adoptAccountMcpStore(root, theirs).changed, false);
    assert.equal(adoptAccountMcpStore(root, { garbage: true }).changed, false, "an unreadable copy merges as empty and changes nothing");
    assert.deepEqual(listAccountMcpServers(loadAccountMcpStore(root)).map((row) => row.name), ["a", "c"]);

    // The Mac's pull: merges what the box answers, at most once per window, and gives up on a slow box.
    let answers = 0; const merges = [];
    const slow = { current: false };
    const clock = { now: 100_000 };
    const pullOnce = pull.module.createBoxAccountMcpStorePull({
      rootDir: () => root,
      readBoxAccountMcpStore: async () => { answers += 1; if (slow.current) return new Promise(() => {}); return { accountMcpStore: { version: 1, servers: { d: { id: "222222", config: { url: "https://d.example/mcp" }, updatedAtMs: 9_000 } }, plugins: {}, credentials: {} } }; },
      onMerged: () => merges.push(answers),
      now: () => clock.now,
      freshMs: 1_000,
      timeoutMs: 50,
    });
    await pullOnce();
    await pullOnce();
    assert.equal(answers, 1, "a second read inside the window does not pull again");
    assert.deepEqual(merges, [1]);
    assert.deepEqual(listAccountMcpServers(loadAccountMcpStore(root)).map((row) => row.name), ["a", "c", "d"]);
    clock.now += 2_000; slow.current = true;
    const started = Date.now();
    await pullOnce();
    assert.ok(Date.now() - started < 1_000, "a slow box does not hold the read");
    assert.equal(answers, 2);
    assert.deepEqual(merges, [1], "nothing merged from a pull that timed out");
  } finally {
    await rm(root, { recursive: true, force: true });
    await store.dispose();
    await pull.dispose();
  }
});

test("a custom URL server's tools are listed and called through a streamable-HTTP MCP server, with its configured headers", async () => {
  const account = await load("source/shared/node/cursor-backend/account-mcp.ts", "account-mcp-http-writer");
  const backend = await load("source/shared/node/account-mcp/backend-exec.ts", "account-mcp-http-backend");
  const root = await mkdtemp(path.join(os.tmpdir(), "caisra-account-mcp-http-"));
  const server = await startCustomMcpServer({ apiKey: "k3y" });
  try {
    const writer = account.module.createAccountMcpWriter(deps(root));
    await writer.setConfig({ mcpServers: { custom: { type: "http", url: server.url, headers: { "X-Api-Key": "k3y" } }, wrong: { url: server.url, headers: { "X-Api-Key": "nope" } } } }, {});
    const fallbackCalls = [];
    const exec = backend.module.createAccountMcpBackendExec({
      rootDir: () => root,
      canStartAuth: true,
      fallback: { listTools: async (ids) => { fallbackCalls.push(ids); return [{ serverIdentifier: "elsewhere", status: "connected", tools: [] }]; } },
    });
    const [custom, wrong, elsewhere] = await exec.listTools(["custom", "wrong", "elsewhere"]);
    assert.equal(custom.status, "connected");
    assert.deepEqual(custom.tools.map((tool) => [tool.name, tool.providerIdentifier, tool.toolName, tool.clientKey]), [["echo", "custom", "echo", "custom"], ["time", "custom", "time", "custom"]]);
    assert.equal(custom.tools[0].description, "Echoes");
    assert.equal(custom.rowServerIdentifier, "custom");
    assert.equal(wrong.status, "needsAuth", "a 401 from the server reads as needsAuth");
    assert.equal(elsewhere.serverIdentifier, "elsewhere");
    assert.deepEqual(fallbackCalls, [["elsewhere"]], "anything not in the store goes to the next backend");
    assert.equal(server.hits["rpc initialize"], 1);

    const ran = await exec.executeTool({ serverIdentifier: "custom", toolName: "echo", args: { text: "hi" }, toolCallId: "c1" });
    assert.equal(ran.result.case, "success");
    assert.equal(ran.result.value.content[0].content.value.text, 'echo: {"text":"hi"} session=custom-session');
    assert.equal(server.hits["rpc initialize"], 1, "the session from the listing is reused");
    assert.equal(typeof ran.toBinary, "function", "the result is the generated McpResult the executor serializes");

    const refused = await exec.executeTool({ serverIdentifier: "wrong", toolName: "echo", args: {}, toolCallId: "c2" });
    assert.equal(refused.result.case, "error");
    assert.match(refused.result.value.error, /401/);
    const unknown = await exec.executeTool({ serverIdentifier: "nowhere", toolName: "echo", args: {}, toolCallId: "c3" });
    assert.match(unknown.result.value.error, /not available here/);

    // A server that needs no sign-in reports so; the manager reads it as already authenticated.
    const status = await exec.checkAuthStatus({ serverId: Number((await writer.getConfigForEdit()).serverIdsByName.custom), accountKey: "default", oauthRedirectUri: "http://localhost:8787/callback" });
    assert.deepEqual({ isAvailable: status.isAvailable, requiresAuth: status.requiresAuth, hasValidToken: status.hasValidToken }, { isAvailable: true, requiresAuth: false, hasValidToken: false });
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
    await account.dispose();
    await backend.dispose();
  }
});

test("a 401 from a custom server yields requiresAuth with an auth URL on the Mac, and never on the box", async () => {
  const account = await load("source/shared/node/cursor-backend/account-mcp.ts", "account-mcp-auth-writer");
  const backend = await load("source/shared/node/account-mcp/backend-exec.ts", "account-mcp-auth-backend");
  const macRoot = await mkdtemp(path.join(os.tmpdir(), "caisra-account-mcp-mac-"));
  const boxRoot = await mkdtemp(path.join(os.tmpdir(), "caisra-account-mcp-box-"));
  const server = await startCustomMcpServer({ requireBearer: true });
  try {
    const writer = account.module.createAccountMcpWriter(deps(macRoot));
    await writer.setConfig({ mcpServers: { gated: { url: server.url } } }, {});
    const serverId = Number((await writer.getConfigForEdit()).serverIdsByName.gated);
    // The box holds a copy of the Mac's store.
    writeFileSync(path.join(boxRoot, "account-mcp-config.json"), readFileSync(path.join(macRoot, "account-mcp-config.json")));

    // Box: needsAuth, the connect card's door is the server's own URL, and no sign-in is ever started here.
    const box = backend.module.createAccountMcpBackendExec({ rootDir: () => boxRoot, canStartAuth: false, now: () => 1_500_000 });
    const [boxListed] = await box.listTools(["gated"]);
    assert.equal(boxListed.status, "needsAuth");
    const boxStatus = await box.checkAuthStatus({ serverId, accountKey: "default", oauthRedirectUri: "http://localhost:8787/callback" });
    assert.deepEqual(boxStatus, { id: String(serverId), isAvailable: true, requiresAuth: true, hasValidToken: false, authUrl: server.url, error: "" });
    assert.equal(server.hits["POST /register"], undefined, "the box registered no client");
    assert.equal(server.hits["GET /.well-known/oauth-authorization-server"], undefined, "the box discovered nothing");

    // Mac: the sign-in starts — discovery, registration, an authorize URL with PKCE and a state.
    const changed = [];
    let clock = 1_000_000;
    const mac = backend.module.createAccountMcpBackendExec({ rootDir: () => macRoot, canStartAuth: true, now: () => clock, onCredentialChanged: (id) => changed.push(id) });
    const [macListed] = await mac.listTools(["gated"]);
    assert.equal(macListed.status, "needsAuth");
    const status = await mac.checkAuthStatus({ serverId, accountKey: "default", oauthRedirectUri: "http://localhost:8787/callback" });
    assert.equal(status.requiresAuth, true);
    assert.equal(status.hasValidToken, false);
    const authorize = new URL(status.authUrl);
    assert.equal(authorize.origin, server.origin);
    assert.equal(authorize.pathname, "/authorize");
    assert.equal(authorize.searchParams.get("client_id"), "simeon-custom");
    assert.equal(authorize.searchParams.get("redirect_uri"), "http://localhost:8787/callback");
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
    const state = authorize.searchParams.get("state");
    assert.ok(state.length > 10);
    assert.equal(server.hits["POST /register"], 1);

    // The loopback finishes it: the code becomes a bearer in the Mac's store; the box's copy is untouched.
    await mac.completeOAuth({ stateId: state, code: "code-ok" });
    assert.deepEqual(changed, [String(serverId)]);
    const macStore = readStore(macRoot);
    assert.equal(macStore.credentials[String(serverId)].accessToken, "bearer-1");
    assert.equal(macStore.credentials[String(serverId)].refreshToken, "refresh-1");
    assert.equal(readStore(boxRoot).credentials[String(serverId)], undefined);
    await assert.rejects(() => mac.completeOAuth({ stateId: state, code: "code-ok" }), /No pending sign-in/, "a state is single use");

    // Now the Mac lists and calls with the bearer, the auth watch sees a valid token, and the row carries a slot.
    const after = await mac.checkAuthStatus({ serverId, accountKey: "default", oauthRedirectUri: "http://localhost:8787/callback" });
    assert.equal(after.hasValidToken, true);
    const [connected] = await mac.listTools(["gated"]);
    assert.equal(connected.status, "connected");
    assert.equal(connected.tools.length, 2);
    const ran = await mac.executeTool({ serverIdentifier: "gated", toolName: "time", args: {}, toolCallId: "c1" });
    assert.equal(ran.result.case, "success");
    assert.deepEqual(await mac.validateTokens([{ serverUrl: server.url, accountKey: "default" }, { serverUrl: "https://elsewhere", accountKey: "default" }]), [{ serverUrl: server.url, accountKey: "default", hasValidToken: true }]);
    const rows = (await account.module.fetchAccountMcpServers(deps(macRoot))).servers;
    assert.deepEqual(rows[0].accounts, [{ accountKey: "default", serverIdentifier: "gated", hasToken: true }]);

    // The box, given the Mac's copy, serves the tools with the bearer and never refreshes an expired one.
    writeFileSync(path.join(boxRoot, "account-mcp-config.json"), readFileSync(path.join(macRoot, "account-mcp-config.json")));
    const [boxConnected] = await box.listTools(["gated"]);
    assert.equal(boxConnected.status, "connected");
    const expired = readStore(macRoot); expired.credentials[String(serverId)].expiresAtMs = 1;
    writeFileSync(path.join(boxRoot, "account-mcp-config.json"), JSON.stringify(expired));
    const tokenHits = server.hits["POST /token"];
    const [boxExpired] = await box.listTools(["gated"]);
    assert.equal(boxExpired.status, "needsAuth");
    assert.equal(server.hits["POST /token"], tokenHits, "the box spent no refresh token");

    // The Mac past expiry refreshes and tells its listeners; logout clears the credential.
    clock += 4_000_000;
    const [refreshed] = await mac.listTools(["gated"]);
    assert.equal(refreshed.status, "connected");
    assert.equal(readStore(macRoot).credentials[String(serverId)].accessToken, "bearer-2");
    assert.deepEqual(changed, [String(serverId), String(serverId)]);
    await mac.logoutAccount({ serverUrl: server.url, accountKey: "default" });
    assert.equal(readStore(macRoot).credentials[String(serverId)].deleted, true);
    assert.deepEqual(await mac.validateTokens([{ serverUrl: server.url, accountKey: "default" }]), [{ serverUrl: server.url, accountKey: "default", hasValidToken: false }]);

    // A server id that is not ours goes to the fallback.
    const fallbackMac = backend.module.createAccountMcpBackendExec({ rootDir: () => macRoot, canStartAuth: true, fallback: { checkAuthStatus: async (args) => ({ id: String(args.serverId), fallback: true }) } });
    assert.deepEqual(await fallbackMac.checkAuthStatus({ serverId: 12, accountKey: "default", oauthRedirectUri: "x" }), { id: "12", fallback: true });
  } finally {
    await server.close();
    await rm(macRoot, { recursive: true, force: true });
    await rm(boxRoot, { recursive: true, force: true });
    await account.dispose();
    await backend.dispose();
  }
});

test("install and uninstall of a plugin round-trip through the store", async () => {
  const account = await load("source/shared/node/cursor-backend/account-mcp.ts", "account-mcp-plugins");
  const root = await mkdtemp(path.join(os.tmpdir(), "caisra-account-mcp-plugins-"));
  try {
    const { createAccountMcpWriter, fetchEffectiveUserPlugins, backfillUserPluginInstalls } = account.module;
    const writer = createAccountMcpWriter(deps(root));
    assert.deepEqual(await fetchEffectiveUserPlugins(deps(root)), []);
    await writer.installPlugin({ pluginId: 42n, variables: { CONTEXT7_API_KEY: "secret" } });
    const installed = await fetchEffectiveUserPlugins(deps(root));
    assert.deepEqual(installed, [{ pluginId: "42", name: "42", displayName: "42", installMode: "user", isEnabled: true }]);
    assert.deepEqual(readStore(root).plugins["42"].variables, { CONTEXT7_API_KEY: "secret" });
    await writer.updatePluginInstall({ pluginId: 42n, variables: { CONTEXT7_API_KEY: "rotated" } });
    assert.deepEqual(readStore(root).plugins["42"].variables, { CONTEXT7_API_KEY: "rotated" });
    await assert.rejects(() => writer.updatePluginInstall({ pluginId: 43n, variables: {} }), /not installed/);
    assert.deepEqual(await backfillUserPluginInstalls(deps(root)), [], "nothing to backfill when the store is its own truth");
    await writer.uninstallPlugin({ pluginId: 42n });
    assert.deepEqual(await fetchEffectiveUserPlugins(deps(root)), []);
    assert.equal(readStore(root).plugins["42"].deleted, true, "the uninstall is a tombstone");
    await writer.installPlugin({ pluginId: 42n });
    assert.equal((await fetchEffectiveUserPlugins(deps(root))).length, 1, "a re-install after an uninstall comes back");
    assert.equal(readStore(root).plugins["42"].variables, undefined, "without the old variables");
  } finally {
    await rm(root, { recursive: true, force: true });
    await account.dispose();
  }
});

test("both sides, the gateway, the loopback and the resync carry the account store and serve custom servers", async () => {
  const read = (file) => readFile(path.join(repoRoot, file), "utf8");
  const host = await read("source/host/extensions/mcp/mcp-service.ts");
  assert.match(host, /createAccountMcpBackendExec\(\{ rootDir: getSandRootDir, fallback: cursorBackendMcpExec, canStartAuth: false/);
  assert.match(host, /createVendorMcpBackendExec\(\{ rootDir: getSandRootDir, fallback: accountBackendMcpExec, canStartAuth: false/);
  assert.match(host, /rootDir: getSandRootDir,\n    \};/, "the box's account deps name the store, not a Connect client");
  assert.doesNotMatch(host, /createClient: \(credentials\) => createSandCursorBackendClient\(DashboardService, \{\n        getAccessToken: \(options\) => credentials\.getAccessToken\(\{ backendUrl: options\.backendUrl \}\),\n        getMachineId: credentials\.getMachineId,\n      \}\) as unknown as AccountMcpClient/);
  assert.match(host, /replaceAccountMcpStore: \(store: unknown\) => adoptAccountMcpStore\(getSandRootDir\(\), store\)\.changed, readAccountMcpStore: \(\) => loadAccountMcpStore\(getSandRootDir\(\)\)/);
  assert.match(host, /parseServerConfig: deps\.parseServerConfig \?\? parseCustomMcpServerConfig/, "AddMcpServer has a parser in the box");
  assert.match(host, /\.\.\.await fetchEffectiveUserPlugins\(accountMcpDeps\)/);
  const gateway = await read("source/host/host-gateway-api.ts");
  assert.match(gateway, /const \{ vendorMcpStore, accountMcpStore, \.\.\.settingsArgs \} = args \?\? \{\};/);
  assert.match(gateway, /refreshMcp: async \(\{ completion, routedAction, routedArgs, vendorMcpStore, accountMcpStore \}: any\)/);
  assert.match(gateway, /if \(routedAction === "account-mcp-store"\) return \{ accountMcpStore: method\(deps\.extensions\.api\("mcp"\), "readAccountMcpStore"\)\(\) \};/);
  const mac = await read("source/electron-main/mcp/desktop-mcp-manager.ts");
  assert.match(mac, /rootDir: vendorRoot,\n    syncStore: pullBoxStore,/);
  assert.match(mac, /fallback: accountBackendMcpExec,\n    canStartAuth: true,/);
  assert.match(mac, /parseServerConfig: \(value: unknown\) =>/, "AddMcpServer has a parser on the Mac");
  assert.doesNotMatch(mac, /generatedAccountClient/);
  const loopback = await read("source/electron-main/mcp/mcp-oauth-loopback-provider.ts");
  assert.match(loopback, /const accountExec = createAccountMcpBackendExec\(\{\n      rootDir: getSandRootDir,\n      fallback: backendMcpExec,\n      canStartAuth: true,/);
  assert.match(loopback, /fallback: accountExec,/);
  const ipc = await read("source/electron-main/mcp/mcp-desktop.ts");
  assert.match(ipc, /const accountMcpStore = deps\.readAccountMcpStore\?\.\(\);/);
  assert.match(ipc, /deps\.adoptAccountMcpStore\?\.\(answer\.accountMcpStore\)/);
  const adapter = await read("source/electron-main/adapters/mcp-oauth.ts");
  assert.match(adapter, /readAccountMcpStore: \(\) => loadAccountMcpStore\(getSandRootDir\(\)\)/);
  assert.match(adapter, /refreshMcp\(\{ routedAction: "account-mcp-store" \}\)/);
  assert.equal((adapter.match(/onAccountStoreChanged: \(\) => \{ void context\.mcpHost\.refreshMcp\(undefined\); \}/g) ?? []).length, 2);
  const resync = await read("source/electron-main/coordinator/coordinator-resync.ts");
  assert.match(resync, /step\("account_mcp"/);
  const auxiliary = await read("source/electron-main/coordinator/production-root-auxiliary-provider.ts");
  assert.match(auxiliary, /getAccountMcpStore: \(\) => loadAccountMcpStore\(getSandRootDir\(\)\)/);
  const accountMcp = await read("source/shared/node/cursor-backend/account-mcp.ts");
  assert.doesNotMatch(accountMcp, /DashboardService|createSandCursorBackendClient/, "no Connect client is reachable from the six functions");
});
