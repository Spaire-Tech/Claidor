import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// `desktop.attachProdBox.*` is exposed by the preload in every build, but
// until 24 September 2026 its two channels had handlers only in a
// development build, so a packaged app's `invoke` rejected with "No
// handler registered for 'sand:attach-prod-box-status'".

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

function fakeIpcMain() {
  const handlers = new Map();
  return { handlers, handle: (channel, listener) => { handlers.set(channel, listener); } };
}

const baseDeps = (ipcMain, isPackaged) => ({
  ipcMain,
  isPackaged,
  env: {},
  skipOnboarding: () => {},
  exitForDevRestart: () => { throw new Error("must not restart"); },
  legs: { listAgents: async () => [], createAgent: async () => ({}), deleteAgents: async () => ({}), getConversationOutline: async () => ({}), getSubagents: async () => ({}) },
  reloadMainWindow: () => {},
  isGatewayOfflineInduced: () => false,
  applyGatewayOffline: async () => undefined,
  clearHasSeenOnboarding: () => {},
  emitForceOnboarding: () => {},
  themeController: { getState: () => ({}), setPreference: () => ({}) },
  broadcast: () => {},
  emitDevBoxRebuild: () => {},
});

test("a packaged build answers both attach-prod-box channels instead of leaving them unhandled", async () => {
  const loaded = await loadModule("source/electron-main/dev/dev-wiring.ts", "dev-wiring");
  try {
    const { registerDevWiring, registerPackagedAttachProdBoxHandlers, PACKAGED_ATTACH_PROD_BOX_STATUS, PACKAGED_ATTACH_PROD_BOX_SET_RESULT } = loaded.module;
    const ipcMain = fakeIpcMain();
    registerDevWiring(baseDeps(ipcMain, true));
    assert.ok(ipcMain.handlers.has("sand:attach-prod-box-status"));
    assert.ok(ipcMain.handlers.has("sand:attach-prod-box-set-enabled"));
    assert.deepEqual(await ipcMain.handlers.get("sand:attach-prod-box-status")({}), { enabled: false, available: false });
    assert.deepEqual(await ipcMain.handlers.get("sand:attach-prod-box-set-enabled")({}, { enabled: true, isRestartMainApp: true }), { ok: false });
    assert.deepEqual(PACKAGED_ATTACH_PROD_BOX_STATUS, { enabled: false, available: false });
    assert.deepEqual(PACKAGED_ATTACH_PROD_BOX_SET_RESULT, { ok: false });
    // No dev-only channel and no dev control server came with them.
    assert.equal(ipcMain.handlers.has("sand:dev-skip-onboarding"), false);
    assert.equal(ipcMain.handlers.has("sand:dev-restart"), false);

    const alone = fakeIpcMain();
    registerPackagedAttachProdBoxHandlers(alone);
    assert.deepEqual([...alone.handlers.keys()], ["sand:attach-prod-box-status", "sand:attach-prod-box-set-enabled"]);

    // The preload still exposes the same two calls in every build.
    const preload = await readFile(path.join(repoRoot, "source/electron-preload/preload.ts"), "utf8");
    assert.match(preload, /desktop\.attachProdBox = \{/);
    assert.match(preload, /ipc\.invoke\("sand:attach-prod-box-status"\)/);
    assert.match(preload, /ipc\.invoke\("sand:attach-prod-box-set-enabled"/);
  } finally {
    await loaded.dispose();
  }
});
