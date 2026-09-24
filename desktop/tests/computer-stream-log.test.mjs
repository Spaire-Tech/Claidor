import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-computer-stream-"));
  const output = path.join(temporary, "module.mjs");
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

function fakeLog() {
  const lines = [];
  return { lines, log: { filePath: "/tmp/computer-stream.log", line: (text) => lines.push(text) } };
}

test("the stream log starts the file over, stamps every line, echoes it and forwards it", async () => {
  const { module, dispose } = await load("source/electron-main/vnc/computer-stream-log.ts");
  try {
    const written = [];
    const echoed = [];
    const forwarded = [];
    let reset = null;
    const log = module.createComputerStreamLog({
      filePath: "/data/computer-stream.log",
      append: (file, text) => written.push([file, text]),
      reset: (file) => { reset = file; },
      echo: (text) => echoed.push(text),
      onLine: (line) => forwarded.push(line),
      now: () => new Date("2026-09-22T10:00:00.000Z"),
    });
    log.line("guest loaded url=http://127.0.0.1:6080/vnc.html");
    assert.equal(reset, "/data/computer-stream.log");
    assert.deepEqual(written, [
      ["/data/computer-stream.log", "2026-09-22T10:00:00.000Z computer stream log at /data/computer-stream.log\n"],
      ["/data/computer-stream.log", "2026-09-22T10:00:00.000Z guest loaded url=http://127.0.0.1:6080/vnc.html\n"],
    ]);
    assert.equal(echoed[1], "[computer-stream] guest loaded url=http://127.0.0.1:6080/vnc.html");
    assert.equal(forwarded[1], "2026-09-22T10:00:00.000Z guest loaded url=http://127.0.0.1:6080/vnc.html");
    // A sink that throws never breaks the app.
    const broken = module.createComputerStreamLog({ filePath: "x", append: () => { throw new Error("disk full"); } });
    broken.line("still fine");
  } finally {
    await dispose();
  }
});

test("every guest event becomes one line, in both console-message shapes", async () => {
  const { module, dispose } = await load("source/electron-main/vnc/computer-stream-log.ts");
  try {
    const { lines, log } = fakeLog();
    const guest = new EventEmitter();
    guest.getURL = () => "http://127.0.0.1:6080/vnc.html?autoconnect=true";
    guest.isDestroyed = () => false;
    module.observeBoxWebviewGuest(guest, log);
    guest.emit("did-start-loading");
    guest.emit("did-navigate", {}, "http://127.0.0.1:6080/vnc.html?autoconnect=true", 200, "OK");
    guest.emit("dom-ready");
    guest.emit("did-finish-load");
    guest.emit("did-fail-load", {}, -3, "ERR_ABORTED", "http://127.0.0.1:6080/vnc.html", true);
    guest.emit("did-fail-load", {}, -102, "ERR_CONNECTION_REFUSED", "http://127.0.0.1:6080/vnc.html", true);
    guest.emit("preload-error", {}, "/app/preload-vnc.cjs", new Error("Cannot find module 'x'"));
    guest.emit("console-message", { level: "error", message: "WebSocket connection to 'ws://127.0.0.1:6080/websockify' failed" });
    guest.emit("console-message", {}, 1, "[SimeonScreen] state=connecting status=\"\" dialog=none", 12, "vnc.html");
    guest.emit("render-process-gone", {}, { reason: "crashed" });
    guest.emit("destroyed");
    assert.deepEqual(lines, [
      "guest created url=http://127.0.0.1:6080/vnc.html?autoconnect=true",
      "guest loading url=http://127.0.0.1:6080/vnc.html?autoconnect=true",
      "guest navigated url=http://127.0.0.1:6080/vnc.html?autoconnect=true status=200",
      "guest dom-ready url=http://127.0.0.1:6080/vnc.html?autoconnect=true",
      "guest loaded url=http://127.0.0.1:6080/vnc.html?autoconnect=true",
      "guest load aborted url=http://127.0.0.1:6080/vnc.html mainFrame=true",
      "guest load FAILED code=-102 (ERR_CONNECTION_REFUSED) url=http://127.0.0.1:6080/vnc.html mainFrame=true",
      "guest preload FAILED path=/app/preload-vnc.cjs error=Cannot find module 'x'",
      "guest console[error] WebSocket connection to 'ws://127.0.0.1:6080/websockify' failed",
      "guest console[info] [SimeonScreen] state=connecting status=\"\" dialog=none",
      "guest renderer gone reason=crashed",
      "guest destroyed",
    ]);
  } finally {
    await dispose();
  }
});

