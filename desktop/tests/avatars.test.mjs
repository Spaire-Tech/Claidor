import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// The founder's twenty-one avatars (docs/product/faces-adventurer-measured.md):
// what the port promised to keep, measured on the component and the generator
// rather than reasoned about.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATES = ["sleeping", "waking", "idle", "listening", "thinking", "searching", "working", "excited", "surprised", "suspicious", "angry", "drowsy", "happy", "curious", "confused", "bored", "proud", "shy", "sad", "laughing", "scared", "playful", "celebrate", "orbit", "radar", "progress", "spawning", "humming", "loading", "dictating", "writing", "sending", "receiving", "uploading", "notifying", "alerting", "dragging", "bouncing", "powering-down"];
const LEGACY = ["blob", "pebble", "squircle", "tablet", "wedge", "hex", "cloud", "teardrop"];

let loaded = null;
async function loadCharacter() {
  if (loaded != null) return loaded;
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-avatars-"));
  const output = path.join(temporary, "character.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "tests/fixtures/avatars-entry.tsx")],
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

test("the generated module is what the sources and the measurements produce", async () => {
  const { importAvatars } = await import(pathToFileURL(path.join(repoRoot, "scripts/import-avatars.mjs")).href);
  const { avatars, credit } = await importAvatars();
  const sources = (await readdir(path.join(repoRoot, "brand/avatars"))).filter((name) => name.endsWith(".svg")).sort();
  assert.equal(avatars.length, 21);
  assert.deepEqual(avatars.map((avatar) => `${avatar.key}.svg`), sources, "one avatar per source file, in order");
  assert.match(credit, /Adventurer.*Lisa Wischofsky.*CC BY 4\.0/);
  const module = await readFile(path.join(repoRoot, "frontend/src/recovered/features/onboarding/signed-in/avatars.generated.ts"), "utf8");
  for (const avatar of avatars) assert.ok(module.includes(`"${avatar.key}": {`), `${avatar.key} is in the module`);
  assert.doesNotMatch(module, /<use|<image|url\(#|\bid="/, "parts are inlined: no ids to collide, no references, no pictures");
  for (const avatar of avatars) {
    assert.ok(avatar.parts.some((part) => part.startsWith("head-")) && avatar.parts.some((part) => part.startsWith("eyes-")) && avatar.parts.some((part) => part.startsWith("mouth-")) && avatar.parts.some((part) => part.startsWith("hair-")), `${avatar.key} has head, eyes, mouth and hair`);
    assert.ok(avatar.eyes.cx > avatar.head.x && avatar.eyes.cx < avatar.head.x + avatar.head.w && avatar.eyes.cy > avatar.head.y && avatar.eyes.cy < avatar.head.y + avatar.head.h, `${avatar.key}: the eye centre is on the head`);
    assert.deepEqual(avatar.head, avatars[0].head, `${avatar.key}: the same head as every other avatar`);
  }
});

test("identity: a stored key is kept, a Grok Bot shape name maps onto the first eight, an unknown one hashes onto the twenty-one", async () => {
  const { AVATAR_KEYS, resolvePersonaShape, resolvePersonaColor, isAvatarKey } = await loadCharacter();
  assert.equal(AVATAR_KEYS.length, 21);
  for (const key of AVATAR_KEYS) assert.equal(resolvePersonaShape("any-agent", key), key);
  LEGACY.forEach((shape, index) => assert.equal(resolvePersonaShape("any-agent", shape), AVATAR_KEYS[index], `${shape} → avatar ${index + 1}`));
  assert.ok(isAvatarKey(resolvePersonaShape("agent-with-nothing-stored")));
  assert.equal(resolvePersonaShape("agent-with-nothing-stored"), resolvePersonaShape("agent-with-nothing-stored", "not-a-key"), "an unknown key falls back to the hash of the id");
  // Recorded: the shipped shape hash, which chose among eight, now chooses among twenty-one, so these are the faces these ids wear from now on.
  assert.deepEqual(["invoice-chaser", "weekly-standup", "sales-forecast", "persona", "hero"].map((id) => resolvePersonaShape(id)), ["adventurer-20", "adventurer-19", "adventurer-05", "adventurer-03", "adventurer-15"]);
  const spread = new Set(Array.from({ length: 200 }, (_, index) => resolvePersonaShape(`agent-${index}`)));
  assert.ok(spread.size >= 18, `two hundred ids spread over at least eighteen avatars, got ${spread.size}`);
  assert.equal(resolvePersonaColor("x", "cyan"), "cyan", "colour keys still resolve (they draw nothing)");
  assert.equal(resolvePersonaColor("invoice-chaser"), "orange", "the colour hash is unchanged");
});

test("the motion table is the shipped forty states, numbers unchanged", async () => {
  const { PERSONA_MOTION } = await loadCharacter();
  assert.deepEqual(Object.keys(PERSONA_MOTION).sort(), [...STATES].sort());
  assert.deepEqual(PERSONA_MOTION.idle, { amplitude: 1.5, period: 9000, tilt: 0, eye: 1 });
  assert.deepEqual(PERSONA_MOTION.thinking, { amplitude: 1, period: 2000, tilt: 3, eye: .75 });
  assert.deepEqual(PERSONA_MOTION.excited, { amplitude: 5, period: 1100, tilt: 0, eye: 1.08 });
  assert.deepEqual(PERSONA_MOTION.celebrate, { amplitude: 7, period: 1400, tilt: 0, eye: 1.12 });
  assert.deepEqual(PERSONA_MOTION.sleeping, { amplitude: 0, period: 6000, tilt: 0, eye: .12 });
});

test("the drawn mark keeps the box, the two animation groups, the data attributes and the part order, and adds nothing to the drawing", async () => {
  const { renderFace, AVATAR_KEYS, AVATAR_PLACEMENT, ADVENTURER_CREDIT } = await loadCharacter();
  const svg = renderFace({ color: "cyan", shape: "adventurer-11", sizePx: 28, state: "idle", sourceId: "agent-a" });
  assert.match(svg, /^<svg [^>]*class="sand-face"/);
  assert.match(svg, /viewBox="-15 -15 259 259"/);
  assert.match(svg, /data-avatar="adventurer-11"/);
  assert.match(svg, /data-grok-state="idle"/);
  assert.match(svg, /data-source-id="agent-a"/);
  assert.equal((svg.match(/<g[^>]*transform="translate\(0 0\)"/g) ?? []).length, 2, "the face group and the eyes group start at rest, and nothing else does");
  assert.match(svg, /<g clip-path="url\(#[^"]+\)"><g transform="translate\(0 0\)">/, "the face group is the first thing inside the mark's clip");
  const parts = [...svg.matchAll(/data-part="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(parts, ["head-default", "eyes-variant06", "eyebrows-variant04", "mouth-variant16", "glasses-variant04", "hair-long14"], "DiceBear's part order, eyes in their own group");
  assert.match(svg, /<g fill="none" transform="matrix\(/, "the source box is placed at one scale, unfilled like DiceBear's root");
  assert.doesNotMatch(svg, /<image|data:image|<use|<text/, "drawn from paths, never a picture, never a reference");
  assert.ok(Math.abs(AVATAR_PLACEMENT.scale - 259 / 762) < 1e-9, "one scale for every avatar");
  for (const key of AVATAR_KEYS) {
    const one = renderFace({ color: "blue", shape: key, sizePx: 16, state: "sleeping", sourceId: `agent-${key}` });
    assert.match(one, new RegExp(`data-avatar="${key}"`));
    assert.equal((one.match(/data-part="eyes-/g) ?? []).length, 1, `${key} has one eyes group`);
  }
  const bigger = renderFace({ color: "blue", shape: "adventurer-03", sizePx: 80, state: "celebrate", sourceId: "agent-b", paused: true });
  assert.match(bigger, /data-paused="true"/);
  assert.equal(renderFace({ color: "blue", shape: "adventurer-03", sizePx: 80, state: "celebrate", sourceId: "agent-b" }).replace(/_R_[0-9a-z]+_/g, "").length, bigger.replace(/ data-paused="true"/, "").replace(/_R_[0-9a-z]+_/g, "").length, "a state or a pause changes no geometry: the avatar is the avatar");
  assert.match(ADVENTURER_CREDIT, /CC BY 4\.0/);
});

test("every surface offers the same twenty-one and nothing else", async () => {
  const { AVATAR_KEYS } = await loadCharacter();
  const editorModel = await readFile(path.join(repoRoot, "frontend/src/recovered/features/agent-info/avatar-editor/model.ts"), "utf8");
  const onboardingModel = await readFile(path.join(repoRoot, "frontend/src/recovered/features/onboarding/signed-in/model.ts"), "utf8");
  const editorView = await readFile(path.join(repoRoot, "frontend/src/recovered/features/agent-info/avatar-editor/view.tsx"), "utf8");
  const onboardingView = await readFile(path.join(repoRoot, "frontend/src/recovered/features/onboarding/signed-in/view.tsx"), "utf8");
  const about = await readFile(path.join(repoRoot, "frontend/src/recovered/features/about/overlay/view.tsx"), "utf8");
  assert.match(editorModel, /export const AVATAR_SHAPES = AVATAR_KEYS;/);
  assert.match(onboardingModel, /export const CHARACTER_SHAPES = AVATAR_KEYS;/);
  assert.doesNotMatch(editorView, /AVATAR_COLORS|aria-label="Character color"/, "the editor has no colour row");
  assert.doesNotMatch(onboardingView, /CHARACTER_COLORS|aria-label="Character color"/, "the create step has no colour row");
  assert.match(onboardingView, /aria-label="Avatar" role="radiogroup"/);
  assert.match(about, /ADVENTURER_CREDIT/, "the About dialog carries the licence credit");
  assert.equal(AVATAR_KEYS[0], "adventurer-01");
});
