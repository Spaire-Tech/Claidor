import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Window } from "happy-dom";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-face-motion-"));
  const output = path.join(temporary, "module.mjs");
  await build({
    entryPoints: [path.join(repoRoot, entry)],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
      });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

const GROK_MOTION_TABLE = "frontend/src/recovered/features/onboarding/signed-in/character.tsx";

test("the motion table is Grok's, state for state", async () => {
  const { module, dispose } = await loadModule("source/shared/agent/face-motion.ts");
  try {
    const { FACE_MOTION_STATES, faceMotionFor, isFaceMotionState } = module;
    const recovered = await import("node:fs/promises").then((fs) => fs.readFile(path.join(repoRoot, GROK_MOTION_TABLE), "utf8"));
    const grok = /const MOTION: Record<[^=]+=\s*\{([\s\S]*?)\n\};/.exec(recovered);
    assert.ok(grok, "recovered character.tsx should hold the MOTION table");
    const entries = [...grok[1].matchAll(/"?([\w-]+)"?:\s*\{\s*amplitude:\s*([\d.]+),\s*period:\s*(\d+),\s*tilt:\s*(-?\d+),\s*eye:\s*([\d.]+)\s*\}/g)];
    assert.ok(entries.length >= 39, `expected Grok's states, found ${entries.length}`);
    for (const [, state, amplitude, period, tilt, eye] of entries) {
      assert.ok(isFaceMotionState(state), `${state} missing from FACE_MOTION_STATES`);
      assert.deepEqual(FACE_MOTION_STATES[state], { amplitude: Number(amplitude), period: Number(period), tilt: Number(tilt), eye: Number(eye) }, state);
    }
    assert.equal(Object.keys(FACE_MOTION_STATES).length, entries.length);
    assert.deepEqual(faceMotionFor("not-a-state"), FACE_MOTION_STATES.idle);
    assert.deepEqual(faceMotionFor(null), FACE_MOTION_STATES.idle);
  } finally {
    await dispose();
  }
});

test("a frame bobs, leans and opens the eyes as the state says", async () => {
  const { module, dispose } = await loadModule("source/shared/agent/face-motion.ts");
  try {
    const { faceMotionFrame, clayFaceGeometry } = module;
    const G = clayFaceGeometry(50);
    const frame = (input) => faceMotionFrame(input, G);
    const rest = frame({ state: "working", elapsedMs: 0 });
    assert.equal(rest.face, "translate(0 0) rotate(-3 50 62)");
    assert.equal(rest.eyes, "translate(0 50) scale(1 1) translate(0 -50)");
    assert.equal(rest.pupils, "translate(0 0)");
    assert.equal(rest.actionDone, false);
    // A quarter period into the bob the face is at the top of its travel.
    const peak = frame({ state: "working", elapsedMs: 1800 / 4 });
    const lift = Number(/translate\(0 (-?[\d.]+)\)/.exec(peak.face)[1]);
    assert.ok(Math.abs(lift + 2 * G.scale) < 0.02, `lift ${lift}`);
    const sleeping = frame({ state: "sleeping", elapsedMs: 5000 });
    assert.match(sleeping.eyes, /scale\(1 0\.12\)/);
    assert.equal(sleeping.face, "translate(0 0) rotate(0 50 62)");
    const thinking = frame({ state: "thinking", elapsedMs: 0 });
    assert.match(thinking.face, /rotate\(3 50 62\)/);
    assert.match(thinking.eyes, /scale\(1 0\.75\)/);
  } finally {
    await dispose();
  }
});

