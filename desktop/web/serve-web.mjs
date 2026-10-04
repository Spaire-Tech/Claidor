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
      if (method === "getForeverBoxStatus") return json(res, 200, { state: "ready", vncUrl: `${origin}/sand-box/box-1/p/6080/vnc.html?network_token=net` });
      if (method === "setBoxSecrets") return json(res, 200, { ok: true });
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
