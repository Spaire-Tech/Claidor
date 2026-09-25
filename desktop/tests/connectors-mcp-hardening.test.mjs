/**
 * Connectors and MCP, hardened (25 September 2026, design-audit-ledger.md
 * cluster `connectors-mcp`).
 *
 * Cursor's Dashboard client was still a live caller on both sides; the
 * vendor OAuth and MCP client had no deadlines, no RFC 8707 resource and a
 * body read that could hang on an open stream; the store crossed to the box
 * with the refresh token and the client secret; and the MCP tools told the
 * agent to ask for keys in the chat.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("a Cursor Connect client answers Unimplemented at once and sends nothing for a service that is not served", async () => {
  // Since 25 September 2026 the DashboardService is served by default
  // (polar/sand); "0" is the 24 September behaviour, measured here.
  process.env.SAND_CONNECT_SERVED = "0";
  const { module, dispose } = await load("source/shared/node/cursor-backend/cursor-inference.ts", "cursor-backend-client");
  const proto = await load("source/packages/proto/generated/aiserver/v1/dashboard_connect.ts", "dashboard-connect");
  try {
    const client = module.createSandCursorBackendClient(proto.module.DashboardService, { getAccessToken: async () => { throw new Error("the wire was touched"); }, getMachineId: async () => "m" });
    await assert.rejects(() => client.getTeams({}), (error) => error.code === 12 && /not served by Simeon Labs' server/.test(error.message));
  } finally {
    delete process.env.SAND_CONNECT_SERVED;
    await proto.dispose();
    await dispose();
  }
});

test("the box's view of the vendor store carries the access token only, and a merge never drops the authority's credential", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/installs.ts", "vendor-installs");
  try {
    const credential = { accessToken: "a", refreshToken: "r", clientSecret: "s", tokenEndpoint: "https://x/token", clientId: "c" };
    const store = { installs: [{ id: "notion", url: "https://mcp.notion.com/mcp", connected: true, credential, installedAtMs: 10 }], removed: [] };
    assert.deepEqual(module.serializeVendorMcpStoreForBox(store)[0].credential, { accessToken: "a", tokenEndpoint: "https://x/token", clientId: "c" });
    assert.deepEqual(module.serializeVendorMcpStore(store)[0].credential, credential, "the Mac's own file keeps everything");
    const boxNewer = { installs: [{ id: "notion", url: "https://mcp.notion.com/mcp", connected: true, installedAtMs: 20 }], removed: [] };
    const merged = module.mergeVendorMcpStores(store, boxNewer, "local");
    assert.deepEqual(merged.installs[0].credential, credential, "a newer row from the box without a credential keeps the Mac's");
    const signedOut = { installs: [{ id: "notion", url: "https://mcp.notion.com/mcp", connected: false, installedAtMs: 10 }], removed: [] };
    const boxHolds = { installs: [{ id: "notion", url: "https://mcp.notion.com/mcp", connected: true, credential, installedAtMs: 5 }], removed: [] };
    assert.equal(module.mergeVendorMcpStores(signedOut, boxHolds, "local").installs[0].credential, undefined, "the Mac's sign-out stands");
  } finally {
    await dispose();
  }
});

test("the OAuth flow has deadlines and an RFC 8707 resource, and a reply stream that never ends is cut", async () => {
  const oauth = await src("shared/node/vendor-mcp/oauth.ts");
  assert.match(oauth, /VENDOR_MCP_OAUTH_FETCH_TIMEOUT_MS = 10_000/);
  assert.equal((oauth.match(/signal: deadline\(\)/g) ?? []).length, 3, "discovery, registration and the token endpoint");
  assert.match(oauth, /authorize\.searchParams\.set\("resource", vendorMcpResource\(args\.mcpUrl\)\)/);
  assert.match(oauth, /resource: vendorMcpResource\(args\.pending\.mcpUrl\)/);
  assert.match(oauth, /\.\.\.\(args\.grant\.resource == null \? \{\} : \{ resource: args\.grant\.resource \}\)/);
  const { module, dispose } = await load("source/shared/node/vendor-mcp/oauth.ts", "vendor-oauth");
  try {
    assert.equal(module.vendorMcpResource("https://mcp.notion.com/mcp?x=1#frag"), "https://mcp.notion.com/mcp");
  } finally {
    await dispose();
  }
  const client = await load("source/shared/node/vendor-mcp/http-mcp-client.ts", "http-mcp-client");
  try {
    let cancelled = false;
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("event: message\ndata: {}\n\n")); }, cancel() { cancelled = true; } });
    const fetchImpl = async () => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    const started = Date.now();
    await assert.rejects(() => client.module.vendorMcpListTools({ url: "https://vendor.example/mcp", accessToken: "t", fetch: fetchImpl, timeoutMs: 200 }), /kept the reply stream open past 200 ms/);
    assert.ok(Date.now() - started < 5_000);
    assert.equal(cancelled, true, "the stream is cancelled, not left open");
  } finally {
    await client.dispose();
  }
});

test("a refresh the vendor refuses for good drops the refresh token, and the tools never ask for a key in the chat", async () => {
  const exec = await src("shared/node/vendor-mcp/backend-exec.ts");
  assert.match(exec, /if \(\/invalid_grant\/i\.test\(errorLabel\(error\)\)\) \{ const \{ refreshToken: _spent, \.\.\.kept \} = credential; setVendorMcpCredential/);
  const tools = await src("host/runner/tools/sand-mcp-management-tools.ts");
  assert.doesNotMatch(tools, /Ask the user for any secret|ask the user for secrets|Ask the user for the token|ask the user, never guess|any secrets rather than guessing/);
  assert.ok((tools.match(/Settings → MCP/g) ?? []).length >= 5, "every secret sentence points at Settings");
  assert.doesNotMatch(await src("shared/node/mcp/mcp-catalog-flow.ts"), /Ask the user for it and pass it/);
  assert.match(await src("shared/node/account-mcp/backend-exec.ts"), /const clientId = server\.config\.auth\?\.CLIENT_ID;/);
  assert.match(await src("shared/node/vendor-mcp/box-pull.ts"), /holdUntilMs = now\(\) \+ BOX_STORE_PULL_FAILURE_HOLD_MS/);
  assert.match(await src("shared/node/cursor-backend/account-mcp.ts"), /cacheScope = accessToken\.length === 0 \? "local" : accountCacheScope\(accessToken\)/);
  assert.doesNotMatch(await src("shared/node/mcp/mcp-marketplace.ts"), /fetchPluginServers/);
  assert.match(await src("host/extensions/mcp/skill-publish.ts"), /Publishing a skill to a team is coming soon in Simeon\./);
});