test("a spin is one full turn in a second and a bounce decays over 700 ms", async () => {
  const { module, dispose } = await loadModule("source/shared/agent/face-motion.ts");
  try {
    const { faceMotionFrame, clayFaceGeometry, FACE_SPIN_MS, FACE_BOUNCE_MS } = module;
    const frame = (input) => faceMotionFrame(input, clayFaceGeometry(50));
    const spin = { kind: "spin", startedAt: 10_000 };
    const half = frame({ state: "sending", elapsedMs: 0, nowMs: 10_000 + FACE_SPIN_MS / 2, action: spin });
    assert.match(half.face, /rotate\(180 50 62\)/);
    assert.equal(half.actionDone, false);
    const done = frame({ state: "sending", elapsedMs: 0, nowMs: 10_000 + FACE_SPIN_MS, action: spin });
    assert.match(done.face, /rotate\(0 50 62\)/);
    assert.equal(done.actionDone, true);
    const bounce = { kind: "bounce", startedAt: 10_000 };
    const start = frame({ state: "sleeping", elapsedMs: 0, nowMs: 10_000, action: bounce });
    assert.match(start.face, /translate\(0 -3\.5\)/, "8 Grok units, scaled to the clay canvas");
    const mid = frame({ state: "sleeping", elapsedMs: 0, nowMs: 10_000 + FACE_BOUNCE_MS / 2, action: bounce });
    assert.match(mid.face, /translate\(0 -1\.75\)/);
    assert.equal(mid.actionDone, false);
    const landed = frame({ state: "sleeping", elapsedMs: 0, nowMs: 10_000 + FACE_BOUNCE_MS, action: bounce });
    assert.match(landed.face, /translate\(0 0\)/);
    assert.equal(landed.actionDone, true);
  } finally {
    await dispose();
  }
});

test("state changes earn the moves Grok fires from outside", async () => {
  const { module, dispose } = await loadModule("source/shared/agent/face-motion.ts");
  try {
    const { faceActionForTransition } = module;
    assert.equal(faceActionForTransition("idle", "sending"), "spin");
    assert.equal(faceActionForTransition("idle", "spawning"), "spin");
    assert.equal(faceActionForTransition("working", "celebrate"), "spin");
    assert.equal(faceActionForTransition("idle", "excited"), "bounce");
    assert.equal(faceActionForTransition("idle", "receiving"), "bounce");
    assert.equal(faceActionForTransition("idle", "working"), null);
    assert.equal(faceActionForTransition("sending", "sending"), null);
    assert.equal(faceActionForTransition("sending", null), null);
  } finally {
    await dispose();
  }
});

test("the eyes follow the pointer across the face and no further", async () => {
  const { module, dispose } = await loadModule("source/shared/agent/face-motion.ts");
  try {
    const { faceGazeFor, faceMotionFrame, clayFaceGeometry } = module;
    const frame = (input) => faceMotionFrame(input, clayFaceGeometry(50));
    const box = { left: 100, top: 200, width: 40, height: 40 };
    assert.deepEqual(faceGazeFor({ x: 120, y: 220 }, box), { x: 0, y: 0 });
    assert.deepEqual(faceGazeFor({ x: 140, y: 200 }, box), { x: 1, y: -1 });
    assert.deepEqual(faceGazeFor({ x: -1000, y: 9000 }, box), { x: -1, y: 1 });
    assert.deepEqual(faceGazeFor({ x: 5, y: 5 }, { left: 0, top: 0, width: 0, height: 0 }), { x: 0, y: 0 });
    const looking = frame({ state: "idle", elapsedMs: 0, gaze: { x: 1, y: -1 } });
    assert.equal(looking.pupils, "translate(1.75 -1.31)");
  } finally {
    await dispose();
  }
});

test("still holds the pose: no bob, no gaze, and a pending move is dropped", async () => {
  const { module, dispose } = await loadModule("source/shared/agent/face-motion.ts");
  try {
    const { faceMotionFrame, clayFaceGeometry } = module;
    const frame = (input) => faceMotionFrame(input, clayFaceGeometry(50));
    const held = frame({ state: "excited", elapsedMs: 275, nowMs: 275, gaze: { x: 1, y: 1 }, action: { kind: "spin", startedAt: 0 }, still: true });
    assert.equal(held.face, "translate(0 0) rotate(0 50 62)");
    assert.match(held.eyes, /scale\(1 1\.08\)/);
    assert.equal(held.pupils, "translate(0 0)");
    assert.equal(held.actionDone, true);
  } finally {
    await dispose();
  }
});

