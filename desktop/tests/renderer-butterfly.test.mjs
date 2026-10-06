/**
 * The butterfly (6 October 2026, the founder): every agent is a butterfly in
 * its palette, in full colour, with a darker border, veins, a body and antennae,
 * and no eyes; the window's mark engine keeps all of its motion, and the
 * spin's light trails and sparks take the agent's own colours.
 *
 * Offline: the replacements apply once each to a source carrying every
 * anchor; the wings' outline is the same code the window runs; the details
 * fade with the morph; the still renderer loses its eye holes and gains the
 * details; the colour helpers fall back and stay near the agent's hue; the
 * call banner's and the mentions' copies are the same drawing. With a pinned
 * renderer on disk: every anchor occurs in the chunk exactly once.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PINNED_RENDERER_SKIP, resolvePinnedRenderer } from "./lib/pinned-renderer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("the butterfly patch draws wings, lays the details over them, hides the eyes and colours the spin's lights", async () => {
  const { BUTTERFLY_REPLACEMENTS, patchOriginalButterfly } = await import(patchModule);
  assert.deepEqual(BUTTERFLY_REPLACEMENTS.map(([label]) => label), [
    "mark-butterfly-shape",
    "mark-wing-art",
    "mark-wing-art-fade",
    "still-mark-no-eyes",
    "still-mark-wings",
    "spin-lights-helper",
    "spin-sparks-ink",
    "spin-sparks-colour",
    "spin-trails-ink",
    "spin-trails-hue",
    "spin-trails-stops",
  ]);
  const patched = patchOriginalButterfly(BUTTERFLY_REPLACEMENTS.map(([, anchor]) => anchor).join("\n"));
  // The key agents have stored stays; the geometry is the wings, sampled by the window's own Yse.
  assert.match(patched, /cloud:Po\("Butterfly",Yse\(t=>\{const dx=Math\.cos\(t\)/);
  assert.ok(!patched.includes("[Re-62,Re+26,56]"), "the cloud's circles are gone");
  assert.match(patched, /p\.jsx\("g",\{className:"simeon-wing-art",style:\{"--wing-edge":/);
  assert.ok(patched.includes('.split("@@").join(N)'), "each mark's details take its own ids");
  assert.ok(patched.includes("o=Math.max(0,1-2.2*Jc).toFixed(3);w&&(w.style.opacity=o)"), "the details fade as the body morphs");
  assert.ok(patched.includes('clipPath:`url(#${N})`,style:{display:"none"}'), "no eyes");
  assert.ok(patched.indexOf('className:"simeon-wing-art"') < patched.indexOf('style:{display:"none"}'), "the details come before the hidden eye group, right after the body");
  assert.match(patched, /ref:w=>\{const b=w\?\.previousElementSibling;b&&\(b\.style\.stroke=/);
  assert.ok(patched.includes("m=o.path"), "the still mark cuts no eye holes");
  assert.ok(patched.includes("W=__simeonWingStill(m,r?r.light.from:t,r?r.light.to:t)"));
  assert.ok(patched.includes("function __simeonInk(g){") && patched.includes("function __simeonWingStill(o,f,t){"));
  assert.ok(!patched.includes("k1e[Math.random()*k1e.length|0]"), "no spark or trail picks from the fixed six colours");
  assert.ok(!patched.includes("hue:N+G*360/Math.max(E,1)"), "no trail is spread round the colour wheel");
  assert.throws(() => patchOriginalButterfly(patched), /missing or ambiguous/);
});

test("the wings are a butterfly's: wider than tall, pinched at the body, the same outline the window samples", async () => {
  const { butterflyReach, BUTTERFLY_OUTLINE, BUTTERFLY_REPLACEMENTS } = await import(patchModule);
  const across = butterflyReach(0), up = butterflyReach(-Math.PI / 2), upperWing = butterflyReach(-Math.PI / 5);
  assert.ok(across > 60 && upperWing > 100, "the forewings reach out and up");
  assert.ok(up < 45, "the wings meet at the body, with a notch above it");
  assert.equal(BUTTERFLY_OUTLINE.split("L").length, 200);
  const engine = BUTTERFLY_REPLACEMENTS[0][2];
  const sample = new Function("Yse", "Re", `return ${engine.slice(engine.indexOf("Yse("), engine.lastIndexOf(",{solid:"))}`)((f, n) => Array.from({ length: n }, (_, i) => f((i / n) * Math.PI * 2)), 114.2705);
  const first = BUTTERFLY_OUTLINE.slice(1).split("L")[0].split(" ").map(Number);
  assert.ok(Math.abs(sample[0][0] - first[0]) < 0.01 && Math.abs(sample[0][1] - first[1]) < 0.01, "the still copies draw the window's outline");
});

test("the still renderer's details take a palette's colours and one id per palette", async () => {
  const { WING_STILL_SOURCE } = await import(patchModule);
  const still = new Function(`${WING_STILL_SOURCE}return __simeonWingStill;`)();
  const a = still("M0 0Z", "#ffd1a6", "#e56f8f"), b = still("M0 0Z", "#ffd1a6", "#e56f8f");
  assert.equal(a.art, b.art, "the same palette draws the same markup");
  assert.match(a.rim, /color-mix\(in oklab,color-mix\(in oklab,#ffd1a6,#e56f8f\) 60%,#10131c\)/);
  assert.ok(a.art.includes('<clipPath id="simeon-wffd1a6e56f8f"><use href="#simeon-wffd1a6e56f8f-outline"/></clipPath>'));
  assert.ok(!a.art.includes("%EDGE%") && !a.art.includes("@@"));
});

test("the lights fall back to Ocean off the page, and a spark stays near the agent's hue", async () => {
  const { AGENT_SPARKS_SOURCE } = await import(patchModule);
  const { ink, spark } = new Function("$t", `const kie="http://www.w3.org/2000/svg";${AGENT_SPARKS_SOURCE}return {ink:__simeonInk,spark:__simeonSpark};`)((a, b) => (a + b) / 2);
  assert.deepEqual(ink(null).map(([h]) => Math.round(h)), [212, 204, 190]);
  assert.equal(spark([[30, 80, 60]]), "hsl(30 80% 60%)");
  assert.equal(spark([[355, 70, 90]]), "hsl(355 70% 76%)", "a spark's lightness stays in the glowing range");
});

test("the call banner's and the mentions' copies are the same butterfly, cropped to its own box", async () => {
  const markSource = await readFile(path.join(repoRoot, "source/shared/voice-call/agent-mark.ts"), "utf8");
  assert.ok(!markSource.includes("CLOUD_MARK_SVG"));
  const svg = JSON.parse(markSource.match(/export const AGENT_MARK_SVG = ("(?:[^"\\]|\\.)*");/)[1]);
  const { butterflyMarkSvg, BUTTERFLY_OUTLINE, AGENT_MENTION_VIEWBOX, agentMentionsCss } = await import(patchModule);
  assert.equal(svg, butterflyMarkSvg({ id: "MARKID", from: "var(--ink-from)", mid: "var(--ink-mid)", to: "var(--ink-to)" }), "agent-mark.ts holds the patch's drawing");
  assert.ok(!svg.includes("-wash"), "full colour: no pale wash over the wings");
  assert.ok(!svg.includes("--eye"), "no eyes");
  const points = BUTTERFLY_OUTLINE.slice(1, -1).split("L").map((p) => p.split(" ").map(Number));
  const [x, y, width, height] = AGENT_MENTION_VIEWBOX.split(" ").map(Number);
  const rim = 1.1, feelerTop = 114.2705 - 80 - 2.6;
  assert.ok(x <= Math.min(...points.map((p) => p[0])) - rim && x + width >= Math.max(...points.map((p) => p[0])) + rim, "the crop holds the wings across");
  assert.ok(y <= feelerTop && y + height >= Math.max(...points.map((p) => p[1])) + rim, "the crop holds the antennae and the hindwings");
  assert.ok(width - (Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0]))) < 6, "and little more");
  assert.match(agentMentionsCss(), /\.simeon-agent__mark\{display:inline-block;width:1\.44em;height:1\.05em;/);
});

test("the apply pass runs the butterfly patch on the mark chunk and records it", async () => {
  const source = await readFile(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs"), "utf8");
  assert.match(source, /const markPatched = patchOriginalButterfly\(patchOriginalSidebarDiscs\(/);
  assert.match(source, /if \(!BUTTERFLY_REPLACEMENTS\.every\(\(\[, before\]\) => markChunks\[0\]\.source\.includes\(before\)\)\) throw new Error/);
  assert.match(source, /\.\.\.SIDEBAR_DISCS_REPLACEMENTS, \.\.\.BUTTERFLY_REPLACEMENTS, BUBBLE_CSS_REPLACEMENT\]\.map\(\(\[label\]\) => label\)/);
  assert.match(source, /"pane-three-tabs", "mark-butterfly", "mark-no-eyes", "spin-lights-agent-colours"[,\]]/);
});

test("the pinned 0.18.0 renderer carries every butterfly anchor exactly once", async (t) => {
  const pinned = resolvePinnedRenderer();
  if (!pinned) { t.skip(PINNED_RENDERER_SKIP); return; }
  const { BUTTERFLY_REPLACEMENTS } = await import(patchModule);
  const assets = path.join(pinned, "assets");
  const names = await readdir(assets);
  const chunk = await readFile(path.join(assets, names.find((name) => name === "index-UbX-y3il.js") ?? names.find((name) => /^index-.*\.js$/.test(name))), "utf8");
  for (const [label, before] of BUTTERFLY_REPLACEMENTS) assert.equal(chunk.split(before).length - 1, 1, `${label} occurs once`);
});
