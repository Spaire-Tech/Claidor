import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { before, after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let SandOsNotificationManager;
let temporary;

before(async () => {
  temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-os-notification-"));
  const output = path.join(temporary, "manager.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/electron-main/notifications/os-notification-manager.ts")],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    logLevel: "silent",
  });
  ({ SandOsNotificationManager } = await import(`${pathToFileURL(output).href}?${Date.now()}`));
});

after(async () => {
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

test("an agent event after the main window was closed does not throw 'Object has been destroyed'", () => {
  // Electron's BrowserWindow after close(): isDestroyed() is the only safe call.
  const destroyed = {
    isDestroyed: () => true,
    isFocused() { throw new TypeError("Object has been destroyed"); },
    isMinimized() { throw new TypeError("Object has been destroyed"); },
    restore() {}, show() {}, focus() {},
  };
  const shown = [];
  const manager = new SandOsNotificationManager({
    getWindow: () => destroyed,
    isSupported: () => true,
    createNotification: (options) => {
      const n = { on() {}, once() {}, show() { shown.push(options.title); }, close() {} };
      return n;
    },
    openAgent() {},
  });
  // Agent has no notifyOnUpdatesEnabled and no lastMessageId — no notification expected.
  const agent = { id: "agent-1", name: "Perrin", isRunning: true, awaitingUserResponse: null, lastActivityAt: 0 };
  manager.seedBaseline([agent]);
  manager.handleAgentsEvent({ agents: [{ ...agent, isRunning: false }] });
  manager.handleAgentUpsertedEvent({ agent: { ...agent, isRunning: true } });
  manager.handleAgentUpsertedEvent({ agent: { ...agent, isRunning: false } });
  assert.deepEqual(shown, [], "no window, no notification, no crash");
});

test("OS notification fires via handleAgentsEvent when the main window is null (closed on macOS)", () => {
  // Bug: handleAgentsEvent used to return early on null window, suppressing both
  // state updates and notifications. A closed window means the user is NOT looking
  // at the app, so notifications should fire just like the unfocused-window case.
  const shown = [];
  const manager = new SandOsNotificationManager({
    getWindow: () => null,
    isSupported: () => true,
    createNotification: (options) => {
      const n = { on() {}, once() {}, show() { shown.push(options.title); }, close() {} };
      return n;
    },
    openAgent() {},
    now: () => 10_000,
  });
  const agent = {
    id: "agent-1",
    name: "Perrin",
    isRunning: true,
    notifyOnUpdatesEnabled: true,
    lastMessageId: "msg-1",
    lastMessagePreview: "All done.",
  };
  manager.seedBaseline([agent]);
  // Agent finishes and produces a new message while no window is open.
  manager.handleAgentsEvent({ agents: [{ ...agent, isRunning: false, lastMessageId: "msg-2" }] });
  assert.deepEqual(shown, ["Perrin"], "OS notification fires even when the window is null");
});

test("OS notification fires via handleAgentUpsertedEvent when the main window is null", () => {
  // Bug: processDelta used to fall back to observeAgent (state-only, no notification)
  // when the window was null. An agent asking for input while the window is closed
  // should still send an OS notification.
  const shown = [];
  const manager = new SandOsNotificationManager({
    getWindow: () => null,
    isSupported: () => true,
    createNotification: (options) => {
      const n = { on() {}, once() {}, show() { shown.push(options.title); }, close() {} };
      return n;
    },
    openAgent() {},
    now: () => 10_000,
  });
  const agent = {
    id: "agent-1",
    name: "Perrin",
    isRunning: true,
    notifyOnUpdatesEnabled: true,
    lastMessageId: "msg-1",
  };
  manager.seedBaseline([agent]);
  // Upserted event: agent now needs input while no window is open.
  manager.handleAgentUpsertedEvent({ agent: { ...agent, awaitingUserResponse: { reason: "Confirm?" } } });
  assert.deepEqual(shown, ["Perrin needs you"], "OS notification fires for needs-input when window is null");
});