test("the trust registry narrates the attach and observes every box guest", async () => {
  const { module, dispose } = await load("source/electron-main/vnc/vnc-trust.ts");
  try {
    const { lines, log } = fakeLog();
    const app = new EventEmitter();
    const boxSession = { webRequest: { onBeforeSendHeaders() {}, onCompleted() {} } };
    const trust = module.registerBoxVncTrust({
      preloadDistDir: "/app/dist/electron-preload",
      onAssetFailure() {},
      routeHostInput: () => false,
      streamLog: log,
      preloadExists: (file) => file.endsWith("preload-vnc.cjs"),
      app,
      boxSession,
      isBoxWebviewSession: (contents) => contents.box === true,
    });
    const embedder = new EventEmitter();
    trust.hardenWebviewAttach(embedder);
    const webPreferences = {};
    const params = { src: "http://127.0.0.1:6080/vnc.html?autoconnect=true", partition: "persist:sand-forever-box" };
    embedder.emit("will-attach-webview", {}, webPreferences, params);
    assert.equal(lines.length, 1);
    assert.equal(lines[0], "attach webview box=true src=http://127.0.0.1:6080/vnc.html?autoconnect=true&resize=scale&reconnect=true partition=persist:sand-forever-box sandbox=false preload=/app/dist/electron-preload/preload-vnc.cjs preloadExists=true");
    // A browser preview webview is not narrated.
    embedder.emit("will-attach-webview", {}, {}, { src: "https://example.com", partition: "persist:preview" });
    assert.equal(lines.length, 1);
    const guest = new EventEmitter();
    guest.getType = () => "webview";
    guest.box = true;
    guest.getURL = () => "";
    guest.isDestroyed = () => false;
    guest.setVisualZoomLevelLimits = () => {};
    guest.setZoomFactor = () => {};
    app.emit("web-contents-created", {}, guest);
    guest.emit("did-fail-load", {}, -102, "ERR_CONNECTION_REFUSED", "http://127.0.0.1:6080/vnc.html", true);
    assert.deepEqual(lines.slice(1), [
      "guest created url=",
      "guest load FAILED code=-102 (ERR_CONNECTION_REFUSED) url=http://127.0.0.1:6080/vnc.html mainFrame=true",
    ]);
  } finally {
    await dispose();
  }
});

test("a log line is turned into one sentence a person can act on", async () => {
  const { module, dispose } = await load("source/shared/computer-stream.ts");
  try {
    const { computerStreamReason } = module;
    assert.equal(computerStreamReason("guest load FAILED code=-102 (ERR_CONNECTION_REFUSED) url=http://127.0.0.1:6080/vnc.html mainFrame=true"), "The screen page did not load (ERR_CONNECTION_REFUSED, -102).");
    assert.equal(computerStreamReason("guest preload FAILED path=/x error=boom"), "The screen page's helper script failed to load.");
    assert.equal(computerStreamReason("guest renderer gone reason=crashed"), "The screen page crashed.");
    assert.equal(computerStreamReason('guest console[info] [SimeonScreen] noVNC did not start after 5000ms; root class="" scripts=1'), "noVNC never started inside the screen page.");
    assert.equal(computerStreamReason('guest console[info] [SimeonScreen] state=disconnected status="Failed to connect to server" dialog=none'), "noVNC cannot reach the desktop's socket.");
    assert.equal(computerStreamReason('guest console[info] [SimeonScreen] state=disconnected status="" dialog=noVNC_credentials_dlg'), "The desktop is asking for a password.");
    assert.equal(computerStreamReason('guest console[info] [SimeonScreen] state=disconnected status="" dialog=noVNC_connect_dlg'), "noVNC is waiting for a Connect click: autoconnect did not fire.");
    assert.equal(computerStreamReason("guest console[error] WebSocket connection failed"), "Error inside the screen page: WebSocket connection failed");
    assert.equal(computerStreamReason('guest console[info] [SimeonScreen] page error: x is not defined at vnc.html:3'), "Error inside the screen page: x is not defined at vnc.html:3");
    assert.equal(computerStreamReason('guest console[info] [SimeonScreen] state=connected status="Connected (unencrypted) to: box" dialog=none'), "");
    assert.equal(computerStreamReason("guest dom-ready url=http://127.0.0.1:6080/vnc.html"), null);
    // The box connection, narrated by the main process.
    assert.equal(computerStreamReason("box reachability outcome=timeout method=getForeverBoxStatus cause=? baseUrl=http://127.0.0.1:1340"), 'The computer\'s gateway did not answer "getForeverBoxStatus" within the deadline.');
    assert.equal(computerStreamReason("box reachability outcome=network method=ensureForeverBox cause=ECONNREFUSED baseUrl=http://127.0.0.1:1340"), 'The computer\'s gateway could not be reached for "ensureForeverBox" (ECONNREFUSED).');
    assert.equal(computerStreamReason("box reachability outcome=http_5xx method=getForeverBoxStatus cause=502 baseUrl=?"), 'The computer\'s gateway failed "getForeverBoxStatus": http_5xx (502).');
    assert.equal(computerStreamReason("local docker FAILED: Local Docker VM is selected, but Docker is unavailable: start Docker and try again"), "Local Docker VM is selected, but Docker is unavailable: start Docker and try again");
    assert.equal(computerStreamReason("local docker: gateway ready at http://127.0.0.1:1340 after 4s"), null);
    assert.equal(computerStreamReason("attach rewrite partition from=persist:preview to=persist:sand-forever-box src=http://127.0.0.1:6080/vnc.html"), "The screen webview used the wrong session partition; it was corrected.");
    assert.equal(computerStreamReason("local docker: container exists=true running=true owned=true schema=9 hostBundleMatches=true"), null);
  } finally {
    await dispose();
  }
});

