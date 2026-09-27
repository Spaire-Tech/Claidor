/** Files and apps wear their real logos (27 September 2026): the file card's icon by kind, PowerPoint as its own kind, and the sidebar's "Connect apps" pill. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PINNED_RENDERER_SKIP, resolvePinnedRenderer } from "./lib/pinned-renderer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("every logo is a readable image, and the stylesheet paints each file kind and app tile", async () => {
  const { FILE_ICON_SOURCES, APP_LOGO_SOURCES, readLogoAssets, patchOriginalLogosStylesheet, LOGOS_MARKER } = await import(patchModule);
  for (const file of [...Object.values(FILE_ICON_SOURCES), ...Object.values(APP_LOGO_SOURCES)]) {
    const bytes = await readFile(path.join(repoRoot, "brand", file));
    if (file.endsWith(".svg")) assert.match(bytes.toString("utf8", 0, 200), /^<svg /, `${file} is plain SVG, not gzip`);
    else assert.equal(bytes.toString("latin1", 8, 12), "WEBP", `${file} is WebP`);
  }
  const assets = await readLogoAssets();
  const sheet = patchOriginalLogosStylesheet(":root{}", assets);
  assert.ok(sheet.includes(LOGOS_MARKER));
  for (const kind of ["pdf", "document", "markdown", "table", "slides"]) assert.ok(sheet.includes(`span[data-kind="${kind}"][data-size]`), `${kind} is painted`);
  // Markdown wears Word's logo, as asked.
  const logoOf = (kind) => sheet.match(new RegExp(`span\\[data-kind="${kind}"\\]\\[data-size\\][^{]*\\{--simeon-file-logo:url\\("([^"]+)"\\)`))[1];
  assert.equal(logoOf("markdown"), logoOf("document"));
  assert.equal(logoOf("pdf"), assets.files.pdf);
  assert.equal(logoOf("table"), assets.files.excel);
  assert.equal(logoOf("slides"), assets.files.powerpoint);
  for (const app of ["gmail", "calendar", "drive"]) assert.ok(sheet.includes(`i[data-app="${app}"]{background-image:url("data:image/`), `${app} tile`);
  assert.throws(() => patchOriginalLogosStylesheet(sheet, assets), /logos block is already present/);
});

test("the button says Connect apps and PowerPoint gets its own kind, on anchors the pinned 0.18.0 chunk carries once", async (t) => {
  const pinned = resolvePinnedRenderer();
  if (!pinned) { t.skip(PINNED_RENDERER_SKIP); return; }
  const { LOGO_REPLACEMENTS, patchOriginalLogos } = await import(patchModule);
  const assets = path.join(pinned, "assets");
  const names = await readdir(assets);
  const chunk = await readFile(path.join(assets, names.find((name) => name === "index-UbX-y3il.js") ?? names.find((name) => /^index-.*\.js$/.test(name))), "utf8");
  for (const [label, before] of LOGO_REPLACEMENTS) assert.equal(chunk.split(before).length - 1, 1, `${label} occurs once`);
  const patched = patchOriginalLogos(chunk);
  assert.ok(patched.includes('children:"Connect apps"'));
  assert.ok(!patched.includes('name:"plug",size:14'));
  assert.ok(patched.includes('r==="pptx"||r==="ppt"?"slides"'));
  assert.ok(patched.includes('tin={slides:{icon24:"file",icon36:"file",tint:"neutral"},markdown:'));
  // The preview router is untouched: a .pptx is still offered no preview.
  assert.ok(patched.includes('e==="docx"?"docx":k6n(n)?"text":"unknown"'));
});
