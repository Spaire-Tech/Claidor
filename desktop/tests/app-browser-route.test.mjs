/**
 * The browser in the app, step 1 (docs/app-browser/README.md, 4 November
 * 2026): the engine's second route for the agent's browser steps, tested
 * with a stand-in app.
 *
 * The bridge: the welcome, the hello it takes and the ones it refuses, the
 * switch, a live app, pings and a quiet app, a step's request and answer,
 * an answer from another stream ignored, a stream that drops mid-step, a
 * deadline, a cancelled turn. A task stays where it started: on the
 * computer until it has been idle and a step opens an address; on the app
 * while its browser is there, waiting briefly for a dropped stream; when it
 * closed, one plain sentence and the computer for the next steps, unless
 * the step opens an address. The tools: the same text as the computer's
 * helper for the same answer, the picture, OpenPage, the switch off taking
 * today's route untouched, uploads read from the computer with its checks,
 * Auto-review reading the app's pages (and refusing when it can't). The
 * gateway's two paths, behind its token. The extension's switch and its
 * place in the host.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const SESSION = "browser-session-aaaa1111";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeClock(start = 1_000_000) {
  const clock = { t: start, now: () => clock.t, monotonicNow: () => clock.t, schedule: () => ({ dispose() {} }) };
  return clock;
}

/** An app with a browser, as the bridge sees it: its stream, its hello, and its answers. */
function standInApp(bridge, { platform = "mac", session = SESSION, answer, hello = {} } = {}) {
  const frames = [];
  let providerId;
  const close = bridge.registerProvider((frame) => {
    frames.push(frame);
    if (frame.kind === "welcome") providerId = frame.providerId;
    if (frame.kind === "request" && answer !== undefined) {
      queueMicrotask(async () => {
        const reply = await answer(frame);
        if (reply !== undefined) bridge.submitResponses({ providerId, frames: [{ kind: "response", requestId: frame.requestId, ...reply }] });
      });
    }
  });
  bridge.submitResponses({ providerId, frames: [{ kind: "hello", protocol: 1, browser: true, platform, label: "Test Mac", deviceId: "device-1", browserSession: session, ...hello }] });
  return {
    frames,
    requests: () => frames.filter((frame) => frame.kind === "request"),
    get providerId() { return providerId; },
    close,
    ping: () => bridge.submitResponses({ providerId, frames: [{ kind: "ping" }] }),
  };
}

const PNG_B64 = Buffer.from("png-bytes").toString("base64");

/** The computer's side for the tools: the helper's answer through the shell, and what was asked of it. */
function computer(driverAnswer, { files = {} } = {}) {
  const calls = [];
  return {
    calls,
    shells: () => calls.filter((call) => call[0] === "shell").map((call) => call[1]),
    deps: {
      resourceAccessor: { get() { throw new Error("no resources in this test"); } },
      getWindowIndex: async () => { calls.push(["window"]); return 1; },
      getBoxId: () => "box-1",
      getDefaultViewId: () => "agent-1",
      uploadFile: async () => { calls.push(["upload"]); },
      downloadFile: async (_context, _box, file) => {
        calls.push(["download", file]);
        if (file.endsWith(".png")) return Buffer.from("png-bytes");
        if (files[file] !== undefined) return files[file];
        throw new Error(`no file ${file}`);
      },
      executeShell: async (_context, input) => {
        calls.push(["shell", input.command]);
        if (input.command.startsWith("test -s")) return { case: "success", stdout: "present\n" };
        if (input.command.startsWith("node ")) return { case: "success", stdout: `\n__SAND_BROWSER_RESULT__${JSON.stringify(driverAnswer)}\n` };
        if (input.command.startsWith("root=$(realpath")) {
          const lines = ["__ROOT__/workspace"];
          for (const [, quoted] of input.command.matchAll(/'([^']*)'/g)) {
            if (quoted === "__ROOT__%s\\n" || quoted.startsWith("__")) continue;
            if (quoted.endsWith("/")) lines.push("__FOLDER__");
            else if (quoted.startsWith("/etc/")) lines.push(`__FILE__${quoted}`);
            else if (files[quoted] !== undefined) lines.push(`__FILE__${quoted}`);
            else lines.push("__MISSING__");
          }
          return { case: "success", stdout: `${lines.join("\n")}\n` };
        }
        return { case: "success", stdout: "" };
      },
    },
  };
}

