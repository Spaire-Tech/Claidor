/**
 * The renderer is loaded from disk, not from a server
 * (source/electron-main/main.ts:343, `window.loadFile`). Two things about that
 * are easy to break without anything failing loudly, and both did break.
 */

import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRenderer = path.join(repoRoot, "dist", "renderer");

/**
 * These two facts are about the **clean-source** renderer — the one
 * `scripts/build-caisra.mjs` emits from `frontend/src`. They must never be
 * asserted against the checksum-pinned shipped renderer, which
 * `npm run package` keeps byte-for-byte from the 0.18.0 ASAR and which this
 * repository is forbidden to rewrite. `dist/caisra-build.json` is written only
 * by the clean-source build, so it is the marker that says which one is here.
 */
async function cleanSourceRendererOrSkip(t) {
  try {
    await stat(path.join(repoRoot, "dist", "caisra-build.json"));
    await stat(path.join(distRenderer, "index.html"));
    return true;
  } catch {
    t.skip("no clean-source renderer in dist/; run npm run build:clean-source");
    return false;
  }
}

test("the emitted index.html marks nothing crossorigin", async (t) => {
  if (!(await cleanSourceRendererOrSkip(t))) return;
  const html = await readFile(path.join(distRenderer, "index.html"), "utf8");

  // A document opened with loadFile has the opaque origin `null`. A
  // subresource marked `crossorigin` is then fetched under CORS rules it can
  // never satisfy, and Chromium refuses it before parsing it. Vite adds the
  // attribute by default, which over http costs nothing.
  //
  // Measured on this file in headless Chromium over file://:
  //   with it     stylesheet refused; font-family "Times New Roman";
  //               --cursor-font-family-sans and --sand-text-primary empty
  //   without it  stylesheet applied; font-family -apple-system, …;
  //               --cursor-spacing-5-5 22px
  //
  // The first is an app with correct markup and no styling whatsoever. It is
  // one attribute between that and the product.
  assert.doesNotMatch(html, /crossorigin/i);

  // Everything must also stay relative: an absolute /assets/… path resolves
  // to the filesystem root under file://.
  for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(url.startsWith("./"), `${url} must stay relative to index.html`);
  }
});

test("every runtime asset the renderer names by hand is emitted beside it", async (t) => {
  if (!(await cleanSourceRendererOrSkip(t))) return;

  // These are asked for through rendererRuntimeAssetUrl() with the filename
  // the 0.18.0 bundle happened to emit. Nothing imports them, so no bundler
  // emits them and no bundler warns. They were missing, and the onboarding
  // screen drew broken-image boxes.
  const named = new Set();
  const source = path.join(repoRoot, "frontend", "src");
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        for (const [, file] of (await readFile(full, "utf8")).matchAll(
          /rendererRuntimeAssetUrl\("([^"]+)"\)/g,
        )) named.add(file);
      }
    }
  };
  await walk(source);

  assert.ok(named.size > 0, "expected the renderer to name runtime assets");
  const emitted = new Set(await readdir(path.join(distRenderer, "assets")));
  for (const file of named) {
    assert.ok(emitted.has(file), `dist/renderer/assets/${file} is named by the renderer but not emitted`);
  }
});
