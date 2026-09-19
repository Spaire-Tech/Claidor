import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(repoRoot, "source/host/extensions/host-upgrade/host-bundle-source.ts");

async function loadModule() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-host-bundle-source-"));
  const output = path.join(temporary, "host-bundle-source.mjs");
  await build({ entryPoints: [sourcePath], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("host bundle source names no origin unless the operator sets one", async () => {
  const loaded = await loadModule();
  try {
    assert.equal(loaded.module.hostBundleBaseUrl({}), null);
    assert.equal(loaded.module.hostBundleBaseUrl({ SAND_HOST_BUNDLE_S3_BASE_URL: "   " }), null);
    assert.equal(loaded.module.hostBundleBaseUrl({ SAND_HOST_BUNDLE_S3_BASE_URL: "https://bundles.example.test/" }), "https://bundles.example.test");
  } finally {
    await loaded.dispose();
  }
});

test("with no origin every update path answers without a network request", async () => {
  const loaded = await loadModule();
  try {
    const calls = [];
    const fetchFn = async (url) => { calls.push(url); return new Response("deadbeef1", { status: 200 }); };
    loaded.module.clearHostBundleVersionCache();
    assert.equal(await loaded.module.resolveHostBundleSource(fetchFn, null), undefined);
    assert.equal(await loaded.module.fetchLatestHostBundleVersion(fetchFn, null), undefined);
    await assert.rejects(() => loaded.module.fetchHostBundleTarball(fetchFn, "deadbeef1", null), loaded.module.SandHostBundleSourceError);
    assert.deepEqual(calls, []);
  } finally {
    await loaded.dispose();
  }
});

test("an explicitly named origin is the only one contacted", async () => {
  const loaded = await loadModule();
  try {
    const calls = [];
    const fetchFn = async (url) => {
      calls.push(url);
      return url.endsWith(".version") ? new Response("deadbeef1", { status: 200 }) : new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    };
    loaded.module.clearHostBundleVersionCache();
    const source = await loaded.module.resolveHostBundleSource(fetchFn, "https://bundles.example.test");
    assert.equal(source?.version, "deadbeef1");
    assert.deepEqual([...await source.loadBundleBytes()], [1, 2, 3]);
    assert.deepEqual(calls, [
      "https://bundles.example.test/sand-host-bundle-latest.version",
      "https://bundles.example.test/sand-host-bundle-deadbeef1.tgz",
    ]);
  } finally {
    await loaded.dispose();
  }
});

test("the source carries no built-in bundle host", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.doesNotMatch(source, /amazonaws|asphr|cursor\.sh|cursor\.com/i);
  assert.doesNotMatch(source, /DEFAULT_BASE_URL|HOST_BUNDLE_BUCKET/);
});
