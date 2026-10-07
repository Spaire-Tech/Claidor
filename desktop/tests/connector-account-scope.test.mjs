import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// A second Simeon account signed in on the same Mac saw, used and pushed to its
// own cloud computer the first account's connectors (7 October 2026): the two
// store files sat once per Mac. Each account now has its own folder.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadStores() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-connector-scope-"));
  const entry = path.join(temporary, "entry.ts");
  const source = (file) => JSON.stringify(path.join(repoRoot, "source/shared/node", file));
  // One bundle, so the scope the Mac registers is the one both stores read.
  await writeFile(entry, `export * from ${source("connector-account-scope.ts")};\nexport { loadVendorMcpStore, saveVendorMcpStore, vendorMcpInstallsPath } from ${source("vendor-mcp/installs.ts")};\nexport { loadAccountMcpStore, saveAccountMcpStore, accountMcpStorePath, EMPTY_ACCOUNT_MCP_STORE } from ${source("account-mcp/store.ts")};\n`);
  const output = path.join(temporary, "stores.mjs");
  await build({ entryPoints: [entry], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' } });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, temporary, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

const ACCOUNT_A = createHash("sha256").update("account-a").digest("hex");
const ACCOUNT_B = createHash("sha256").update("account-b").digest("hex");
const install = (id, accessToken) => ({ id, url: `https://${id}.example/mcp`, connected: true, installedAtMs: 1, credentialAtMs: 1, credential: { accessToken, refreshToken: `${accessToken}-refresh`, tokenEndpoint: `https://${id}.example/token`, clientId: "client" } });

test("each account on the Mac reads only its own connectors, and the box keeps one folder", async () => {
  const loaded = await loadStores();
  const m = loaded.module;
  const root = path.join(loaded.temporary, "data");
  try {
    // The box never registers a scope: the files stay where they were.
    assert.equal(m.vendorMcpInstallsPath(root), path.join(root, "vendor-mcp-installs.json"));
    assert.equal(m.accountMcpStorePath(root), path.join(root, "account-mcp-config.json"));

    let scope = ACCOUNT_A;
    m.scopeConnectorStoresToAccount(() => scope);
    assert.equal(m.vendorMcpInstallsPath(root), path.join(root, "accounts", ACCOUNT_A, "vendor-mcp-installs.json"));
    m.saveVendorMcpStore(root, { installs: [install("notion", "token-of-a")], removed: [] });
    m.saveAccountMcpStore(root, { ...m.EMPTY_ACCOUNT_MCP_STORE, servers: { "a-server": { id: "100001", config: { url: "https://a.example/mcp" }, updatedAtMs: 1 } } });

    // Account B signs in on the same Mac: nothing of A's.
    scope = ACCOUNT_B;
    assert.deepEqual(m.loadVendorMcpStore(root).installs, []);
    assert.deepEqual(m.loadAccountMcpStore(root).servers, {});
    m.saveVendorMcpStore(root, { installs: [install("linear", "token-of-b")], removed: [] });

    // Signed out: an empty folder, never A's or B's.
    scope = undefined;
    assert.deepEqual(m.loadVendorMcpStore(root).installs, []);
    assert.match(m.vendorMcpInstallsPath(root), /accounts[\\/]signed-out[\\/]vendor-mcp-installs\.json$/);

    // A comes back to exactly what A had.
    scope = ACCOUNT_A;
    assert.deepEqual(m.loadVendorMcpStore(root).installs.map((row) => [row.id, row.credential?.accessToken]), [["notion", "token-of-a"]]);
    assert.deepEqual(Object.keys(m.loadAccountMcpStore(root).servers), ["a-server"]);

    // A scope that is not a hash never becomes a path of its own making.
    scope = "../../etc";
    assert.equal(path.dirname(path.dirname(m.vendorMcpInstallsPath(root))), path.join(root, "accounts"));
  } finally {
    m.resetConnectorStoreScope();
    await loaded.dispose();
  }
});

test("the files from before are adopted once by the account the Mac is scoped to, and never by the next one", async () => {
  const loaded = await loadStores();
  const m = loaded.module;
  const root = path.join(loaded.temporary, "data");
  try {
    m.saveVendorMcpStore(root, { installs: [install("gmail", "earlier-token")], removed: [] });
    let scope = ACCOUNT_A;
    m.scopeConnectorStoresToAccount(() => scope);
    assert.deepEqual(m.loadVendorMcpStore(root).installs.map((row) => row.id), ["gmail"]);
    assert.equal(existsSync(path.join(root, "vendor-mcp-installs.json")), false, "moved, not copied");
    scope = ACCOUNT_B;
    assert.deepEqual(m.loadVendorMcpStore(root).installs, []);

    // A file from before that arrives when the account already has one is set aside, read by no one.
    await writeFile(path.join(root, "vendor-mcp-installs.json"), JSON.stringify([install("slack", "stray")]));
    scope = ACCOUNT_A;
    assert.deepEqual(m.loadVendorMcpStore(root).installs.map((row) => row.id), ["gmail"]);
    const unassigned = path.join(root, "accounts", "unassigned");
    const [stamp] = await readdir(unassigned);
    assert.match(await readFile(path.join(unassigned, stamp, "vendor-mcp-installs.json"), "utf8"), /stray/);
  } finally {
    m.resetConnectorStoreScope();
    await loaded.dispose();
  }
});

test("the Mac registers the settings' account scope when it creates its settings", async () => {
  const providers = await readFile(path.join(repoRoot, "source/electron-main/production-binding-providers.ts"), "utf8");
  assert.match(providers, /scopeConnectorStoresToAccount\(\(\) => settingsStore\.getMcpCustomInstructionsAccountScope\(\)\);/);
  const host = await readFile(path.join(repoRoot, "source/host/extensions/mcp/mcp-service.ts"), "utf8");
  assert.doesNotMatch(host, /scopeConnectorStoresToAccount/, "the cloud computer belongs to one account");
});
