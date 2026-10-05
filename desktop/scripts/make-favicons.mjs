#!/usr/bin/env node
/**
 * Simeon's favicon, the four-petal mark, for every web surface (the
 * founder, 28 September 2026: "this is the favicon. please change
 * everywhere. even in app.simeonlabs"; the mark itself from 4 October 2026).
 * Drawn from the path in lib/simeon-logo.mjs, cropped to the mark so it
 * reads at 16 px.
 *
 *   node scripts/make-favicons.mjs site <dir>   the website: favicon.svg, favicon.ico, apple-touch-icon.png
 *   node scripts/make-favicons.mjs web <dir>    the dashboard's public/: the same, plus the four PNG names
 *                                               its layout links (favicon.png is shown on dark tab bars,
 *                                               favicon-dark.png on light ones, and their -dev twins)
 *
 * The SVG follows the browser's colour scheme (a black mark on a light tab
 * bar, white on a dark one); the .ico and the home-screen icon are the mark
 * as supplied, black on white.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { SIMEON_MARK_BOUNDS, loadChromium, simeonMarkMarkup } from "./lib/simeon-logo.mjs";

// The mark's bounds in the 400-unit box, with a hair of margin.
const box = (() => {
  const { x, y, width, height } = SIMEON_MARK_BOUNDS;
  const side = Math.max(width, height) * 1.04, cx = x + width / 2, cy = y + height / 2;
  return `${(cx - side / 2).toFixed(1)} ${(cy - side / 2).toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}`;
})();

const schemeSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}"><style>path{fill:#141414}@media (prefers-color-scheme:dark){path{fill:#ffffff}}</style>${simeonMarkMarkup("")}</svg>\n`;
const flatSvg = (ink, background) => {
  const [x, y, w] = box.split(" ").map(Number);
  // On a background the mark sits inside a margin, as it does in the supplied picture.
  const pad = background ? w * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x - pad} ${y - pad} ${w + 2 * pad} ${w + 2 * pad}">`
    + (background ? `<rect x="${x - pad}" y="${y - pad}" width="${w + 2 * pad}" height="${w + 2 * pad}" fill="${background}"/>` : "")
    + `${simeonMarkMarkup(ink)}</svg>`;
};

async function rasterise(page, svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img style="display:block;width:${size}px;height:${size}px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body></html>`);
  await page.waitForFunction(() => document.images[0]?.complete);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

// An .ico whose entries are PNGs, which every current browser reads.
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, at); header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8); header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

const [target, dir] = process.argv.slice(2);
if (!["site", "web"].includes(target) || !dir) {
  console.error("usage: node scripts/make-favicons.mjs site|web <dir>");
  process.exit(2);
}
await mkdir(dir, { recursive: true });
const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage();
try {
  const onWhite = flatSvg("#141414", "#ffffff");
  await writeFile(path.join(dir, "favicon.svg"), schemeSvg());
  const icoSizes = [16, 32, 48];
  const entries = [];
  for (const size of icoSizes) entries.push({ size, data: await rasterise(page, onWhite, size) });
  await writeFile(path.join(dir, "favicon.ico"), ico(entries));
  await writeFile(path.join(dir, "apple-touch-icon.png"), await rasterise(page, onWhite, 180));
  if (target === "web") {
    const white = await rasterise(page, flatSvg("#ffffff"), 64), black = await rasterise(page, flatSvg("#141414"), 64);
    for (const [name, data] of [["favicon.png", white], ["favicon-dev.png", white], ["favicon-dark.png", black], ["favicon-dev-dark.png", black]]) await writeFile(path.join(dir, name), data);
  }
} finally {
  await browser.close();
}
console.log(`favicons written to ${dir}`);