test("the welcome says the protocol and the switch; a hello without a browser, a session or our protocol is not used", async () => {
  const { module, dispose } = await load("source/host/extensions/local-browser/local-browser-bridge.ts", "lb-hello");
  try {
    for (const enabled of [true, false]) {
      const bridge = new module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => enabled, reconnectGraceMs: 0 });
      const app = standInApp(bridge);
      assert.deepEqual(app.frames[0], { kind: "welcome", providerId: app.providerId, protocol: 1, enabled });
    }
    const refused = [
      { protocol: 2 },
      { browser: false },
      { platform: "linux" },
      { browserSession: "short" },
      { browserSession: "has spaces in it" },
    ];
    for (const hello of refused) {
      const reports = [];
      const bridge = new module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => true, reconnectGraceMs: 0, report: (entry) => reports.push(entry) });
      standInApp(bridge, { hello });
      assert.deepEqual(await bridge.choose("agent-1", { opensAddress: true }), { route: "box" }, JSON.stringify(hello));
      assert.ok(reports.some((entry) => entry.event === "refused-hello"), JSON.stringify(hello));
    }
  } finally { await dispose(); }
});

test("the switch off, or no app, keeps every step on the computer; with both, a new task goes to the app", async () => {
  const { module, dispose } = await load("source/host/extensions/local-browser/local-browser-bridge.ts", "lb-switch");
  try {
    const off = new module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => false, reconnectGraceMs: 0 });
    standInApp(off);
    assert.deepEqual(await off.choose("agent-1", { opensAddress: true }), { route: "box" });

    const none = new module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => true, reconnectGraceMs: 0 });
    assert.deepEqual(await none.choose("agent-1", { opensAddress: true }), { route: "box" });

    const on = new module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => true, reconnectGraceMs: 0 });
    standInApp(on, { platform: "windows" });
    assert.deepEqual(await on.choose("agent-1", { opensAddress: true }), { route: "app", browserSession: SESSION, place: "this PC" });
  } finally { await dispose(); }
});

test("an app that pinged and went quiet for thirty seconds is not live", async () => {
  const { module, dispose } = await load("source/host/extensions/local-browser/local-browser-bridge.ts", "lb-liveness");
  try {
    const clock = fakeClock();
    const bridge = new module.LocalBrowserBridge({ clock, enabled: () => true, reconnectGraceMs: 0 });
    const app = standInApp(bridge);
    app.ping();
    clock.t += 29_000;
    assert.equal((await bridge.choose("agent-1", { opensAddress: true })).route, "app");
    clock.t += 31_000;
    assert.equal((await bridge.choose("agent-2", { opensAddress: true })).route, "box", "a new task does not go to a quiet app");
    const choice = await bridge.choose("agent-1", { opensAddress: false });
    assert.equal(choice.route, "gone", "the task in it is told its browser closed");
    assert.match(choice.message, /The browser on this Mac closed/);
  } finally { await dispose(); }
});

test("a step goes as one request and comes back as its answer; an answer from another stream is ignored", async () => {
  const { module, dispose } = await load("source/host/extensions/local-browser/local-browser-bridge.ts", "lb-request");
  try {
    const bridge = new module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => true, reconnectGraceMs: 0, randomId: (() => { let n = 0; return () => `id-${++n}`; })() });
    const app = standInApp(bridge);
    const other = standInApp(bridge, { session: "browser-session-bbbb2222" });
    const choice = await bridge.choose("agent-1", { opensAddress: true });
    assert.equal(choice.browserSession, "browser-session-bbbb2222", "a new task goes to the app heard from last");
    const pending = bridge.request(choice, { op: "snapshot", viewId: "agent-1", args: { depth: 3 }, screenshot: true }, { timeoutMs: 5_000 });
    const [sent] = other.requests();
    assert.deepEqual(sent, { kind: "request", requestId: sent.requestId, protocol: 1, deadlineMs: 5_000, op: "snapshot", viewId: "agent-1", args: { depth: 3 }, screenshot: true });
    assert.equal(app.requests().length, 0);
    bridge.submitResponses({ providerId: app.providerId, frames: [{ kind: "response", requestId: sent.requestId, ok: true, summary: "wrong stream" }] });
    bridge.submitResponses({ frames: [{ kind: "response", requestId: sent.requestId, ok: true, summary: "no stream named" }] });
    bridge.submitResponses({ providerId: other.providerId, frames: [{ kind: "response", requestId: sent.requestId, ok: true, summary: "Snapshot taken" }] });
    const answer = await pending;
    assert.equal(answer.summary, "Snapshot taken");
  } finally { await dispose(); }
});

