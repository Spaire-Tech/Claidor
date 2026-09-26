/**
 * The founder's marks in the shipped screens (23 September 2026): the
 * landing mark and the onboarding hero become clouds, the boot screen's Grok
 * Bot logo becomes Simeon's petals with a slow turn, and the app icon file
 * the hand-off screen draws is Simeon's. All package-time, over the pinned
 * renderer (scripts/lib/router-renderer-patch.mjs).
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PINNED_RENDERER_SKIP, resolvePinnedRenderer } from "./lib/pinned-renderer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("the marks patch turns the landing and hero marks into clouds and the loading logo into the turning petals", async () => {
  const { MARK_REPLACEMENTS, patchOriginalMarks, LOADING_LOGO_TURN_SECONDS } = await import(patchModule);
  const chunk = MARK_REPLACEMENTS.map(([, before]) => before).join(";\n");
  const patched = patchOriginalMarks(chunk);
  assert.match(patched, /color:"black",paused:N,shape:"cloud",sizePx:ujn,state:E/);
  assert.match(patched, /\{id:"hero",color:"black",shape:"cloud",isGazing:!1,bob:null\}/);
  // The logo keeps its signature, size, colour variable and reduced-motion rule.
  assert.match(patched, /function tOt\(\{size:n,color:e="black",className:t\}\)/);
  assert.match(patched, /prefers-reduced-motion: reduce/);
  assert.match(patched, /r=\{fill:MNe\(e\)\}/);
  assert.match(patched, /height:n,viewBox:"80 80 240 240",width:n/);
  assert.equal((patched.match(/p\.jsx\("ellipse",/g) ?? []).length, 12, "twelve petals");
  assert.match(patched, new RegExp(`s\\?null:p\\.jsx\\("animateTransform",\\{attributeName:"transform",type:"rotate",from:"0 200 200",to:"360 200 200",dur:"${LOADING_LOGO_TURN_SECONDS}s",repeatCount:"indefinite"\\}`));
  assert.doesNotMatch(patched, /values:eOt/, "the 158-frame morph is gone");
  assert.throws(() => patchOriginalMarks(patched), /landing-mark-cloud anchor is missing or ambiguous/);
});

test("the app icon written over the pinned renderer's is the founder's, not Grok Bot's", async () => {
  const { APP_ICON_SOURCE } = await import(patchModule);
  const icon = await readFile(APP_ICON_SOURCE);
  assert.equal(icon.subarray(1, 4).toString(), "PNG");
  assert.equal(icon.readUInt32BE(16), 512);
  assert.equal(icon.readUInt32BE(20), 512);
});

test("the pinned 0.18.0 renderer carries each mark anchor exactly once", async (t) => {
  const pinned = resolvePinnedRenderer();
  if (!pinned) { t.skip(PINNED_RENDERER_SKIP); return; }
  const { MARK_REPLACEMENTS } = await import(patchModule);
  const assets = path.join(pinned, "assets");
  const names = await readdir(assets);
  const chunkName = names.find((name) => name === "index-UbX-y3il.js") ?? names.find((name) => /^index-.*\.js$/.test(name));
  const source = await readFile(path.join(assets, chunkName), "utf8");
  for (const [label, before] of MARK_REPLACEMENTS) assert.equal(source.split(before).length - 1, 1, `${label} occurs once in ${chunkName}`);
});
