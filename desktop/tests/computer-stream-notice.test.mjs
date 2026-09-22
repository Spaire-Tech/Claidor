import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Window } from "happy-dom";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadNotice() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-stream-notice-"));
  const output = path.join(temporary, "notice.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/electron-preload/computer-stream-notice.ts")], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("a spinner that outlives the delay gets the last reason and the log path painted under it", async () => {
  const { module, dispose } = await loadNotice();
  const window = new Window();
  let handle = null;
  try {
    const document = window.document;
    document.body.innerHTML = '<div class="sand-box-vnc-pool"><div class="sand-box-vnc-pool__layer"></div><span class="sand-box-vnc-pool__connecting">spinner</span></div>';
    let now = 0;
    const scheduled = [];
    let deliver = null;
    handle = module.installComputerStreamNotice({
      doc: document,
      subscribe: (listener) => { deliver = listener; return () => { deliver = null; }; },
      delayMs: 20_000,
      now: () => now,
      schedule: (callback, delayMs) => scheduled.push({ callback, delayMs }),
      log: () => {},
    });
    const notice = () => document.querySelector("[data-caisra-screen-notice]");
    assert.equal(notice(), null, "nothing before the delay");
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].delayMs, 20_050);
    deliver({ line: "2026-09-22T10:00:00.000Z computer stream log at /Users/me/Library/Application Support/Simeon/computer-stream.log", filePath: "/Users/me/Library/Application Support/Simeon/computer-stream.log" });
    deliver({ line: "2026-09-22T10:00:01.000Z guest dom-ready url=http://127.0.0.1:6080/vnc.html" });
    assert.equal(notice(), null, "still nothing before the delay");
    now = 20_000;
    scheduled[0].callback();
    assert.ok(notice());
    assert.equal(notice().textContent, "The computer's screen isn't connecting. No reason was reported yet. Details: /Users/me/Library/Application Support/Simeon/computer-stream.log");
    assert.equal(notice().parentElement.className, "sand-box-vnc-pool");
    assert.equal(notice().style.getPropertyValue("position"), "absolute");
    deliver({ line: '2026-09-22T10:00:21.000Z guest console[info] [SimeonScreen] state=disconnected status="Failed to connect to server" dialog=none' });
    assert.equal(notice().textContent, "The computer's screen isn't connecting. noVNC cannot reach the desktop's socket. Details: /Users/me/Library/Application Support/Simeon/computer-stream.log");
    assert.equal(document.querySelectorAll("[data-caisra-screen-notice]").length, 1);
    // A connect clears the reason; the spinner leaving removes the notice.
    deliver({ line: '2026-09-22T10:00:30.000Z guest console[info] [SimeonScreen] state=connected status="Connected" dialog=none' });
    assert.equal(notice().textContent, "The computer's screen isn't connecting. No reason was reported yet. Details: /Users/me/Library/Application Support/Simeon/computer-stream.log");
    document.querySelector(".sand-box-vnc-pool__connecting").remove();
    deliver({ line: "2026-09-22T10:00:31.000Z guest loaded url=x" });
    assert.equal(notice(), null);
  } finally {
    handle?.disconnect();
    window.close();
    await dispose();
  }
});

test("the notice text reads the same with and without a reason or a path", async () => {
  const { module, dispose } = await loadNotice();
  try {
    assert.equal(module.noticeText(null, null), "The computer's screen isn't connecting. No reason was reported yet.");
    assert.equal(module.noticeText("The screen page crashed.", "/log"), "The computer's screen isn't connecting. The screen page crashed. Details: /log");
  } finally {
    await dispose();
  }
});

test("the window preload installs the notice and the VNC preload the status reporter", async () => {
  const { readFile } = await import("node:fs/promises");
  const preload = await readFile(path.join(repoRoot, "source/electron-preload/preload.ts"), "utf8");
  assert.match(preload, /installComputerStreamNoticeSafely\(options\.ipc\)/);
  const vnc = await readFile(path.join(repoRoot, "source/electron-preload/preload-vnc.ts"), "utf8");
  assert.match(vnc, /install\("vnc status reporter"/);
});