test("a stream that drops mid-step fails the step; a deadline cancels it; a cancelled turn cancels it", async () => {
  const { module, dispose } = await load("source/host/extensions/local-browser/local-browser-bridge.ts", "lb-failures");
  try {
    const bridge = new module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => true, reconnectGraceMs: 0 });
    const app = standInApp(bridge);
    const choice = await bridge.choose("agent-1", { opensAddress: true });
    const dropped = bridge.request(choice, { op: "click", viewId: "agent-1", args: {}, screenshot: true }, { timeoutMs: 5_000 });
    app.close();
    await assert.rejects(dropped, /The browser on this Mac stopped answering; try the step again\./);

    const bridge2 = new module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => true, reconnectGraceMs: 0 });
    const app2 = standInApp(bridge2);
    const choice2 = await bridge2.choose("agent-1", { opensAddress: true });
    await assert.rejects(bridge2.request(choice2, { op: "click", viewId: "agent-1", args: {}, screenshot: true }, { timeoutMs: 40 }), /didn't answer within 0 seconds|didn't answer within/);
    const [timedOut] = app2.requests();
    assert.ok(app2.frames.some((frame) => frame.kind === "cancel" && frame.requestId === timedOut.requestId), "the app is told to stop");

    const controller = new AbortController();
    const cancelled = bridge2.request(choice2, { op: "click", viewId: "agent-1", args: {}, screenshot: true }, { timeoutMs: 5_000, signal: controller.signal });
    controller.abort();
    await assert.rejects(cancelled, (error) => error.name === "AbortError");
    const last = app2.requests().at(-1);
    assert.ok(app2.frames.some((frame) => frame.kind === "cancel" && frame.requestId === last.requestId));
  } finally { await dispose(); }
});

test("a task stays where it started: the computer's until idle and an address, the app's while it is there", async () => {
  const { module, dispose } = await load("source/host/extensions/local-browser/local-browser-bridge.ts", "lb-sticky");
  try {
    const clock = fakeClock();
    const bridge = new module.LocalBrowserBridge({ clock, enabled: () => true, reconnectGraceMs: 0, taskIdleMs: 600_000 });
    assert.deepEqual(await bridge.choose("agent-1", { opensAddress: true }), { route: "box" }, "no app yet: the computer");
    standInApp(bridge);
    assert.deepEqual(await bridge.choose("agent-1", { opensAddress: false }), { route: "box" }, "the app came: the task stays");
    assert.deepEqual(await bridge.choose("agent-1", { opensAddress: true }), { route: "box" }, "an address in the same task stays too");
    clock.t += 600_001;
    assert.deepEqual(await bridge.choose("agent-1", { opensAddress: false }), { route: "box" }, "idle, but this step reads the page it has");
    clock.t += 600_001;
    assert.equal((await bridge.choose("agent-1", { opensAddress: true })).route, "app", "idle and a new address: a new task, in the app");
    clock.t += 3 * 600_000;
    assert.equal((await bridge.choose("agent-1", { opensAddress: false })).route, "app", "the app's task holds while its browser is there");
  } finally { await dispose(); }
});

