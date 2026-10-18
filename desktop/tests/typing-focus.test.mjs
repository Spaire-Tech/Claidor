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
 *
 * The press decides, not which page says it has the focus: with the agent's
 * browser helper attached (Playwright, as `sand-browser-driver-source.ts`
 * attaches), every tab says it has the focus, and the first version took a
 * field the agent had left focused in a tab behind.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
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

/** A Chromium on a DevTools port of its own, opened on `url`; `stop` ends it. */
async function startChromium(focus, url, ready) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "simeon-typing-focus-chrome-"));
  const devtools = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${devtools}`, `--user-data-dir=${profile}`, "--window-size=800,700", url], { stdio: "ignore" });
  let targets = [];
  for (let attempt = 0; attempt < 100; attempt += 1) {
    targets = await focus.listFocusTargets(devtools);
    if (ready(targets)) break;
    await wait(100);
  }
  return {
    devtools,
    targets,
    async stop() {
      chrome.kill("SIGKILL");
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    },
  };
}

/** A person's tap or key, as the screen's mouse and keyboard deliver them: real input, through the page's DevTools. */
function hands(connection) {
  return {
    async tap(x, y) {
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
        await connection.send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 });
      }
    },
    async enter() {
      await connection.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
      await connection.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    },
  };
}

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
  const chromium = await startChromium(focus, `http://127.0.0.1:${main.address().port}/`, (targets) => targets.some((target) => target.type === "iframe") && targets.some((target) => target.type === "page"));
  try {
    assert.ok(chromium.targets.some((target) => target.type === "iframe"), `the other site's frame runs in a process of its own: ${JSON.stringify(chromium.targets)}`);
    const page = chromium.targets.find((target) => target.type === "page");
    const connection = await focus.CdpConnection.open(page.socketUrl);
    const lines = [];
    const read = focus.createTypingFocus({ displayFor: () => chromium.devtools, portFor: (display) => display, settleMs: 50, log: (line) => lines.push(line) });
    // The person takes control: every frame gets its listener.
    assert.deepEqual(await read("agent-1", true), { focus: "" });
    assert.match(lines.at(-1), new RegExp(`^\\[simeon\\] typing-focus prepared agent=agent-1 port=${chromium.devtools} ms=\\d+$`));
    const { tap } = hands(connection);
    const took = [];
    const after = async (x, y) => {
      await tap(x, y);
      const startedAt = Date.now();
      const { focus: answer } = await read("agent-1");
      took.push(Date.now() - startedAt);
      assert.match(lines.at(-1), / by=press /, `the press was seen: ${lines.at(-1)}`);
      return answer;
    };
    try {
      assert.equal(await after(50, 25), "email", "the page's own email field");
      assert.equal(await after(40, 65), "", "a button puts the keyboard away");
      assert.equal(await after(300, 25), "", "a read-only field takes no typing");
      assert.equal(await after(300, 65), "text", "a text area");
      assert.equal(await after(600, 600), "", "an empty part of the page");
      assert.equal(await after(60, 120), "password", "a field in a frame of the page's own address");
      assert.equal(await after(30, 165), "", "that frame's button");
      assert.equal(await after(60, 240), "text", "a field in a frame of another address on the same site (Apple's sign-in)");
      assert.equal(await after(30, 285), "", "that frame's button");
      assert.equal(await after(60, 360), "text", "a field in a frame of another site, in its own process");
      assert.equal(await after(30, 405), "", "that frame's button");
      assert.equal(await after(50, 25), "email", "and back to the page's own field");
      t.diagnostic(`answers took ${Math.min(...took)}-${Math.max(...took)} ms`);
      assert.ok(Math.max(...took) < 1_000, `each answer well under a second: ${took.join(",")}`);
    } finally {
      connection.close();
    }
  } finally {
    await chromium.stop();
    await new Promise((resolve) => main.close(resolve));
    await new Promise((resolve) => other.close(resolve));
  }
});

