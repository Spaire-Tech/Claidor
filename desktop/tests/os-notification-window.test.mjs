import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("an agent event after the main window was closed does not throw 'Object has been destroyed'", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-os-notification-"));
  try {
    const output = path.join(temporary, "manager.mjs");
    await build({ entryPoints: [path.join(repoRoot, "source/electron-main/notifications/os-notification-manager.ts")], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
    const { SandOsNotificationManager } = await import(`${pathToFileURL(output).href}?${Date.now()}`);
    // Electron's BrowserWindow after close(): isDestroyed() is the only safe call.
    const destroyed = { isDestroyed: () => true, isFocused() { throw new TypeError("Object has been destroyed"); }, isMinimized() { throw new TypeError("Object has been destroyed"); }, restore() {}, show() {}, focus() {} };
    const shown = [];
    const manager = new SandOsNotificationManager({
      getWindow: () => destroyed,
      isSupported: () => true,
      createNotification: (options) => { const n = { on() {}, once() {}, show() { shown.push(options.title); }, close() {} }; return n; },
      openAgent() {},
    });
    const agent = { id: "agent-1", name: "Perrin", isRunning: true, awaitingUserResponse: null, lastActivityAt: 0 };
    manager.seedBaseline([agent]);
    manager.handleAgentsEvent({ agents: [{ ...agent, isRunning: false }] });
    manager.handleAgentUpsertedEvent({ agent: { ...agent, isRunning: true } });
    manager.handleAgentUpsertedEvent({ agent: { ...agent, isRunning: false } });
    assert.deepEqual(shown, [], "no window, no notification, no crash");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