test("where a task is now (step 3, the cards): its app while that browser is connected, never a new choice", async () => {
  const { module, dispose } = await load("source/host/extensions/local-browser/local-browser-bridge.ts", "lb-where");
  try {
    const reports = [];
    const bridge = new module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => true, reconnectGraceMs: 0, report: (entry) => reports.push(entry) });
    const app = standInApp(bridge);
    assert.equal(bridge.where("agent-1"), undefined, "no task yet: the computer's, as before");
    assert.equal(reports.filter((entry) => entry.event === "route").length, 0, "and nothing was chosen for it");
    assert.equal((await bridge.choose("agent-1", { opensAddress: true })).route, "app");
    assert.deepEqual(bridge.where("agent-1"), { route: "app", browserSession: SESSION, place: "this Mac" });
    assert.equal(bridge.where("agent-2"), undefined, "another agent's task is its own");
    app.close();
    assert.equal(bridge.where("agent-1"), undefined, "the app gone: no tab of it to act on");
    assert.equal((await bridge.choose("agent-1", { opensAddress: false })).route, "gone", "where changed nothing: the next step is still told");
  } finally { await dispose(); }
});

test("the app's browser closed: one plain sentence, then the computer; an address starts afresh; a dropped stream is waited for", async () => {
  const { module, dispose } = await load("source/host/extensions/local-browser/local-browser-bridge.ts", "lb-closed");
  try {
    const bridge = new module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => true, reconnectGraceMs: 0 });
    const app = standInApp(bridge);
    assert.equal((await bridge.choose("agent-1", { opensAddress: true })).route, "app");
    app.close();
    const gone = await bridge.choose("agent-1", { opensAddress: false });
    assert.deepEqual(gone, { route: "gone", message: "The browser on this Mac closed, and its pages with it. The next steps use the browser on your own computer: start again from the address." });
    assert.deepEqual(await bridge.choose("agent-1", { opensAddress: false }), { route: "box" }, "the next step goes to the computer");
    assert.deepEqual(await bridge.choose("agent-1", { opensAddress: true }), { route: "box" }, "and stays there");

    const second = standInApp(bridge, { session: "browser-session-cccc3333" });
    assert.equal((await bridge.choose("agent-2", { opensAddress: true })).browserSession, "browser-session-cccc3333");
    second.close();
    const reopened = standInApp(bridge, { session: "browser-session-dddd4444" });
    assert.deepEqual(await bridge.choose("agent-2", { opensAddress: true }), { route: "app", browserSession: "browser-session-dddd4444", place: "this Mac" }, "a step that opens an address starts afresh, in the app open now");
    reopened.close();

    const graceful = new module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => true, reconnectGraceMs: 2_000 });
    const first = standInApp(graceful);
    assert.equal((await graceful.choose("agent-1", { opensAddress: true })).route, "app");
    first.close();
    const waiting = graceful.choose("agent-1", { opensAddress: false });
    await sleep(30);
    standInApp(graceful);
    assert.equal((await waiting).route, "app", "the same browser back on a new stream: the task goes on");
  } finally { await dispose(); }
});

