import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";
import { createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";

// 5 October 2026, Track D piece 3: our box exec daemon answers the Computer
// tool itself (`source/box-exec-daemon/computer-use.ts`): xdotool for the
// input, ImageMagick for a WebP screenshot, on the daemon's DISPLAY. The
// wire test below needs Xvfb, xdotool, import and xdpyinfo on the machine
// and skips without them; the mapping tests always run.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

function hasProgram(name) {
  return spawnSync("sh", ["-c", `command -v ${name}`], { stdio: "ignore" }).status === 0;
}

const desktopToolsPresent = ["Xvfb", "xdotool", "import", "xdpyinfo"].every(hasProgram);

test("key chords are spelled the way xdotool takes them", async () => {
  const loaded = await loadModule("source/box-exec-daemon/computer-use.ts", "computer-use");
  try {
    const { xdotoolKeyChord, xdotoolModifiers, mouseButtonNumber, scrollButtonNumber, MouseButton, ScrollDirection } = loaded.module;
    assert.equal(xdotoolKeyChord("Ctrl+l"), "ctrl+l");
    assert.equal(xdotoolKeyChord("cmd+shift+T"), "super+shift+T");
    assert.equal(xdotoolKeyChord("Return"), "Return");
    assert.equal(xdotoolKeyChord("enter"), "Return");
    assert.equal(xdotoolKeyChord("Escape"), "Escape");
    assert.equal(xdotoolKeyChord("Page_Down"), "Page_Down");
    assert.equal(xdotoolKeyChord("pagedown"), "Page_Down");
    assert.equal(xdotoolKeyChord("/"), "slash");
    assert.equal(xdotoolKeyChord(","), "comma");
    assert.equal(xdotoolKeyChord("+"), "plus");
    assert.equal(xdotoolKeyChord("ctrl++"), "ctrl+plus");
    assert.equal(xdotoolKeyChord("f5"), "F5");
    assert.equal(xdotoolKeyChord("alt+F4"), "alt+F4");
    assert.equal(xdotoolKeyChord("XF86AudioPlay"), "XF86AudioPlay");
    assert.throws(() => xdotoolKeyChord("  "), /needs a key/);
    assert.deepEqual(xdotoolModifiers("ctrl+shift"), ["ctrl", "shift"]);
    assert.deepEqual(xdotoolModifiers("cmd, alt"), ["super", "alt"]);
    assert.deepEqual(xdotoolModifiers(undefined), []);
    assert.equal(mouseButtonNumber(MouseButton.LEFT), 1);
    assert.equal(mouseButtonNumber(MouseButton.MIDDLE), 2);
    assert.equal(mouseButtonNumber(MouseButton.RIGHT), 3);
    assert.equal(mouseButtonNumber(MouseButton.BACK), 8);
    assert.equal(mouseButtonNumber(MouseButton.FORWARD), 9);
    assert.equal(mouseButtonNumber(MouseButton.UNSPECIFIED), 1);
    assert.equal(scrollButtonNumber(ScrollDirection.UP), 4);
    assert.equal(scrollButtonNumber(ScrollDirection.DOWN), 5);
    assert.equal(scrollButtonNumber(ScrollDirection.LEFT), 6);
    assert.equal(scrollButtonNumber(ScrollDirection.RIGHT), 7);
  } finally {
    await loaded.dispose();
  }
});

test("without a display the daemon says computer use is unsupported and answers the message with an error", async () => {
  const loaded = await loadModule("source/box-exec-daemon/server.ts", "box-exec-daemon-no-display");
  const control = await loadModule("source/packages/proto/generated/agent/v1/control_service_connect.ts", "control-service");
  const exec = await loadModule("source/packages/proto/generated/agent/v1/exec_service_connect.ts", "exec-service");
  const messages = await loadModule("source/packages/proto/generated/agent/v1/exec_pb.ts", "exec-messages");
  const workspace = await mkdtemp(path.join(os.tmpdir(), "simeon-box-workspace-"));
  const environment = { ...process.env };
  delete environment.DISPLAY;
  const daemon = await loaded.module.startBoxExecDaemon({ port: 0, workspaceRoot: workspace, environment });
  try {
    const transport = createConnectTransport({ baseUrl: daemon.url, httpVersion: "1.1", interceptors: [next => request => { request.header.set("authorization", "Bearer local"); return next(request); }] });
    const capabilities = await createPromiseClient(control.module.ControlService, transport).getCapabilities({});
    assert.equal(capabilities.computerUseSupported, false);
    const execClient = createPromiseClient(exec.module.ExecService, transport);
    const request = new messages.module.ExecServerMessage({ id: 1, execId: "cu-1", message: { case: "computerUseArgs", value: { toolCallId: "t1", actions: [{ action: { case: "screenshot", value: {} } }] } } });
    const elements = [];
    for await (const element of execClient.exec(request)) elements.push(element);
    const result = elements.find(element => element.element.case === "execClientMessage");
    assert.ok(result, "a client message came back");
    assert.equal(result.element.value.message.case, "computerUseResult");
    assert.equal(result.element.value.message.value.result.case, "error");
    assert.match(result.element.value.message.value.result.value.error, /No display/);
    assert.equal(elements.at(-1).element.value.message.case, "streamClose");
  } finally {
    await daemon.stop();
    await rm(workspace, { recursive: true, force: true });
    await Promise.all([loaded.dispose(), control.dispose(), exec.dispose(), messages.dispose()]);
  }
});

test("on a display the daemon moves the mouse, types, reads the cursor and returns a WebP screenshot", { skip: desktopToolsPresent ? false : "needs Xvfb, xdotool, import and xdpyinfo" }, async () => {
  const displayNumber = 90 + Math.floor(Math.random() * 100);
  const display = `:${displayNumber}`;
  // -noreset as the box starts it: without it Xvfb forgets the pointer (and
  // everything else) each time its last client disconnects, and every xdotool
  // call is a client of its own.
  const xvfb = spawn("Xvfb", [display, "-screen", "0", "640x480x24", "-ac", "-noreset", "-nolisten", "tcp"], { stdio: "ignore" });
  const ready = async () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (spawnSync("xdpyinfo", ["-display", display], { stdio: "ignore" }).status === 0) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Xvfb did not answer on ${display}`);
  };
  const loaded = await loadModule("source/box-exec-daemon/server.ts", "box-exec-daemon-display");
  const control = await loadModule("source/packages/proto/generated/agent/v1/control_service_connect.ts", "control-service-display");
  const exec = await loadModule("source/packages/proto/generated/agent/v1/exec_service_connect.ts", "exec-service-display");
  const messages = await loadModule("source/packages/proto/generated/agent/v1/exec_pb.ts", "exec-messages-display");
  const workspace = await mkdtemp(path.join(os.tmpdir(), "simeon-box-workspace-"));
  let daemon;
  try {
    await ready();
    daemon = await loaded.module.startBoxExecDaemon({ port: 0, workspaceRoot: workspace, environment: { ...process.env, DISPLAY: display } });
    const transport = createConnectTransport({ baseUrl: daemon.url, httpVersion: "1.1", interceptors: [next => request => { request.header.set("authorization", "Bearer local"); return next(request); }] });
    const capabilities = await createPromiseClient(control.module.ControlService, transport).getCapabilities({});
    assert.equal(capabilities.computerUseSupported, true);
    const execClient = createPromiseClient(exec.module.ExecService, transport);
    const actions = [
      { action: { case: "mouseMove", value: { coordinate: { x: 123, y: 45 } } } },
      { action: { case: "click", value: { coordinate: { x: 200, y: 100 }, button: 1, count: 2 } } },
      { action: { case: "scroll", value: { direction: 2, amount: 2 } } },
      { action: { case: "drag", value: { path: [{ x: 10, y: 10 }, { x: 30, y: 40 }], button: 1 } } },
      { action: { case: "type", value: { text: "héllo, wörld" } } },
      { action: { case: "key", value: { key: "Ctrl+l" } } },
      { action: { case: "key", value: { key: "shift", holdDurationMs: 20 } } },
      { action: { case: "wait", value: { durationMs: 10 } } },
      { action: { case: "mouseMove", value: { coordinate: { x: 321, y: 234 } } } },
      { action: { case: "cursorPosition", value: {} } },
      { action: { case: "screenshot", value: {} } },
    ];
    const request = new messages.module.ExecServerMessage({ id: 7, execId: "cu-7", message: { case: "computerUseArgs", value: { toolCallId: "t7", actions } } });
    const elements = [];
    for await (const element of execClient.exec(request)) elements.push(element);
    const reply = elements.find(element => element.element.case === "execClientMessage");
    assert.ok(reply, "a client message came back");
    assert.equal(reply.element.value.message.case, "computerUseResult");
    const result = reply.element.value.message.value.result;
    assert.equal(result.case, "success", result.case === "error" ? result.value.error : "");
    assert.equal(result.value.actionCount, actions.length);
    assert.deepEqual({ x: result.value.cursorPosition.x, y: result.value.cursorPosition.y }, { x: 321, y: 234 });
    const screenshot = Buffer.from(result.value.screenshot, "base64");
    assert.equal(screenshot.toString("latin1", 0, 4), "RIFF");
    assert.equal(screenshot.toString("latin1", 8, 12), "WEBP");
    assert.match(result.value.log, /^1\. move to \(123, 45\)/m);
    assert.match(result.value.log, /key Ctrl\+l — sent as ctrl\+l/);
    assert.ok(reply.element.value.localExecutionTimeMs >= 0);

    // A chord xdotool cannot press is reported, not swallowed, and a last look comes with it.
    const bad = new messages.module.ExecServerMessage({ id: 8, execId: "cu-8", message: { case: "computerUseArgs", value: { toolCallId: "t8", actions: [{ action: { case: "mouseMove", value: {} } }] } } });
    const badElements = [];
    for await (const element of execClient.exec(bad)) badElements.push(element);
    const badResult = badElements.find(element => element.element.case === "execClientMessage").element.value.message.value.result;
    assert.equal(badResult.case, "error");
    assert.match(badResult.value.error, /needs coordinates/);
    assert.equal(badResult.value.actionCount, 0);
    assert.ok(badResult.value.screenshot.length > 0, "the error carries a screenshot");
  } finally {
    await daemon?.stop();
    xvfb.kill("SIGTERM");
    await rm(workspace, { recursive: true, force: true });
    await Promise.all([loaded.dispose(), control.dispose(), exec.dispose(), messages.dispose()]);
  }
});
