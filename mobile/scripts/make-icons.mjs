#!/usr/bin/env node
/**
 * The iPhone app's pictures, drawn from Simeon's mark
 * (`desktop/scripts/lib/simeon-logo.mjs`), so the phone's icon is the Mac's:
 *
 * - assets/icon.png: 1024×1024, opaque, full bleed. iOS rounds the corners
 *   itself and refuses an icon with transparency, so the Mac's white tile
 *   becomes the whole square, with the same faint shading to the bottom and
 *   the mark at the same share of the tile (618 of 912).
 * - assets/splash-icon.png and assets/splash-icon-dark.png: the mark alone
 *   on nothing, black and light, for the launch screen (app.config.ts puts
 *   them on the window's own grounds).
 *
 *   SIMEON_PLAYWRIGHT=../desktop/node_modules/playwright-core node scripts/make-icons.mjs
 *
 * Chromium comes from SIMEON_CHROMIUM, else Playwright's own.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadChromium, simeonMarkMarkup, SIMEON_LOGO_BOX, SIMEON_MARK_BOUNDS } from "../../desktop/scripts/lib/simeon-logo.mjs";

const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets");

/** The Mac's tile, made the whole square: the same shading and the mark at the same share. */
export function iosIconSvg(size = 1024, ink = "#141414") {
  const markWidth = (618 / 912) * size;
  const scale = markWidth / SIMEON_MARK_BOUNDS.width;
  const offset = size / 2 - (SIMEON_LOGO_BOX / 2) * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fefefe"/><stop offset="0.55" stop-color="#f8f8f8"/><stop offset="1" stop-color="#ededee"/></linearGradient></defs>
  <rect width="${size}" height="${size}" fill="url(#tile)"/>
  <g transform="translate(${offset.toFixed(2)} ${offset.toFixed(2)}) scale(${scale.toFixed(4)})">${simeonMarkMarkup(ink)}</g>
</svg>`;
}

/** The mark alone, centred in a square with room round it. */
export function splashSvg(size, ink) {
  const scale = (size * 0.8) / SIMEON_MARK_BOUNDS.width;
  const offset = size / 2 - (SIMEON_LOGO_BOX / 2) * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><g transform="translate(${offset.toFixed(2)} ${offset.toFixed(2)}) scale(${scale.toFixed(4)})">${simeonMarkMarkup(ink)}</g></svg>`;
}

/**
 * App Store Connect refuses an icon with an alpha channel. Chromium writes an
 * opaque screenshot as 8-bit RGB (PNG colour type 2); anything else stops
 * here rather than reaching a build.
 */
export function assertOpaquePng(png) {
  const colourType = png[25];
  if (png.toString("latin1", 12, 16) !== "IHDR" || colourType !== 2) throw new Error(`the icon must be an RGB PNG without alpha (colour type 2), not colour type ${colourType}`);
  return png;
}

async function render(browser, svg, size, transparent) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${svg}`, { waitUntil: "load" });
  const png = await page.screenshot({ type: "png", omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  return png;
}

async function main() {
  const chromium = await loadChromium();
  const browser = await chromium.launch({ ...(process.env.SIMEON_CHROMIUM ? { executablePath: process.env.SIMEON_CHROMIUM } : {}), args: ["--no-sandbox"] });
  try {
    await writeFile(path.join(assets, "icon.png"), assertOpaquePng(await render(browser, iosIconSvg(1024), 1024, false)));
    await writeFile(path.join(assets, "splash-icon.png"), await render(browser, splashSvg(1024, "#141414"), 1024, true));
    await writeFile(path.join(assets, "splash-icon-dark.png"), await render(browser, splashSvg(1024, "#f5f5f7"), 1024, true));
  } finally {
    await browser.close();
  }
  console.log(`wrote icon.png, splash-icon.png and splash-icon-dark.png in ${path.relative(process.cwd(), assets) || assets}`);
}

if (process.argv[1] != null && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
