/**
 * The browser helper that stays running (12 November 2026). On the
 * founder's cloud computer every browser step cost a second or more: a new
 * node process, Playwright loaded, a connection mapping every tab, the
 * step, a screenshot, a disconnect; and the agent took a snapshot after
 * almost every click. Now one helper per display keeps its connection and
 * serves the steps, a click hands back the page's snapshot, and a Chrome
 * left unused (nobody watching, not handed over) is closed and opened again
 * on the next step with its tabs and sign-ins.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROMIUM = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", process.env.SIMEON_TEST_CHROMIUM ?? ""].find((candidate) => candidate.length > 0 && existsSync(candidate));
const MARKER = "__SAND_BROWSER_RESULT__";

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, ms, what) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(100);
  }
  assert.fail(`timed out waiting for ${what}`);
}

/** A helper killed by the test leaves its socket file. */
async function removeSockets(source, displays) {
  const selfId = createHash("sha256").update(source).digest("hex").slice(0, 12);
  for (const n of displays) await rm(`/tmp/.sand-browser/daemon-${selfId}-${n}.sock`, { force: true });
}

const cdpUp = (port) => fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.ok, () => false);

test("an idle Chrome is closed only when nothing has used it for the idle time, nobody watches and it isn't handed over (a fake clock)", async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-driver-source.ts", "idle-verdict");
  try {
    const source = module.SAND_BROWSER_DRIVER_SOURCE;
    const fn = source.slice(source.indexOf("function idleCloseVerdict"), source.indexOf("\nfunction statePath"));
    const verdict = new Function(`${fn}; return idleCloseVerdict;`)();
    const minute = 60_000;
    const at = (minutes, extra = {}) => verdict({ nowMs: 1_000_000 + minutes * minute, lastUsedMs: 1_000_000, idleMs: 10 * minute, watched: false, held: false, busy: false, ...extra });
    assert.equal(at(9.9), "recent");
    assert.equal(at(10), "close");
    assert.equal(at(60), "close");
    assert.equal(at(60, { watched: true }), "watched", "a screen someone watches, or controls, is never closed");
    assert.equal(at(60, { held: true }), "held", "nor a computer handed to the person");
    assert.equal(at(60, { busy: true }), "busy");
    assert.equal(at(60, { idleMs: 0 }), "never", "0 turns closing off");
  } finally {
    await dispose();
  }
});

test("the idle time is SIMEON_BROWSER_IDLE_CLOSE_MINUTES, the earlier CLAIDOR_ name still read, 10 minutes by default", async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-tools.ts", "idle-setting");
  try {
    const { browserIdleCloseMs } = module;
    assert.equal(browserIdleCloseMs({}), 600_000);
    assert.equal(browserIdleCloseMs({ SIMEON_BROWSER_IDLE_CLOSE_MINUTES: "3" }), 180_000);
    assert.equal(browserIdleCloseMs({ CLAIDOR_BROWSER_IDLE_CLOSE_MINUTES: "4" }), 240_000);
    assert.equal(browserIdleCloseMs({ SIMEON_BROWSER_IDLE_CLOSE_MINUTES: "2", CLAIDOR_BROWSER_IDLE_CLOSE_MINUTES: "4" }), 120_000);
    assert.equal(browserIdleCloseMs({ SIMEON_BROWSER_IDLE_CLOSE_MINUTES: "0" }), 0);
    assert.equal(browserIdleCloseMs({ SIMEON_BROWSER_IDLE_CLOSE_MINUTES: "soon" }), 600_000);
  } finally {
    await dispose();
  }
});

/** Browser dependencies whose computer answers each step with `answer(request)`. */
function fakeComputer(answer) {
  const commands = [];
  const uploads = [];
  const downloads = [];
  const box = `box-${Math.random()}`;
  const dependencies = {
    resourceAccessor: { get() { throw new Error("unused"); } },
    getWindowIndex: async () => 3,
    getBoxId: () => box,
    getDefaultViewId: () => "agent",
    uploadFile: async (_context, _box, file) => { uploads.push(file); },
    downloadFile: async (_context, _box, file) => { downloads.push(file); return new Uint8Array([1, 2, 3]); },
    async executeShell(_context, input) {
      commands.push(input.command);
      if (input.command.startsWith("test -s")) return { case: "success", stdout: "present\n" };
      const request = JSON.parse(Buffer.from(input.command.split(" ").at(-1), "base64").toString("utf8"));
      return { case: "success", ...answer(request, commands.length) };
    },
  };
  return { dependencies, commands, uploads, downloads };
}

