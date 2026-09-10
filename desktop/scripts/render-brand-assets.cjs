#!/usr/bin/env node
'use strict';

/**
 * Renders the Maties logo, the sphere, into every raster the app ships: the in-app logo, the app icon PNG ladder, the macOS .icns,
 * the Windows .ico and the tray icons. Uses the Chromium that Playwright
 * finds, so it needs no ImageMagick.
 *
 *   node scripts/render-brand-assets.cjs [--playwright <path to playwright package>]
 *
 * The app icon is the sphere on a white rounded square (macOS draws no
 * mask of its own). The tray icons are the sphere alone on transparent.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const playwrightArg = args.indexOf('--playwright');
const playwrightPath = playwrightArg >= 0 ? args[playwrightArg + 1] : 'playwright';

const ICON_SIZES = [1024, 512, 256, 128, 64, 48, 32, 24, 16];
/** macOS icns entries: type code and pixel size (PNG payloads). */
const ICNS_TYPES = [
  ['ic10', 1024],
  ['ic14', 512],
  ['ic09', 512],
  ['ic13', 256],
  ['ic08', 256],
  ['ic07', 128],
  ['ic12', 64],
  ['ic11', 32],
  ['icp5', 32],
  ['icp4', 16],
];
const ICO_SIZES = [256, 128, 64, 48, 32, 16];

/**
 * The sphere is the logo (docs/maties/design.md, section 2): the same
 * gradient layers as the Sphere component, drawn still, at one frame.
 */
const sphereHtml = (size) => `<span style="position:relative; display:inline-block; width:${size}px; height:${size}px; border-radius:50%; overflow:hidden;
  box-shadow:0 1px 2px rgba(24,74,68,.10), 0 ${Math.round(size*0.2)}px ${Math.round(size*0.46)}px rgba(24,74,68,.18), inset 0 -${Math.round(size*0.15)}px ${Math.round(size*0.25)}px rgba(14,58,54,.22), inset 0 ${Math.round(size*0.1)}px ${Math.round(size*0.2)}px rgba(255,255,255,.6), inset 0 0 0 .5px rgba(255,255,255,.5)">
  <span style="position:absolute; inset:-40%; border-radius:50%; transform:rotate(0deg) translate(9%,-6%) scale(1.2); filter:blur(${Math.max(1,size/9.6)}px); background:radial-gradient(44% 46% at 30% 24%, #f2f6d2 0%, rgba(242,246,210,0) 60%), radial-gradient(50% 52% at 74% 20%, #7fdcc6 0%, rgba(127,220,198,0) 66%), radial-gradient(54% 56% at 22% 76%, #a9de5c 0%, rgba(169,222,92,0) 68%), linear-gradient(160deg, #d8f0b4 0%, #6fcbb8 55%, #3aa0c4 100%)"></span>
  <span style="position:absolute; inset:-34%; border-radius:50%; opacity:.85; transform:translate(-8%,7%) scale(1.35); filter:blur(${Math.max(1,size/6.9)}px); background:radial-gradient(40% 42% at 72% 74%, #2aa6c6 0%, rgba(42,166,198,0) 64%), radial-gradient(26% 26% at 56% 56%, #f2a45e 0%, rgba(242,164,94,0) 58%), radial-gradient(34% 36% at 20% 40%, #cfeeb0 0%, rgba(207,238,176,0) 62%)"></span>
  <span style="position:absolute; inset:-20%; border-radius:50%; opacity:.7; transform:translate(-14%,10%); filter:blur(${Math.max(1,size/8)}px); background:radial-gradient(32% 34% at 50% 50%, #f6b26b 0%, rgba(246,178,107,0) 62%), radial-gradient(30% 32% at 24% 62%, #8ee06a 0%, rgba(142,224,106,0) 64%)"></span>
  <span style="position:absolute; left:16%; top:12%; width:34%; height:24%; border-radius:50%; background:radial-gradient(closest-side, rgba(255,255,255,.95), rgba(255,255,255,0)); filter:blur(1.5px)"></span>
  <span style="position:absolute; left:-10%; bottom:-14%; width:70%; height:44%; border-radius:50%; background:radial-gradient(closest-side, rgba(255,255,255,.55), rgba(255,255,255,0)); filter:blur(3px)"></span>
</span>`;

