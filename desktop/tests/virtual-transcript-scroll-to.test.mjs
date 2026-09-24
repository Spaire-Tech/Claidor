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

let scrollTo;
let geo;
let dispose;

test("setup: load modules", async () => {
  const [scrollToLoaded, geoLoaded] = await Promise.all([
    load(
      "frontend/src/recovered/features/conversation/workspace/virtual-transcript-scroll-to.ts",
      "virtual-transcript-scroll-to"
    ),
    load(
      "frontend/src/recovered/features/conversation/workspace/virtual-transcript-geometry.ts",
      "virtual-transcript-geometry"
    ),
  ]);
  scrollTo = scrollToLoaded.module;
  geo = geoLoaded.module;
  dispose = async () => {
    await scrollToLoaded.dispose();
    await geoLoaded.dispose();
  };
});

// --- computeScrollTopForEntry ---

test("computeScrollTopForEntry centers a row in viewport", () => {
  // 10 rows of 60px, viewport 200px, no inset
  const offsets = geo.buildOffsets(Array.from({ length: 10 }, () => 60));
  // Row 5: top=300, height=60, center=330
  // idealScrollTop = 330 - 100 = 230
  const st = scrollTo.computeScrollTopForEntry(offsets, 5, 200, 0);
  assert.equal(st, 230);
});

test("computeScrollTopForEntry clamps to 0 for first row", () => {
  const offsets = geo.buildOffsets(Array.from({ length: 10 }, () => 60));
  // Row 0: top=0, center=30, idealScrollTop = 30 - 100 = -70 → clamped to 0
  const st = scrollTo.computeScrollTopForEntry(offsets, 0, 200, 0);
  assert.equal(st, 0);
});

test("computeScrollTopForEntry clamps to maxScrollTop for last row", () => {
  const offsets = geo.buildOffsets(Array.from({ length: 10 }, () => 60));
  // total = 600, viewport 200, maxScrollTop = 400
  // Row 9: top=540, center=570, idealScrollTop = 570 - 100 = 470 → clamped to 400
  const st = scrollTo.computeScrollTopForEntry(offsets, 9, 200, 0);
  assert.equal(st, 400);
});

test("computeScrollTopForEntry with leading inset", () => {
  const offsets = geo.buildOffsets([60, 60, 60]);
  // leadingInset=24
  // Row 1: top = 60 + 24 = 84, height = 60, center = 114
  // idealScrollTop = 114 - 150 = -36 → 0
  const st = scrollTo.computeScrollTopForEntry(offsets, 1, 300, 24);
  assert.equal(st, 0);
});

test("computeScrollTopForEntry returns 0 for empty offsets", () => {
  assert.equal(scrollTo.computeScrollTopForEntry([0], 0, 200, 0), 0);
});

test("computeScrollTopForEntry returns 0 for out-of-bounds index", () => {
  const offsets = geo.buildOffsets([60, 60]);
  assert.equal(scrollTo.computeScrollTopForEntry(offsets, 5, 200, 0), 0);
  assert.equal(scrollTo.computeScrollTopForEntry(offsets, -1, 200, 0), 0);
});

test("computeScrollTopForEntry with variable heights", () => {
  // heights: 32, 192, 60
  const offsets = geo.buildOffsets([32, 192, 60]);
  // Row 1: top=32, height=192, center=128
  // viewport 200, idealScrollTop = 128 - 100 = 28
  const st = scrollTo.computeScrollTopForEntry(offsets, 1, 200, 0);
  assert.equal(st, 28);
});

// --- findEntryIndex ---

test("findEntryIndex returns correct index", () => {
  const entries = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(scrollTo.findEntryIndex(entries, "b"), 1);
});

test("findEntryIndex returns -1 for missing id", () => {
  const entries = [{ id: "a" }, { id: "b" }];
  assert.equal(scrollTo.findEntryIndex(entries, "z"), -1);
});

test("findEntryIndex returns first occurrence on duplicates", () => {
  const entries = [{ id: "a" }, { id: "b" }, { id: "a" }];
  assert.equal(scrollTo.findEntryIndex(entries, "a"), 0);
});

// cleanup
test("teardown", async () => {
  if (dispose) await dispose();
});
