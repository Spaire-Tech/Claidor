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
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", packages: "external" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const credential = { accessToken: "figma-token", refreshToken: "r", expiresAtMs: 4e12, tokenEndpoint: "https://mcp.figma.com/token", clientId: "c" };

test("an install the agent ran in the box reaches the Mac, and the Mac's credential reaches the box", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/installs.ts", "vendor-installs");
  const mac = await mkdtemp(path.join(os.tmpdir(), "caisra-mac-"));
  const box = await mkdtemp(path.join(os.tmpdir(), "caisra-box-"));
  try {
    let clock = 1_000;
    const now = () => clock;
    // The box installs Figma (the agent's InstallPlugin); the Mac has no file.
    module.upsertVendorMcpInstall(box, { id: "figma", url: "https://mcp.figma.com/mcp", connected: false }, now);
    // The Mac's refresh sends its (empty) store: the box keeps its install.
    const boxAfterEmpty = module.adoptVendorMcpStore(box, module.serializeVendorMcpStore(module.loadVendorMcpStore(mac)), "incoming");
    assert.equal(boxAfterEmpty.changed, false);
    assert.deepEqual(module.loadVendorMcpInstalls(box).map((row) => row.id), ["figma"]);
    // The Mac pulls the box's copy: the row lands on the Mac, which is where the connect card looks.
    const macPull = module.adoptVendorMcpStore(mac, module.serializeVendorMcpStore(module.loadVendorMcpStore(box)), "local");
    assert.equal(macPull.changed, true);
    assert.equal(module.vendorMcpInstallById(mac, "figma")?.url, "https://mcp.figma.com/mcp");
    // Sign-in finishes on the Mac; the next refresh carries the credential to the box, the Mac's row winning.
    module.setVendorMcpCredential(mac, "figma", credential);
    module.adoptVendorMcpStore(box, module.serializeVendorMcpStore(module.loadVendorMcpStore(mac)), "incoming");
    assert.equal(module.vendorMcpInstallById(box, "figma")?.credential?.accessToken, "figma-token");
    // A box pull never overwrites the Mac's credential.
    module.adoptVendorMcpStore(mac, module.serializeVendorMcpStore(module.loadVendorMcpStore(box)), "local");
    assert.equal(module.vendorMcpInstallById(mac, "figma")?.credential?.accessToken, "figma-token");
    // Logout on the Mac clears the box's credential on the next refresh (the Mac is the authority).
    module.clearVendorMcpCredential(mac, "figma");
    module.adoptVendorMcpStore(box, module.serializeVendorMcpStore(module.loadVendorMcpStore(mac)), "incoming");
    assert.equal(module.vendorMcpInstallById(box, "figma")?.credential, undefined);
    assert.equal(module.vendorMcpInstallById(box, "figma")?.url, "https://mcp.figma.com/mcp", "the install itself stays");
    // An uninstall on either side leaves a tombstone the other side honours.
    clock = 2_000;
    module.removeVendorMcpInstall(box, "figma", now);
    module.adoptVendorMcpStore(mac, module.serializeVendorMcpStore(module.loadVendorMcpStore(box)), "local");
    assert.equal(module.vendorMcpInstallById(mac, "figma"), undefined, "the box's uninstall removes the Mac's row");
    module.adoptVendorMcpStore(box, module.serializeVendorMcpStore(module.loadVendorMcpStore(mac)), "incoming");
    assert.equal(module.vendorMcpInstallById(box, "figma"), undefined, "and the Mac's copy does not bring it back");
    // A later re-install wins over the tombstone.
    clock = 3_000;
    module.upsertVendorMcpInstall(mac, { id: "figma", url: "https://mcp.figma.com/mcp", connected: false }, now);
    module.adoptVendorMcpStore(box, module.serializeVendorMcpStore(module.loadVendorMcpStore(mac)), "incoming");
    assert.equal(module.vendorMcpInstallById(box, "figma")?.url, "https://mcp.figma.com/mcp");
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

test("the Mac's pull is throttled, bounded, and merges the box's answer", async () => {
  const { module, dispose } = await load("source/shared/node/vendor-mcp/box-pull.ts", "vendor-box-pull");
  const installs = await load("source/shared/node/vendor-mcp/installs.ts", "vendor-installs-2");
  const mac = await mkdtemp(path.join(os.tmpdir(), "caisra-mac2-"));
  try {
    let reads = 0;
    let clock = 0;
    const pull = module.createBoxVendorMcpStorePull({
      rootDir: () => mac,
      readBoxVendorMcpStore: async () => { reads += 1; return { vendorMcpStore: [{ id: "figma", url: "https://mcp.figma.com/mcp", connected: false, installedAtMs: 10 }] }; },
      now: () => clock,
    });
    await pull();
    assert.equal(installs.module.vendorMcpInstallById(mac, "figma")?.url, "https://mcp.figma.com/mcp");
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
  assert.match(source, /await synced\(\);\n\s*const install = installFor\(vendorPluginId\);/);
  assert.match(source, /async listTools\(serverIdentifiers: readonly string\[\]\): Promise<readonly unknown\[\]> \{\n\s*await synced\(\);/);
});
