#!/usr/bin/env node
/**
 * `npm run web`: Simeon on the web on your own machine, with nothing real
 * behind it. Builds the page (web/build-web.mjs) into dist/web and serves it
 * on 127.0.0.1, standing in for Simeon Labs' server and for a cloud
 * computer: the cookie trade, the profile, the models, the box broker and
 * the box's gateway (commands and the event stream through the proxy's
 * paths), answered from the website's scripted backend (demo/backend.ts).
 * So the whole page runs, sign-in to streaming reply, before a real server
 * is ever involved. With `--real`, only the page is served and it talks to
 * the API on 127.0.0.1:8000 (`uv run task api`).
 *
 * Connected apps are stood in for too: a small catalog, the manager's
 * answers (`desktopMcp`), and a sign-in that goes to a pretend vendor on
 * this server, comes back through the hosted callback to
 * `/app/connected.html`, and finishes in the "box" (`completeMcpOAuth`),
 * which then tells the window (`mcp-auth`, `mcp-servers`).
 *
 *   node web/serve-web.mjs [--real] [--port 4174]
 */
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const real = args.includes("--real");
const port = Number(args[args.indexOf("--port") + 1] || process.env.SIMEON_WEB_PORT || 4174);
const outDir = path.join(root, "dist/web");
execFileSync(process.execPath, [path.join(root, "web/build-web.mjs"), "--out", outDir], { stdio: "inherit" });

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".wasm": "application/wasm", ".webp": "image/webp", ".mp4": "video/mp4" };

// The stand-in box: the demo's scripted backend, bundled once for Node.
let backend = null;
const sseClients = new Set();
const CHANNEL_BY_FAMILY = { transcript: "transcript", "client-side-tool-v2": "client-side-tool-v2", agents: "agents", "agent-upserted": "agent-upserted", tray: "tray", "agents-workflow": "workflows", subagents: "subagents", "async-tasks": "async-tasks", "agents-automation": "automations", "mcp-servers-updated": "mcp-servers", "forever-box": "forever-box", "teach-recording": "teach-recording", "box-disk-pressure": "box-disk-pressure", "computer-action": "computer-action", outline: "outline", sharing: "sharing", "host-settings": "host-settings", memory: "memory" };
if (!real) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-web-fake-"));
  const output = path.join(temporary, "backend.mjs");
  await build({ entryPoints: [path.join(root, "demo/backend.ts")], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const { createDemoBackend } = await import(pathToFileURL(output).href);
  process.on("exit", () => { void rm(temporary, { recursive: true, force: true }); });
  backend = createDemoBackend({
    timeScale: 0.5,
    pushCoordinatorEvent: (family, payload) => {
      const channel = CHANNEL_BY_FAMILY[family] ?? family;
      const line = `data: ${JSON.stringify({ channel, payload })}\n\n`;
      for (const res of sseClients) res.write(line);
    },
    pushMainEvent: () => {},
  });
}

const json = (res, status, body, headers = {}) => { const raw = JSON.stringify(body); res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(raw), ...headers }); res.end(raw); };
const readBody = (req) => new Promise((resolve) => { const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))); });
const profile = { id: "user-1", email: "bass@simeonlabs.com", name: "Bass F", preferredName: "Bass", suggestedName: "Bass", avatarUrl: null, accountMode: "personal" };
const HOST_SETTINGS = { pinnedAgentIds: [], sidebarSections: null, agentDefaultModel: null, computerUseModel: null, autoReviewInstructions: null };