function grokMark(document, state) {
  const mark = document.createElement("span");
  mark.className = "sand-agent-avatar sand-grok-bot-mark";
  mark.setAttribute("data-avatar-color", "sage");
  mark.setAttribute("data-avatar-shape", "blob");
  mark.setAttribute("data-source-id", "agent-bass");
  if (state) mark.setAttribute("data-grok-state", state);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.append(document.createElementNS("http://www.w3.org/2000/svg", "path"));
  mark.append(svg);
  document.body.append(mark);
  return mark;
}

test("the overlay loop reads the mark's state each frame and writes Grok's transforms", async () => {
  const loaded = await loadModule("source/electron-preload/agent-face-overlay.ts");
  const window = new Window();
  try {
    const { syncFaceMarks, tickFaceMotion, resetFaceMotion, trackedFaceCount, hostGrokState } = loaded.module;
    let now = 0;
    resetFaceMotion(() => now);
    const mark = grokMark(window.document, "idle");
    assert.equal(hostGrokState(mark), "idle");
    assert.equal(syncFaceMarks(window.document), 1);
    assert.equal(trackedFaceCount(), 1);
    const face = mark.querySelector(".caisra-face__face");
    assert.equal(mark.querySelector(".caisra-face__eyes"), null, "the slice has no eyes; the body carries the motion");
    now = 0;
    assert.equal(tickFaceMotion(now), 1);
    assert.equal(face.getAttribute("transform"), "translate(0 0) rotate(0 50 50)");

    mark.setAttribute("data-grok-state", "thinking");
    now = 500;
    tickFaceMotion(now);
    assert.match(face.getAttribute("transform"), /rotate\(3 50 50\)/);

    // Sending earns a spin that runs for a second on the same clock.
    mark.setAttribute("data-grok-state", "sending");
    now = 1000;
    tickFaceMotion(now);
    now = 1500;
    tickFaceMotion(now);
    assert.match(face.getAttribute("transform"), /rotate\(180 50 50\)/);
    now = 2100;
    tickFaceMotion(now);
    assert.match(face.getAttribute("transform"), /rotate\(0 50 50\)/);

    // The state can live on a descendant, as the pinned renderer may put it.
    mark.removeAttribute("data-grok-state");
    mark.querySelector("svg").setAttribute("data-grok-state", "bored");
    assert.equal(hostGrokState(mark), "bored");
    now = 2200;
    tickFaceMotion(now);
    assert.match(face.getAttribute("transform"), /rotate\(-8 50 50\)/);

    // A mark that leaves the page leaves the loop.
    mark.remove();
    assert.equal(tickFaceMotion(2300), 0);
    assert.equal(trackedFaceCount(), 0);
  } finally {
    loaded.module.resetFaceMotion();
    window.close();
    await loaded.dispose();
  }
});

test("a paused mark holds its pose", async () => {
  const loaded = await loadModule("source/electron-preload/agent-face-overlay.ts");
  const window = new Window();
  try {
    const { syncFaceMarks, tickFaceMotion, resetFaceMotion } = loaded.module;
    resetFaceMotion(() => 0);
    const mark = grokMark(window.document, "excited");
    mark.setAttribute("data-paused", "true");
    syncFaceMarks(window.document);
    tickFaceMotion(275);
    assert.equal(mark.querySelector(".caisra-face__face").getAttribute("transform"), "translate(0 0) rotate(0 50 50)");
  } finally {
    loaded.module.resetFaceMotion();
    window.close();
    await loaded.dispose();
  }
});
