/**
 * The Dock and Finder icon: Simeon's mark rasterised at every size macOS
 * asks for and packed as brand/Simeon.icns, which package-macos.mjs writes
 * over the icon files inherited from the 0.18.0 shell. Also writes
 * brand/Simeon-1024.png for anyone who needs the picture.
 *
 *   CAISRA_PLAYWRIGHT=/path/to/playwright-core node scripts/make-app-icon.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadChromium, simeonAppIconSvg } from "./lib/simeon-logo.mjs";
import { ICNS_TYPES, packIcns } from "./lib/make-icns.mjs";

export const APP_ICON_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../brand");
export const APP_ICON_ICNS = path.join(APP_ICON_DIR, "Simeon.icns");

async function main() {
  const chromium = await loadChromium();
  const browser = await chromium.launch({ executablePath: process.env.CAISRA_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const sizes = {};
  try {
    for (const size of Object.keys(ICNS_TYPES).map(Number)) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}</style>${simeonAppIconSvg({ size })}`, { waitUntil: "load" });
      sizes[size] = await page.screenshot({ type: "png", omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  await mkdir(APP_ICON_DIR, { recursive: true });
  const icns = packIcns(sizes);
  await writeFile(APP_ICON_ICNS, icns);
  await writeFile(path.join(APP_ICON_DIR, "Simeon-1024.png"), sizes[1024]);
  console.log(`wrote ${path.relative(process.cwd(), APP_ICON_ICNS)} (${icns.length} bytes, ${Object.keys(sizes).length} sizes)`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