test("the tools send a step to the app and write its answer as the computer's helper's", async () => {
  const tools = await load("source/host/runner/tools/sand-browser-tools.ts", "lb-tools");
  const lb = await load("source/host/extensions/local-browser/local-browser-bridge.ts", "lb-tools-bridge");
  try {
    const helperAnswer = { ok: true, summary: "Snapshot of the page", url: "https://example.com/", title: "Example", data: "- button \"Buy\" [ref=e3]", viewId: "agent-1", screenshot: true };

    // Today's route: the computer's helper.
    const box = computer(helperAnswer);
    const boxTools = Object.fromEntries(tools.module.createSandBrowserTools(box.deps).map((tool) => [tool.name, tool]));
    const fromBox = await boxTools.browser_snapshot.execute({}, {}, { toolCallId: "t1" });

    // The app's route, with the same answer from the stand-in app.
    const bridge = new lb.module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => true, reconnectGraceMs: 0 });
    const app = standInApp(bridge, { answer: () => ({ ...helperAnswer, screenshotB64: PNG_B64 }) });
    const pictures = [];
    const viaApp = computer({ ok: false, error: "the computer must not be used" });
    const appTools = Object.fromEntries(tools.module.createSandBrowserTools({ ...viaApp.deps, appBrowser: bridge, getPersistImage: () => async (bytes, mime) => { pictures.push([Buffer.from(bytes).toString(), mime]); } }).map((tool) => [tool.name, tool]));
    const fromApp = await appTools.browser_snapshot.execute({}, {}, { toolCallId: "t2" });

    assert.equal(fromApp.text, fromBox.text, "the same words");
    assert.equal(fromApp.imageB64, PNG_B64, "the app's picture");
    assert.equal(fromBox.imageB64, PNG_B64);
    assert.deepEqual(pictures, [["png-bytes", "image/png"]], "kept like the computer's");
    assert.equal(appTools.browser_snapshot.render(fromApp).kind, "image");
    assert.deepEqual(viaApp.calls, [], "nothing ran on the computer");
    const [request] = app.requests();
    assert.equal(request.op, "snapshot");
    assert.equal(request.viewId, "agent-1");
    assert.equal(request.screenshot, true);
    assert.deepEqual(request.args, {});

    // A failure reads as the helper's does.
    const bridge3 = new lb.module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => true, reconnectGraceMs: 0 });
    const failing = standInApp(bridge3, { answer: () => ({ ok: false, error: "Ref e9 is not on the page; take a fresh browser_snapshot." }) });
    const failTools = Object.fromEntries(tools.module.createSandBrowserTools({ ...computer({}).deps, appBrowser: bridge3 }).map((tool) => [tool.name, tool]));
    assert.deepEqual(await failTools.browser_type.execute({}, { ref: "e9", text: "hi" }, { toolCallId: "t3" }), { text: "Ref e9 is not on the page; take a fresh browser_snapshot.", isError: true });
    // A step that takes no picture on the computer asks the app for none.
    await failTools.browser_tabs.execute({}, { action: "list" }, { toolCallId: "t4" });
    assert.deepEqual(failing.requests().map((frame) => [frame.op, frame.screenshot]), [["type", true], ["tabs", false]]);
  } finally { await Promise.all([tools.dispose(), lb.dispose()]); }
});

test("OpenPage goes to the app in front; with the switch off every step takes today's route", async () => {
  const tools = await load("source/host/runner/tools/sand-browser-tools.ts", "lb-openpage");
  const lb = await load("source/host/extensions/local-browser/local-browser-bridge.ts", "lb-openpage-bridge");
  try {
    const bridge = new lb.module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => true, reconnectGraceMs: 0 });
    const app = standInApp(bridge, { answer: () => ({ ok: true, summary: "Opened https://appleid.apple.com/", url: "https://appleid.apple.com/", title: "Apple Account" }) });
    const viaApp = computer({});
    const openPage = tools.module.createSandOpenPageTool({ ...viaApp.deps, appBrowser: bridge });
    const opened = await openPage.execute({}, { url: "https://appleid.apple.com/" }, { toolCallId: "o1" });
    assert.match(opened.text, /^Opened https:\/\/appleid\.apple\.com\/\n\nCurrent page: Apple Account \(https:\/\/appleid\.apple\.com\/\)\n\nThe page is open in front/);
    const [request] = app.requests();
    assert.deepEqual({ op: request.op, args: request.args, screenshot: request.screenshot }, { op: "navigate", args: { url: "https://appleid.apple.com/", front: true }, screenshot: false });
    assert.deepEqual(viaApp.calls, []);

    const off = new lb.module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => false, reconnectGraceMs: 0 });
    const ignored = standInApp(off, { answer: () => ({ ok: true, summary: "must not be used" }) });
    const box = computer({ ok: true, summary: "Navigated", url: "https://example.com/", title: "Example", screenshot: true });
    const boxTools = Object.fromEntries(tools.module.createSandBrowserTools({ ...box.deps, appBrowser: off }).map((tool) => [tool.name, tool]));
    const navigated = await boxTools.browser_navigate.execute({}, { url: "https://example.com/" }, { toolCallId: "n1" });
    assert.equal(navigated.text, "Navigated\n\nCurrent page: Example (https://example.com/)");
    assert.equal(ignored.requests().length, 0, "the app was sent nothing");
    assert.ok(box.shells().some((command) => command.startsWith("node /tmp/.sand-browser/driver-v2.mjs ")), "the computer's helper ran");
  } finally { await Promise.all([tools.dispose(), lb.dispose()]); }
});

