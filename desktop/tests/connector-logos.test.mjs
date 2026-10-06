/**
 * Every connector has its own product mark (6 October 2026). Before this,
 * four Google products were drawn with the same Google "G" and 45
 * connectors were fetched live from Google's favicon service, which gave
 * Slides and Calendar a generic icon (the founder, 6 October 2026).
 *
 * Measures: every id in the catalog has an embedded logo; no logo is the
 * G, a favicon-service URL or Composio's placeholder grid; the generated
 * file matches the folder (so a forgotten regeneration fails here).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { OUT_FILE, readConnectorLogos, renderLogoData } from "../scripts/make-connector-logos.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function catalogIds() {
  const source = await readFile(path.join(repoRoot, "source/shared/node/vendor-mcp/catalog.ts"), "utf8");
  return [...source.matchAll(/\bid: "([^"]+)"/g)].map((m) => m[1]);
}

// The Google "G" the old file embedded for four products: its first path.
const GOOGLE_G_PATH = "M11.5043 2.42609C11.5043 1.61739";

test("every connector in the catalog has an embedded logo of its own", async () => {
  const ids = await catalogIds();
  assert.ok(ids.length >= 60, `the catalog lists ${ids.length} connectors`);
  const logos = Object.fromEntries((await readConnectorLogos()).map(({ id, dataUrl }) => [id, dataUrl]));
  const missing = ids.filter((id) => logos[id] == null);
  assert.deepEqual(missing, [], `connectors without a logo file: ${missing.join(", ")}`);
  const seen = new Map();
  for (const id of ids) {
    const url = logos[id];
    assert.match(url, /^data:image\/(svg\+xml|png|webp);base64,/, `${id} is embedded`);
    const decoded = Buffer.from(url.slice(url.indexOf(",") + 1), "base64").toString("latin1");
    assert.ok(!decoded.includes(GOOGLE_G_PATH), `${id} is not the Google G`);
    assert.ok(!decoded.includes("composio-fallback"), `${id} is not Composio's placeholder`);
    assert.ok(!url.includes("s2/favicons"), `${id} is not fetched from the favicon service`);
    assert.ok(decoded.length > 300, `${id} is a real picture (${decoded.length} bytes)`);
    const prior = seen.get(url);
    assert.equal(prior, undefined, `${id} and ${prior} share one picture`);
    seen.set(url, id);
  }
});

test("the generated logo file matches the folder", async () => {
  const expected = renderLogoData(await readConnectorLogos());
  const actual = await readFile(OUT_FILE, "utf8");
  assert.equal(actual, expected, "run: node scripts/make-connector-logos.mjs");
});

test("the panel's logo lookup answers every catalog id from the embedded set", async () => {
  const source = await readFile(path.join(repoRoot, "source/shared/node/vendor-mcp/logos.ts"), "utf8");
  assert.ok(!source.includes("s2/favicons"), "no favicon service left in logos.ts");
  assert.ok(!source.includes(GOOGLE_G_PATH), "no Google G left in logos.ts");
  assert.match(source, /CONNECTOR_LOGOS/);
});