const iconHtml = (size, { tile }) => {
  const sphere = tile ? Math.round(size * 0.62) : size;
  return `<!doctype html><html><head><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  .icon { width: ${size}px; height: ${size}px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;
    ${tile ? `background: #ffffff; border-radius: ${Math.round(size * 0.2237)}px;` : ''} }
</style></head><body><div class="icon">${sphereHtml(sphere)}</div></body></html>`;
};

const pngChunk = (buffer, name) => {
  const nameBuffer = Buffer.from(name, 'ascii');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(buffer.length + 8);
  return Buffer.concat([size, nameBuffer, buffer]);
};

const buildIcns = (pngBySize) => {
  const entries = ICNS_TYPES
    .filter(([, size]) => pngBySize.has(size))
    .map(([type, size]) => pngChunk(pngBySize.get(size), type));
  const body = Buffer.concat(entries);
  return Buffer.concat([pngChunk(body, 'icns')]);
};

const buildIco = (pngBySize) => {
  const sizes = ICO_SIZES.filter(size => pngBySize.has(size));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  const entries = [];
  const blobs = [];
  let offset = 6 + 16 * sizes.length;
  for (const size of sizes) {
    const data = pngBySize.get(size);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    blobs.push(data);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...blobs]);
};

(async () => {
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const render = async (size, options) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(iconHtml(size, options));
    await page.waitForTimeout(50);
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };

  const pngDir = path.join(root, 'build', 'icons', 'png');
  fs.mkdirSync(pngDir, { recursive: true });
  const tiles = new Map();
  for (const size of ICON_SIZES) {
    const png = await render(size, { tile: true });
    tiles.set(size, png);
    fs.writeFileSync(path.join(pngDir, `${size}x${size}.png`), png);
  }

  fs.mkdirSync(path.join(root, 'build', 'icons', 'mac'), { recursive: true });
  fs.writeFileSync(path.join(root, 'build', 'icons', 'mac', 'icon.icns'), buildIcns(tiles));
  fs.mkdirSync(path.join(root, 'build', 'icons', 'win'), { recursive: true });
  fs.writeFileSync(path.join(root, 'build', 'icons', 'win', 'icon.ico'), buildIco(tiles));

  // The in-app logo: the same tile at 512.
  fs.writeFileSync(path.join(root, 'public', 'logo.png'), tiles.get(512));

  // Tray: the mark alone, black on transparent, the file names the app loads
  // (see src/main for `tray-icon`). macOS menu-bar images are 18 and 36 px
  // canvases with the mark a little inside them.
  const trayDir = path.join(root, 'resources', 'tray');
  fs.mkdirSync(trayDir, { recursive: true });
  const padded = async (canvas, mark) => {
    await page.setViewportSize({ width: canvas, height: canvas });
    await page.setContent(`<!doctype html><html><head><style>
      html, body { margin: 0; background: transparent; }
      .c { width: ${canvas}px; height: ${canvas}px; display: flex; align-items: center; justify-content: center; }
    </style></head><body><div class="c">${sphereHtml(mark)}</div></body></html>`);
    await page.waitForTimeout(50);
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: canvas, height: canvas } });
  };
  fs.writeFileSync(path.join(trayDir, 'tray-icon.png'), await render(48, { tile: false }));
  fs.writeFileSync(path.join(trayDir, 'tray-icon-mac.png'), await padded(18, 16));
  fs.writeFileSync(path.join(trayDir, 'tray-icon-mac@2x.png'), await padded(36, 32));
  fs.writeFileSync(path.join(trayDir, 'trayIconTemplate.png'), await padded(18, 16));
  fs.writeFileSync(path.join(trayDir, 'trayIconTemplate@2x.png'), await padded(36, 32));
  const trayPngs = new Map();
  for (const size of [16, 32, 48]) trayPngs.set(size, await render(size, { tile: false }));
  fs.writeFileSync(path.join(trayDir, 'tray-icon.ico'), buildIco(trayPngs));

  await browser.close();
  console.log('[brand] rendered icons, icns, ico, logo and tray from the sphere');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
