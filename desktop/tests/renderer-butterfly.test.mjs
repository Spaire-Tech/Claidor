/**
 * The butterfly (6 October 2026, the founder): every agent's mark is
 * Simeon's logo filled in, with small dot eyes, and the spin's light trails
 * and sparks take the agent's own colours. The engine's animations are its
 * own and untouched.
 *
 * Offline: the replacements apply once each to a source carrying every
 * anchor; the dot-eye rewrite turns pills into dots and leaves the closed and
 * round eyes; the colour helpers fall back and stay near the agent's hue; the
 * still copy (call banner, mentions) is the butterfly. With a pinned renderer
 * on disk: every anchor occurs in the chunk exactly once.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PINNED_RENDERER_SKIP, resolvePinnedRenderer } from "./lib/pinned-renderer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;

test("the butterfly patch replaces the cloud's circles, rewrites the eyes and colours the spin's lights", async () => {
  const { BUTTERFLY_REPLACEMENTS, BUTTERFLY_WINGS, patchOriginalButterfly } = await import(patchModule);
  assert.deepEqual(BUTTERFLY_REPLACEMENTS.map(([label]) => label), [
    "mark-butterfly-shape",
    "mark-dot-eyes-open",
    "mark-dot-eyes-close",
    "spin-lights-helper",
    "spin-sparks-ink",
    "spin-sparks-colour",
    "spin-trails-ink",
    "spin-trails-hue",
    "spin-trails-stops",
  ]);
  const before = BUTTERFLY_REPLACEMENTS.map(([, anchor]) => anchor).join("\n");
  const patched = patchOriginalButterfly(before);
  // The key agents have stored stays; the geometry is four tapered wings and a body.
  assert.match(patched, /cloud:Po\("Butterfly",YJt\(\[\[Re-56,Re-50,54\],/);
  assert.equal(BUTTERFLY_WINGS.length, 9);
  assert.ok(!patched.includes("[Re-62,Re+26,56]"), "the cloud's circles are gone");
  assert.match(patched, /const u3=\(E=>\{/);
  assert.ok(patched.includes("]]]]),HJt="), "the eye table's wrapper is closed");
  assert.ok(patched.includes("function __simeonInk(g){"));
  assert.ok(!patched.includes("k1e[Math.random()*k1e.length|0]"), "no spark or trail picks from the fixed six colours");
  assert.ok(!patched.includes("hue:N+G*360/Math.max(E,1)"), "no trail is spread round the colour wheel");
  assert.ok(patched.includes("${(j.sat??56).toFixed(0)}%"));
  assert.throws(() => patchOriginalButterfly(patched), /missing or ambiguous/);
});

test("pills become dots as wide as the pill; closed and round eyes stay", async () => {
  const { DOT_EYES_SOURCE, EYE_SLITS, EYE_ROUND } = await import(patchModule);
  const dotEyes = new Function(`return ${DOT_EYES_SOURCE}`)();
  // A pill 60 long and 20 wide along x, centred on (100, 50), 48 points.
  const pill = Array.from({ length: 48 }, (_, i) => {
    const a = ((i + 0.5) / 48) * Math.PI * 2; // no point on the seam, so the pill is symmetric
    const x = Math.cos(a) >= 0 ? 20 + 10 * Math.cos(a) : -20 + 10 * Math.cos(a);
    return [100 + x, 50 + 10 * Math.sin(a)];
  });
  const table = Array.from({ length: 25 }, () => [pill, pill]);
  const out = dotEyes(table);
  assert.equal(out.length, 25);
  const dot = out[0][0];
  assert.equal(dot.length, 48, "the morph keeps its 48 points");
  const cx = dot.reduce((s, p) => s + p[0], 0) / 48, cy = dot.reduce((s, p) => s + p[1], 0) / 48;
  assert.ok(Math.abs(cx - 100) < 0.5 && Math.abs(cy - 50) < 0.5, "the dot sits where the pill was");
  for (const [x, y] of dot) assert.ok(Math.abs(Math.hypot(x - cx, y - cy) - 10) < 0.05, "the dot's radius is half the pill's width");
  for (const key of EYE_SLITS) {
    const [k, m] = key.split(",").map(Number);
    assert.equal(out[k][m], pill, `closed eye ${key} stays`);
  }
  for (const k of EYE_ROUND) assert.equal(out[k], table[k], `round expression ${k} stays`);
});

test("the lights fall back to Ocean off the page, and a spark stays near the agent's hue", async () => {
  const { AGENT_SPARKS_SOURCE } = await import(patchModule);
  const { ink, spark } = new Function("$t", `const kie="http://www.w3.org/2000/svg";${AGENT_SPARKS_SOURCE}return {ink:__simeonInk,spark:__simeonSpark};`)((a, b) => (a + b) / 2);
  assert.deepEqual(ink(null).map(([h]) => Math.round(h)), [212, 204, 190]);
  assert.equal(spark([[30, 80, 60]]), "hsl(30 80% 60%)");
  assert.equal(spark([[355, 70, 90]]), "hsl(355 70% 76%)", "a spark's lightness stays in the glowing range");
});

test("the call banner's and the mentions' still copy is the butterfly with dot eyes", async () => {
  const markSource = await readFile(path.join(repoRoot, "source/shared/voice-call/agent-mark.ts"), "utf8");
  assert.ok(!markSource.includes("CLOUD_MARK_SVG"));
  const svg = JSON.parse(markSource.match(/export const AGENT_MARK_SVG = ("(?:[^"\\]|\\.)*");/)[1]);
  assert.equal((svg.match(/var\(--eye,#fcfcfc\)/g) ?? []).length, 2, "two eyes");
  const { AGENT_MENTION_VIEWBOX, agentMentionMarks, agentMentionsCss } = await import(patchModule);
  assert.equal(AGENT_MENTION_VIEWBOX, "0 9 229 211");
  const { outline } = agentMentionMarks(markSource);
  const outlineSvg = Buffer.from(outline.split(",")[1], "base64").toString();
  assert.ok(outlineSvg.includes(`viewBox="${AGENT_MENTION_VIEWBOX}"`));
  assert.ok(svg.includes(outlineSvg.match(/<path d="([^"]+)"/)[1]), "the mask is the still copy's outline");
  assert.match(agentMentionsCss(), /\.simeon-agent__mark\{display:inline-block;width:1\.14em;height:1\.05em;/);
});

test("the apply pass runs the butterfly patch on the mark chunk and records it", async () => {
  const source = await readFile(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs"), "utf8");
  assert.match(source, /const markPatched = patchOriginalButterfly\(patchOriginalSidebarDiscs\(/);
  assert.match(source, /if \(!BUTTERFLY_REPLACEMENTS\.every\(\(\[, before\]\) => markChunks\[0\]\.source\.includes\(before\)\)\) throw new Error/);
  assert.match(source, /\.\.\.SIDEBAR_DISCS_REPLACEMENTS, \.\.\.BUTTERFLY_REPLACEMENTS, BUBBLE_CSS_REPLACEMENT\]\.map\(\(\[label\]\) => label\)/);
  assert.match(source, /"pane-three-tabs", "mark-butterfly", "eyes-dots", "spin-lights-agent-colours"\]/);
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
