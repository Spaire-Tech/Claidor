/**
 * Simeon on the web (web/): the Mac app's window served at
 * app.simeonlabs.com/app, with the page standing in for Electron. The
 * bridge bundles for a browser with no Node left in it; the page's door to
 * the server trades the cookie for the pair once and refreshes it the way
 * the Mac does; the gateway connection is built the way the Mac builds it.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", alias: { "node:crypto": path.join(repoRoot, "web/shims/node-crypto.ts") } });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), key: (i) => [...map.keys()][i] ?? null, get length() { return map.size; } };
}

function envelope(exp) {
  const claims = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `simeon_da_h.${claims}.s`;
}

test("the bridge bundles for a browser: the app's real preload and port server, nothing from Node", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-web-bundle-"));
  t.after(() => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const outfile = path.join(temporary, "web-bridge.js");
  await build({
    entryPoints: [path.join(repoRoot, "web/bridge.ts")], bundle: true, format: "iife", platform: "browser", target: "es2022", outfile,
    define: { "process.platform": '"darwin"', "process.env": "{}", __SIMEON_WEB_VERSION__: '"0.0.0-test"' },
    alias: { "node:crypto": path.join(repoRoot, "web/shims/node-crypto.ts") },
    logLevel: "silent",
  });
  const bundle = await readFile(outfile, "utf8");
  assert.match(bundle, /sand:coordinator-port-request/, "the app's own preload is in the bundle");
  assert.match(bundle, /hello\.protocolVersion/, "the app's own port server is in the bundle");
  assert.match(bundle, /\/auth\/web-session/, "the cookie trade is in the bundle");
  assert.match(bundle, /EnsureSandBox/, "the broker call is in the bundle");
  assert.doesNotMatch(bundle, /require\("node:/, "nothing from Node is required");
  assert.doesNotMatch(bundle, /from "node:/, "nothing from Node is imported");
});

test("the API door: where the server is, from where the page is", async (t) => {
  const { module, dispose } = await loadModule("web/api.ts", "web-api");
  t.after(dispose);
  const { resolveApiBase } = module;
  assert.equal(resolveApiBase({ hostname: "app.simeonlabs.com", search: "", protocol: "https:" }), "https://api.simeonlabs.com");
  assert.equal(resolveApiBase({ hostname: "localhost", search: "", protocol: "http:" }), "http://127.0.0.1:8000");
  assert.equal(resolveApiBase({ hostname: "localhost", search: "?api=http://127.0.0.1:4174/", protocol: "http:" }), "http://127.0.0.1:4174");
  assert.equal(resolveApiBase({ hostname: "app.staging.simeonlabs.com", search: "?api=javascript:alert(1)", protocol: "https:" }), "https://api.staging.simeonlabs.com");
});

test("the API door: the cookie trades for the pair once, the pair refreshes ahead of the hour, a dead pair is forgotten", async (t) => {
  const { module, dispose } = await loadModule("web/api.ts", "web-api");
  t.after(dispose);
  const { SimeonApi, sessionTokenStore } = module;
  let now = 1_000_000;
  const calls = [];
  const answers = new Map();
  const fetchImpl = async (url, init = {}) => {
    const key = `${init.method ?? "GET"} ${new URL(url).pathname}`;
    calls.push({ key, headers: init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : (init.headers ?? {}), credentials: init.credentials, body: init.body });
    const answer = answers.get(key) ?? { status: 404, body: {} };
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  };
  const storage = fakeStorage();
  const api = new SimeonApi({ base: "https://api.test", store: sessionTokenStore(storage), fetch: fetchImpl, now: () => now, clientVersion: "0.0.0-test" });
  assert.equal(api.isSignedIn(), false);

  // Signed out on the web app: 401, nothing kept.
  answers.set("POST /auth/web-session", { status: 401, body: { error: "unauthenticated" } });
  assert.equal(await api.signInFromCookie(), false);
  assert.equal(api.isSignedIn(), false);

  // Signed in: the pair, kept in the tab, with the envelope's expiry.
  const exp = Math.floor(now / 1000) + 3600;
  answers.set("POST /auth/web-session", { status: 200, body: { accessToken: envelope(exp), refreshToken: "simeon_dr_one" } });
  assert.equal(await api.signInFromCookie(), true);
  assert.equal(calls.at(-1).credentials, "include", "the cookie goes with the trade");
  assert.equal(api.isSignedIn(), true);
  assert.equal(JSON.parse(storage.getItem("simeon.web.tokens")).refreshToken, "simeon_dr_one");

  // A desktop call carries the bearer and the client headers, and reads the envelope.
  answers.set("GET /desktop/api/user/profile", { status: 200, body: { code: 0, data: { email: "bass@simeonlabs.com" } } });
  assert.deepEqual(await api.data("user/profile"), { email: "bass@simeonlabs.com" });
  assert.equal(calls.at(-1).headers.authorization, `Bearer ${envelope(exp)}`);
  assert.equal(calls.at(-1).headers["x-cursor-client-type"], "sand");

  // Five minutes before the hour is up, the next call refreshes first, like the Mac.
  now = (exp - 200) * 1000;
  const exp2 = exp + 3600;
  answers.set("POST /oauth/token", { status: 200, body: { access_token: envelope(exp2), refresh_token: "simeon_dr_two" } });
  await api.data("user/profile");
  const refresh = calls.find((c) => c.key === "POST /oauth/token");
  assert.deepEqual(JSON.parse(refresh.body), { grant_type: "refresh_token", refresh_token: "simeon_dr_one" });
  assert.equal(calls.at(-1).headers.authorization, `Bearer ${envelope(exp2)}`);
  assert.equal(JSON.parse(storage.getItem("simeon.web.tokens")).refreshToken, "simeon_dr_two");

  // A spent refresh token (200 with shouldLogout, the server's gentle answer) signs the tab out.
  now = (exp2 - 100) * 1000;
  answers.set("POST /oauth/token", { status: 200, body: { shouldLogout: true, error: "invalid_grant" } });
  await assert.rejects(() => api.data("user/profile"), /Sign in/);
  assert.equal(api.isSignedIn(), false);
  assert.equal(storage.getItem("simeon.web.tokens"), null);

  // A Connect call on the broker: JSON in, JSON out, the hint header on a refusal.
  answers.set("POST /auth/web-session", { status: 200, body: { accessToken: envelope(exp2 + 7200), refreshToken: "simeon_dr_three" } });
  await api.signInFromCookie();
  answers.set("POST /aiserver.v1.GrokBotService/EnsureSandBox", { status: 200, body: { gatewayUrl: "https://api.test/sand-box/b/p/1340", gatewayToken: "gw", networkToken: "net" } });
  const box = await api.connect("EnsureSandBox", {});
  assert.equal(box.gatewayUrl, "https://api.test/sand-box/b/p/1340");
  assert.equal(calls.at(-1).headers["content-type"], "application/json");
});

test("the gateway connection is built the way the Mac builds it, with the VNC proxy when the box is fronted", async (t) => {
  const { module, dispose } = await loadModule("web/gateway.ts", "web-gateway");
  t.after(dispose);
  const { connectionFromBox } = module;
  const connection = connectionFromBox({ gatewayUrl: "https://api.test/sand-box/b/p/1340", gatewayToken: "gw", networkToken: "net", vncUrl: "https://api.test/sand-box/b/p/6080/vnc.html?network_token=net", forkVncBaseUrl: "https://api.test/sand-box/b/p/6081" });
  assert.equal(connection.baseUrl, "https://api.test/sand-box/b/p/1340");
  assert.equal(connection.token, "gw");
  assert.deepEqual(connection.headers, { "x-anyrun-network-token": "net" });
  assert.equal(connection.vncProxy.networkToken, "net");
  assert.throws(() => connectionFromBox({ gatewayUrl: "" }), /no gateway address/);
});

test("the models menu is the Mac's: the primary role only, one row on by default", async (t) => {
  const { module, dispose } = await loadModule("web/backend.ts", "web-backend");
  t.after(dispose);
  const { availableModelsJson } = module;
  const menu = availableModelsJson([
    { modelId: "gpt-6-luna", modelName: "Luna", role: "cheap" },
    { modelId: "gpt-6-sol", modelName: "Sol", provider: "openai", role: "primary", contextWindow: 400000, supportsImage: true },
    { modelId: "claude-opus-5", role: "fallback" },
    { modelId: "gone", role: "primary", accessible: false },
  ]);
  assert.deepEqual(menu.models.map((m) => m.name), ["gpt-6-sol"]);
  assert.equal(menu.models[0].defaultOn, true);
  assert.equal(menu.models[0].clientDisplayName, "Sol");
  assert.equal(menu.models[0].vendorName, "openai");
  assert.equal(menu.models[0].contextTokenLimit, 400000);
});
