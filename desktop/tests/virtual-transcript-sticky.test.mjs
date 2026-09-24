import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
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

let sticky;
let dispose;

test("setup: load sticky module", async () => {
  const loaded = await load(
    "frontend/src/recovered/features/conversation/workspace/virtual-transcript-sticky.ts",
    "virtual-transcript-sticky"
  );
  sticky = loaded.module;
  dispose = loaded.dispose;
});

// --- golden constants ---

test("golden constants are exported", () => {
  assert.equal(sticky.NEAR_BOTTOM_THRESHOLD_PX, 4);
  assert.equal(sticky.USER_INPUT_WINDOW_MS, 250);
  assert.equal(sticky.DRIFT_TOLERANCE_PX, 1);
});

// --- initialStickyState ---

test("initial state is pinned", () => {
  const state = sticky.initialStickyState();
  assert.equal(state.isPinned, true);
  assert.equal(state.lastUserGestureMs, 0);
});

// --- distanceFromBottom ---

test("distanceFromBottom at bottom is 0", () => {
  assert.equal(sticky.distanceFromBottom({ scrollTop: 800, scrollHeight: 1200, clientHeight: 400 }), 0);
});

test("distanceFromBottom mid-scroll", () => {
  assert.equal(sticky.distanceFromBottom({ scrollTop: 500, scrollHeight: 1200, clientHeight: 400 }), 300);
});

test("distanceFromBottom never negative", () => {
  // scrollTop beyond max (can happen transiently)
  assert.equal(sticky.distanceFromBottom({ scrollTop: 900, scrollHeight: 1200, clientHeight: 400 }), 0);
});

// --- isNearBottom ---

test("isNearBottom true when at bottom", () => {
  assert.equal(sticky.isNearBottom({ scrollTop: 800, scrollHeight: 1200, clientHeight: 400 }), true);
});

test("isNearBottom true within threshold", () => {
  assert.equal(sticky.isNearBottom({ scrollTop: 797, scrollHeight: 1200, clientHeight: 400 }, 4), true);
});

test("isNearBottom false beyond threshold", () => {
  assert.equal(sticky.isNearBottom({ scrollTop: 795, scrollHeight: 1200, clientHeight: 400 }, 4), false);
});

// --- isWithinUserInputWindow ---

test("isWithinUserInputWindow true within window", () => {
  assert.equal(sticky.isWithinUserInputWindow(1000, 1200, 250), true);
});

test("isWithinUserInputWindow false outside window", () => {
  assert.equal(sticky.isWithinUserInputWindow(1000, 1300, 250), false);
});

test("isWithinUserInputWindow true at boundary", () => {
  assert.equal(sticky.isWithinUserInputWindow(1000, 1250, 250), true);
});

// --- onScroll: re-latch ---

test("onScroll re-latches when near bottom", () => {
  const prev = { isPinned: false, lastUserGestureMs: 500 };
  const m = { scrollTop: 798, scrollHeight: 1200, clientHeight: 400 };
  const next = sticky.onScroll(prev, m, 1000);
  assert.equal(next.isPinned, true);
});

// --- onScroll: user gesture unpins ---

test("onScroll unpins on user gesture away from bottom", () => {
  const prev = { isPinned: true, lastUserGestureMs: 950 };
  const m = { scrollTop: 500, scrollHeight: 1200, clientHeight: 400 };
  const next = sticky.onScroll(prev, m, 1000);
  assert.equal(next.isPinned, false);
});

// --- onScroll: programmatic drift within tolerance stays pinned ---

test("onScroll stays pinned for small programmatic drift within near-bottom threshold", () => {
  const prev = { isPinned: true, lastUserGestureMs: 0 };
  // 1px from bottom — within nearBottomThresholdPx (4), so re-latches (stays pinned)
  const m = { scrollTop: 799, scrollHeight: 1200, clientHeight: 400 };
  const next = sticky.onScroll(prev, m, 5000);
  assert.equal(next.isPinned, true);
});

test("onScroll stays pinned for drift within tolerance but outside near-bottom threshold", () => {
  const prev = { isPinned: true, lastUserGestureMs: 0 };
  // 1px drift, nearBottomThreshold set to 0 so it's not "near bottom",
  // but drift <= driftTolerancePx (1) so stays pinned
  const m = { scrollTop: 799, scrollHeight: 1200, clientHeight: 400 };
  const next = sticky.onScroll(prev, m, 5000, { nearBottomThresholdPx: 0, driftTolerancePx: 1 });
  assert.equal(next.isPinned, true);
  assert.equal(next, prev); // Same reference — no change
});

// --- onScroll: large programmatic scroll unpins ---

test("onScroll unpins on large programmatic scroll away", () => {
  const prev = { isPinned: true, lastUserGestureMs: 0 };
  const m = { scrollTop: 500, scrollHeight: 1200, clientHeight: 400 };
  const next = sticky.onScroll(prev, m, 5000);
  assert.equal(next.isPinned, false);
});

// --- onScroll: already unpinned stays unpinned ---

test("onScroll stays unpinned when already unpinned and away", () => {
  const prev = { isPinned: false, lastUserGestureMs: 0 };
  const m = { scrollTop: 500, scrollHeight: 1200, clientHeight: 400 };
  const next = sticky.onScroll(prev, m, 5000);
  assert.equal(next.isPinned, false);
});

// --- onUserGesture ---

test("onUserGesture records timestamp", () => {
  const prev = { isPinned: true, lastUserGestureMs: 0 };
  const next = sticky.onUserGesture(prev, 12345);
  assert.equal(next.lastUserGestureMs, 12345);
  assert.equal(next.isPinned, true); // Pin state unchanged
});

// --- onScrollToBottom ---

test("onScrollToBottom pins and resets gesture timer", () => {
  const prev = { isPinned: false, lastUserGestureMs: 9999 };
  const next = sticky.onScrollToBottom(prev);
  assert.equal(next.isPinned, true);
  assert.equal(next.lastUserGestureMs, 0);
});

// --- scrollTopForBottom ---

test("scrollTopForBottom computes max scrollTop", () => {
  assert.equal(sticky.scrollTopForBottom({ scrollHeight: 1200, clientHeight: 400 }), 800);
});

test("scrollTopForBottom returns 0 when content fits", () => {
  assert.equal(sticky.scrollTopForBottom({ scrollHeight: 200, clientHeight: 400 }), 0);
});

// cleanup
test("teardown", async () => {
  if (dispose) await dispose();
});