// The stand-in's connected apps: the catalog as the manager lists it
// (`mcp-marketplace-view.ts`), the installed servers as it lists them, and
// sign-ins pending by state, the way the box keeps them.
const CATALOG = [
  { id: "notion", displayName: "Notion", category: "Files & Docs", description: "Search, read, and write pages and databases.", url: "https://mcp.notion.com/mcp", serverId: "900005" },
  { id: "linear", displayName: "Linear", category: "Developer", description: "Issues, projects and cycles.", url: "https://mcp.linear.app/mcp", serverId: "900008" },
  { id: "gmail", displayName: "Gmail", category: "Mail & Calendar", description: "Search, read, draft, and manage email.", url: "https://api.simeonlabs.com/desktop/api/apps/mcp/gmail", serverId: "900001" },
];
const mcpState = { installed: new Map(), pending: new Map() };
const catalogView = (entry) => ({ id: entry.id, name: entry.id, displayName: entry.displayName, description: entry.description, category: entry.category, homepage: entry.url, connectors: [{ name: entry.displayName, description: entry.description }], skills: [], vendorMcpUrl: entry.url });
const installedServer = (entry, row) => ({ id: entry.serverId, name: entry.displayName, serverIdentifier: entry.id, accountKey: "default", rowServerIdentifier: entry.id, transport: "http", url: entry.url, toolCount: row.connected ? 12 : 0, customInstructions: row.instructions ?? "", isTeamServer: false, pluginId: entry.id, status: row.connected ? "connected" : "needsAuth", accounts: [{ accountKey: "default", serverIdentifier: entry.id, status: row.connected ? "connected" : "needsAuth" }] });
const byServerId = (serverId) => CATALOG.find((entry) => entry.serverId === String(serverId));
const listServers = () => ({ servers: [...mcpState.installed].map(([id, row]) => installedServer(CATALOG.find((entry) => entry.id === id), row)) });
const pushBox = (channel, payload) => { const line = `data: ${JSON.stringify({ channel, payload })}\n\n`; for (const res of sseClients) res.write(line); };
function desktopMcp(origin, { action, args = [] }) {
  const [first, second, third] = args;
  switch (action) {
    case "listServers": return listServers();
    case "listEffectivePlugins": return [...mcpState.installed.keys()].map((id) => ({ pluginId: id, name: id, displayName: CATALOG.find((entry) => entry.id === id).displayName, installMode: "user", isEnabled: true }));
    case "getCatalog": return CATALOG.map(catalogView);
    case "resolvePluginLogo": return null;
    case "vendorServerIdForPlugin": return CATALOG.find((entry) => entry.id === first)?.serverId ?? null;
    case "installEntry": { const entry = CATALOG.find((item) => item.id === first?.entryId); if (entry == null) throw new Error(`no such app ${first?.entryId}`); mcpState.installed.set(entry.id, { connected: false }); pushBox("mcp-servers", { servers: [] }); return listServers(); }
    case "updatePluginInstall": return listServers();
    case "removeServer": { const entry = byServerId(first); const removed = entry != null && mcpState.installed.delete(entry.id); pushBox("mcp-servers", { servers: [] }); return { removed, ...listServers() }; }
    case "uninstallPlugin": { const removed = mcpState.installed.delete(first); pushBox("mcp-servers", { servers: [] }); return { removed }; }
    case "authenticateServer": {
      const entry = byServerId(first); const row = entry == null ? undefined : mcpState.installed.get(entry.id);
      if (entry == null || row == null) return { status: "not-configured", serverName: String(first) };
      if (row.connected) return { status: "already-authenticated", serverName: entry.displayName };
      // What the box does: PKCE, the vendor's authorize endpoint, the hosted callback as redirect_uri, the state kept for 15 minutes.
      const state = `st-${Math.random().toString(36).slice(2, 10)}`;
      mcpState.pending.set(state, { id: entry.id, serverName: entry.displayName, accountKey: second ?? "default" });
      const authorize = new URL(`${origin}/vendor/authorize`); authorize.searchParams.set("client_id", "simeon"); authorize.searchParams.set("redirect_uri", `${origin}/desktop/mcp-oauth/callback`); authorize.searchParams.set("state", state); authorize.searchParams.set("response_type", "code");
      return { status: "started", serverName: entry.displayName, authorizationUrl: authorize.toString() };
    }
    case "renameAccount": case "removeAccount": { const entry = byServerId(first?.serverId); if (entry != null && action === "removeAccount") { const row = mcpState.installed.get(entry.id); if (row) row.connected = false; } pushBox("mcp-servers", { servers: [] }); return listServers(); }
    case "setServerCustomInstructions": { const entry = byServerId(first?.serverId); const row = entry == null ? undefined : mcpState.installed.get(entry.id); if (row) row.instructions = first.instructions; return listServers(); }
    case "listServerTools": { const entry = byServerId(first); const row = entry == null ? undefined : mcpState.installed.get(entry.id); if (!row?.connected) return []; row.disabled ??= new Set(); return ["search", "create_page", "update_page"].map((name) => ({ name, title: name.replace("_", " "), description: `${entry.displayName}: ${name}`, isDisabled: row.disabled.has(name) })); }
    case "toggleMcpToolDisabled": { const entry = byServerId(first?.serverId); const row = entry == null ? undefined : mcpState.installed.get(entry.id); if (row) { row.disabled ??= new Set(); if (row.disabled.has(first.toolName)) row.disabled.delete(first.toolName); else row.disabled.add(first.toolName); } return desktopMcp(origin, { action: "listServerTools", args: [first?.serverId] }); }
    default: throw new Error(`unknown connected-apps action: ${action}`);
  }
}
/** The second half of the sign-in, as the box does it: the code for the credential; the watch then tells the window. */
function completeMcpOAuth({ stateId, code }) {
  const pending = mcpState.pending.get(stateId);
  if (pending == null || code !== `code-${stateId}`) throw new Error("No pending sign-in matches this callback.");
  mcpState.pending.delete(stateId);
  const row = mcpState.installed.get(pending.id);
  if (row == null) throw new Error(`${pending.id} is no longer installed; the sign-in was discarded.`);
  row.connected = true;
  const entry = CATALOG.find((item) => item.id === pending.id);
  setTimeout(() => { pushBox("mcp-auth", { serverId: entry.serverId, accountKey: pending.accountKey, serverName: pending.serverName, serverIdentifier: entry.id, requestingAgentId: null }); pushBox("mcp-servers", { servers: [] }); }, 300);
  return { ok: true };
}