test("the host hands each step to the helper with the idle time, and shows a picture only when the screen changed", async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-tools.ts", "host-client");
  const saved = process.env.SIMEON_BROWSER_IDLE_CLOSE_MINUTES;
  process.env.SIMEON_BROWSER_IDLE_CLOSE_MINUTES = "7";
  try {
    let shot = "same";
    const fake = fakeComputer(() => ({ stdout: `\n${MARKER}${JSON.stringify({ ok: true, summary: "Done", screenshot: true, shot })}\n` }));
    const tools = module.createSandBrowserTools(fake.dependencies);
    const byName = (name) => tools.find((tool) => tool.name === name);
    const first = await byName("browser_snapshot").execute({}, {}, { toolCallId: "one" });
    const node = fake.commands.find((command) => command.startsWith("node "));
    assert.match(node, /^node \/tmp\/\.sand-browser\/driver-v3-[0-9a-f]{12}\.mjs --client [A-Za-z0-9+/=]+$/);
    const request = JSON.parse(Buffer.from(node.split(" ").at(-1), "base64").toString("utf8"));
    assert.equal(request.idleCloseMs, 7 * 60_000);
    assert.equal(request.display, 3);
    assert.equal(request.cdpPort, 9225);
    assert.ok(first.imageB64, "the first picture is shown");
    assert.equal(fake.downloads.length, 1);

    const second = await byName("browser_snapshot").execute({}, {}, { toolCallId: "two" });
    assert.equal(second.imageB64, undefined, "the same picture again is not shown");
    assert.equal(fake.downloads.length, 1, "nor fetched");
    assert.match(second.text, /The screen looks the same as in the last picture\./);

    const asked = await byName("browser_take_screenshot").execute({}, {}, { toolCallId: "three" });
    assert.ok(asked.imageB64, "an asked screenshot is always shown");

    shot = "changed";
    const third = await byName("browser_scroll").execute({}, {}, { toolCallId: "four" });
    assert.ok(third.imageB64, "a changed screen is shown");
    assert.doesNotMatch(third.text, /looks the same/);
  } finally {
    if (saved === undefined) delete process.env.SIMEON_BROWSER_IDLE_CLOSE_MINUTES;
    else process.env.SIMEON_BROWSER_IDLE_CLOSE_MINUTES = saved;
    await dispose();
  }
});

test("a computer that lost the helper's file gets it again and the step is asked once more", async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-tools.ts", "host-missing");
  try {
    const fake = fakeComputer((_request, count) => count <= 2
      ? { stderr: `node:internal/modules/run_main:123\nError: Cannot find module '${module.SAND_BROWSER_PLAYWRIGHT_BOX_DIR.replace(/playwright-core.*/, "driver-v3-x.mjs")}'`, stdout: "", exitCode: 1 }
      : { stdout: `\n${MARKER}${JSON.stringify({ ok: true, summary: "Clicked Save" })}\n` });
    const click = module.createSandBrowserTools(fake.dependencies).find((tool) => tool.name === "browser_click");
    const output = await click.execute({}, { ref: "e1", element: "Save" }, { toolCallId: "c" });
    assert.equal(output.isError, undefined, output.text);
    assert.match(output.text, /^Clicked Save/);
    assert.equal(fake.uploads.filter((file) => /driver-v3-[0-9a-f]{12}\.mjs$/.test(file)).length, 2, "written, then written again");
    assert.equal(fake.commands.filter((command) => command.startsWith("node ")).length, 2);
  } finally {
    await dispose();
  }
});