test("the app's browser closing mid-task: the step says so, and the next one runs on the computer", async () => {
  const tools = await load("source/host/runner/tools/sand-browser-tools.ts", "lb-midtask");
  const lb = await load("source/host/extensions/local-browser/local-browser-bridge.ts", "lb-midtask-bridge");
  try {
    const bridge = new lb.module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => true, reconnectGraceMs: 0 });
    const app = standInApp(bridge, { platform: "windows", answer: () => ({ ok: true, summary: "Navigated", url: "https://example.com/", title: "Example" }) });
    const box = computer({ ok: true, summary: "Snapshot of the computer's page", url: "about:blank", title: "" });
    const all = Object.fromEntries(tools.module.createSandBrowserTools({ ...box.deps, appBrowser: bridge }).map((tool) => [tool.name, tool]));
    await all.browser_navigate.execute({}, { url: "https://example.com/" }, { toolCallId: "m1" });
    assert.deepEqual(box.calls, []);
    app.close();
    const failed = await all.browser_snapshot.execute({}, {}, { toolCallId: "m2" });
    assert.deepEqual(failed, { text: "The browser on this PC closed, and its pages with it. The next steps use the browser on your own computer: start again from the address.", isError: true });
    assert.deepEqual(box.calls, [], "the failed step ran nowhere");
    const next = await all.browser_snapshot.execute({}, {}, { toolCallId: "m3" });
    assert.match(next.text, /^Snapshot of the computer's page/);
    assert.ok(box.shells().some((command) => command.startsWith("node ")));
  } finally { await Promise.all([tools.dispose(), lb.dispose()]); }
});

test("an upload in the app sends the files read from the computer, with the helper's checks", async () => {
  const tools = await load("source/host/runner/tools/sand-browser-tools.ts", "lb-upload");
  const lb = await load("source/host/extensions/local-browser/local-browser-bridge.ts", "lb-upload-bridge");
  try {
    const bridge = new lb.module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => true, reconnectGraceMs: 0 });
    const app = standInApp(bridge, { answer: (frame) => ({ ok: true, summary: `Attached ${frame.args.files.map((file) => file.name).join(", ")} to Upload CV` }) });
    const box = computer({}, { files: { "/workspace/uploads/resume.pdf": Buffer.from("%PDF-resume") } });
    const all = Object.fromEntries(tools.module.createSandBrowserTools({ ...box.deps, appBrowser: bridge }).map((tool) => [tool.name, tool]));
    const attached = await all.browser_upload_file.execute({}, { ref: "e4", element: "Upload CV", paths: ["uploads/resume.pdf"] }, { toolCallId: "u1" });
    assert.match(attached.text, /^Attached resume\.pdf to Upload CV/);
    const [request] = app.requests();
    assert.deepEqual(request.args, { ref: "e4", element: "Upload CV", files: [{ name: "resume.pdf", path: "/workspace/uploads/resume.pdf", dataB64: Buffer.from("%PDF-resume").toString("base64") }] });
    assert.equal(request.args.paths, undefined, "the computer's paths are not sent");

    const refusals = [
      [["/etc/passwd"], /Only files in \/workspace can be attached to a page; \/etc\/passwd is outside it/],
      [["/workspace/uploads/missing.pdf"], /No file at \/workspace\/uploads\/missing\.pdf on your computer/],
      [["/workspace/uploads/"], /is a folder, not a file/],
      [[], /browser_upload_file needs paths/],
    ];
    for (const [paths, pattern] of refusals) {
      const output = await all.browser_upload_file.execute({}, { ref: "e4", element: "Upload CV", paths }, { toolCallId: "u2" });
      assert.equal(output.isError, true, JSON.stringify(paths));
      assert.match(output.text, pattern);
    }
    assert.equal(app.requests().length, 1, "a refused upload sends nothing to the app");
  } finally { await Promise.all([tools.dispose(), lb.dispose()]); }
});

