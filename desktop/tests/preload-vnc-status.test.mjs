import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Window } from "happy-dom";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadPreload() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-vnc-status-"));
  const output = path.join(temporary, "preload-vnc.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/electron-preload/preload-vnc.ts")], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

function noVncPage(document) {
  document.body.innerHTML = `
    <div id="noVNC_status"></div>
    <div id="noVNC_connect_dlg"></div>
    <div id="noVNC_credentials_dlg"></div>
    <script src="app/ui.js"></script>
  `;
}

test("the status reporter narrates what noVNC does inside the page", async () => {
  const { module, dispose } = await loadPreload();
  const window = new Window({ url: "http://127.0.0.1:6080/vnc.html?autoconnect=true&reconnect=true" });
  try {
    const document = window.document;
    noVncPage(document);
    const lines = [];
    const scheduled = [];
    const observers = [];
    module.installNoVncStatusReporter({
      document,
      window,
      location: window.location,
      createMutationObserver: (listener) => { const observer = { observe() {}, disconnect() {}, fire: listener }; observers.push(observer); return observer; },
      log: (line) => lines.push(line),
      schedule: (callback, delayMs) => scheduled.push({ callback, delayMs }),
      graceMs: 5000,
    });
    const fire = () => observers.forEach((observer) => observer.fire());
    assert.equal(lines[0], "[SimeonScreen] page href=http://127.0.0.1:6080/vnc.html?autoconnect=true&reconnect=true");
    assert.equal(lines[1], '[SimeonScreen] state=disconnected status="" dialog=none');
    document.documentElement.classList.add("noVNC_connecting");
    fire();
    assert.equal(lines[2], '[SimeonScreen] state=connecting status="" dialog=none');
    fire();
    assert.equal(lines.length, 3, "an unchanged picture is not repeated");
    document.documentElement.classList.remove("noVNC_connecting");
    document.getElementById("noVNC_status").textContent = "Failed to connect to server";
    fire();
    assert.equal(lines[3], '[SimeonScreen] state=disconnected status="Failed to connect to server" dialog=none');
    document.getElementById("noVNC_credentials_dlg").classList.add("noVNC_open");
    fire();
    assert.equal(lines[4], '[SimeonScreen] state=disconnected status="Failed to connect to server" dialog=noVNC_credentials_dlg');
    document.getElementById("noVNC_credentials_dlg").classList.remove("noVNC_open");
    document.documentElement.classList.add("noVNC_connected");
    document.getElementById("noVNC_status").textContent = "Connected (unencrypted) to: box";
    fire();
    assert.equal(lines[5], '[SimeonScreen] state=connected status="Connected (unencrypted) to: box" dialog=none');
    // noVNC was seen, so the grace timer stays quiet.
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].delayMs, 5000);
    scheduled[0].callback();
    assert.equal(lines.length, 6);
    window.dispatchEvent(new window.ErrorEvent("error", { message: "x is not defined", filename: "http://127.0.0.1:6080/app/ui.js", lineno: 3 }));
    assert.equal(lines[6], "[SimeonScreen] page error: x is not defined at http://127.0.0.1:6080/app/ui.js:3");
  } finally {
    window.close();
    await dispose();
  }
});

test("a page where noVNC never adds a class is called not started after the grace", async () => {
  const { module, dispose } = await loadPreload();
  const window = new Window({ url: "http://127.0.0.1:6080/vnc.html" });
  try {
    const document = window.document;
    noVncPage(document);
    const lines = [];
    const scheduled = [];
    module.installNoVncStatusReporter({
      document, window, location: window.location,
      createMutationObserver: () => ({ observe() {}, disconnect() {} }),
      log: (line) => lines.push(line),
      schedule: (callback, delayMs) => scheduled.push({ callback, delayMs }),
    });
    scheduled[0].callback();
    assert.equal(scheduled[0].delayMs, module.NOVNC_START_GRACE_MS);
    assert.equal(lines.at(-1), '[SimeonScreen] noVNC did not start after 5000ms; root class="" scripts=1');
  } finally {
    window.close();
    await dispose();
  }
});

test("the reporter stays out of pages that are not the box desktop", async () => {
  const { module, dispose } = await loadPreload();
  const window = new Window({ url: "https://example.com/" });
  try {
    const lines = [];
    module.installNoVncStatusReporter({ document: window.document, window, location: window.location, createMutationObserver: () => ({ observe() {}, disconnect() {} }), log: (line) => lines.push(line) });
    assert.equal(lines.length, 0);
  } finally {
    window.close();
    await dispose();
  }
});
