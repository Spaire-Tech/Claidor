/**
 * The vendor connector store travels both ways (24 September 2026, evening).
 * The founder's log: "Installed Figma" in the box, the card drawn, then the
 * Mac had no `vendor-mcp-installs.json` at all, and every refresh wrote the
 * Mac's empty store over the box's, so the connect card, answered on the
 * Mac, found no row and the agent offered a retry.
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
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", packages: "external" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const credential = { accessToken: "notion-token", refreshToken: "r", expiresAtMs: 4e12, tokenEndpoint: "https://mcp.notion.com/token", clientId: "c" };

test("an install the agent ran in the box reaches the Mac, and the Mac's credential reaches the box", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/installs.ts", "vendor-installs");
  const mac = await mkdtemp(path.join(os.tmpdir(), "simeon-mac-"));
  const box = await mkdtemp(path.join(os.tmpdir(), "simeon-box-"));
  try {
    let clock = 1_000;
    const now = () => clock;
    // The box installs Figma (the agent's InstallPlugin); the Mac has no file.
    module.upsertVendorMcpInstall(box, { id: "notion", url: "https://mcp.notion.com/mcp", connected: false }, now);
    // The Mac's refresh sends its (empty) store: the box keeps its install.
    const boxAfterEmpty = module.adoptVendorMcpStore(box, module.serializeVendorMcpStore(module.loadVendorMcpStore(mac)), "incoming");
    assert.equal(boxAfterEmpty.changed, false);
    assert.deepEqual(module.loadVendorMcpInstalls(box).map((row) => row.id), ["notion"]);
    // The Mac pulls the box's copy: the row lands on the Mac, which is where the connect card looks.
    const macPull = module.adoptVendorMcpStore(mac, module.serializeVendorMcpStore(module.loadVendorMcpStore(box)), "local");
    assert.equal(macPull.changed, true);
    assert.equal(module.vendorMcpInstallById(mac, "notion")?.url, "https://mcp.notion.com/mcp");
    // Sign-in finishes on the Mac; the next refresh carries the credential to the box, the Mac's row winning.
    module.setVendorMcpCredential(mac, "notion", credential);
    module.adoptVendorMcpStore(box, module.serializeVendorMcpStore(module.loadVendorMcpStore(mac)), "incoming");
    assert.equal(module.vendorMcpInstallById(box, "notion")?.credential?.accessToken, "notion-token");
    // A box pull never overwrites the Mac's credential.
    module.adoptVendorMcpStore(mac, module.serializeVendorMcpStore(module.loadVendorMcpStore(box)), "local");
    assert.equal(module.vendorMcpInstallById(mac, "notion")?.credential?.accessToken, "notion-token");
    // Logout on the Mac clears the box's credential on the next refresh (the Mac is the authority).
    module.clearVendorMcpCredential(mac, "notion");
    module.adoptVendorMcpStore(box, module.serializeVendorMcpStore(module.loadVendorMcpStore(mac)), "incoming");
    assert.equal(module.vendorMcpInstallById(box, "notion")?.credential, undefined);
    assert.equal(module.vendorMcpInstallById(box, "notion")?.url, "https://mcp.notion.com/mcp", "the install itself stays");
    // An uninstall on either side leaves a tombstone the other side honours.
    clock = 2_000;
    module.removeVendorMcpInstall(box, "notion", now);
    module.adoptVendorMcpStore(mac, module.serializeVendorMcpStore(module.loadVendorMcpStore(box)), "local");
    assert.equal(module.vendorMcpInstallById(mac, "notion"), undefined, "the box's uninstall removes the Mac's row");
    module.adoptVendorMcpStore(box, module.serializeVendorMcpStore(module.loadVendorMcpStore(mac)), "incoming");
    assert.equal(module.vendorMcpInstallById(box, "notion"), undefined, "and the Mac's copy does not bring it back");
    // A later re-install wins over the tombstone.
    clock = 3_000;
    module.upsertVendorMcpInstall(mac, { id: "notion", url: "https://mcp.notion.com/mcp", connected: false }, now);
    module.adoptVendorMcpStore(box, module.serializeVendorMcpStore(module.loadVendorMcpStore(mac)), "incoming");
    assert.equal(module.vendorMcpInstallById(box, "notion")?.url, "https://mcp.notion.com/mcp");
    assert.equal(module.loadVendorMcpStore(box).removed.length, 0, "the tombstone is gone once re-installed");
    // The file still reads as before for a row from before this change (no installedAtMs).
    const legacy = module.parseVendorMcpStore([{ id: "notion", url: "https://mcp.notion.com/mcp", connected: false }, { id: "gone", removedAtMs: 5 }, { bogus: true }]);
    assert.deepEqual(legacy.installs.map((row) => row.id), ["notion"]);
    assert.deepEqual(legacy.removed, [{ id: "gone", removedAtMs: 5 }]);
  } finally {
    await rm(mac, { recursive: true, force: true });
    await rm(box, { recursive: true, force: true });
    await dispose();
  }
});

test("a sign-in finished in the box (Simeon on the web) reaches the Mac, each side keeps its own refresh token, and a sign-out anywhere wins", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/installs.ts", "vendor-installs-web");
  const mac = await mkdtemp(path.join(os.tmpdir(), "simeon-mac3-"));
  const box = await mkdtemp(path.join(os.tmpdir(), "simeon-box3-"));
  const sync = (from, to, authority) => module.adoptVendorMcpStore(to, module.serializeVendorMcpStoreForPeer(module.loadVendorMcpStore(from)), authority);
  try {
    let clock = 1_000;
    const now = () => clock;
    // Installed from the web: the box has the row, the Mac takes it.
    module.upsertVendorMcpInstall(box, { id: "notion", url: "https://mcp.notion.com/mcp", connected: false }, now);
    sync(box, mac, "local");
    // The web's sign-in finishes in the box; the Mac's next pull brings the credential, without the refresh token.
    clock = 2_000;
    module.setVendorMcpCredential(box, "notion", credential, now);
    sync(box, mac, "local");
    const onMac = module.vendorMcpInstallById(mac, "notion");
    assert.equal(onMac?.credential?.accessToken, "notion-token");
    assert.equal(onMac?.credential?.refreshToken, undefined, "the refresh token stays where the sign-in finished");
    assert.equal(onMac?.credentialAtMs, 2_000);
    // The Mac's refresh sends its copy back: the box keeps its own row, refresh token included, although the Mac is the authority on a tie.
    sync(mac, box, "incoming");
    assert.equal(module.vendorMcpInstallById(box, "notion")?.credential?.refreshToken, "r");
    // The box refreshes the token (a newer credential): the Mac takes it.
    clock = 3_000;
    module.setVendorMcpCredential(box, "notion", { ...credential, accessToken: "notion-token-2" }, now);
    sync(box, mac, "local");
    assert.equal(module.vendorMcpInstallById(mac, "notion")?.credential?.accessToken, "notion-token-2");
    // A sign-out on the Mac, later, wins over the box's credential; one in the box wins over the Mac's.
    clock = 4_000;
    module.clearVendorMcpCredential(mac, "notion", now);
    sync(mac, box, "incoming");
    assert.equal(module.vendorMcpInstallById(box, "notion")?.credential, undefined, "the Mac's sign-out reaches the box");
    clock = 5_000;
    module.setVendorMcpCredential(mac, "notion", credential, now);
    sync(mac, box, "incoming");
    assert.equal(module.vendorMcpInstallById(box, "notion")?.credential?.accessToken, "notion-token");
    clock = 6_000;
    module.clearVendorMcpCredential(box, "notion", now);
    sync(box, mac, "local");
    assert.equal(module.vendorMcpInstallById(mac, "notion")?.credential, undefined, "the box's sign-out reaches the Mac, although the Mac is the authority");
    // A stale copy never undoes a newer change: the Mac's old row (with the credential) comes back, the box keeps the sign-out.
    module.adoptVendorMcpStore(box, [{ id: "notion", url: "https://mcp.notion.com/mcp", connected: true, credential, installedAtMs: 1_000, credentialAtMs: 5_000 }], "incoming");
    assert.equal(module.vendorMcpInstallById(box, "notion")?.credential, undefined);
    // Rows from before this change (no credentialAtMs) merge as they did: the authority's credential stands.
    const merged = module.mergeVendorMcpStores(
      { installs: [{ id: "x", url: "u", connected: false, installedAtMs: 1 }], removed: [] },
      { installs: [{ id: "x", url: "u", connected: true, credential: { accessToken: "a", tokenEndpoint: "t", clientId: "c" }, installedAtMs: 1 }], removed: [] },
      "incoming",
    );
    assert.equal(merged.installs[0].credential?.accessToken, "a");
  } finally {
    await rm(mac, { recursive: true, force: true });
    await rm(box, { recursive: true, force: true });
    await dispose();
  }
});

test("the Mac's pull is throttled, bounded, and merges the box's answer", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/box-pull.ts", "vendor-box-pull");
  const installs = await load("source/shared/node/vendor-mcp/installs.ts", "vendor-installs-2");
  const mac = await mkdtemp(path.join(os.tmpdir(), "simeon-mac2-"));
  try {
    let reads = 0;
    let clock = 0;
    const pull = module.createBoxVendorMcpStorePull({
      rootDir: () => mac,
      readBoxVendorMcpStore: async () => { reads += 1; return { vendorMcpStore: [{ id: "notion", url: "https://mcp.notion.com/mcp", connected: false, installedAtMs: 10 }] }; },
      now: () => clock,
    });
    await pull();
    assert.equal(installs.module.vendorMcpInstallById(mac, "notion")?.url, "https://mcp.notion.com/mcp");
    await pull();
    assert.equal(reads, 1, "a second pull within the fresh window does not ask the box again");
    clock = 5_000;
    await pull();
    assert.equal(reads, 2);
    const slow = module.createBoxVendorMcpStorePull({ rootDir: () => mac, readBoxVendorMcpStore: () => new Promise(() => {}), timeoutMs: 20, log: () => {} });
    const started = Date.now();
    await slow();
    assert.ok(Date.now() - started < 1_000, "a silent box does not hold the read");
  } finally {
    await rm(mac, { recursive: true, force: true });
    await installs.dispose();
    await dispose();
  }
});

test("the vendor backend on the Mac pulls the box's store before it looks for the install", async () => {
  const source = await readFile(path.join(repoRoot, "source/shared/node/vendor-mcp/backend-exec.ts"), "utf8");
  assert.match(source, /readonly syncStore\?: \(\) => Promise<void>;/);
  assert.match(source, /await synced\(\);\n\s*const connector = vendorMcpConnectorById\(vendorPluginId\);/);
  assert.match(source, /async listTools\(serverIdentifiers: readonly string\[\]\): Promise<readonly unknown\[\]> \{\n\s*await synced\(\);/);
});