test("Auto-review reads the app's pages for a step there, and refuses when it can't", async () => {
  const tools = await load("source/host/runner/tools/sand-browser-tools.ts", "lb-review");
  const lb = await load("source/host/extensions/local-browser/local-browser-bridge.ts", "lb-review-bridge");
  try {
    const bridge = new lb.module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => true, reconnectGraceMs: 0 });
    let state = { ok: true, data: JSON.stringify({ pages: [{ id: "tab-2", url: "https://shop.example/cart" }, { id: "tab-1", url: "https://example.com/" }], viewPageId: "tab-2" }) };
    const app = standInApp(bridge, { answer: (frame) => (frame.op === "review_state" ? state : { ok: true, summary: "Clicked" }) });
    const choice = await bridge.choose("agent-1", { opensAddress: true });
    const read = await tools.module.captureAppBrowserReviewState({ route: bridge, choice, viewId: "agent-1" });
    assert.match(read.displayStateIdentity, /^[0-9a-f]{64}$/);
    assert.equal(read.targetPageUrl, "https://shop.example/cart");
    state = { ok: true, data: JSON.stringify({ pages: [{ id: "tab-1", url: "https://example.com/" }, { id: "tab-2", url: "https://shop.example/cart" }], viewPageId: "tab-2" }) };
    assert.equal((await tools.module.captureAppBrowserReviewState({ route: bridge, choice, viewId: "agent-1" })).displayStateIdentity, read.displayStateIdentity, "the same pages, in any order");
    state = { ok: true, data: JSON.stringify({ pages: [{ id: "tab-1", url: "https://example.com/" }] }) };
    assert.notEqual((await tools.module.captureAppBrowserReviewState({ route: bridge, choice, viewId: "agent-1" })).displayStateIdentity, read.displayStateIdentity, "a page closed changes it");
    for (const [answer, pattern] of [
      [{ ok: false, error: "The browser is starting" }, /could not capture the current page state: The browser is starting/],
      [{ ok: true, data: "not json" }, /sent no list of pages/],
      [{ ok: true, data: JSON.stringify({ tabs: [] }) }, /sent no list of pages/],
    ]) {
      state = answer;
      await assert.rejects(tools.module.captureAppBrowserReviewState({ route: bridge, choice, viewId: "agent-1" }), (error) => error.name === "SandBrowserAutoReviewBlockedError" && pattern.test(error.message));
    }

    // Through the tool, under review: the app is asked for its pages, not the computer.
    state = { ok: false, error: "no pages yet" };
    const box = computer({});
    const reviewed = Object.fromEntries(tools.module.createSandBrowserTools({
      ...box.deps,
      appBrowser: bridge,
      autoReview: { mode: "enforce", agentId: "agent-1", boxIdentity: { boxId: "box-1", windowGeneration: "g" }, resolveDisplayNumber: async () => { throw new Error("the computer's display must not be asked"); } },
    }).map((tool) => [tool.name, tool]));
    const blocked = await reviewed.browser_click.execute({}, { ref: "e3", element: "Buy button, to buy" }, { toolCallId: "r1" });
    assert.deepEqual(blocked, { text: "Browser Auto-review could not capture the current page state: no pages yet", isError: true });
    assert.deepEqual(app.requests().filter((frame) => frame.op === "click"), [], "the click was not sent");
    assert.deepEqual(box.calls, [], "the computer was not probed");
  } finally { await Promise.all([tools.dispose(), lb.dispose()]); }
});

