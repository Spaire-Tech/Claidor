#!/usr/bin/env node
/**
 * Simeon's favicon, the twelve-petal mark, for every web surface (the
 * founder, 28 September 2026: "this is the favicon. please change
 * everywhere. even in app.simeonlabs"). Drawn from the numbers in
 * lib/simeon-logo.mjs, cropped to the petals so it reads at 16 px.
 *
 *   node scripts/make-favicons.mjs site <dir>   the website: favicon.svg, favicon.ico, apple-touch-icon.png
 *   node scripts/make-favicons.mjs web <dir>    the dashboard's public/: the same, plus the four PNG names
 *                                               its layout links (favicon.png is shown on dark tab bars,
 *                                               favicon-dark.png on light ones, and their -dev twins)
 *
 * The SVG follows the browser's colour scheme (black petals on a light tab
 * bar, white on a dark one); the .ico and the home-screen icon are the mark
 * as supplied, black on white.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { SIMEON_PETALS, loadChromium, simeonPetalsMarkup } from "./lib/simeon-logo.mjs";

// The petals' bounds in the 400-unit box, with a hair of margin.
const box = (() => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of SIMEON_PETALS) {
    const r = Math.max(p.rx, p.ry);
    x0 = Math.min(x0, p.cx - r); y0 = Math.min(y0, p.cy - r); x1 = Math.max(x1, p.cx + r); y1 = Math.max(y1, p.cy + r);
  }
  const side = Math.max(x1 - x0, y1 - y0) * 1.04, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return `${(cx - side / 2).toFixed(1)} ${(cy - side / 2).toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}`;
})();

const schemeSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}"><style>ellipse{fill:#141414}@media (prefers-color-scheme:dark){ellipse{fill:#ffffff}}</style>${simeonPetalsMarkup("").replaceAll(' fill=""', "")}</svg>\n`;
const flatSvg = (ink, background) => {
  const [x, y, w] = box.split(" ").map(Number);
  // On a background the mark sits inside a margin, as it does in the supplied picture.
  const pad = background ? w * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x - pad} ${y - pad} ${w + 2 * pad} ${w + 2 * pad}">`
    + (background ? `<rect x="${x - pad}" y="${y - pad}" width="${w + 2 * pad}" height="${w + 2 * pad}" fill="${background}"/>` : "")
    + `${simeonPetalsMarkup(ink)}</svg>`;
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
