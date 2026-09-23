import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// The clay faces (docs/product/faces-clay-measured.md): what the redesign
// promised to keep, measured on the component rather than reasoned about.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VIEWBOX = { minX: -15, minY: -15, maxX: 244, maxY: 244 };
const CENTER = 114.2705;
const SHAPES = ["blob", "pebble", "squircle", "tablet", "wedge", "hex", "cloud", "teardrop"];
const COLORS = ["black", "brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray"];
const STATES = ["sleeping", "waking", "idle", "listening", "thinking", "searching", "working", "excited", "surprised", "suspicious", "angry", "drowsy", "happy", "curious", "confused", "bored", "proud", "shy", "sad", "laughing", "scared", "playful", "celebrate", "orbit", "radar", "progress", "spawning", "humming", "loading", "dictating", "writing", "sending", "receiving", "uploading", "notifying", "alerting", "dragging", "bouncing", "powering-down"];

let loaded = null;
async function loadCharacter() {
  if (loaded != null) return loaded;
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-clay-faces-"));
  const output = path.join(temporary, "character.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "tests/fixtures/clay-faces-entry.tsx")],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
    logLevel: "silent",
  });
  loaded = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  test.after(() => rm(temporary, { recursive: true, force: true }));
  return loaded;
}

/** Samples every command of an absolute M/L/Q/C/Z path, enough to bound it. */
function samplePath(d) {
  const tokens = d.match(/[MLCQZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const points = [];
  let index = 0, command = "", x = 0, y = 0, startX = 0, startY = 0;
  const number = () => Number(tokens[index++]);
  const bezier = (controls, count = 24) => {
    for (let step = 1; step <= count; step += 1) {
      const t = step / count;
      let px = 0, py = 0;
      const n = controls.length - 1;
      controls.forEach(([cx, cy], k) => {
        const weight = binomial(n, k) * (1 - t) ** (n - k) * t ** k;
        px += cx * weight; py += cy * weight;
      });
      points.push([px, py]);
    }
  };
  while (index < tokens.length) {
    if (/^[a-z]$/i.test(tokens[index])) command = tokens[index++].toUpperCase();
    if (command === "Z") { points.push([startX, startY]); x = startX; y = startY; continue; }
    if (command === "M") { x = number(); y = number(); startX = x; startY = y; points.push([x, y]); command = "L"; continue; }
    if (command === "L") { x = number(); y = number(); points.push([x, y]); continue; }
    if (command === "Q") { const x1 = number(), y1 = number(), ex = number(), ey = number(); bezier([[x, y], [x1, y1], [ex, ey]]); x = ex; y = ey; continue; }
    if (command === "C") { const x1 = number(), y1 = number(), x2 = number(), y2 = number(), ex = number(), ey = number(); bezier([[x, y], [x1, y1], [x2, y2], [ex, ey]]); x = ex; y = ey; continue; }
    index += 1;
  }
  return points;
}
function binomial(n, k) { let result = 1; for (let i = 1; i <= k; i += 1) result = result * (n - k + i) / i; return result; }
function bounds(points) {
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

test("eight hair styles sit under Grok Bot's eight shape keys, and every one lies inside the 259 box", async () => {
  const { PERSONA_HAIR_STYLES, PERSONA_SHAPE_PATHS, personaShapePath } = await loadCharacter();
  assert.deepEqual(Object.keys(PERSONA_HAIR_STYLES), SHAPES);
  const names = new Set();
  for (const shape of SHAPES) {
    const style = PERSONA_HAIR_STYLES[shape];
    names.add(style.name);
    for (const part of [style.front, style.back].filter(Boolean)) {
      const box = bounds(samplePath(part));
      assert.ok(box.minX >= VIEWBOX.minX && box.maxX <= VIEWBOX.maxX && box.minY >= VIEWBOX.minY && box.maxY <= VIEWBOX.maxY, `${shape} (${style.name}) leaves the box: ${JSON.stringify(box)}`);
      assert.ok(box.minY < CENTER - 8 - 13, `${shape} hair sits above the eye line, not on it`);
      assert.ok(box.maxX - box.minX > 120, `${shape} hair is wide enough to read as hair at 16 px`);
    }
    assert.equal(PERSONA_SHAPE_PATHS[shape], style.front, "the old export still names a path per shape");
  }
  assert.equal(names.size, 8, "eight distinct silhouettes");
  assert.equal(personaShapePath("not-a-shape"), PERSONA_HAIR_STYLES.blob.front, "an unknown shape draws the first style, as the body path did");
});

test("identity is unchanged: the hash defaults for colour and shape, and the eleven colour keys", async () => {
  const { resolvePersonaColor, resolvePersonaShape, resolvePersonaTone, SKIN_TONES } = await loadCharacter();
  // Recorded from the shipped functions before the redesign; the same ids must keep the same faces.
  const recorded = {
    "sand-agent-mark-source-agent-1": ["orange", "tablet"],
    "invoice-chaser": ["orange", "teardrop"],
    "weekly-standup": ["violet", "squircle"],
    "sales-forecast": ["cyan", "hex"],
    "persona": ["yellow", "pebble"],
  };
  for (const [id, [color, shape]] of Object.entries(recorded)) {
    assert.equal(resolvePersonaColor(id), color, `colour of ${id}`);
    assert.equal(resolvePersonaShape(id), shape, `shape of ${id}`);
  }
  for (const color of COLORS) assert.equal(resolvePersonaColor("x", color), color, `${color} is still a colour key`);
  assert.equal(resolvePersonaColor("x", "teal"), resolvePersonaColor("x"), "an unknown colour falls back to the hash");
  for (const shape of SHAPES) assert.equal(resolvePersonaShape("x", shape), shape);
  assert.equal(SKIN_TONES.length, 5);
  const tones = new Set(COLORS.map((color) => resolvePersonaTone(color)));
  assert.equal(tones.size, 5, "the eleven hair colours use all five skin tones");
  assert.equal(resolvePersonaTone("teal"), SKIN_TONES[1], "an unknown colour gets the middle-light tone");
});

test("the motion table is the shipped forty states, numbers unchanged", async () => {
  const { PERSONA_MOTION } = await loadCharacter();
  assert.deepEqual(Object.keys(PERSONA_MOTION).sort(), [...STATES].sort());
  assert.deepEqual(PERSONA_MOTION.idle, { amplitude: 1.5, period: 9000, tilt: 0, eye: 1 });
  assert.deepEqual(PERSONA_MOTION.thinking, { amplitude: 1, period: 2000, tilt: 3, eye: .75 });
  assert.deepEqual(PERSONA_MOTION.searching, { amplitude: 2, period: 1000, tilt: -4, eye: .9 });
  assert.deepEqual(PERSONA_MOTION.working, { amplitude: 2, period: 1800, tilt: -3, eye: 1 });
  assert.deepEqual(PERSONA_MOTION.excited, { amplitude: 5, period: 1100, tilt: 0, eye: 1.08 });
  assert.deepEqual(PERSONA_MOTION.celebrate, { amplitude: 7, period: 1400, tilt: 0, eye: 1.12 });
  assert.deepEqual(PERSONA_MOTION.sleeping, { amplitude: 0, period: 6000, tilt: 0, eye: .12 });
});

test("the drawn face keeps the two animation groups, the data attributes, the three smiles and the size gate", async () => {
  const { renderFace } = await loadCharacter();
  const small = renderFace({ color: "cyan", shape: "cloud", sizePx: 28, state: "idle", sourceId: "agent-a" });
  assert.match(small, /^<svg [^>]*class="sand-face"/);
  assert.match(small, /viewBox="-15 -15 259 259"/);
  assert.match(small, /data-grok-state="idle"/);
  assert.match(small, /data-source-id="agent-a"/);
  assert.match(small, /data-avatar-hair="curls"/);
  assert.match(small, /--sand-face-hair-light:#2FA49C;--sand-face-hair-dark:#41B9B0;--sand-face-skin:#63402B/);
  const groups = small.match(/<g[^>]*transform="translate\(0 0\)"/g) ?? [];
  assert.equal(groups.length, 3, "the face group, the eyes group and the pupils group all start at rest");
  assert.match(small, /<g transform="translate\(114\.2705 106\.2705\)"><g transform="translate\(0 0\)">/, "the eyes group is centred on the eye line so a squint closes about it");
  assert.doesNotMatch(small, /<image|data:image|WebGL|canvas/i, "drawn, never a picture");
  assert.equal((small.match(/stroke-width="5"/g) ?? []).length, 0, "no brows below 36 px");
  assert.doesNotMatch(small, /--sand-face-blush/, "no blush below 36 px");
  assert.equal((small.match(/<circle /g) ?? []).length, 11, "head clip, two sclera clips, head, rim, two sclera, two pupils, two catchlights; no ears");

  const large = renderFace({ color: "cyan", shape: "cloud", sizePx: 36, state: "idle", sourceId: "agent-a" });
  assert.equal((large.match(/stroke-width="5"/g) ?? []).length, 1, "brows from 36 px");
  assert.match(large, /--sand-face-blush/);
  assert.ok((large.match(/<circle /g) ?? []).length > (small.match(/<circle /g) ?? []).length, "ears from 36 px");

  for (const state of ["excited", "happy", "celebrate"]) {
    assert.match(renderFace({ color: "red", shape: "blob", sizePx: 28, state, sourceId: "agent-b" }), /Q114\.2705 166\.2705 134\.2705 147\.2705/, `${state} smiles`);
  }
  assert.doesNotMatch(renderFace({ color: "red", shape: "blob", sizePx: 28, state: "idle", sourceId: "agent-b" }), /Q114\.2705 166\.2705/, "idle does not");
  const asleep = renderFace({ color: "red", shape: "blob", sizePx: 28, state: "sleeping", sourceId: "agent-b" });
  assert.doesNotMatch(asleep, /--sand-face-sclera/, "sleeping draws closed lids, not open eyes");
  const paused = renderFace({ color: "red", shape: "blob", sizePx: 28, state: "working", sourceId: "agent-b", paused: true });
  assert.match(paused, /data-paused="true"/);
  const lit = renderFace({ color: "red", shape: "blob", sizePx: 80, state: "idle", sourceId: "agent-b", surfaceTheme: "light" });
  assert.match(lit, /data-surface-theme="light"/);
});

test("the theme sheet chooses the hair pair by the shell's data-theme and never by JavaScript", async () => {
  const { FACE_STYLE } = await loadCharacter();
  assert.match(FACE_STYLE, /\.sand-face\{--sand-face-hair:var\(--sand-face-hair-light\)/);
  assert.match(FACE_STYLE, /\[data-theme="cursor-dark"\] \.sand-face[^{]*\{--sand-face-hair:var\(--sand-face-hair-dark\)/);
  assert.match(FACE_STYLE, /\.sand-face\[data-surface-theme="light"\]\{--sand-face-hair:var\(--sand-face-hair-light\)/);
});
