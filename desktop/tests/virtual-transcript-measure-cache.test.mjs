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

let cache;
let geo;
let MeasureCache;
let dispose;

test("setup: load modules", async () => {
  const [cacheLoaded, geoLoaded] = await Promise.all([
    load(
      "frontend/src/recovered/features/conversation/workspace/virtual-transcript-measure-cache.ts",
      "virtual-transcript-measure-cache"
    ),
    load(
      "frontend/src/recovered/features/conversation/workspace/virtual-transcript-geometry.ts",
      "virtual-transcript-geometry"
    ),
  ]);
  MeasureCache = cacheLoaded.module.MeasureCache;
  geo = geoLoaded.module;
  dispose = async () => {
    await cacheLoaded.dispose();
    await geoLoaded.dispose();
  };
});

// --- commit replaces estimate ---

test("commit stores a measured height", () => {
  cache = new MeasureCache();
  const changed = cache.commit("msg-1", 120);
  assert.equal(changed, true);
  assert.equal(cache.get("msg-1"), 120);
});

test("commit returns false for no-op (same height within 0.5px)", () => {
  cache = new MeasureCache();
  cache.commit("msg-1", 120);
  assert.equal(cache.commit("msg-1", 120.3), false);
  // Value should stay the original
  assert.equal(cache.get("msg-1"), 120);
});

test("commit returns true when height differs by >= 0.5px", () => {
  cache = new MeasureCache();
  cache.commit("msg-1", 120);
  assert.equal(cache.commit("msg-1", 120.5), true);
  assert.equal(cache.get("msg-1"), 120.5);
});

// --- invalidate clears ---

test("invalidate removes a committed key", () => {
  cache = new MeasureCache();
  cache.commit("msg-1", 100);
  assert.equal(cache.invalidate("msg-1"), true);
  assert.equal(cache.get("msg-1"), undefined);
});

test("invalidate returns false for unknown key", () => {
  cache = new MeasureCache();
  assert.equal(cache.invalidate("nonexistent"), false);
});

// --- resolveHeights uses committed then estimate ---

test("resolveHeights returns committed height when available", () => {
  cache = new MeasureCache();
  cache.commit("msg-1", 200);
  const entries = [
    { id: "msg-1", kind: "message", hasAttachments: false },
  ];
  const heights = cache.resolveHeights(entries);
  assert.deepEqual(heights, [200]);
});

test("resolveHeights falls back to estimate when not committed", () => {
  cache = new MeasureCache();
  const entries = [
    { id: "msg-1", kind: "message", hasAttachments: false },
    { id: "ev-1", kind: "timeline-event" },
  ];
  const heights = cache.resolveHeights(entries);
  // message=60, timeline-event=32
  assert.deepEqual(heights, [60, 32]);
});

test("resolveHeights mixes committed and estimated", () => {
  cache = new MeasureCache();
  cache.commit("msg-2", 150);
  const entries = [
    { id: "msg-1", kind: "message", hasAttachments: false },
    { id: "msg-2", kind: "message", hasAttachments: false },
    { id: "sep-1", kind: "time-separator" },
  ];
  const heights = cache.resolveHeights(entries);
  assert.deepEqual(heights, [60, 150, 32]);
});

// --- rebuild offsets after commit changes totalSizePx ---

test("totalSizePx changes after commit", () => {
  cache = new MeasureCache();
  const entries = [
    { id: "msg-1", kind: "message", hasAttachments: false },
    { id: "msg-2", kind: "message", hasAttachments: false },
  ];

  // Before commit: both estimated at 60 → total 120
  const heightsBefore = cache.resolveHeights(entries);
  const offsetsBefore = geo.buildOffsets(heightsBefore);
  assert.equal(geo.totalSizePx(offsetsBefore), 120);

  // After committing a taller height for msg-1
  cache.commit("msg-1", 200);
  const heightsAfter = cache.resolveHeights(entries);
  const offsetsAfter = geo.buildOffsets(heightsAfter);
  assert.equal(geo.totalSizePx(offsetsAfter), 260); // 200 + 60
});

// --- prune ---

test("prune removes keys not in active set", () => {
  cache = new MeasureCache();
  cache.commit("msg-1", 100);
  cache.commit("msg-2", 200);
  cache.commit("msg-3", 300);
  cache.prune(new Set(["msg-1", "msg-3"]));
  assert.equal(cache.get("msg-1"), 100);
  assert.equal(cache.get("msg-2"), undefined);
  assert.equal(cache.get("msg-3"), 300);
  assert.equal(cache.size, 2);
});

// --- clear ---

test("clear removes all committed heights", () => {
  cache = new MeasureCache();
  cache.commit("msg-1", 100);
  cache.commit("msg-2", 200);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.get("msg-1"), undefined);
});

// --- size ---

test("size reflects committed count", () => {
  cache = new MeasureCache();
  assert.equal(cache.size, 0);
  cache.commit("a", 10);
  assert.equal(cache.size, 1);
  cache.commit("b", 20);
  assert.equal(cache.size, 2);
  cache.invalidate("a");
  assert.equal(cache.size, 1);
});

// cleanup
test("teardown", async () => {
  if (dispose) await dispose();
});