test("with the agent's browser helper attached, the tab in front answers, not a field left focused in a tab behind; Return follows the focus", { skip: CHROMIUM === undefined ? "no Chromium here" : false, timeout: 60_000 }, async () => {
  const focus = await load();
  const signIn = `<!doctype html><body style="margin:0">
    <input type="email" id="e" style="position:absolute;left:10px;top:10px;width:200px;height:30px">
    <input type="password" id="p" style="position:absolute;left:10px;top:60px;width:200px;height:30px">
    <button style="position:absolute;left:10px;top:110px;width:100px;height:30px">Go</button>
    <script>
      e.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); p.focus(); } });
      p.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); p.blur(); } });
    </script></body>`;
  const server = await serve({ "/behind": signIn, "/front": signIn, "/later": signIn });
  const base = `http://127.0.0.1:${server.address().port}`;
  const chromium = await startChromium(focus, `${base}/behind`, (targets) => targets.some((target) => target.type === "page"));
  const playwright = createRequire(import.meta.url)("playwright-core");
  // The helper, as it attaches (`chromium.connectOverCDP`, focus emulation on in every page).
  const browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${chromium.devtools}`, { timeout: 10_000 });
  try {
    const context = browser.contexts()[0];
    const behind = context.pages()[0];
    await behind.click("#e");
    const front = await context.newPage();
    await front.goto(`${base}/front`);
    await front.bringToFront();
    assert.equal(await behind.evaluate(() => document.hasFocus()), true, "under the helper the tab behind says it has the focus too");
    // The agent's own clicks are a few seconds old by the person's first tap (Chrome's user activation lasts five).
    await wait(5_200);
    // The person's taps and keys reach the front tab as real input.
    const session = await context.newCDPSession(front);
    const { tap, enter } = hands({ send: (method, params) => session.send(method, params) });
    const lines = [];
    const read = focus.createTypingFocus({ displayFor: () => chromium.devtools, portFor: (display) => display, settleMs: 50, retryMs: 60, log: (line) => lines.push(line) });
    const ask = async () => (await read("agent-1")).focus;

    // An older phone that never prepared: the first tap is still the front tab's.
    await tap(40, 125);
    assert.equal(await ask(), "", "the front tab's button, though a tab behind has its email field focused");
    await tap(50, 25);
    assert.equal(await ask(), "email", "the front tab's email field");
    await enter();
    assert.equal(await ask(), "password", "Return moved the focus on to the password field");
    await enter();
    assert.equal(await ask(), "", "Return on the password field took the focus away");
    await tap(50, 75);
    assert.equal(await ask(), "password", "the password field");
    await tap(600, 400);
    assert.equal(await ask(), "", "an empty part of the page");

    // The page in front changes (the agent or a link): the new page has no listener yet.
    await front.goto(`${base}/later`);
    await wait(5_200);
    await tap(50, 25);
    assert.equal(await ask(), "email", "a field of a page newer than the last question");
    assert.match(lines.at(-1), / by=unwatched /);
    await tap(40, 125);
    assert.equal(await ask(), "", "and its button, seen by its listener now");
    assert.match(lines.at(-1), / by=press /);
    await session.detach().catch(() => {});
  } finally {
    await browser.close().catch(() => {});
    await chromium.stop();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("the press decides; without one, only a page new since the last question that a real press just reached", async () => {
  const focus = await load();
  const frame = (target, kind, pressedAt, more = {}) => ({ target, kind, pressedAt, fresh: false, focused: true, activated: false, born: 1, ...more });
  const reports = [frame("behind", "email", 0), frame("front", "", 500), frame("front-frame", "password", 900, { focused: false })];
  assert.equal(focus.pressedFrame(reports, 0)?.target, "front-frame", "the newest press");
  assert.equal(focus.pressedFrame(reports, 900), undefined, "none newer than the last used");
  assert.equal(focus.pressedFrame(reports, 600)?.kind, "password");
  // No press seen: the focus emulation says every page is focused, so that alone decides nothing.
  assert.equal(focus.unwatchedKeyboard([frame("behind", "email", 0, { fresh: true })]), "", "a field left focused in a tab behind, no press reached it");
  assert.equal(focus.unwatchedKeyboard([frame("behind", "email", 0, { fresh: true }), frame("new", "search", 0, { fresh: true, activated: true, born: 5 })]), "search", "the new page a press just reached");
  assert.equal(focus.unwatchedKeyboard([frame("old", "email", 0, { activated: true })]), "", "a page that had its listener and saw no press: the tap was not in it");
  assert.equal(focus.unwatchedKeyboard([frame("new", "frame", 0, { fresh: true, activated: true }), frame("inner", "text", 0, { fresh: true, activated: true, born: 0 })]), "text", "the focus went on into a frame, which answers for itself");
});

test("no Chrome on the agent's display is no keyboard, and the answer waits for the tap to land", async () => {
  const focus = await load();
  assert.deepEqual(await focus.readTypingFocus(1, { retryMs: 5 }), { focus: "", by: "none", frames: 0, lastPressAt: 0 }, "nothing listens on port 1");
  const lines = [];
  const startedAt = Date.now();
  const read = focus.createTypingFocus({ displayFor: (id) => (id === "agent-1" ? 3 : undefined), portFor: (display) => display, settleMs: 120, retryMs: 5, log: (line) => lines.push(line) });
  assert.deepEqual(await read("agent-1"), { focus: "" });
  assert.ok(Date.now() - startedAt >= 120, "the tap gets its time to reach Chrome first");
  assert.match(lines[0], /^\[simeon\] typing-focus agent=agent-1 port=3 focus=none by=none frames=0 ms=\d+$/);
  assert.deepEqual(await read("agent-1", true), { focus: "" });
  assert.match(lines[1], /^\[simeon\] typing-focus prepared agent=agent-1 port=3 ms=\d+$/);
});

test("a bot check handed to the person is left alone and watched: the hand-over names it and the way out, and whether it cleared is logged (18 October 2026)", async () => {
  const focus = await load();
  // PzDeals' Cloudflare wall, as the founder was handed it: no listener goes into the page or its check frame.
  assert.equal(focus.isBotCheckTarget({ type: "page", url: "https://www.pzdeals.com/products/dell-se2225h", title: "Just a moment..." }), true);
  assert.equal(focus.isBotCheckTarget({ type: "iframe", url: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv/abc", title: "" }), true);
  assert.equal(focus.isBotCheckTarget({ type: "page", url: "https://www.pzdeals.com/products/dell-se2225h", title: "Dell SE2225H" }), false);
  assert.equal(focus.isBotCheckTarget({ type: "page", url: "https://gelectronic.store/checkout", title: "Sign in - G-electronic" }), false);

  const wall = { family: "cloudflare_challenge", host: "pzdeals.com" };
  const answers = [wall, wall, undefined];
  let asked = 0;
  const lines = [];
  const options = { displayFor: () => 4, portFor: (display) => display, settleMs: 0, retryMs: 1, retries: 0, log: (line) => lines.push(line), exitNetwork: async () => "ip=34.1.2.3 colo=SEA loc=US" };
  const read = focus.createTypingFocus({ ...options, botCheck: async () => answers[Math.min(asked++, answers.length - 1)] });
  await read("agent-1", true);
  await read("agent-1");
  await read("agent-1");
  await read("agent-1");
  const checks = lines.filter((line) => line.includes("bot-check"));
  assert.equal(checks[0], "[simeon] bot-check handed-over agent=agent-1 cloudflare_challenge on pzdeals.com exit ip=34.1.2.3 colo=SEA loc=US");
  assert.match(checks[1], /^\[simeon\] bot-check cleared agent=agent-1 on pzdeals\.com after \d+s and 2 tap\(s\)$/);
  assert.equal(checks.length, 2, "nothing more once it cleared");

  // A wall that never clears says so every fifth tap; no wall, no lines.
  const stuck = [];
  const stuckRead = focus.createTypingFocus({ ...options, log: (line) => stuck.push(line), botCheck: async () => wall });
  await stuckRead("agent-2", true);
  for (let tap = 0; tap < 5; tap += 1) await stuckRead("agent-2");
  assert.match(stuck.filter((line) => line.includes("bot-check")).at(-1), /^\[simeon\] bot-check still-shown agent=agent-2 on pzdeals\.com after \d+s and 5 tap\(s\)$/);
  const quiet = [];
  const quietRead = focus.createTypingFocus({ ...options, log: (line) => quiet.push(line), botCheck: async () => undefined });
  await quietRead("agent-3", true);
  await quietRead("agent-3");
  assert.equal(quiet.filter((line) => line.includes("bot-check")).length, 0);
});