async function fakeApi(req, res, url) {
  const origin = `http://127.0.0.1:${port}`;
  if (req.method === "POST" && url.pathname === "/auth/web-session") return json(res, 200, { accessToken: "simeon_da_fake", refreshToken: "simeon_dr_fake", expiresAt: new Date(Date.now() + 3600_000).toISOString() }, { "cache-control": "no-store" });
  if (req.method === "POST" && url.pathname === "/oauth/token") return json(res, 200, { access_token: "simeon_da_fake", refresh_token: "simeon_dr_fake" });
  if (url.pathname === "/desktop/api/user/profile") return json(res, 200, { code: 0, data: profile });
  if (url.pathname === "/desktop/api/user/name") { const body = JSON.parse(await readBody(req) || "{}"); profile.preferredName = body.name ?? profile.preferredName; return json(res, 200, { code: 0, data: profile }); }
  if (url.pathname === "/desktop/api/models/available") return json(res, 200, { code: 0, data: [{ modelId: "gpt-6-sol", modelName: "Sol", provider: "openai", role: "primary", contextWindow: 400000, supportsImage: true, supportsToolCalling: true, agenticReady: true }, { modelId: "gpt-6-luna", modelName: "Luna", provider: "openai", role: "cheap" }] });
  if (url.pathname.startsWith("/desktop/api/")) { await readBody(req); return json(res, 200, { code: 0, data: {} }); }
  if (url.pathname === "/aiserver.v1.GrokBotService/EnsureSandBox") {
    await readBody(req);
    return json(res, 200, { cluster: "simeon", podId: "box-1", networkToken: "net", gatewayUrl: `${origin}/sand-box/box-1/p/1340`, gatewayToken: "gw", vncUrl: `${origin}/sand-box/box-1/p/6080/vnc.html?network_token=net`, forkVncBaseUrl: `${origin}/sand-box/box-1/p/6081` });
  }
  if (url.pathname.startsWith("/aiserver.v1.GrokBotService/")) { await readBody(req); return json(res, 200, { started: false, reason: "not in the stand-in", operationId: "" }); }
  // The vendor's sign-in page and the server's hosted callback: the vendor
  // sends the person back with a code, the server sends them on to the page
  // on the web app that hands the box the code.
  if (url.pathname === "/vendor/authorize") {
    const back = new URL(url.searchParams.get("redirect_uri") ?? `${origin}/desktop/mcp-oauth/callback`);
    const state = url.searchParams.get("state") ?? "";
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><title>Pretend vendor</title><body style="font:16px system-ui;padding:40px"><h1>Pretend vendor</h1><p>Simeon would like to read your workspace.</p><a id="allow" href="${back.toString()}?code=code-${state}&state=${state}">Allow</a> · <a id="deny" href="${back.toString()}?error=access_denied&state=${state}">Deny</a></body>`);
    return undefined;
  }
  if (url.pathname === "/desktop/mcp-oauth/callback") {
    const kept = new URLSearchParams(); for (const name of ["state", "code", "error", "error_description"]) { const value = url.searchParams.get(name); if (value != null) kept.set(name, value); }
    // The page in the new tab must find this stand-in as its API, as the first tab did through `?api=`.
    kept.set("api", origin);
    res.writeHead(302, { location: `${origin}/app/connected.html?${kept.toString()}`, "cache-control": "no-store" }); res.end(); return undefined;
  }
  // The computer panel's page, as noVNC would be through the proxy.
  if (url.pathname === "/sand-box/box-1/p/6080/vnc.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end("<!doctype html><title>computer</title><body style='margin:0;background:#1e3a5f;color:#fff;font:16px system-ui;display:grid;place-items:center;height:100vh'>the cloud computer's screen (noVNC stands here)</body>"); return undefined; }
  const gateway = /^\/sand-box\/box-1\/p\/1340(\/.*)$/.exec(url.pathname);
  if (gateway) {
    // What the proxy and the host check: the gateway token and the network token.
    if (req.headers.authorization !== "Bearer gw" || req.headers["x-anyrun-network-token"] !== "net") return json(res, 401, { error: "unauthorized" });
    if (req.headers.origin !== undefined && !url.searchParams.has("proxied")) { /* the real proxy strips Origin; the stand-in is the proxy, so it accepts it */ }
    const rest = gateway[1];
    if (rest === "/health") return json(res, 200, { ok: true, pid: process.pid, isBusy: false, activeAgentId: null, startedAt: Date.now(), lastBusyAtMs: null });
    if (rest === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" });
      res.write("retry: 1000\n\n");
      sseClients.add(res);
      const beat = setInterval(() => res.write(":ping\n\n"), 15_000);
      req.on("close", () => { clearInterval(beat); sseClients.delete(res); });
      backend?.onServing();
      return undefined;
    }
    const command = /^\/api\/([A-Za-z0-9_]+)$/.exec(rest);
    if (command && req.method === "POST") {
      const method = command[1];
      const body = await readBody(req);
      const args = body.length > 0 ? JSON.parse(body) : {};
      if (method === "getHostSettings") return json(res, 200, HOST_SETTINGS, { "x-sand-mint-dedupe": "1" });
      if (method === "setHostSettings") { Object.assign(HOST_SETTINGS, args); return json(res, 200, HOST_SETTINGS); }
      if (method === "getBoxSecretsStatus") return json(res, 200, { keys: [] });
      // The host's shape (`host-box.ts`, BoxStatus): the agent's screen and its windows.
      if (method === "getForeverBoxStatus" || method === "ensureForeverBox") { const vncUrl = `${origin}/sand-box/box-1/p/6080/vnc.html?network_token=net`; return json(res, 200, { agentId: args?.id ?? "", state: "running", vncUrl, windows: [{ windowIndex: 0, vncUrl }] }); }
      if (method === "setBoxSecrets") return json(res, 200, { ok: true });
      if (method === "syncPluginSkills") return json(res, 200, []);
      if (method === "getPluginSyncStatus") return json(res, 200, { authBlocked: [] });
      if (method === "desktopMcp") { try { return json(res, 200, desktopMcp(origin, args) ?? null, { "x-sand-mint-dedupe": "1" }); } catch (error) { return json(res, 500, { error: error.message }); } }
      if (method === "completeMcpOAuth") { try { return json(res, 200, completeMcpOAuth(args)); } catch (error) { return json(res, 500, { error: error.message }); } }
      const outcome = await backend.coordinator(method, args);
      if (outcome.status === "ok") return json(res, 200, outcome.value ?? null, { "x-sand-mint-dedupe": "1" });
      return json(res, 404, { error: outcome.failure.message });
    }
    return json(res, 404, { error: `unknown gateway path ${rest}` });
  }
  return false;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  // CORS as the API has it for the web app's origin, so the page may also be opened from another port.
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": req.headers.origin ?? "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-allow-credentials": "true" }); res.end(); return; }
  if (req.headers.origin) { res.setHeader("access-control-allow-origin", req.headers.origin); res.setHeader("access-control-allow-credentials", "true"); res.setHeader("access-control-expose-headers", "x-sand-mint-dedupe, x-automation-failure-hint, retry-after"); }
  if (!real && (await fakeApi(req, res, url)) !== false) return;
  let file = decodeURIComponent(url.pathname);
  if (file === "/" || file === "/app") file = "/app/index.html";
  if (!file.startsWith("/app/")) { res.writeHead(404); res.end("not found"); return; }
  const target = path.join(outDir, file.slice("/app/".length));
  if (!target.startsWith(outDir)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(target);
    res.writeHead(200, { "content-type": TYPES[path.extname(target)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(data);
  } catch { res.writeHead(404); res.end("not found"); }
});
server.listen(port, "127.0.0.1", () => {
  const api = real ? "the API on 127.0.0.1:8000" : "a stand-in server and box";
  console.log(`Simeon on the web: http://127.0.0.1:${port}/app${real ? "" : `?api=http://127.0.0.1:${port}`} (${api})`);
});
