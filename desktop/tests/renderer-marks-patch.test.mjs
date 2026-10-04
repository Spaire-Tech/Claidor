/**
 * The founder's marks in the shipped screens (23 September 2026): the
 * landing mark and the onboarding hero become clouds, the boot screen's Grok
 * Bot logo becomes Simeon's mark with a slow turn, and the app icon file
 * the hand-off screen draws is Simeon's. All package-time, over the pinned
 * renderer (scripts/lib/router-renderer-patch.mjs). On 26 September the
 * marks became Ocean and the cloud became the only shape.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PINNED_RENDERER_SKIP, resolvePinnedRenderer } from "./lib/pinned-renderer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("the marks patch turns the landing and hero marks into clouds and the loading logo into the turning mark", async () => {
  const { MARK_REPLACEMENTS, patchOriginalMarks, LOADING_LOGO_TURN_SECONDS, LOADING_LOGO_VIEWBOX } = await import(patchModule);
  const { SIMEON_MARK_PATH } = await import(pathToFileURL(path.join(repoRoot, "scripts/lib/simeon-logo.mjs")).href);
  const chunk = MARK_REPLACEMENTS.map(([, before]) => before).join(";\n");
  const patched = patchOriginalMarks(chunk);
  // Ocean (the `blue` id), 26 September 2026, not Slate (`black`).
  assert.match(patched, /color:"blue",paused:N,shape:"cloud",sizePx:ujn,state:E/);
  assert.match(patched, /\{id:"hero",color:"blue",shape:"cloud",isGazing:!1,bob:null\}/);
  assert.match(patched, /V=L==null\?\{color:"blue",shape:"cloud"\}:/);
  // The logo keeps its signature, size, colour variable and reduced-motion rule.
  assert.match(patched, /function tOt\(\{size:n,color:e="black",className:t\}\)/);
  assert.match(patched, /prefers-reduced-motion: reduce/);
  assert.match(patched, /r=\{fill:MNe\(e\)\}/);
  assert.equal(LOADING_LOGO_VIEWBOX, "50 50 299 299", "the window round the mark");
  assert.match(patched, /height:n,viewBox:"50 50 299 299",width:n/);
  assert.ok(patched.includes(`p.jsx("path",{d:"${SIMEON_MARK_PATH}",fillRule:"evenodd",style:r},"mark")`), "the mark is the founder's path");
  assert.equal((patched.match(/p\.jsx\("ellipse",/g) ?? []).length, 0, "no petal ellipses remain");
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

test("every shape is the cloud: one geometry, the cloud's size, a cloud-only list, no shape picker", async () => {
  const { SHAPE_REPLACEMENTS, patchOriginalShapes, patchOriginalShapePickerStylesheet, SHAPE_PICKER_CSS } = await import(patchModule);
  const chunk = SHAPE_REPLACEMENTS.map(([, before]) => before).join(";\n");
  const patched = patchOriginalShapes(chunk);
  assert.match(patched, /Jo\.wedge\.face\.leftDX=-6;for\(const k of Object\.keys\(Jo\)\)Jo\[k\]=Jo\.cloud;const Qtt=Object\.keys\(Jo\)/);
  assert.match(patched, /function \$de\(n\)\{return ont\.cloud\}/);
  assert.match(patched, /const Ij=\["cloud"\];/);
  assert.match(patched, /mde=\{color:"blue",shape:"cloud"\}/);
  assert.throws(() => patchOriginalShapes(patched), /shapes-geometry-cloud anchor is missing or ambiguous/);
  // The geometry loop, run over a table shaped like the renderer's: every
  // name, including one saved before this change, resolves to the cloud.
  const Jo = { blob: { path: "b", face: {} }, wedge: { path: "w", face: {} }, cloud: { path: "c", face: {} }, hex: { path: "h", face: {} } };
  Jo.wedge.face.leftDX = -6;
  for (const k of Object.keys(Jo)) Jo[k] = Jo.cloud;
  assert.deepEqual(new Set(Object.values(Jo).map((entry) => entry.path)), new Set(["c"]));
  // The two "Character shape" pickers are hidden; the colour rows are not.
  const css = patchOriginalShapePickerStylesheet(".x{}");
  assert.ok(css.endsWith(SHAPE_PICKER_CSS));
  assert.match(SHAPE_PICKER_CSS, /\[aria-label="Character shape"\]\{display:none!important\}/);
  assert.doesNotMatch(SHAPE_PICKER_CSS, /Character color/);
  assert.throws(() => patchOriginalShapePickerStylesheet(css), /already present/);
});

test("the pinned 0.18.0 renderer carries each shape anchor exactly once, and both pickers are labelled Character shape", async (t) => {
  const pinned = resolvePinnedRenderer();
  if (!pinned) { t.skip(PINNED_RENDERER_SKIP); return; }
  const { SHAPE_REPLACEMENTS } = await import(patchModule);
  const source = await readFile(path.join(pinned, "assets", "index-UbX-y3il.js"), "utf8");
  for (const [label, before] of SHAPE_REPLACEMENTS) assert.equal(source.split(before).length - 1, 1, `${label} occurs once`);
  assert.equal(source.split('"aria-label":"Character shape"').length - 1, 2);
});

test("the onboarding copy says what the founder wrote, and the teammates keep their ids", async () => {
  const { COPY_REPLACEMENTS, patchOriginalCopy } = await import(patchModule);
  const patched = patchOriginalCopy(COPY_REPLACEMENTS.map(([, before]) => before).join(";\n"));
  assert.match(patched, /tagline:"Your personal team of agents for whatever needs doing\."/);
  assert.match(patched, /const H2e="Put any task in the hands of your agents"/);
  assert.match(patched, /XBn=\{"invoice-chaser":"Email Chaser","weekly-standup":"Flight Booker","sales-forecast":"Content Planner"\}/);
  assert.doesNotMatch(patched, /Invoice Chaser|Weekly Standup|Sales Forecast|always-on agents that you can give|Hand off any task/);
  assert.throws(() => patchOriginalCopy(patched), /copy-signin-tagline anchor is missing or ambiguous/);
});

test("the pinned 0.18.0 renderer carries each onboarding copy anchor exactly once", async (t) => {
  const pinned = resolvePinnedRenderer();
  if (!pinned) { t.skip(PINNED_RENDERER_SKIP); return; }
  const { COPY_REPLACEMENTS } = await import(patchModule);
  const source = await readFile(path.join(pinned, "assets", "index-UbX-y3il.js"), "utf8");
  for (const [label, before] of COPY_REPLACEMENTS) assert.equal(source.split(before).length - 1, 1, `${label} occurs once`);
});
