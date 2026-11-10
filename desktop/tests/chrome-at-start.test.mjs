/**
 * Chrome open on the computer's own screen as soon as it is up (10 November
 * 2026, the founder: "can we by design make the chrome to open by default.
 * as soon as the computer is booted up"): the computer's launcher once the
 * screen is there, nothing when Chrome runs already or was opened on this
 * start of the computer, and nothing on a computer without the launcher.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-chrome-at-start-"));
  const outfile = path.join(dir, "chrome-at-start.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/host/extensions/wallpaper/chrome-at-start.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

function computer({ launcher = true, screen = true, running = false, marked = false, fails = false } = {}) {
  const seen = { launches: 0, marks: 0, lines: [] };
  const state = { screen, marked };
  return {
    seen,
    state,
    deps: {
      hasLauncher: () => launcher,
      screenUp: () => state.screen,
      chromeRunning: async () => running,
      launch: async () => {
        seen.launches += 1;
        if (fails) throw new Error("box-chrome: another launch holds /home/box/chrome-profile\nmore");
      },
      marked: () => state.marked,
      mark: () => { seen.marks += 1; state.marked = true; },
      log: (line) => seen.lines.push(line),
    },
  };
}

test("Chrome is opened once the screen is up, and only once per start of the computer", async () => {
  const { module: m, dispose } = await load();
  try {
    const box = computer();
    assert.equal(await m.openChromeOnce(box.deps), "opened");
    assert.equal(box.seen.launches, 1);
    assert.deepEqual(box.seen.lines, ["chrome at start: opened"]);
    // The engine starting again on the same start of the computer (updated in place): the person may have closed it.
    assert.equal(await m.openChromeOnce(box.deps), "done-before");
    assert.equal(box.seen.launches, 1);
  } finally {
    await dispose();
  }
});

test("nothing when Chrome is open already, on a computer without the launcher, or while the screen is not up", async () => {
  const { module: m, dispose } = await load();
  try {
    const open = computer({ running: true });
    assert.equal(await m.openChromeOnce(open.deps), "running");
    assert.equal(open.seen.launches, 0);
    assert.equal(open.seen.marks, 1);
    const elsewhere = computer({ launcher: false });
    assert.equal(await m.openChromeOnce(elsewhere.deps), "no-launcher");
    assert.equal(elsewhere.seen.marks, 0);
    const early = computer({ screen: false });
    assert.equal(await m.openChromeOnce(early.deps), "no-screen");
    assert.equal(early.seen.launches, 0);
    assert.equal(early.seen.marks, 0);
    // A launch that failed is tried again at the next start: no mark, one line with the first line of why.
    const failing = computer({ fails: true });
    assert.equal(await m.openChromeOnce(failing.deps), "failed");
    assert.equal(failing.seen.marks, 0);
    assert.deepEqual(failing.seen.lines, ["chrome at start: not opened reason=box-chrome: another launch holds /home/box/chrome-profile"]);
  } finally {
    await dispose();
  }
});

test("the screen is waited for (every 3 s, three minutes at most), then Chrome opened once", async () => {
  const { module: m, dispose } = await load();
  try {
    const box = computer({ screen: false });
    const pending = [];
    const later = (delayMs, callback) => pending.push({ delayMs, callback });
    const flush = async () => { await new Promise((resolve) => setImmediate(resolve)); };
    m.openChromeWhenScreenIsUp(box.deps, later);
    await flush();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].delayMs, m.DISPLAY_LOOK_MS);
    pending.shift().callback();
    await flush();
    box.state.screen = true;
    pending.shift().callback();
    await flush();
    assert.equal(box.seen.launches, 1);
    assert.equal(pending.length, 0);
    // No screen in three minutes: it stops looking, with one line.
    const never = computer({ screen: false });
    const queue = [];
    m.openChromeWhenScreenIsUp(never.deps, (delayMs, callback) => queue.push(callback), 9_000, 3_000);
    await flush();
    for (let i = 0; i < 10 && queue.length > 0; i += 1) { queue.shift()(); await flush(); }
    assert.equal(queue.length, 0);
    assert.equal(never.seen.launches, 0);
    assert.deepEqual(never.seen.lines, ["chrome at start: no screen came up"]);
    // Stopped (the engine stopping): no more looks.
    const stoppedBox = computer({ screen: false });
    const kept = [];
    const stop = m.openChromeWhenScreenIsUp(stoppedBox.deps, (delayMs, callback) => kept.push(callback));
    await flush();
    stop();
    stoppedBox.state.screen = true;
    kept.shift()();
    await flush();
    assert.equal(stoppedBox.seen.launches, 0);
  } finally {
    await dispose();
  }
});

test("on the computer: its launcher on screen :1 with Chrome's DevTools port 9223, the mark in /tmp", async () => {
  const { module: m, dispose } = await load();
  try {
    assert.equal(m.BOX_CHROME_COMMAND, "/usr/local/bin/box-chrome");
    assert.equal(m.PRIMARY_DISPLAY, ":1");
    assert.equal(m.PRIMARY_CHROME_PORT, 9223);
    assert.ok(m.CHROME_OPENED_MARK.startsWith("/tmp/"));
    // This machine has no launcher: the real dependencies leave it as it is.
    const deps = m.boxChromeAtStartDeps(() => {});
    assert.equal(typeof deps.launch, "function");
    if (!deps.hasLauncher()) assert.equal(await m.openChromeOnce(deps), "no-launcher");
  } finally {
    await dispose();
  }
});