test("the gateway serves the two paths behind its token and hands them to the bridge", async () => {
  const gateway = await load("source/host/gateway-server.ts", "lb-gateway");
  const lb = await load("source/host/extensions/local-browser/local-browser-bridge.ts", "lb-gateway-bridge");
  const bridge = new lb.module.LocalBrowserBridge({ clock: fakeClock(), enabled: () => true, reconnectGraceMs: 0 });
  const base = { api: { getAgentAvatar() {} }, subscribe: () => () => {}, getHealth: () => ({}), startedAt: 0, localBrowser: bridge };
  const open = await gateway.module.startGatewayServer({ ...base });
  const locked = await gateway.module.startGatewayServer({ ...base, authToken: "gateway-token" });
  try {
    const plain = await fetch(`http://127.0.0.1:${open.port}/local-browser/requests`);
    assert.equal(plain.status, 401, "never without the gateway's token");
    assert.match(await plain.text(), /local-browser requires gateway authentication/);
    const wrong = await fetch(`http://127.0.0.1:${locked.port}/local-browser/responses`, { method: "POST", headers: { authorization: "Bearer nope" }, body: "{}" });
    assert.equal(wrong.status, 401);

    let stream;
    const welcome = await new Promise((resolve, reject) => {
      stream = http.get({ host: "127.0.0.1", port: locked.port, path: "/local-browser/requests", headers: { authorization: "Bearer gateway-token" } }, (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
          const match = text.match(/data: (\{.*\})\n/);
          if (match) resolve(JSON.parse(match[1]));
        });
      });
      stream.on("error", (error) => { if (error.code !== "ECONNRESET") reject(error); });
    });
    assert.equal(welcome.kind, "welcome");
    assert.equal(welcome.protocol, 1);
    assert.equal(welcome.enabled, true);
    assert.deepEqual(await bridge.choose("agent-1", { opensAddress: true }), { route: "box" }, "no hello yet");

    const posted = await fetch(`http://127.0.0.1:${locked.port}/local-browser/responses`, {
      method: "POST",
      headers: { authorization: "Bearer gateway-token", "content-type": "application/json" },
      body: JSON.stringify({ providerId: welcome.providerId, frames: [{ kind: "hello", protocol: 1, browser: true, platform: "mac", browserSession: SESSION }] }),
    });
    assert.equal(posted.status, 200);
    assert.deepEqual(await posted.json(), { ok: true });
    assert.equal((await bridge.choose("agent-2", { opensAddress: true })).route, "app", "the app's hello through the gateway");
    stream.destroy();
    await sleep(50);
    assert.equal((await bridge.choose("agent-3", { opensAddress: true })).route, "box", "the stream closed: no app");
  } finally {
    await Promise.all([open.close(), locked.close()]);
    await Promise.all([gateway.dispose(), lb.dispose()]);
  }
});

test("the extension reads the switch, logs it, and is the host's 38th", async () => {
  const { module, dispose } = await load("source/host/extensions/local-browser/extension.ts", "lb-extension");
  try {
    for (const [value, enabled] of [["1", true], ["on", true], [" TRUE ", true], ["0", false], ["", false], [undefined, false]]) {
      const lines = [];
      const bridge = module.createLocalBrowserBridge(value === undefined ? {} : { SIMEON_APP_BROWSER: value }, (line) => lines.push(line));
      assert.equal(bridge.isEnabled(), enabled, String(value));
      assert.equal(lines[0], `[simeon] local-browser ${enabled ? "on" : "off"} (SIMEON_APP_BROWSER=${value ?? ""})`);
    }
    assert.deepEqual(module.localBrowserExtension.dependencies, []);
  } finally { await dispose(); }
  const ids = await src("host/extensions/extension-ids.generated.ts");
  assert.match(ids, /LocalBrowser: "local-browser"/);
  const registry = await src("host/extensions/registry.ts");
  assert.match(registry, /HostExtensions\.LocalExec, HostExtensions\.LocalBrowser, /, "beside local exec; Channels stays last");
  const production = await src("host/host-production-extensions.ts");
  assert.match(production, /\[HostExtensions\.LocalBrowser\]: bind\(localBrowserExtension\)/);
  const composition = await src("host/host-runner-composition.ts");
  assert.match(composition, /\.\.\.\(appBrowser === undefined \? \{\} : \{ appBrowser \}\)/, "the turn's browser tools are given the route");
  const main = await src("host/main.ts");
  assert.match(main, /localBrowser: host\.getLocalBrowserBridge\(\)/, "the gateway is given the bridge");
});
