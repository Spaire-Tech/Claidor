/**
 * Every connector Simeon offers is named in the chat in its colour, with its
 * logo (15 October 2026; the founder: "again, some connectors are missing the
 * color. like shop. whenever you add a connector make sure the color is in the
 * chat as well"). Shop was added to the catalogue without a line in
 * ios/scripts/connector-mentions.json, so the iPhone and Mac apps wrote its
 * name in plain text.
 *
 * A new connector needs, besides its catalogue entry: a line in
 * connector-mentions.json (name, key, logo, colour), then
 * `node ios/scripts/make-assets.mjs`, which writes GeneratedBrands.swift and
 * the Brands/<key> logos of both apps.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function loadCatalogue() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-catalogue-"));
  const outfile = path.join(dir, "catalog.mjs");
  await build({ entryPoints: [path.join(repoRoot, "desktop/source/shared/node/vendor-mcp/catalog.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { connectors: module.VENDOR_MCP_CONNECTORS, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const generated = readFileSync(path.join(repoRoot, "ios/SimeonCore/Sources/SimeonCore/GeneratedBrands.swift"), "utf8");
const mentions = new Map([...generated.matchAll(/BrandMention\(name: "([^"]+)", key: "([^"]+)", light: "(#[0-9a-f]{6})", dark: "(#[0-9a-f]{6})"/g)]
  .map(([, name, key, light, dark]) => [name, { key, light, dark }]));

test("every connector in the catalogue has its colour and logo in the iPhone and Mac chat", async () => {
  const { connectors, dispose } = await loadCatalogue();
  try {
    assert.ok(connectors.length > 50, `the catalogue has its connectors: ${connectors.length}`);
    const missing = [];
    for (const connector of connectors) {
      const mention = mentions.get(connector.name);
      if (mention == null) { missing.push(`${connector.name}: no colour (add it to ios/scripts/connector-mentions.json, then run node ios/scripts/make-assets.mjs)`); continue; }
      for (const app of ["ios", "mac"]) {
        const logo = path.join(repoRoot, app, "Simeon/Assets.xcassets/Brands", `${mention.key}.imageset`, `${mention.key}.png`);
        if (!existsSync(logo)) missing.push(`${connector.name}: no logo in the ${app === "ios" ? "iPhone" : "Mac"} app (run node ios/scripts/make-assets.mjs)`);
      }
    }
    assert.deepEqual(missing, [], `connectors named in the chat without their colour or logo:\n${missing.join("\n")}`);
  } finally {
    await dispose();
  }
});

test("Shop and Shop Pay are written in Shop's purple", () => {
  assert.deepEqual(mentions.get("Shop"), { key: "shop", light: "#5433eb", dark: "#907af2" });
  assert.equal(mentions.get("Shop Pay")?.key, "shop");
});
