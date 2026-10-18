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

// Shopify's store sign-in, as read off gelectronic.store on 18 October 2026:
// the email field and Continue in the page, "Continue with Shop" in
// <shop-login>'s open shadow root, which holds a frame from another site.
function signInPage(otherOrigin) {
  return `<!doctype html><html><body>
  <h1>Sign in</h1>
  <input aria-label="Email"><button onclick="this.textContent='Continue pressed'">Continue</button>
  <shop-login></shop-login>
  <iframe src="/code" width="320" height="90"></iframe>
  <iframe src="/hidden" width="0" height="0" style="border:0"></iframe>
  <script>
    customElements.define("shop-login", class extends HTMLElement {
      constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = '<button onclick="this.textContent=\\'Shop pressed\\'">Continue with Shop</button>'
          + '<a href="#" onclick="this.textContent=\\'Email chosen\\'; return false">Use email instead</a>'
          + '<iframe src="${otherOrigin}/shop" width="320" height="90"></iframe>';
      }
    });
  </script>
</body></html>`;
}

test("the page reader reads a sign-in drawn in a shadow root and in frames, and the helper clicks and types there (18 October 2026)", { skip: CHROMIUM === undefined ? "no Chromium here" : false, timeout: 90_000 }, async () => {
  const { createServer } = await import("node:http");
  const { spawn } = await import("node:child_process");
  const { writeFile } = await import("node:fs/promises");
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-driver-source.ts", "driver-frames");
  // Two sites: the store's page and Shop's frame (localhost and 127.0.0.1 are different sites, so the frame is out of process, as Shop's is).
  const shop = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><body><button onclick="this.textContent='Frame pressed'">Inside Shop's frame</button></body>`);
  });
  await new Promise((resolve) => shop.listen(0, "127.0.0.1", resolve));
  const store = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    if (request.url === "/code") return response.end(`<!doctype html><body><input aria-label="Sign-in code"></body>`);
    if (request.url === "/hidden") return response.end(`<!doctype html><body><button>Tracking</button></body>`);
    response.end(signInPage(`http://127.0.0.1:${shop.address().port}`));
  });
  await new Promise((resolve) => store.listen(0, "127.0.0.1", resolve));
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-driver-frames-"));
  // The driver sits in the tree so it finds playwright-core as on the box; `/.tmp*/` is ignored by git.
  const driverDir = path.join(repoRoot, `.tmp-driver-${process.pid}`);
  const driver = path.join(driverDir, "driver.mjs");
  const port = 9600 + (process.pid % 300);
  const display = 900 + (process.pid % 90);
  const chrome = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(dir, "profile")}`, "about:blank"], { stdio: "ignore" });
  const drive = async (request) => {
    const encoded = Buffer.from(JSON.stringify({ display, cdpPort: port, viewId: "test", ...request })).toString("base64");
    const child = spawn(process.execPath, [driver, encoded], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    await new Promise((resolve) => child.on("exit", resolve));
    const marker = out.lastIndexOf(module.SAND_BROWSER_RESULT_MARKER);
    return JSON.parse(out.slice(marker + module.SAND_BROWSER_RESULT_MARKER.length).trim());
  };
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(driverDir, { recursive: true });
    await writeFile(driver, module.SAND_BROWSER_DRIVER_SOURCE);
    for (let tries = 0; tries < 50; tries += 1) {
      if (await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const opened = await drive({ op: "navigate", url: `http://localhost:${store.address().port}/` });
    assert.equal(opened.ok, true, JSON.stringify(opened));
    await new Promise((resolve) => setTimeout(resolve, 500));
    const read = async () => {
      const snapshot = await drive({ op: "snapshot" });
      assert.equal(snapshot.ok, true, JSON.stringify(snapshot));
      return snapshot.data;
    };
    const refOf = (text, label) => {
      const line = text.split("\n").find((one) => one.includes(label) && one.includes("[ref="));
      assert.ok(line, `${label} is read:\n${text}`);
      return /\[ref=([a-z0-9]+)\]/.exec(line)[1];
    };
    let page = await read();
    // The page's own fields, as before.
    assert.match(refOf(page, 'textbox "Email"'), /^e\d+$/);
    // The shadow root's button and link, in the page's own refs.
    const shopButton = refOf(page, 'button "Continue with Shop"');
    const emailInstead = refOf(page, 'link "Use email instead"');
    assert.match(shopButton, /^e\d+$/);
    // The frames shown, each after the page under its site, with refs of their own; the hidden one left out.
    assert.match(page, /- frame "127\.0\.0\.1"\n {2}- button "Inside Shop's frame" \[ref=f\de1\]/);
    const codeField = refOf(page, 'textbox "Sign-in code"');
    assert.match(codeField, /^f\de1$/);
    assert.ok(!page.includes("Tracking"), page);

    assert.equal((await drive({ op: "click", ref: emailInstead, element: "Use email instead" })).ok, true);
    assert.equal((await drive({ op: "click", ref: refOf(page, "Inside Shop's frame"), element: "the frame's button" })).ok, true);
    const filled = await drive({ op: "fill", ref: codeField, value: "482913" });
    assert.equal(filled.ok, true, JSON.stringify(filled));
    page = await read();
    assert.match(page, /link "Email chosen"/);
    assert.match(page, /button "Frame pressed"/);
    assert.match(page, /textbox "Sign-in code" \[ref=f\de1\] value="482913"/);
    // A ref from an earlier snapshot of a frame is refused, not guessed.
    assert.equal((await drive({ op: "click", ref: "f9e9", element: "nothing" })).ok, false);
  } finally {
    chrome.kill("SIGKILL");
    store.close();
    shop.close();
    await rm(driverDir, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    await rm(`/tmp/.sand-browser/views-${display}.json`, { force: true });
    await dispose();
  }
});

test("bot checks and card fields are never read: the person answers the one, the checkout card types the other", async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-driver-source.ts", "driver-skipped-frames");
  try {
    const source = module.SAND_BROWSER_DRIVER_SOURCE;
    const pattern = source.slice(source.indexOf("const SKIPPED_FRAME_HOSTS = ") + "const SKIPPED_FRAME_HOSTS = ".length, source.indexOf(";\n\nfunction readableFrameHost"));
    const fn = source.slice(source.indexOf("function readableFrameHost"), source.indexOf("\nconst SNAPSHOT_FN"));
    const readableFrameHost = new Function(`const SKIPPED_FRAME_HOSTS = ${pattern}; ${fn}; return readableFrameHost;`)();
    for (const url of [
      "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv/abc",
      "https://newassets.hcaptcha.com/captcha/v1/abc/static/hcaptcha.html",
      "https://www.google.com/recaptcha/api2/anchor?k=abc",
      "https://www.recaptcha.net/recaptcha/api2/anchor",
      "https://js.stripe.com/v3/elements-inner-card.html",
      "https://checkout.pci.shopifyinc.com/build/abc/card_fields.html",
      "https://www.paypal.com/smart/buttons",
      "about:blank",
      "javascript:void(0)",
    ]) assert.equal(readableFrameHost(url), undefined, url);
    assert.equal(readableFrameHost("https://shop.app/accounts/pre_auth?client_id=x"), "shop.app");
    assert.equal(readableFrameHost("https://gelectronic.store/services/login_with_shop/authorize"), "gelectronic.store");
    assert.equal(readableFrameHost("https://www.google.com/maps/embed"), "www.google.com");
  } finally {
    await dispose();
  }
});
