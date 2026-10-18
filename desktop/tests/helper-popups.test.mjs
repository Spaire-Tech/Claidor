/**
 * A store's popup over the button a helper clicks (18 October 2026). Rhea's
 * browser helper clicked Deskery's "Add to cart" just as its "Get 10% off
 * your first order" popup opened over it; the click waited ten seconds,
 * failed with Playwright's call log, and the helper went no further. A click
 * now closes such a popup by its own way out ("No, thanks", a close ×, else
 * Escape) and lands; one it can't clear says what is in the way.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

// Deskery's product page as it was: Add to cart, and Klaviyo's sign-up popup
// over the page with its email field, "Get My 10% Off" and "No, thanks".
const STORE = `<!doctype html><html><body style="margin:0;font-family:sans-serif">
  <h1>deli 17-piece office supplies set</h1>
  <p id="cart">Cart: 0</p>
  <button id="add" style="margin:40px 200px;padding:12px 40px" onclick="document.getElementById('cart').textContent = 'Cart: 1'">Add to cart</button>
  <button id="other" style="margin:40px 200px;padding:12px 40px" onclick="this.textContent = 'Wishlisted'">Add to wishlist</button>
  <div id="popup" style="position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1000">
    <div role="dialog" aria-label="Get 10% off" style="position:absolute;left:150px;top:20px;width:420px;background:#fff;padding:20px">
      <h2>Get 10% Off Your First Deskery Order</h2>
      <input aria-label="Enter your email">
      <button onclick="document.body.dataset.subscribed = 'yes'">Get My 10% Off</button>
      <button onclick="document.getElementById('popup').remove()">No, thanks</button>
    </div>
  </div>
</body></html>`;

// A popup with no button of its own that Escape closes; and a cover nothing closes.
const ESCAPE_ONLY = `<!doctype html><html><body style="margin:0">
  <button id="add" style="margin:40px 200px;padding:12px 40px" onclick="this.textContent = 'Added'">Add to cart</button>
  <div id="sheet" style="position:fixed;inset:0;background:rgba(0,0,0,0.3)"><p style="background:#fff;margin:20px">Sign up for our newsletter</p></div>
  <script>document.addEventListener("keydown", (event) => { if (event.key === "Escape") document.getElementById("sheet")?.remove(); });</script>
</body></html>`;
const STUCK = `<!doctype html><html><body style="margin:0">
  <button id="add" style="margin:40px 200px;padding:12px 40px">Add to cart</button>
  <div style="position:fixed;inset:0;background:rgba(0,0,0,0.3)"><p style="background:#fff;margin:20px">Please wait while we load your offer</p></div>
</body></html>`;

test("a click closes a store's sign-up popup by its \"No, thanks\" and lands; Escape closes one without a button; one nothing closes is named", { skip: CHROMIUM === undefined ? "no Chromium here" : false, timeout: 120_000 }, async () => {
  const { createServer } = await import("node:http");
  const { spawn } = await import("node:child_process");
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-driver-source.ts", "driver-popups");
  const site = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(request.url === "/escape" ? ESCAPE_ONLY : request.url === "/stuck" ? STUCK : STORE);
  });
  await new Promise((resolve) => site.listen(0, "127.0.0.1", resolve));
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-driver-popups-"));
  const driverDir = path.join(repoRoot, `.tmp-driver-popups-${process.pid}`);
  const driver = path.join(driverDir, "driver.mjs");
  const port = 9100 + (process.pid % 190);
  const display = 700 + (process.pid % 90);
  const chrome = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--no-first-run", "--window-size=1280,800", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(dir, "profile")}`, "about:blank"], { stdio: "ignore" });
  const drive = async (request) => {
    const encoded = Buffer.from(JSON.stringify({ display, cdpPort: port, viewId: "test", ...request })).toString("base64");
    const child = spawn(process.execPath, [driver, encoded], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    await new Promise((resolve) => child.on("exit", resolve));
    const marker = out.lastIndexOf(module.SAND_BROWSER_RESULT_MARKER);
    return JSON.parse(out.slice(marker + module.SAND_BROWSER_RESULT_MARKER.length).trim());
  };
  const refOf = (text, label) => {
    const line = text.split("\n").find((one) => one.includes(label) && one.includes("[ref="));
    assert.ok(line, `${label} is read:\n${text}`);
    return /\[ref=([a-z0-9]+)\]/.exec(line)[1];
  };
  const read = async () => {
    const snapshot = await drive({ op: "snapshot" });
    assert.equal(snapshot.ok, true, JSON.stringify(snapshot));
    return snapshot.data;
  };
  try {
    await mkdir(driverDir, { recursive: true });
    await writeFile(driver, module.SAND_BROWSER_DRIVER_SOURCE);
    for (let tries = 0; tries < 50; tries += 1) {
      if (await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const base = `http://127.0.0.1:${site.address().port}`;

    assert.equal((await drive({ op: "navigate", url: `${base}/` })).ok, true);
    let page = await read();
    const started = Date.now();
    const added = await drive({ op: "click", ref: refOf(page, 'button "Add to cart"'), element: "Add to cart, to put the set in the cart" });
    assert.equal(added.ok, true, JSON.stringify(added));
    assert.equal(added.summary, 'Closed a popup over it first ("No, thanks"). Clicked Add to cart, to put the set in the cart');
    assert.ok(Date.now() - started < 8000, "no ten-second wait on the covered button");
    page = await read();
    assert.match(page, /Cart: 1/);
    assert.doesNotMatch(page, /Get My 10% Off/, "the popup is gone");
    // The offer itself was never taken.
    const typed = await drive({ op: "click", ref: refOf(page, 'button "Add to wishlist"'), element: "Add to wishlist" });
    assert.equal(typed.summary, "Clicked Add to wishlist", "nothing over it now, nothing said");

    assert.equal((await drive({ op: "navigate", url: `${base}/escape` })).ok, true);
    page = await read();
    const escaped = await drive({ op: "click", ref: refOf(page, 'button "Add to cart"'), element: "Add to cart" });
    assert.equal(escaped.ok, true, JSON.stringify(escaped));
    assert.equal(escaped.summary, "Pressed Escape to close a popup over it first. Clicked Add to cart");
    assert.match(await read(), /button "Added"/);

    assert.equal((await drive({ op: "navigate", url: `${base}/stuck` })).ok, true);
    page = await read();
    const stuck = await drive({ op: "click", ref: refOf(page, 'button "Add to cart"'), element: "Add to cart" });
    assert.equal(stuck.ok, false);
    assert.match(stuck.error, /^Clicking Add to cart didn't work: something on the page is over it \(div "Please wait while we load your offer"\), most likely a popup or banner\. Close it first/);
  } finally {
    chrome.kill("SIGKILL");
    site.close();
    await rm(driverDir, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    await rm(`/tmp/.sand-browser/views-${display}.json`, { force: true });
    await dispose();
  }
});
