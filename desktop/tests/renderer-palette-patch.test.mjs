/**
 * The agents' twelve palettes (23 September 2026), a package-time patch over
 * the pinned renderer's colour tables and the mark's SVG.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PINNED_RENDERER_SKIP, resolvePinnedRenderer } from "./lib/pinned-renderer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("twelve palettes replace the colour tables, every old id survives, and the mark paints a three-stop gradient through grain", async () => {
  const { AGENT_PALETTES, PALETTE_REPLACEMENTS, patchOriginalPalette } = await import(patchModule);
  assert.equal(AGENT_PALETTES.length, 12);
  for (const id of ["black", "brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray", "mint"]) assert.ok(AGENT_PALETTES.some((p) => p.id === id), `${id} is a palette`);
  const chunk = PALETTE_REPLACEMENTS.map(([, before]) => before).join(";\n");
  const patched = patchOriginalPalette(chunk);
  for (const p of AGENT_PALETTES) {
    assert.match(patched, new RegExp(`${p.id}:\\{lightFrom:"${p.top}",lightMid:"${p.mid}",lightTo:"${p.bottom}",darkFrom:"${p.top}",darkMid:"${p.mid}",darkTo:"${p.bottom}"\\}`));
    assert.match(patched, new RegExp(`${p.id}:\\{light:"${p.mid}",dark:"${p.mid}"\\}`));
    assert.match(patched, new RegExp(`\\{id:"${p.id}",label:"${p.label}",value:"${p.mid}"\\}`));
  }
  assert.match(patched, /const nnt=PQ\.slice\(\)/, "the picker offers all twelve");
  assert.match(patched, /function OrbInk\(n\)\{const e=G_t\[n\]\?\?G_t\.black;/);
  assert.match(patched, /"--ink-from":r\?\.gradientFrom\?\?OrbInk\(t\)\.from,"--ink-mid":r\?\.gradientFrom\?\?OrbInk\(t\)\.mid,"--ink-to":r\?\.gradientTo\?\?OrbInk\(t\)\.to/);
  assert.match(patched, /"--ink-from":i\?\.gradientFrom\?\?OrbInk\(s\)\.from/, "mirrors set the variables too");
  assert.match(patched, /stopColor:"var\(--ink-from\)"[\s\S]*stopColor:"var\(--ink-mid\)"[\s\S]*stopColor:"var\(--ink-to\)"/);
  assert.match(patched, /p\.jsx\("feTurbulence",\{type:"fractalNoise"/);
  assert.match(patched, /style:\{fill:`url\(#\$\{N\}-ink\)`,filter:`url\(#\$\{N\}-grain\)`\},d:le\.path/);
  assert.doesNotMatch(patched, /b\?\{fill:`url/, "the never-passed inkGradient branch is gone");
  assert.match(patched, /linear-gradient\(\$\{s\+90\}deg, \$\{e\}, \$\{r\} 55%, \$\{t\}\)/, "the editor's swatch gradient has three stops");
  assert.throws(() => patchOriginalPalette(patched), /palette-gradients anchor is missing or ambiguous/);
});

test("the pinned 0.18.0 renderer carries each palette anchor exactly once", async (t) => {
  const pinned = resolvePinnedRenderer();
  if (!pinned) { t.skip(PINNED_RENDERER_SKIP); return; }
  const { PALETTE_REPLACEMENTS } = await import(patchModule);
  const assets = path.join(pinned, "assets");
  const names = await readdir(assets);
  const chunkName = names.find((name) => name === "index-UbX-y3il.js") ?? names.find((name) => /^index-.*\.js$/.test(name));
  const source = await readFile(path.join(assets, chunkName), "utf8");
  for (const [label, before] of PALETTE_REPLACEMENTS) assert.equal(source.split(before).length - 1, 1, `${label} occurs once in ${chunkName}`);
});
