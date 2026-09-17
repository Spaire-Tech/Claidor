import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { chromium } from "/home/user/Claidor/desktop/node_modules/playwright-core/index.mjs";

/**
 * Serve the built app, then photograph each screen at 2x.
 *
 * `/photos/*` comes from the desktop harness's own folder, which is where the
 * founder's card pictures live and is not in the repository — they are stock
 * photographs, not code. Without them the answer cards still draw; their
 * frames collapse and the cards close up around the text.
 */
const DIST = new URL("../dist/", import.meta.url).pathname;
const SHOTS = new URL("../shots/", import.meta.url).pathname;
const PHOTOS = "/home/user/Claidor/desktop/harness/shots/photos";
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const file = path.startsWith("/photos/")
    ? join(PHOTOS, path.slice("/photos/".length))
    : join(DIST, path === "/" ? "index.html" : path.slice(1));
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1060, height: 860 },
  deviceScaleFactor: 2,
});

/*
 * The cards ask picsum for their pictures, which is OpenUI's own rule and the
 * address a real agent writes. This container reaches the internet through a
 * proxy that Chromium is not configured for, so the request would fail here
 * and only here. Rather than change the program — the program is the thing
 * being photographed — each address is fetched once with curl, which does use
 * the proxy, and served back to the page. The card still asks for exactly what
 * it would ask for on a Mac.
 */
const run = promisify(execFile);
const CACHE = new URL("../.picsum/", import.meta.url).pathname;
await mkdir(CACHE, { recursive: true });
const cached = new Map();
await context.route("https://picsum.photos/**", async (route) => {
  const url = route.request().url();
  let body = cached.get(url);
  if (!body) {
    // A fetch that fails leaves the route unfulfilled with a 404, which is
    // what the browser would have got anyway; the page falls back to its
    // monogram rather than showing a broken glyph.
    const file = join(CACHE, `${url.replace(/[^a-z0-9]+/gi, "-")}.jpg`);
    try {
      await readFile(file);
    } catch {
      // `-f` so a 404 is an error rather than a zero-byte file that the page
      // would then draw as a broken image.
      await run("curl", ["-fsSL", "--max-time", "30", "-o", file, url]).catch(() => undefined);
    }
    try {
      body = await readFile(file);
    } catch {
      await route.fulfill({ status: 404, body: "" });
      return;
    }
    cached.set(url, body);
  }
  await route.fulfill({ status: 200, contentType: "image/jpeg", body });
});
const SCREENS = [
  "morning",
  "voice",
  "starting-up",
  "everything",
  "routines",
  "routines-menu",
  "cards",
  "cards-hotels",
  "cards-trip",
  "cards-fifa",
  "cards-plan",
  "proactive",
  "apps",
];
for (const screen of SCREENS) {
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/?screen=${screen}`, { waitUntil: "networkidle" });
  // A thread opens at the bottom, where the newest message is. A card screen
  // opens at the top, because the card is the answer and it is long.
  if (!screen.startsWith("cards") && screen !== "proactive" && screen !== "apps") {
    await page.evaluate(() => {
      const thread = document.querySelector(".thread");
      if (thread) thread.scrollTop = thread.scrollHeight;
    });
  }
  await page.waitForTimeout(600);
  const window = page.locator(".frame");
  await window.screenshot({ path: join(SHOTS, `${screen}.png`) });
  console.log(`shot ${screen}`);
  await page.close();
}
await browser.close();
server.close();
