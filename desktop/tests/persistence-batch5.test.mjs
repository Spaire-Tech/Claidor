/**
 * Data and persistence, batch 5 (25 September 2026; ledger F-258, F-360,
 * F-361, F-362, F-370, F-372).
 *
 * Offline: an unreadable settings.json is copied aside before defaults
 * apply, and the store's temp name is unique per write; deleting an agent
 * removes its connector-secrets folder; the box is told its data root; the
 * secrets store reports an undecryptable blob instead of listing it or
 * failing the push; and the sign-in poll posts the verifier in a body,
 * never in the query string.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  // In the tree, so `undici` (left external) resolves from node_modules.
  const temporary = await mkdtemp(path.join(repoRoot, ".tmp-persistence-batch5-"));
  const outfile = path.join(temporary, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/persistence-batch5-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["undici"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, temporary, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("an unreadable settings.json is copied aside before defaults apply, and each write has its own temp name", async () => {
  const loaded = await load();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    const dir = path.join(loaded.temporary, "settings");
    await mkdir(dir, { recursive: true });
    const settingsPath = path.join(dir, "settings.json");
    await writeFile(settingsPath, "{ this is not json");
    const store = new loaded.module.SandSettingsStore(settingsPath);
    const loadedSettings = store.load();
    assert.equal(loadedSettings.version, 1);
    const names = await readdir(dir);
    const backup = names.find((name) => name.startsWith("settings.json.unreadable-"));
    assert.ok(backup, `a copy was made: ${names.join(",")}`);
    assert.equal(await readFile(path.join(dir, backup), "utf8"), "{ this is not json");
    assert.ok(warnings.some((line) => line.includes(backup)), "the copy's name is printed");
    // A version the store does not know is treated the same way.
    await writeFile(settingsPath, JSON.stringify({ version: 99 }));
    store.load();
    assert.equal((await readdir(dir)).filter((name) => name.startsWith("settings.json.unreadable-")).length >= 1, true);
    // The temp name carries pid and a random suffix.
    const source = await readFile(path.join(repoRoot, "source/shared/node/settings/sand-settings-store.ts"), "utf8");
    assert.match(source, /const temp = `\$\{this\.settingsPath\}\.\$\{process\.pid\}\.\$\{randomBytes\(4\)\.toString\("hex"\)\}\.tmp`/);
    store.persist({ ...loadedSettings, egressTunnelEnabled: true });
    assert.equal(JSON.parse(await readFile(settingsPath, "utf8")).egressTunnelEnabled, true);
    assert.equal((await readdir(dir)).some((name) => name.endsWith(".tmp")), false, "no temp file is left behind");
  } finally {
    console.warn = originalWarn;
    await loaded.dispose();
  }
});

test("deleting an agent removes its connector-secrets folder", async () => {
  const loaded = await load();
  try {
    const root = path.join(loaded.temporary, "connector-secrets");
    const store = new loaded.module.SandConnectorSecretStore(root);
    assert.equal(store.setSecret("agent-one", "slack", "token", "xoxb-1"), true);
    assert.equal(store.setSecret("agent-two", "discord", "token", "d-2"), true);
    store.removeAgent("agent-one");
    assert.equal(existsSync(path.join(root, "agent-one")), false);
    assert.equal(store.getSecret("agent-two", "discord", "token"), "d-2");
    store.removeAgent("../escape");
    assert.equal(existsSync(root), true);
    const session = await readFile(path.join(repoRoot, "source/host/extensions/session/agent-session.ts"), "utf8");
    assert.match(session, /await rm\(this\.getAgentDir\(agentId\), \{ recursive: true, force: true \}\); this\.connectorSecrets\.removeAgent\(agentId\);/);
  } finally {
    await loaded.dispose();
  }
});

test("the box is told its data root, and an undecryptable secret is reported instead of listed or fatal", async () => {
  const connector = await readFile(path.join(repoRoot, "source/electron-main/box/local-docker-host-connector.ts"), "utf8");
  assert.match(connector, /"--env", "SAND_DATA_ROOT=\/home\/box\/sand-data",/);
  const secrets = await readFile(path.join(repoRoot, "source/electron-main/secrets/user-secrets-store.ts"), "utf8");
  assert.match(secrets, /async listKeys\(\): Promise<string\[\]> \{[\s\S]*?const readable = new Set<string>\(session\.keys\(\)\);[\s\S]*?catch \(error\) \{ reportDesktopEdgeFailure\("user-secrets", "decrypt", error\); \}/);
  assert.match(secrets, /for \(const key of diskKeys\) \{\n\s*\/\/ One undecryptable blob used to fail the whole push to the box, silently \(F-372\)\.\n\s*try \{ secrets\[key\] = /);
  assert.equal(/for \(const key of diskKeys\) secrets\[key\] = loadElectronUserSecretsRuntime/.test(secrets), false);
});

test("the sign-in poll posts the verifier in a body, never in the query string", async () => {
  // proxy-fetch.ts reads HTTPS_PROXY when its module loads, so the bundle is
  // loaded with none set and the call reaches the local server directly.
  const previousProxy = { HTTPS_PROXY: process.env.HTTPS_PROXY, https_proxy: process.env.https_proxy };
  delete process.env.HTTPS_PROXY;
  delete process.env.https_proxy;
  const loaded = await load();
  const seen = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      seen.push({ method: request.method, url: request.url, body });
      if (seen.length === 1) { response.writeHead(404, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "not_found" })); return; }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ accessToken: "eyJ.access", refreshToken: "claidor_dr_1" }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const tokens = await loaded.module.pollAuthenticationStatus({ uuid: "u-1", verifier: "secret-verifier", apiBaseUrl: `http://127.0.0.1:${port}` });
    assert.deepEqual(tokens, { accessToken: "eyJ.access", refreshToken: "claidor_dr_1" });
    assert.equal(seen.length, 2);
    for (const request of seen) {
      assert.equal(request.method, "POST");
      assert.equal(request.url, "/auth/poll");
      assert.deepEqual(JSON.parse(request.body), { uuid: "u-1", verifier: "secret-verifier" });
    }
  } finally {
    for (const [key, value] of Object.entries(previousProxy)) { if (value !== undefined) process.env[key] = value; }
    server.close();
    await loaded.dispose();
  }
});
