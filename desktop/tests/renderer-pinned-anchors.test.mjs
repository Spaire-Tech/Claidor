/**
 * The renderer patch's anchors against the pinned 0.18.0 bytes (ledger
 * F-451, F-452, F-454; 26 September 2026).
 *
 * Offline: the brand residue counter counts Cursor's names after the pass
 * and the record carries them. With a pinned renderer on disk (bootstrap's
 * path or GROK_BOT_PINNED_RENDERER): every class the header-card and
 * Liquid Glass blocks name appears in the shipped stylesheet or a chunk,
 * and the brand pass leaves no "Grok Bot" behind.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { BOOTSTRAPPED_RENDERER, PINNED_RENDERER_SKIP, readPinnedRendererAssets, resolvePinnedRenderer } from "./lib/pinned-renderer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("the tests read bootstrap's renderer by default and the variable still wins", () => {
  assert.equal(resolvePinnedRenderer({ GROK_BOT_PINNED_RENDERER: "/elsewhere/renderer" }), "/elsewhere/renderer");
  assert.equal(BOOTSTRAPPED_RENDERER, path.join(repoRoot, "src", "app", "dist", "renderer"));
  const resolved = resolvePinnedRenderer({});
  assert.ok(resolved === undefined || resolved === BOOTSTRAPPED_RENDERER);
});

test("the brand pass counts Cursor's names left after it and records them", async () => {
  const { BRAND_RESIDUE_WORDS, countBrandResidue } = await import(patchModule);
  assert.deepEqual([...BRAND_RESIDUE_WORDS], ["Cursor", "Anysphere", "cursor.com", "cursor.sh"]);
  assert.deepEqual(countBrandResidue(['"Sign in with Cursor"', "Anysphere Inc", "https://cursor.com/x", "nothing"]), { Cursor: 1, Anysphere: 1, "cursor.com": 1, "cursor.sh": 0 });
  const source = await readFile(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs"), "utf8");
  assert.match(source, /const brandResidue = countBrandResidue\(brandSources\);/);
  assert.match(source, /totals: brandTotals, files: brandFiles, residue: brandResidue \}/);
});

test("every class the header-card and Liquid Glass blocks name is in the pinned renderer", async (t) => {
  const pinned = resolvePinnedRenderer();
  if (!pinned) { t.skip(PINNED_RENDERER_SKIP); return; }
  const { HEADER_CARD_CSS, LIQUID_GLASS_CSS, styleAnchorClasses, countStyleAnchors } = await import(patchModule);
  const { css, chunks } = await readPinnedRendererAssets(pinned);
  for (const [block, text] of [["header-card", HEADER_CARD_CSS], ["liquid-glass", LIQUID_GLASS_CSS]]) {
    const { missing } = countStyleAnchors(styleAnchorClasses(text), [css, ...chunks]);
    assert.deepEqual(missing, [], `${block}: every class appears in the pinned stylesheet or a chunk`);
  }
});

test("the brand pass over the pinned renderer leaves no Grok Bot and records the residue", async (t) => {
  const pinned = resolvePinnedRenderer();
  if (!pinned) { t.skip(PINNED_RENDERER_SKIP); return; }
  const { patchOriginalBrandStrings, countBrandResidue } = await import(patchModule);
  const { chunks, css } = await readPinnedRendererAssets(pinned);
  const patched = [...chunks, css].map((source) => patchOriginalBrandStrings(source).source);
  for (const source of patched) assert.equal(source.includes("Grok Bot"), false);
  const residue = countBrandResidue(patched);
  t.diagnostic(`brand residue in the pinned renderer: ${JSON.stringify(residue)}`);
  assert.equal(typeof residue.Cursor, "number");
});
