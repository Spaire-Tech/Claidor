/**
 * What a tap on the whole computer landed in (15 October 2026), against a
 * real Chromium: the phone opens its keyboard when the tap focused a text
 * field and puts it away when it did not. The page is the shape of a
 * sign-in: a field of its own, a button, a read-only field, and three
 * frames: one of its own address, one of another address on the same site
 * (Apple's sign-in form on appleid.apple.com is a frame from
 * idmsa.apple.com; Chrome keeps it in the page's process, where the page
 * cannot look into it), and one of another site (Chrome runs it in a process
 * of its own, a DevTools target of its own).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROMIUM = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", process.env.SIMEON_TEST_CHROMIUM ?? ""].find((candidate) => candidate.length > 0 && existsSync(candidate));

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-typing-focus-"));
  const outfile = path.join(dir, "typing-focus.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/host/box/typing-focus.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  try {
    return await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function serve(routes) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const body = routes[new URL(req.url, "http://x").pathname];
      res.writeHead(body === undefined ? 404 : 200, { "content-type": "text/html" });
      res.end(body ?? "");
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const box = (top) => `position:absolute;left:10px;top:${top}px;width:300px;height:100px;border:0`;
const field = (attributes) => `<!doctype html><body style="margin:0"><input ${attributes} style="position:absolute;left:0;top:0;width:200px;height:40px"><button style="position:absolute;left:0;top:50px;width:100px;height:30px">Next</button></body>`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("a tap on a field opens its keyboard, one elsewhere puts it away, inside frames of any kind", { skip: CHROMIUM === undefined ? "no Chromium here" : false, timeout: 60_000 }, async (t) => {
  const focus = await load();
  const other = await serve({ "/frame": field('type="text" id="inner"') });
  const otherPort = other.address().port;
  const main = await serve({
    "/": `<!doctype html><body style="margin:0;height:900px">
      <input type="email" id="email" style="position:absolute;left:10px;top:10px;width:200px;height:30px">
      <button style="position:absolute;left:10px;top:50px;width:100px;height:30px">Continue</button>
      <input type="text" readonly value="fixed" style="position:absolute;left:250px;top:10px;width:120px;height:30px">
      <textarea style="position:absolute;left:250px;top:50px;width:120px;height:30px"></textarea>
      <iframe src="/own" style="${box(100)}"></iframe>
      <iframe src="http://127.0.0.1:${otherPort}/frame" style="${box(220)}"></iframe>
      <iframe src="http://localhost:${otherPort}/frame" style="${box(340)}"></iframe>
    </body>`,
    "/own": field('type="password"'),
  });
  const mainPort = main.address().port;
  const profile = await mkdtemp(path.join(os.tmpdir(), "simeon-typing-focus-chrome-"));
  const devtools = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${devtools}`, `--user-data-dir=${profile}`, "--window-size=800,700", `http://127.0.0.1:${mainPort}/`], { stdio: "ignore" });
  try {
    let targets = [];
    for (let attempt = 0; attempt < 100; attempt += 1) {
      targets = await focus.listFocusTargets(devtools);
      if (targets.some((target) => target.type === "iframe") && targets.some((target) => target.type === "page")) break;
      await wait(100);
    }
    assert.ok(targets.some((target) => target.type === "iframe"), `the other site's frame runs in a process of its own: ${JSON.stringify(targets)}`);
    const page = targets.find((target) => target.type === "page");
    const connection = await focus.CdpConnection.open(page.socketUrl);
    // A person's tap, as the screen's mouse delivers it.
    const tap = async (x, y) => {
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
        await connection.send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 });
      }
      await wait(100);
      const startedAt = Date.now();
      const answer = await focus.readTypingFocus(devtools);
      took.push(Date.now() - startedAt);
      return answer;
    };
    const took = [];
    try {
      assert.equal(await tap(50, 25), "email", "the page's own email field");
      assert.equal(await tap(40, 65), "", "a button puts the keyboard away");
      assert.equal(await tap(300, 25), "", "a read-only field takes no typing");
      assert.equal(await tap(300, 65), "text", "a text area");
      assert.equal(await tap(600, 600), "", "an empty part of the page");
      assert.equal(await tap(60, 120), "password", "a field in a frame of the page's own address");
      assert.equal(await tap(30, 165), "", "that frame's button");
      assert.equal(await tap(60, 240), "text", "a field in a frame of another address on the same site (Apple's sign-in)");
      assert.equal(await tap(30, 285), "", "that frame's button");
      assert.equal(await tap(60, 360), "text", "a field in a frame of another site, in its own process");
      assert.equal(await tap(30, 405), "", "that frame's button");
      assert.equal(await tap(50, 25), "email", "and back to the page's own field");
      t.diagnostic(`answers took ${Math.min(...took)}-${Math.max(...took)} ms`);
      assert.ok(Math.max(...took) < 1_000, `each answer well under a second: ${took.join(",")}`);
    } finally {
      connection.close();
    }
  } finally {
    chrome.kill("SIGKILL");
    await new Promise((resolve) => main.close(resolve));
    await new Promise((resolve) => other.close(resolve));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
});

test("no Chrome on the agent's display is no keyboard, and the answer waits for the tap to land", async () => {
  const focus = await load();
  assert.equal(await focus.readTypingFocus(1), "", "nothing listens on port 1");
  const lines = [];
  const startedAt = Date.now();
  const read = focus.createTypingFocus({ displayFor: (id) => (id === "agent-1" ? 3 : undefined), portFor: (display) => display, settleMs: 120, log: (line) => lines.push(line) });
  assert.deepEqual(await read("agent-1"), { focus: "" });
  assert.ok(Date.now() - startedAt >= 120, "the tap gets its time to reach Chrome first");
  assert.match(lines[0], /^\[simeon\] typing-focus agent=agent-1 focus=none ms=\d+$/);
});
