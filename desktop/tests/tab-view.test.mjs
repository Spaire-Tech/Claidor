/**
 * The agent's own Chrome tab on the person's phone (15 October 2026): the
 * engine's side, run against a fake Chrome that speaks DevTools over a real
 * socket. It finds the agent's tab, streams its pictures one acknowledged
 * frame at a time, lays the tab out at the phone's size while the person is
 * in control (and gives the tab its own size back after), passes taps,
 * scrolls, typing and keys, follows a sign-in pop-up and comes back from it.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { WebSocketServer } from "ws";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-tab-view-"));
  const outfile = path.join(dir, "tab-view.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/host/box/tab-view.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  try {
    return await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await wait(10);
  }
  assert.fail(`timed out waiting for ${label}`);
}

/** A Chrome with page tabs; every DevTools command a page receives is recorded. */
async function fakeChrome() {
  const pages = new Map(); // id → { url, title, openerId, commands: [], sockets: Set }
  const server = http.createServer((request, response) => {
    if (request.url === "/json/version") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/browser/fake` }));
      return;
    }
    response.statusCode = 404;
    response.end("{}");
  });
  const sockets = new WebSocketServer({ server });
  sockets.on("connection", (socket, request) => {
    const url = request.url ?? "";
    if (url.startsWith("/devtools/browser/")) {
      socket.on("message", (raw) => {
        const message = JSON.parse(String(raw));
        if (message.method === "Target.getTargets") {
          const targetInfos = [...pages.entries()].map(([targetId, page]) => ({ targetId, type: "page", url: page.url, title: page.title, ...(page.openerId ? { openerId: page.openerId } : {}) }));
          socket.send(JSON.stringify({ id: message.id, result: { targetInfos } }));
        } else socket.send(JSON.stringify({ id: message.id, result: {} }));
      });
      return;
    }
    const id = url.split("/").at(-1);
    const page = pages.get(id);
    if (!page) { socket.close(); return; }
    page.sockets.add(socket);
    socket.on("close", () => page.sockets.delete(socket));
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw));
      page.commands.push({ method: message.method, params: message.params });
      let result = {};
      if (message.method === "Runtime.evaluate") {
        const expression = message.params.expression;
        if (expression.includes("location.href")) result = { result: { value: JSON.stringify([page.url, page.title]) } };
        else if (expression.includes("activeElement")) result = { result: { value: page.focus ?? "" } };
        else if (expression.includes("visibilityState")) result = { result: { value: page.visible ? "visible" : "hidden" } };
      }
      socket.send(JSON.stringify({ id: message.id, result }));
      if (message.method === "Page.startScreencast") {
        page.screencasting = true;
        page.frameSession = (page.frameSession ?? 0) + 1;
        socket.send(JSON.stringify({ method: "Page.screencastFrame", params: { data: `JPEG-${id}-1`, sessionId: page.frameSession * 100 + 1, metadata: { deviceWidth: page.width ?? 1280, deviceHeight: page.height ?? 720 } } }));
      }
      if (message.method === "Page.screencastFrameAck" && page.screencasting && (page.sent ?? 1) < 3) {
        page.sent = (page.sent ?? 1) + 1;
        socket.send(JSON.stringify({ method: "Page.screencastFrame", params: { data: `JPEG-${id}-${page.sent}`, sessionId: page.frameSession * 100 + page.sent, metadata: { deviceWidth: page.width ?? 1280, deviceHeight: page.height ?? 720 } } }));
      }
      if (message.method === "Page.stopScreencast") page.screencasting = false;
      if (message.method === "Emulation.setDeviceMetricsOverride") { page.width = message.params.width; page.height = message.params.height; }
      if (message.method === "Emulation.clearDeviceMetricsOverride") { page.width = 1280; page.height = 720; }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    pages,
    add(id, page) { pages.set(id, { title: "", commands: [], sockets: new Set(), ...page }); },
    remove(id) { const page = pages.get(id); pages.delete(id); for (const socket of page?.sockets ?? []) socket.close(); },
    methods(id) { return (pages.get(id)?.commands ?? []).map((command) => command.method); },
    async close() { for (const socket of sockets.clients) socket.terminate(); sockets.close(); await new Promise((resolve) => server.close(resolve)); },
  };
}

function recordingSink({ hold = false } = {}) {
  const events = [];
  const releases = [];
  return {
    events,
    frames: () => events.filter((event) => event.type === "frame"),
    release() { for (const release of releases.splice(0)) release(); },
    send(event) {
      events.push(event);
      if (hold && event.type === "frame") return new Promise((resolve) => releases.push(resolve));
      return Promise.resolve();
    },
  };
}

async function viewsFile(views, urls = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-views-"));
  await writeFile(path.join(dir, "views-1.json"), JSON.stringify({ views, urls }));
  return dir;
}

test("the agent's own tab is shown, one acknowledged picture at a time, with its address", async () => {
  const module = await load();
  const chrome = await fakeChrome();
  chrome.add("other", { url: "https://news.example.com/", title: "News", visible: true });
  chrome.add("mine", { url: "https://appleid.apple.com/sign-in", title: "Sign in" });
  const dir = await viewsFile({ "agent-1": "mine" });
  const lines = [];
  const views = new module.TabViews({ displayFor: () => 1, portFor: () => chrome.port, readViews: (display) => module.readBrowserViews(display, dir), log: (line) => lines.push(line), pollMs: 60_000, focusSettleMs: 1 });
  const sink = recordingSink({ hold: true });
  try {
    const opened = await views.open("agent-1", { width: 390, height: 700, control: false }, sink);
    assert.equal(opened.ok, true);
    await until(() => sink.frames().length === 1, "the first picture");
    assert.deepEqual(sink.frames()[0], { type: "frame", jpeg: "JPEG-mine-1", width: 1280, height: 720 }, "the page's own size, watched");
    assert.deepEqual(sink.events.find((event) => event.type === "tab"), { type: "tab", url: "https://appleid.apple.com/sign-in", title: "Sign in" });
    const start = chrome.pages.get("mine").commands.find((command) => command.method === "Page.startScreencast");
    assert.deepEqual(start.params, { format: "jpeg", quality: 60, maxWidth: 780, maxHeight: 1400, everyNthFrame: 1 });
    assert.equal(chrome.methods("mine").includes("Emulation.setDeviceMetricsOverride"), false, "watching leaves the agent's page as it is");
    await wait(50);
    assert.equal(chrome.methods("mine").includes("Page.screencastFrameAck"), false, "no acknowledgement before the phone has the picture");
    sink.release();
    await until(() => sink.frames().length === 2, "the second picture after the first was sent");
    assert.equal(chrome.methods("other").length, 0, "another agent's tab is never touched");
    opened.close();
    await until(() => chrome.methods("mine").includes("Page.stopScreencast"), "the screencast stopped");
    assert.ok(lines.some((line) => /^\[simeon\] tab-view open agent=agent-1 tab=appleid\.apple\.com control=false size=390x700$/.test(line)), lines.join("\n"));
    await until(() => lines.some((line) => /^\[simeon\] tab-view closed agent=agent-1 reason=viewer-closed frames=2$/.test(line)), "the closed line");
  } finally {
    await chrome.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("in control the tab takes the phone's size, comes to the front, and gets taps, scrolls, typing and keys; its own size comes back after", async () => {
  const module = await load();
  const chrome = await fakeChrome();
  chrome.add("mine", { url: "https://appleid.apple.com/", title: "Apple Account", focus: "password" });
  const dir = await viewsFile({ "agent-1": "mine" });
  const views = new module.TabViews({ displayFor: () => 1, portFor: () => chrome.port, readViews: (display) => module.readBrowserViews(display, dir), log: () => {}, pollMs: 60_000, focusSettleMs: 1 });
  const sink = recordingSink();
  try {
    const opened = await views.open("agent-1", { width: 390, height: 700, control: true }, sink);
    assert.equal(opened.ok, true);
    await until(() => sink.frames().length >= 1, "a picture");
    const methods = chrome.methods("mine");
    assert.ok(methods.indexOf("Emulation.setDeviceMetricsOverride") < methods.indexOf("Page.startScreencast"), "laid out before the first picture");
    assert.deepEqual(chrome.pages.get("mine").commands.find((command) => command.method === "Emulation.setDeviceMetricsOverride").params, { width: 390, height: 700, deviceScaleFactor: 2, mobile: true });
    assert.ok(methods.includes("Page.bringToFront"));
    assert.deepEqual({ width: sink.frames()[0].width, height: sink.frames()[0].height }, { width: 390, height: 700 });

    const tap = await views.input("agent-1", { kind: "tap", x: 120, y: 340 });
    assert.deepEqual(tap, { ok: true, focus: "password" }, "the phone learns a field to type in has the keyboard");
    const mouse = chrome.pages.get("mine").commands.filter((command) => command.method === "Input.dispatchMouseEvent").map((command) => [command.params.type, command.params.x, command.params.y]);
    assert.deepEqual(mouse, [["mouseMoved", 120, 340], ["mousePressed", 120, 340], ["mouseReleased", 120, 340]]);
    assert.deepEqual(await views.input("agent-1", { kind: "scroll", x: 195, y: 350, dx: 0, dy: 240 }), { ok: true });
    assert.deepEqual(chrome.pages.get("mine").commands.at(-1).params, { type: "mouseWheel", x: 195, y: 350, deltaX: 0, deltaY: 240 });
    assert.deepEqual(await views.input("agent-1", { kind: "text", text: "hunter2" }), { ok: true });
    assert.deepEqual(chrome.pages.get("mine").commands.at(-1), { method: "Input.insertText", params: { text: "hunter2" } });
    assert.deepEqual(await views.input("agent-1", { kind: "key", key: "Enter" }), { ok: true });
    const keys = chrome.pages.get("mine").commands.slice(-2).map((command) => command.params);
    assert.equal(keys[0].type, "keyDown");
    assert.equal(keys[0].text, "\r", "Enter submits a form");
    assert.equal(keys[0].windowsVirtualKeyCode, 13);
    assert.equal(keys[1].type, "keyUp");
    assert.deepEqual(await views.input("agent-1", { kind: "key", key: "Backspace" }), { ok: true });
    assert.equal(chrome.pages.get("mine").commands.at(-2).params.type, "rawKeyDown");

    assert.deepEqual(await views.input("agent-1", { kind: "control", on: false }), { ok: true, control: false });
    assert.ok(chrome.methods("mine").includes("Emulation.clearDeviceMetricsOverride"), "handing back control gives the page its own size");
    assert.deepEqual(await views.input("agent-1", { kind: "bogus" }), { ok: false, reason: "bad-input" });
    assert.deepEqual(await views.input("agent-2", { kind: "tap", x: 1, y: 1 }), { ok: false, reason: "no-view" });

    await views.input("agent-1", { kind: "control", on: true });
    const before = chrome.methods("mine").filter((method) => method === "Emulation.clearDeviceMetricsOverride").length;
    opened.close();
    await until(() => chrome.methods("mine").filter((method) => method === "Emulation.clearDeviceMetricsOverride").length === before + 1, "the page's size given back on close");
  } finally {
    await chrome.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a sign-in pop-up the tab opens is followed, and closing it comes back to the tab; another tab is not", async () => {
  const module = await load();
  const chrome = await fakeChrome();
  chrome.add("mine", { url: "https://shop.example.com/login", title: "Log in" });
  const dir = await viewsFile({ "agent-1": "mine" });
  const views = new module.TabViews({ displayFor: () => 1, portFor: () => chrome.port, readViews: (display) => module.readBrowserViews(display, dir), log: () => {}, pollMs: 40, focusSettleMs: 1 });
  const sink = recordingSink();
  try {
    const opened = await views.open("agent-1", { width: 390, height: 700, control: true }, sink);
    assert.equal(opened.ok, true);
    chrome.add("someone-else", { url: "https://mail.example.com/", title: "Mail" });
    await wait(150);
    assert.equal(chrome.methods("someone-else").length, 0, "a tab this one did not open is left alone");
    chrome.add("popup", { url: "https://accounts.google.com/signin", title: "Sign in - Google", openerId: "mine" });
    await until(() => chrome.methods("popup").includes("Page.startScreencast"), "the pop-up shown");
    assert.ok(chrome.methods("popup").includes("Emulation.setDeviceMetricsOverride"), "the pop-up is at the phone's size too");
    await until(() => sink.events.some((event) => event.type === "tab" && event.url === "https://accounts.google.com/signin"), "the pop-up's address");
    const startsBefore = chrome.methods("mine").filter((method) => method === "Page.startScreencast").length;
    chrome.remove("popup");
    await until(() => chrome.methods("mine").filter((method) => method === "Page.startScreencast").length === startsBefore + 1, "back on the tab");
    opened.close();
  } finally {
    await chrome.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("with no browser there is no view; a second viewer takes the tab over from the first", async () => {
  const module = await load();
  const chrome = await fakeChrome();
  const views = new module.TabViews({ displayFor: () => 1, portFor: () => chrome.port, readViews: () => ({ views: {}, urls: {} }), log: () => {}, pollMs: 60_000, focusSettleMs: 1 });
  try {
    assert.deepEqual(await views.open("agent-1", { width: 390, height: 700, control: false }, recordingSink()), { ok: false, reason: "no-browser" });
    chrome.add("front", { url: "https://example.com/", title: "Example", visible: true });
    const first = recordingSink();
    assert.equal((await views.open("agent-1", { width: 390, height: 700, control: false }, first)).ok, true, "with no tab of its own, the tab in front");
    const second = recordingSink();
    assert.equal((await views.open("agent-1", { width: 390, height: 700, control: false }, second)).ok, true);
    await until(() => first.events.some((event) => event.type === "closed" && event.reason === "replaced"), "the first told it was replaced");
    views.closeAll();
  } finally {
    await chrome.close();
  }
});

test("inputs and sizes are checked; the agent's tab is found by id, then address, then the one in front", async () => {
  const module = await load();
  assert.deepEqual(module.parseTabViewInput({ kind: "tap", x: 1, y: 2 }), { kind: "tap", x: 1, y: 2 });
  assert.equal(module.parseTabViewInput({ kind: "tap", x: "1", y: 2 }), undefined);
  assert.equal(module.parseTabViewInput({ kind: "key", key: "Delete" }), undefined);
  assert.equal(module.parseTabViewInput({ kind: "text", text: "" }), undefined);
  assert.deepEqual(module.parseTabViewInput({ kind: "scroll", x: 1, y: 2, dy: 30 }), { kind: "scroll", x: 1, y: 2, dx: 0, dy: 30 });
  assert.deepEqual(module.clampTabViewSize("390", "10000"), { width: 390, height: 2000 });
  assert.deepEqual(module.clampTabViewSize(undefined, 10), { width: 390, height: 240 });
  const tabs = [{ id: "a", url: "https://a.example/" }, { id: "b", url: "https://b.example/" }, { id: "c", url: "https://c.example/" }];
  const visible = (id) => async (tab) => tab.id === id;
  assert.equal((await module.chooseAgentTab(tabs, { views: { agent: "b" }, urls: {} }, "agent", visible("c"))).id, "b");
  assert.equal((await module.chooseAgentTab(tabs, { views: { agent: "gone" }, urls: { agent: "https://c.example/" } }, "agent", visible("a"))).id, "c");
  assert.equal((await module.chooseAgentTab(tabs, { views: {}, urls: {} }, "agent", visible("b"))).id, "b");
  assert.equal((await module.chooseAgentTab(tabs, { views: {}, urls: {} }, "agent", visible("none"))).id, "a");
  assert.equal(await module.chooseAgentTab([], { views: {}, urls: {} }, "agent", visible("a")), undefined);
});