test("a hand-off keeps the agent's Chrome open: the mark is set when it starts and taken back when it ends", async () => {
  const { module, dispose } = await load("source/host/box/box-windows.ts", "browser-hold");
  const display = 470 + (process.pid % 20);
  try {
    const run = (held) => spawnSync("bash", ["-c", module.sandBrowserHoldCommand(held)], { env: { ...process.env, DISPLAY: `:${display}` } });
    assert.equal(run(true).status, 0);
    assert.ok(existsSync(`/tmp/.sand-browser/hold-${display}`));
    assert.equal(run(false).status, 0);
    assert.ok(!existsSync(`/tmp/.sand-browser/hold-${display}`));

    // A checkout card's mark: its own per agent and entry, on the window it
    // names, safe in the shell, taken back by name on any window.
    const shell = (command) => spawnSync("bash", ["-c", command], { env: { ...process.env, DISPLAY: ":1" } });
    const mark = (agentId, entryId) => `/tmp/.sand-browser/purchase-hold-${agentId}-${entryId}.${display}`;
    assert.equal(shell(module.sandBrowserHoldCommand(true, { purchase: { agentId: "a1", entryId: "t3s1" }, display })).status, 0);
    assert.equal(shell(module.sandBrowserHoldCommand(true, { purchase: { agentId: "x-a1", entryId: "t3s1" }, display })).status, 0);
    assert.equal(shell(module.sandBrowserHoldCommand(true, { purchase: { agentId: "a/1;touch /tmp/x", entryId: "t3s1" }, display })).status, 0);
    assert.ok(existsSync(mark("a1", "t3s1")), "on the window it names, not the shell's");
    assert.ok(existsSync(mark("a_1_touch__tmp_x", "t3s1")), "nothing but letters, digits, _ and - reach the shell");
    assert.ok(!existsSync(`/tmp/.sand-browser/hold-${display}`), "the hand-off's mark is another");
    assert.equal(shell(module.sandBrowserHoldCommand(false, { purchase: { agentId: "a1", entryId: "t3s1" } })).status, 0);
    assert.ok(!existsSync(mark("a1", "t3s1")));
    assert.ok(existsSync(mark("x-a1", "t3s1")), "another agent's card keeps its own");
    const production = await readFile(path.join(repoRoot, "source/host/extensions/session/production.ts"), "utf8");
    assert.match(production, /onStarted: event => \{\n\s*void holdHandoffBrowser\(box, requestContext, event\.agentId, true\);/);
    assert.match(production, /onEnded: event => \{\n\s*void holdHandoffBrowser\(box, requestContext, event\.agentId, false\);/);
  } finally {
    await rm(`/tmp/.sand-browser/hold-${display}`, { force: true });
    for (const name of readdirSync("/tmp/.sand-browser").filter((one) => one.startsWith("purchase-hold-") && one.endsWith(`.${display}`))) await rm(`/tmp/.sand-browser/${name}`, { force: true });
    await dispose();
  }
});

test("a checkout card's mark keeps Chrome open two hours at most, a hand-off's twelve, each on its own window (a fake clock)", async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-driver-source.ts", "held-by");
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-held-by-"));
  try {
    const source = module.SAND_BROWSER_DRIVER_SOURCE;
    const slice = (from, to) => { const at = source.indexOf(from); return source.slice(at, source.indexOf(to, at)); };
    const code = [slice("function holdPath", "\nfunction closedPath"), slice("function heldBy", "\nfunction noteUsed"), slice("function mtimeMs", "\n// The display's screen")].join("\n");
    const hour = 60 * 60 * 1000;
    const heldBy = new Function("STATE_DIR", "HOLD_MAX_MS", "PURCHASE_HOLD_MAX_MS", "statSync", "readdirSync", "unlinkSync", `${code}; return heldBy;`)(dir, 12 * hour, 2 * hour, statSync, readdirSync, unlinkSync);
    const card = path.join(dir, "purchase-hold-a1-t3s1.7");
    await writeFile(card, "");
    const at = statSync(card).mtimeMs;
    assert.equal(heldBy(7, at + 1000), "purchase");
    assert.equal(heldBy(8, at + 1000), undefined, "another window's Chrome is not held");
    assert.equal(heldBy(7, at + 2 * hour - 1000), "purchase");
    assert.equal(heldBy(7, at + 2 * hour + 1000), undefined, "after two hours a card nobody answered no longer holds it");
    assert.ok(!existsSync(card), "and its mark is removed");
    await writeFile(path.join(dir, "hold-7"), "");
    assert.equal(heldBy(7, at + 3 * hour), "handoff");
    assert.equal(heldBy(7, at + 13 * hour), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await dispose();
  }
});

// A store page: a session cookie (no expiry) signs the person in; Add to
// cart changes the page; Checkout goes to another page.
function storePage(signedIn) {
  return `<!doctype html><html><head><title>Store</title></head><body style="margin:0;font-family:sans-serif">
  <h1>${signedIn ? "Signed in as Ana" : "Signed out"}</h1>
  <p id="cart">Cart: 0</p>
  <button onclick="document.getElementById('cart').textContent = 'Cart: 1'; this.insertAdjacentHTML('afterend', '<button>Remove from cart</button>')">Add to cart</button>
  <a href="/checkout">Checkout</a>
  <input aria-label="Coupon">
</body></html>`;
}

test("the helper that stays running serves the steps, a click hands back the page's snapshot, and a refused helper falls back to one step", { skip: CHROMIUM === undefined ? "no Chromium here" : false, timeout: 120_000 }, async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-driver-source.ts", "driver-daemon");
  const site = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/checkout") return response.end("<!doctype html><title>Checkout</title><h1>Checkout</h1><button>Pay</button>");
    response.end(storePage(false));
  });
  await new Promise((resolve) => site.listen(0, "127.0.0.1", resolve));
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-driver-daemon-"));
  // The driver sits in the tree so it finds playwright-core as on the box; `/.tmp*/` is ignored by git.
  const driverDir = path.join(repoRoot, `.tmp-driver-daemon-${process.pid}`);
  const driver = path.join(driverDir, "driver.mjs");
  const port = 9400 + (process.pid % 150);
  const display = 400 + (process.pid % 60);
  const refused = display + 60;
  const startChrome = () => spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(dir, "profile")}`, "about:blank"], { stdio: "ignore" });
  let chrome = startChrome();
  const drive = async (request, args = ["--client"]) => {
    const encoded = Buffer.from(JSON.stringify({ display, cdpPort: port, viewId: "agent", ...request })).toString("base64");
    const child = spawn(process.execPath, [driver, ...args, encoded], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    await new Promise((resolve) => child.on("exit", resolve));
    return JSON.parse(out.slice(out.lastIndexOf(MARKER) + MARKER.length).trim());
  };
  const refOf = (text, label) => {
    const line = text.split("\n").find((one) => one.includes(label) && one.includes("[ref="));
    assert.ok(line, `${label} is read:\n${text}`);
    return /\[ref=([a-z0-9]+)\]/.exec(line)[1];
  };
  let impostor;
  try {
    await mkdir(driverDir, { recursive: true });
    await writeFile(driver, module.SAND_BROWSER_DRIVER_SOURCE);
    const selfId = createHash("sha256").update(module.SAND_BROWSER_DRIVER_SOURCE).digest("hex").slice(0, 12);
    const socketOf = (n) => `/tmp/.sand-browser/daemon-${selfId}-${n}.sock`;
    await waitFor(() => cdpUp(port), 10_000, "Chrome");
    const base = `http://127.0.0.1:${site.address().port}`;

    const opened = await drive({ op: "navigate", url: `${base}/` });
    assert.equal(opened.ok, true, JSON.stringify(opened));
    assert.equal(opened.served, "daemon", "the first step starts the helper and is its");
    assert.ok(existsSync(socketOf(display)));
    const snapshot = await drive({ op: "snapshot" });
    assert.equal(snapshot.served, "daemon");
    const add = refOf(snapshot.data, 'button "Add to cart"');
    const coupon = refOf(snapshot.data, 'textbox "Coupon"');

    // The click's answer is the page after it, with refs: the new button is
    // there, and the refs the agent already had still name the same elements.
    const clicked = await drive({ op: "click", ref: add, element: "Add to cart" });
    assert.equal(clicked.ok, true, JSON.stringify(clicked));
    assert.equal(clicked.summary, "Clicked Add to cart");
    assert.match(clicked.data, /^Page snapshot after it \(\d+ interactive refs\):\n/);
    assert.match(clicked.data, /Cart: 1/);
    assert.equal(refOf(clicked.data, 'button "Add to cart"'), add, "the same element keeps its ref");
    assert.equal(refOf(clicked.data, 'textbox "Coupon"'), coupon, "an element after a new one keeps its ref");
    const remove = refOf(clicked.data, 'button "Remove from cart"');
    assert.ok(![add, coupon].includes(remove), "a new element takes a new ref");
    const typed = await drive({ op: "type", ref: coupon, text: "SAVE10", element: "Coupon" });
    assert.equal(typed.ok, true, JSON.stringify(typed));
    assert.match(typed.data, /textbox "Coupon" \[ref=e\d+\] value="SAVE10"/);
    // Enter on a link opens its page, and the snapshot is that page's.
    assert.ok(refOf(typed.data, 'link "Checkout"'));
    const focused = await drive({ op: "cdp", method: "Runtime.evaluate", params: { expression: "document.querySelector('a').focus()" } });
    assert.equal(focused.ok, true, JSON.stringify(focused));
    const pressed = await drive({ op: "press_key", key: "Enter" });
    assert.equal(pressed.ok, true, JSON.stringify(pressed));
    assert.equal(pressed.url, `${base}/checkout`);
    assert.match(pressed.data, /button "Pay"/, "the snapshot after Enter is the page it opened");

    // Chrome restarted: the same helper connects again.
    const pid = readFileSync(`/tmp/.sand-browser/daemon-${display}.log`, "utf8").match(/pid (\d+)\] started/)[1];
    chrome.kill("SIGKILL");
    await new Promise((resolve) => chrome.once("exit", resolve));
    chrome = startChrome();
    await waitFor(() => cdpUp(port), 10_000, "Chrome again");
    const again = await drive({ op: "navigate", url: `${base}/` });
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(again.served, "daemon");
    assert.match(readFileSync(`/tmp/.sand-browser/daemon-${display}.log`, "utf8"), new RegExp(`pid ${pid}\\] connected to Chrome on port ${port}[\\s\\S]*pid ${pid}\\] connected to Chrome on port ${port}`), "the same helper, connected twice");

    // A helper that is there but takes no step: the step runs the one-step way.
    await mkdir("/tmp/.sand-browser", { recursive: true });
    impostor = net.createServer((socket) => socket.destroy());
    await new Promise((resolve) => impostor.listen(socketOf(refused), resolve));
    const fallback = await drive({ op: "navigate", url: `${base}/`, display: refused });
    assert.equal(fallback.ok, true, JSON.stringify(fallback));
    assert.equal(fallback.served, "once");
    assert.equal(fallback.title, "Store");
    assert.match(readFileSync(`/tmp/.sand-browser/daemon-${refused}.log`, "utf8"), /a navigate step ran the one-step way: the helper did not take it/);
  } finally {
    impostor?.close();
    spawnSync("pkill", ["-f", `${driver} --serve`]);
    chrome.kill("SIGKILL");
    site.close();
    await rm(driverDir, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    for (const n of [display, refused]) {
      for (const name of [`views-${n}.json`, `used-${n}`, `daemon-${n}.log`, `closed-${n}.json`]) await rm(`/tmp/.sand-browser/${name}`, { force: true });
    }
    await removeSockets(module.SAND_BROWSER_DRIVER_SOURCE, [display, refused]);
    await dispose();
  }
});

