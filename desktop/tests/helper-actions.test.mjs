/**
 * The browser and desktop helpers on a checkout (18 October 2026). The
 * founder's agent could not fill an Altex checkout: the page reader saw 6 of
 * its 30 fields, because Shopify wraps the whole form in a `display:
 * contents` element, which has no size and read as hidden. The browser
 * helper then clicked the email field and pressed a key in one step, and the
 * press landed first. The desktop helper's first click said `left_click`,
 * Claude's own name for it, and was refused.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROMIUM = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", process.env.SIMEON_TEST_CHROMIUM ?? ""].find((candidate) => candidate.length > 0 && existsSync(candidate));

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

// The shape of Shopify's checkout form, as read off altex.com: the fields sit inside a form drawn with display: contents.
const CHECKOUT = `<!doctype html><html><body>
  <a href="/cart">Cart</a>
  <form style="display: contents">
    <div><label for="email">Email or mobile phone number</label><input id="email" name="email" type="email"></div>
    <div style="display: contents"><input name="firstName" aria-label="First name"><input name="lastName" aria-label="Last name"></div>
    <select aria-label="State"><option>California</option></select>
    <button type="submit">Pay now $179.99</button>
  </form>
  <div style="display: contents" aria-hidden="true"><input aria-label="Hidden for everyone"></div>
  <div style="display: none"><input aria-label="Not shown"></div>
</body></html>`;

test("the page reader sees the fields inside an element drawn with display: contents, as on Shopify's checkout", { skip: CHROMIUM === undefined ? "no Chromium here" : false, timeout: 60_000 }, async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-driver-source.ts", "driver-source");
  const source = module.SAND_BROWSER_DRIVER_SOURCE;
  const fn = source.slice(source.indexOf("const SNAPSHOT_FN = ") + "const SNAPSHOT_FN = ".length, source.indexOf("\nfunction clickOptionsFor")).trim().replace(/;$/, "");
  const { chromium } = await import(pathToFileURL(path.join(repoRoot, "node_modules/playwright-core/index.mjs")).href);
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  try {
    const page = await browser.newPage();
    await page.setContent(CHECKOUT);
    const snapshot = await page.evaluate(`(${fn})({ interactive: false, maxDepth: 20 })`);
    const refs = snapshot.lines.filter((line) => line.includes("[ref="));
    assert.equal(snapshot.refCount, 6, snapshot.lines.join("\n"));
    assert.ok(refs.some((line) => line.includes('textbox "Email or mobile phone number"')), refs.join("\n"));
    assert.ok(refs.some((line) => line.includes('textbox "First name"')) && refs.some((line) => line.includes('textbox "Last name"')), refs.join("\n"));
    assert.ok(refs.some((line) => line.includes('combobox "State"')), refs.join("\n"));
    assert.ok(refs.some((line) => line.includes('button "Pay now $179.99"')), refs.join("\n"));
    assert.ok(!snapshot.lines.some((line) => line.includes("Hidden for everyone") || line.includes("Not shown")), snapshot.lines.join("\n"));
  } finally {
    await browser.close();
    await dispose();
  }
});

test("the desktop helper reads Claude's own names for its actions", async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-computer-tool.ts", "computer-tool");
  try {
    const parameters = module.buildComputerParameters();
    assert.deepEqual(parameters.parse({ action: "left_click", x: 370, y: 403 }), { action: "click", x: 370, y: 403 });
    assert.equal(parameters.parse({ action: "right_click", x: 1, y: 2 }).button, "right");
    assert.equal(parameters.parse({ action: "double_click", x: 1, y: 2 }).count, 2);
    assert.equal(parameters.parse({ action: "mouse_move", x: 1, y: 2 }).action, "move");
    // The founder's log: a left_click with typing and another left_click after it.
    const batch = parameters.parse({ action: "left_click", x: 370, y: 403, then: [{ action: "type", text: "a" }, { action: "left_click", x: 264, y: 692 }] });
    assert.deepEqual(batch.then.map((one) => one.action), ["type", "click"]);
    // Our own names, and a name that is no one's, are as before.
    assert.equal(parameters.parse({ action: "click", x: 1, y: 2 }).action, "click");
    assert.equal(parameters.safeParse({ action: "tap", x: 1, y: 2 }).success, false);
  } finally {
    await dispose();
  }
});

test("a helper's actions in one step run one after another, in the order asked", async () => {
  const { module, dispose } = await load("source/host/runner/tools/one-at-a-time.ts", "one-at-a-time");
  try {
    const inTurn = module.createOneAtATime();
    const order = [];
    const slow = inTurn(async () => { order.push("click starts"); await new Promise((resolve) => setTimeout(resolve, 30)); order.push("click ends"); return "clicked"; });
    const failing = inTurn(async () => { order.push("key"); throw new Error("no page"); });
    const after = inTurn(async () => { order.push("snapshot"); return "read"; });
    assert.equal(await slow, "clicked");
    await assert.rejects(failing, /no page/);
    assert.equal(await after, "read");
    assert.deepEqual(order, ["click starts", "click ends", "key", "snapshot"]);
  } finally {
    await dispose();
  }
  const browser = await readFile(path.join(repoRoot, "source/host/runner/tools/sand-browser-tools.ts"), "utf8");
  assert.match(browser, /execute: \(context, args, metadata\) => inTurn\(\(\) => runBrowserSpec\(/);
  const computer = await readFile(path.join(repoRoot, "source/host/runner/tools/sand-computer-tool.ts"), "utf8");
  assert.match(computer, /return inTurn\(\(\) => act\(raw, meta\)\);/);
});
