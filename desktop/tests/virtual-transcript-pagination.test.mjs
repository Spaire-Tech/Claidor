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

let pagination;
let dispose;

test("setup: load pagination module", async () => {
  const loaded = await load(
    "frontend/src/recovered/features/conversation/workspace/virtual-transcript-pagination.ts",
    "virtual-transcript-pagination"
  );
  pagination = loaded.module;
  dispose = loaded.dispose;
});

// --- computeAnchoredScrollTop ---

test("computeAnchoredScrollTop adds height growth to anchor", () => {
  // Was at scrollTop 300, total was 1000, now 1500 (500 prepended)
  const result = pagination.computeAnchoredScrollTop(300, 1000, 1500);
  assert.equal(result, 800); // 300 + 500
});

test("computeAnchoredScrollTop returns anchor when no growth", () => {
  const result = pagination.computeAnchoredScrollTop(300, 1000, 1000);
  assert.equal(result, 300);
});

test("computeAnchoredScrollTop returns anchor when content shrinks", () => {
  // Shrinking should not happen in normal flow, but if it does, don't shift
  const result = pagination.computeAnchoredScrollTop(300, 1000, 800);
  assert.equal(result, 300);
});

test("computeAnchoredScrollTop with zero anchor", () => {
  const result = pagination.computeAnchoredScrollTop(0, 500, 1000);
  assert.equal(result, 500);
});

test("computeAnchoredScrollTop with large prepend", () => {
  // 50 entries of 60px prepended = 3000px growth
  const result = pagination.computeAnchoredScrollTop(100, 2000, 5000);
  assert.equal(result, 3100);
});

// cleanup
test("teardown", async () => {
  if (dispose) await dispose();
});
