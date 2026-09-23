/** The person's chat bubble is iMessage blue (23 September 2026), in the runtime token and the stylesheet default. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("the user bubble token becomes the Slate palette's blue in light and dark, and the stylesheet default follows", async () => {
  const { BUBBLE_REPLACEMENTS, BUBBLE_CSS_REPLACEMENT, patchOriginalBubble, patchOriginalBubbleStylesheet, USER_BUBBLE_LIGHT, USER_BUBBLE_DARK } = await import(patchModule);
  assert.equal(USER_BUBBLE_LIGHT, "#5e6d86", "the Slate palette's middle colour");
  assert.equal(USER_BUBBLE_DARK, "#5e6d86");
  const patched = patchOriginalBubble(BUBBLE_REPLACEMENTS.map(([, before]) => before).join(";"));
  assert.match(patched, /Ct\("fill\/bubble-user",El\(\{value:"#5e6d86",alias:"simeon\/slate"\},\{value:"#5e6d86",alias:"simeon\/slate-dark"\}\)\)/);
  assert.equal(patchOriginalBubbleStylesheet(`:root{${BUBBLE_CSS_REPLACEMENT[1]}}`), ":root{--sand-fill-bubble-user:#5e6d86;}");
  assert.throws(() => patchOriginalBubble(patched), /user-bubble-blue anchor is missing or ambiguous/);
});

test("the pinned 0.18.0 renderer carries the bubble token and the stylesheet default exactly once", async (t) => {
  const pinned = process.env.GROK_BOT_PINNED_RENDERER?.trim();
  if (!pinned) { t.skip("GROK_BOT_PINNED_RENDERER is not set; the pinned renderer is not in this repository"); return; }
  const { BUBBLE_REPLACEMENTS, BUBBLE_CSS_REPLACEMENT } = await import(patchModule);
  const assets = path.join(pinned, "assets");
  const names = await readdir(assets);
  const chunk = await readFile(path.join(assets, names.find((name) => name === "index-UbX-y3il.js") ?? names.find((name) => /^index-.*\.js$/.test(name))), "utf8");
  for (const [label, before] of BUBBLE_REPLACEMENTS) assert.equal(chunk.split(before).length - 1, 1, `${label} occurs once`);
  const css = await readFile(path.join(assets, names.find((name) => name.endsWith(".css"))), "utf8");
  assert.equal(css.split(BUBBLE_CSS_REPLACEMENT[1]).length - 1, 1, "one stylesheet default");
});
