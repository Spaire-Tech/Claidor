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

let geo;
let dispose;

test("setup: load geometry module", async () => {
  const loaded = await load(
    "frontend/src/recovered/features/conversation/workspace/virtual-transcript-geometry.ts",
    "virtual-transcript-geometry"
  );
  geo = loaded.module;
  dispose = loaded.dispose;
});

// --- estimateEntryHeightPx ---

test("estimateEntryHeightPx returns 60 for message without attachments", () => {
  assert.equal(geo.estimateEntryHeightPx("message", false), 60);
});

test("estimateEntryHeightPx returns 192 for message with attachments", () => {
  assert.equal(geo.estimateEntryHeightPx("message", true), 192);
});

test("estimateEntryHeightPx returns 32 for timeline-event", () => {
  assert.equal(geo.estimateEntryHeightPx("timeline-event"), 32);
});

test("estimateEntryHeightPx returns 32 for time-separator", () => {
  assert.equal(geo.estimateEntryHeightPx("time-separator"), 32);
});

test("estimateEntryHeightPx returns 40 for unread-divider", () => {
  assert.equal(geo.estimateEntryHeightPx("unread-divider"), 40);
});

test("estimateEntryHeightPx returns 0 for local-tool-permission (renders null)", () => {
  assert.equal(geo.estimateEntryHeightPx("local-tool-permission"), 0);
});

test("estimateEntryHeightPx returns 60 for unknown kind", () => {
  assert.equal(geo.estimateEntryHeightPx("computer-handoff"), 60);
});

// --- buildOffsets / totalSizePx ---

test("buildOffsets of empty list yields [0]", () => {
  const offsets = geo.buildOffsets([]);
  assert.deepEqual(offsets, [0]);
});

test("buildOffsets prefix sums are correct", () => {
  const offsets = geo.buildOffsets([60, 32, 40, 60]);
  assert.deepEqual(offsets, [0, 60, 92, 132, 192]);
});

test("totalSizePx of empty offsets is 0", () => {
  assert.equal(geo.totalSizePx([]), 0);
});

test("totalSizePx returns last element", () => {
  assert.equal(geo.totalSizePx([0, 60, 92, 132, 192]), 192);
});

// --- computeMountedRange ---

test("computeMountedRange with empty list", () => {
  const range = geo.computeMountedRange({
    offsets: [0],
    scrollTopPx: 0,
    viewportPx: 500,
  });
  assert.equal(range.firstIndex, 0);
  assert.equal(range.lastIndex, 0);
});

test("computeMountedRange single row fully visible", () => {
  const offsets = geo.buildOffsets([60]);
  const range = geo.computeMountedRange({
    offsets,
    scrollTopPx: 0,
    viewportPx: 500,
    overscanRows: 0,
    leadingInsetPx: 0,
  });
  assert.equal(range.firstIndex, 0);
  assert.equal(range.lastIndex, 1);
});

test("computeMountedRange with overscan clamped to bounds", () => {
  // 3 rows of 60px each, viewport shows all, overscan 6 — should clamp
  const offsets = geo.buildOffsets([60, 60, 60]);
  const range = geo.computeMountedRange({
    offsets,
    scrollTopPx: 0,
    viewportPx: 500,
    overscanRows: 6,
    leadingInsetPx: 0,
  });
  assert.equal(range.firstIndex, 0);
  assert.equal(range.lastIndex, 3);
});

test("computeMountedRange scroll mid-list", () => {
  // 20 rows of 60px each = 1200px total, viewport 200px
  const heights = Array.from({ length: 20 }, () => 60);
  const offsets = geo.buildOffsets(heights);
  // scrollTop 500 with no leading inset → visible rows at px 500..700
  // row 8 starts at 480, row 9 at 540, row 10 at 600, row 11 at 660, row 12 at 720
  // visible: rows 8–11 (8*60=480 < 500 but bottom=540 > 500 → first visible=8)
  // with overscan 2: first = max(0, 8-2) = 6, last = min(20, 12+2) = 14
  const range = geo.computeMountedRange({
    offsets,
    scrollTopPx: 500,
    viewportPx: 200,
    overscanRows: 2,
    leadingInsetPx: 0,
  });
  assert.equal(range.firstIndex, 6);
  assert.equal(range.lastIndex, 14);
});

test("computeMountedRange with leading inset", () => {
  // 10 rows of 60px = 600px. Leading inset 24. scrollTop 0.
  // visibleTop = max(0, 0 - 24) = 0, visibleBottom = 0 + 300 = 300
  // rows 0..4 visible (0-60, 60-120, 120-180, 180-240, 240-300)
  // overscan 0
  const heights = Array.from({ length: 10 }, () => 60);
  const offsets = geo.buildOffsets(heights);
  const range = geo.computeMountedRange({
    offsets,
    scrollTopPx: 0,
    viewportPx: 300,
    overscanRows: 0,
    leadingInsetPx: 24,
  });
  assert.equal(range.firstIndex, 0);
  assert.equal(range.lastIndex, 5);
});

test("computeMountedRange scrolled to bottom", () => {
  const heights = Array.from({ length: 20 }, () => 60);
  const offsets = geo.buildOffsets(heights);
  // total = 1200px, viewport 200px, scrollTop = 1000 (at bottom), no inset
  const range = geo.computeMountedRange({
    offsets,
    scrollTopPx: 1000,
    viewportPx: 200,
    overscanRows: 2,
    leadingInsetPx: 0,
  });
  // visible: rows 16-19, with overscan: 14-20 (clamped)
  assert.equal(range.firstIndex, 14);
  assert.equal(range.lastIndex, 20);
});

test("computeMountedRange variable heights", () => {
  // heights: 32, 60, 40, 192, 60, 32, 60, 60, 60, 60
  // offsets: 0, 32, 92, 132, 324, 384, 416, 476, 536, 596, 656
  const heights = [32, 60, 40, 192, 60, 32, 60, 60, 60, 60];
  const offsets = geo.buildOffsets(heights);
  assert.equal(geo.totalSizePx(offsets), 656);

  // scrollTop 100, viewport 200, no inset, overscan 1
  // visibleTop=100, visibleBottom=300
  // first row whose bottom > 100: row 1 (bottom=92 <=100? yes) → row 2 (bottom=132 > 100 ✓)
  // Wait: row 1 bottom = offsets[2] = 92 ≤ 100, so firstVisible=2
  // first row whose top ≥ 300: row 4 top=324 ≥ 300 → lastVisible=4 (exclusive)
  // But we need row 3 (top=132, bottom=324) since 324>300 it's partially visible
  // Actually lastVisible is exclusive upper bound of visible rows
  // overscan 1: first=max(0,2-1)=1, last=min(10,4+1)=5
  const range = geo.computeMountedRange({
    offsets,
    scrollTopPx: 100,
    viewportPx: 200,
    overscanRows: 1,
    leadingInsetPx: 0,
  });
  assert.equal(range.firstIndex, 1);
  assert.equal(range.lastIndex, 5);
});

// --- constants exported ---

test("golden constants are exported", () => {
  assert.equal(geo.LEADING_INSET_PX, 24);
  assert.equal(geo.TRAILING_INSET_PX, 12);
  assert.equal(geo.OVERSCAN_ROWS, 6);
});

// cleanup
test("teardown", async () => {
  if (dispose) await dispose();
});