test("an unused Chrome is closed while nobody watches, it isn't handed over and no checkout card waits, then opens again with its tab and its sign-in", { skip: CHROMIUM === undefined ? "no Chromium here" : false, timeout: 120_000 }, async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-driver-source.ts", "driver-idle");
  const windows = await load("source/host/box/box-windows.ts", "idle-windows");
  const cards = await load("source/host/extensions/transcript/purchase-cards.ts", "idle-cards");
  const tool = await load("source/host/runner/tools/purchase-tool.ts", "idle-tool");
  const site = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/sign-in") {
      // A session cookie: no expiry, gone when the browser closes, unless kept.
      response.setHeader("set-cookie", "session=ana; Path=/");
      return response.end("<!doctype html><title>Signed in</title><a href='/'>Go to the store</a>");
    }
    response.end(storePage((request.headers.cookie ?? "").includes("session=ana")));
  });
  await new Promise((resolve) => site.listen(0, "127.0.0.1", resolve));
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-driver-idle-"));
  const driverDir = path.join(repoRoot, `.tmp-driver-idle-${process.pid}`);
  const driver = path.join(driverDir, "driver.mjs");
  const port = 9560 + (process.pid % 30);
  const display = 300 + (process.pid % 60);
  const profile = path.join(dir, "profile");
  // box-chrome as the computer has it, for this test: Chrome on the
  // display's port and profile, in the background, its pid kept.
  const bin = path.join(dir, "bin");
  const pidFile = path.join(dir, "chrome.pid");
  await mkdir(bin, { recursive: true });
  await writeFile(path.join(bin, "box-chrome"), `#!/bin/sh\n"${CHROMIUM}" --headless=new --no-sandbox --no-first-run --remote-debugging-port=${port} --user-data-dir=${profile} about:blank >/dev/null 2>&1 &\necho $! > "${pidFile}"\n`);
  await chmod(path.join(bin, "box-chrome"), 0o755);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  const drive = async (request) => {
    const encoded = Buffer.from(JSON.stringify({ display, cdpPort: port, viewId: "agent", idleCloseMs: 1200, ...request })).toString("base64");
    const child = spawn(process.execPath, [driver, "--client", encoded], { stdio: ["ignore", "pipe", "inherit"], env });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    await new Promise((resolve) => child.on("exit", resolve));
    return JSON.parse(out.slice(out.lastIndexOf(MARKER) + MARKER.length).trim());
  };
  const log = () => readFile(`/tmp/.sand-browser/daemon-${display}.log`, "utf8").catch(() => "");
  // A viewer on the display's screen: an established connection to its VNC port.
  const vncPort = 5900 + display;
  const vnc = net.createServer(() => {});
  let viewer;
  try {
    await mkdir(driverDir, { recursive: true });
    await writeFile(driver, module.SAND_BROWSER_DRIVER_SOURCE);
    await new Promise((resolve) => vnc.listen(vncPort, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${site.address().port}`;

    // The first step starts Chrome (through box-chrome) and signs in.
    assert.equal((await drive({ op: "navigate", url: `${base}/sign-in` })).ok, true);
    const store = await drive({ op: "navigate", url: `${base}/` });
    assert.equal(store.ok, true, JSON.stringify(store));
    assert.equal(store.served, "daemon");
    assert.match((await drive({ op: "snapshot" })).data, /Signed in as Ana/);

    // Watched: unused for longer than the idle time, still open.
    viewer = net.connect(vncPort, "127.0.0.1");
    await new Promise((resolve) => viewer.once("connect", resolve));
    await sleep(2500);
    assert.equal(await cdpUp(port), true, "a watched screen's Chrome stays open");
    assert.match(await log(), /Chrome kept open: someone is watching the screen/);

    // Handed over: still open with nobody watching.
    viewer.destroy();
    await writeFile(`/tmp/.sand-browser/hold-${display}`, "");
    await sleep(2500);
    assert.equal(await cdpUp(port), true, "a computer handed to the person keeps its Chrome");
    assert.match(await log(), /Chrome kept open: the computer is handed to the person/);

    // A checkout card waits for the person (RequestPurchase's hold, as the
    // host sets it): still open with nobody watching and no hand-off.
    const shellOnThisComputer = { get: () => ({ execute: async (_context, shellArgs) => spawnSync("bash", ["-c", shellArgs.command]) }) };
    const purchaseMark = `/tmp/.sand-browser/purchase-hold-a1-t3s1.${display}`;
    await windows.module.setSandBrowserHold({}, shellOnThisComputer, true, { purchase: { agentId: "a1", entryId: "t3s1" }, display });
    assert.ok(existsSync(purchaseMark));
    await rm(`/tmp/.sand-browser/hold-${display}`, { force: true });
    await sleep(2500);
    assert.equal(await cdpUp(port), true, "a checkout card waiting for the person keeps its Chrome");
    assert.match(await log(), /Chrome kept open: a checkout card waits for the person/);

    // The person answers it (Deny): the purchase ends, its mark goes, and the
    // idle close runs again. Closed, its tab and session cookie written down,
    // the helper gone.
    const message = tool.module.purchaseCardFromArgs({ merchant_name: "Store", checkout_url: `https://store.example/checkout`, items: [{ name: "Shirt", quantity: 1, unit_amount: 2000 }], total: 2000, currency: "usd", credential_type: "card" }, { ok: true, paymentMethodId: "csmrpd_visa", card: { brand: "Visa", last4: "1234" } }, undefined);
    const entries = [{ kind: "send-message", id: "t3s1", timestampMs: 42, message }];
    const db = { getTranscriptEntries: () => entries, updateTranscriptEntry: (id, update) => { const index = entries.findIndex((item) => item.id === id); if (index >= 0) entries[index] = update(entries[index]); } };
    const purchases = new cards.module.PurchaseCards({
      sessions: { activeSession: { id: "a1", db }, liveSessions: new Map(), inMemoryTranscriptAgentId: "a1", isAgentGone: () => false },
      sessionStore: { readAgentTranscriptEntries: () => [], withAgentDb: async () => undefined },
      roster: { emit: () => {}, emitAgentUpdate: async () => undefined },
      backgroundWakes: { runHiddenPromptWake: async () => {} },
    }, { retryDelayMs: 0, log: () => undefined });
    purchases.setPurchaseBrowserRelease((agentId, entryId) => windows.module.setSandBrowserHold({}, shellOnThisComputer, false, { purchase: { agentId, entryId } }));
    await purchases.answerPurchase({ agentId: "a1", entryId: "t3s1", allow: false }, undefined);
    assert.equal(entries[0].purchaseState, "denied");
    await waitFor(() => !existsSync(purchaseMark), 5_000, "the card's mark to go");
    await waitFor(async () => !(await cdpUp(port)), 10_000, "the idle close");
    await waitFor(async () => /closed Chrome after [\d.]+ min unused, nobody watching, not handed over, no checkout card waiting \(1 tab\(s\) kept to reopen\)/.test(await log()), 5_000, "the close's log line");
    const record = JSON.parse(await readFile(`/tmp/.sand-browser/closed-${display}.json`, "utf8"));
    assert.equal(record.tabs.length, 1);
    assert.equal(record.tabs[0].url, `${base}/`);
    assert.deepEqual(record.tabs[0].viewIds, ["agent"]);
    assert.ok(record.sessionCookies.some((cookie) => cookie.name === "session" && cookie.value === "ana"));
    await waitFor(async () => /ending: closed Chrome/.test(await log()), 5_000, "the helper to end");

    // The next step opens Chrome again on the same profile: the agent's tab, signed in.
    const back = await drive({ op: "snapshot" });
    assert.equal(back.ok, true, JSON.stringify(back));
    assert.equal(back.url, `${base}/`, "the agent's own tab again");
    assert.match(back.data, /Signed in as Ana/, "and its sign-in, though the cookie ended with the browser");
    assert.ok(!existsSync(`/tmp/.sand-browser/closed-${display}.json`), "the record is read once");
  } finally {
    viewer?.destroy();
    vnc.close();
    spawnSync("pkill", ["-f", `${driver} --serve`]);
    const chromePid = Number(await readFile(pidFile, "utf8").catch(() => ""));
    if (chromePid > 0) { try { process.kill(chromePid, "SIGKILL"); } catch {} }
    spawnSync("pkill", ["-f", `--user-data-dir=${profile}`]);
    site.close();
    await sleep(300);
    await rm(driverDir, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    for (const name of [`views-${display}.json`, `used-${display}`, `daemon-${display}.log`, `closed-${display}.json`, `hold-${display}`, `purchase-hold-a1-t3s1.${display}`]) await rm(`/tmp/.sand-browser/${name}`, { force: true });
    await removeSockets(module.SAND_BROWSER_DRIVER_SOURCE, [display]);
    await Promise.all([dispose(), windows.dispose(), cards.dispose(), tool.dispose()]);
  }
});
