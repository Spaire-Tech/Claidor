import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// The box-migration watcher (Cursor's `WatchSandBoxMigration` stream) is
// only attached for a remote box. Until 24 September 2026 it started
// whatever the runtime and, on the default local Docker box, retried a 404
// against Simeon Labs' server every 3 s for as long as the app ran.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' } });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("no watcher is built for a local Docker box; one is for a remote box", async () => {
  const loaded = await loadModule("source/electron-main/box/box-recovery.ts", "box-recovery");
  try {
    const { migrationWatchForBoxRuntime } = loaded.module;
    let built = 0;
    assert.equal(migrationWatchForBoxRuntime("local-docker", () => { built += 1; return "watch"; }), undefined);
    assert.equal(built, 0);
    assert.equal(migrationWatchForBoxRuntime("remote", () => { built += 1; return "watch"; }), "watch");
    assert.equal(built, 1);
  } finally {
    await loaded.dispose();
  }
});

test("without a watcher the relay never starts a stream, and the dev recreate plane's events still land", async () => {
  const loaded = await loadModule("source/electron-main/box/box-recovery.ts", "box-recovery");
  try {
    const { createProductionBoxRecovery, migrationWatchForBoxRuntime } = loaded.module;
    const broadcast = [];
    let streamed = 0;
    const watch = migrationWatchForBoxRuntime("local-docker", () => async function* () { streamed += 1; yield { operationId: null, status: "creating", detail: "" }; });
    const recovery = createProductionBoxRecovery({
      connector: {},
      ...(watch === undefined ? {} : { watch }),
      broadcast: (event) => broadcast.push(event),
      restartCoordinator: () => {},
      updateForeverBox: async () => undefined,
    });
    recovery.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(streamed, 0, "no stream was opened on a local box");
    assert.equal(recovery.readBoxMigrationStatus(), null);
    recovery.ingestMigration({ operationId: null, phase: "moving", detail: "copying the workspace" });
    assert.deepEqual(recovery.readBoxMigrationStatus(), { operationId: null, phase: "moving", detail: "copying the workspace" });
    assert.deepEqual(broadcast, [{ operationId: null, phase: "moving", detail: "copying the workspace" }]);
    recovery.dispose();

    // A remote box still streams.
    const remoteEvents = [];
    const remote = createProductionBoxRecovery({
      connector: {},
      watch: migrationWatchForBoxRuntime("remote", () => async function* () { streamed += 1; yield { operationId: null, status: "done", detail: "" }; }),
      broadcast: (event) => remoteEvents.push(event.phase),
      restartCoordinator: () => {},
      updateForeverBox: async () => undefined,
    });
    remote.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    remote.dispose();
    assert.equal(streamed, 1);
    assert.deepEqual(remoteEvents, ["done"]);

    const services = await readFile(path.join(repoRoot, "source/electron-main/main-production-services.ts"), "utf8");
    assert.match(services, /migrationWatchForBoxRuntime\(requireValue\(settings, "settings"\)\.settingsStore\.getBoxRuntime\(\), \(\) => createSandMigrationWatcher\(backendClientOptions\)\)/);
  } finally {
    await loaded.dispose();
  }
});