test("lines written before the log exists are held and flushed into it", async () => {
  const { module, dispose } = await load("source/electron-main/vnc/computer-stream-log.ts");
  try {
    module.resetComputerStreamLog();
    module.computerStreamLine("local docker: ensuring the box");
    module.computerStreamLine("local docker: daemon 28.0.1");
    const written = [];
    const log = module.createComputerStreamLog({ filePath: "/x", append: (_file, text) => written.push(text.trim().replace(/^\S+ /, "")) });
    module.adoptComputerStreamLog(log);
    module.computerStreamLine("box reachability outcome=timeout method=getForeverBoxStatus cause=? baseUrl=?");
    assert.deepEqual(written, ["computer stream log at /x", "local docker: ensuring the box", "local docker: daemon 28.0.1", "box reachability outcome=timeout method=getForeverBoxStatus cause=? baseUrl=?"]);
    module.resetComputerStreamLog();
  } finally {
    await dispose();
  }
});

test("the box connector and the coordinator's reachability reports write into the same log", async () => {
  const { readFile } = await import("node:fs/promises");
  const connector = await readFile(path.join(repoRoot, "source/electron-main/box/local-docker-host-connector.ts"), "utf8");
  assert.match(connector, /computerStreamLine\(`local docker FAILED: /);
  assert.match(connector, /computerStreamLine\(`local docker: gateway ready at /);
  assert.match(connector, /computerStreamLine\(`local docker: container exists=/);
  const provider = await readFile(path.join(repoRoot, "source/electron-main/coordinator/production-provider.ts"), "utf8");
  assert.match(provider, /computerStreamLine\(`box reachability outcome=/);
});

test("a loopback vnc.html on the wrong partition is forced onto the box session with autoconnect", async () => {
  const { module, dispose } = await load("source/electron-main/vnc/vnc-trust.ts");
  try {
    const { lines, log } = fakeLog();
    const app = new EventEmitter();
    const boxSession = { webRequest: { onBeforeSendHeaders() {}, onCompleted() {} } };
    const trust = module.registerBoxVncTrust({
      preloadDistDir: "/app/dist/electron-preload",
      onAssetFailure() {},
      routeHostInput: () => false,
      streamLog: log,
      preloadExists: (file) => file.endsWith("preload-vnc.cjs"),
      app,
      boxSession,
      isBoxWebviewSession: (contents) => contents.box === true,
    });
    const embedder = new EventEmitter();
    trust.hardenWebviewAttach(embedder);
    const webPreferences = {};
    const params = { src: "http://127.0.0.1:6081/vnc.html?path=websockify%3Ftoken%3D2", partition: "persist:preview" };
    embedder.emit("will-attach-webview", {}, webPreferences, params);
    assert.equal(params.partition, "persist:sand-forever-box");
    assert.match(String(params.src), /autoconnect=true/);
    assert.match(String(params.src), /reconnect=true/);
    assert.equal(webPreferences.sandbox, false);
    assert.match(String(webPreferences.preload), /preload-vnc\.cjs$/);
    assert.equal(lines[0], "attach rewrite partition from=persist:preview to=persist:sand-forever-box src=http://127.0.0.1:6081/vnc.html?path=websockify%3Ftoken%3D2");
    assert.match(lines[1], /^attach webview box=true /);
    assert.match(lines[1], /partition=persist:sand-forever-box/);
    assert.match(lines[1], /preload=\/app\/dist\/electron-preload\/preload-vnc\.cjs/);
    assert.equal(module.ensureBoxDesktopAutoconnect("http://127.0.0.1:6080/vnc.html?autoconnect=true&resize=scale&reconnect=true"), "http://127.0.0.1:6080/vnc.html?autoconnect=true&resize=scale&reconnect=true");
  } finally {
    await dispose();
  }
});
