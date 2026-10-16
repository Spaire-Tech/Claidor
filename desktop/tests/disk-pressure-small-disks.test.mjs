/**
 * The cloud computer's disk check on an E2B computer (16 October 2026).
 *
 * Measured in the founder's computer: the disk was 15G with 9.6G free, and
 * /tmp was a tmpfs of 2.0G (half the memory). The check read /tmp as a
 * disk with 1.9G free, at or under the 2 GiB "hard" line, and every such
 * computer said "Computer is critically low on disk space". With /tmp on
 * the disk, the "soft" line at 8 GiB free would have said "low" after 1.6G
 * of files on a disk 47% full.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { statfsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  await rm(temporary, { recursive: true, force: true });
  return module;
}

const guard = await loadModule("source/host/extensions/forever-box/disk-pressure-guard.ts", "disk-pressure-guard");
const GIB = 1024 ** 3;
const disk = (totalGiB, freeGiB) => ({ totalBytes: totalGiB * GIB, availableBytes: freeGiB * GIB });

test("the founder's E2B computer is healthy: 15G disk with 9.6G free", () => {
  assert.equal(guard.classifyDiskPressure(disk(15, 9.6)), "healthy");
  // The 1.6G that would have made it "low" before.
  assert.equal(guard.classifyDiskPressure(disk(15, 7.9)), "healthy");
});

test("a small disk is low at 30% free and critical at 2 GiB, as a big one is at 8 and 2", () => {
  assert.equal(guard.classifyDiskPressure(disk(15, 4.6)), "healthy");
  assert.equal(guard.classifyDiskPressure(disk(15, 4.4)), "soft");
  assert.equal(guard.classifyDiskPressure(disk(15, 2.1)), "soft");
  assert.equal(guard.classifyDiskPressure(disk(15, 1.9)), "hard");
  // Leaving "low" takes 35% free on a small disk.
  assert.equal(guard.classifyDiskPressure(disk(15, 5), "soft"), "soft");
  assert.equal(guard.classifyDiskPressure(disk(15, 5.4), "soft"), "healthy");
  // Leaving "critical" still takes 3 GiB.
  assert.equal(guard.classifyDiskPressure(disk(15, 2.5), "hard"), "hard");
  assert.equal(guard.classifyDiskPressure(disk(15, 3.5), "hard"), "soft");
});

test("a large disk keeps the upstream lines", () => {
  // From 10 / 0.35 = 28.6 GiB up, the shares are above 8 and 10 GiB.
  assert.equal(guard.classifyDiskPressure(disk(50, 8.5)), "healthy");
  assert.equal(guard.classifyDiskPressure(disk(50, 7.9)), "soft");
  assert.equal(guard.classifyDiskPressure(disk(50, 9.5), "soft"), "soft");
  assert.equal(guard.classifyDiskPressure(disk(50, 10.5), "soft"), "healthy");
  assert.equal(guard.classifyDiskPressure(disk(50, 1.9)), "hard");
  // The ratios are unchanged: 5% free is critical on any disk.
  assert.equal(guard.classifyDiskPressure(disk(200, 9.5)), "hard");
});

const tmpfs = (() => {
  try { return statfsSync("/dev/shm", { bigint: true }).type === guard.TMPFS_MAGIC ? "/dev/shm" : null; } catch { return null; }
})();

test("a tmpfs is memory, not disk, and is left out of the check", { skip: tmpfs === null ? "no tmpfs at /dev/shm here" : false }, async () => {
  const sample = await guard.readDiskVolumeSnapshots([{ volume: "temp", path: tmpfs }, { volume: "workspace", path: repoRoot }]);
  assert.equal(sample.complete, true);
  assert.deepEqual(sample.snapshots.map((s) => s.volume), ["workspace"]);
});
