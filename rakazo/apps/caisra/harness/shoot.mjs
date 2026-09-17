import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "/home/user/Claidor/desktop/node_modules/playwright-core/index.mjs";

/** Serve the built app, then photograph each screen at 2x. */
const DIST = new URL("../dist/", import.meta.url).pathname;
const SHOTS = new URL("../shots/", import.meta.url).pathname;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const file = path === "/" ? "index.html" : path.slice(1);
  try {
    const body = await readFile(join(DIST, file));
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
const context = await browser.newContext({ viewport: { width: 860, height: 900 }, deviceScaleFactor: 2 });
for (const screen of ["morning", "starting-up"]) {
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/?screen=${screen}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const window = page.locator(".window");
  await window.screenshot({ path: join(SHOTS, `${screen}.png`) });
  console.log(`shot ${screen}`);
  await page.close();
}
await browser.close();
server.close();
