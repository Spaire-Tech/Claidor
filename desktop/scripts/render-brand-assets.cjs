#!/usr/bin/env node
'use strict';

/**
 * Renders the Maties mark (build/logo/maties-mark.svg) into every raster
 * the app ships: the in-app logo, the app icon PNG ladder, the macOS .icns,
 * the Windows .ico and the tray icons. Uses the Chromium that Playwright
 * finds, so it needs no ImageMagick.
 *
 *   node scripts/render-brand-assets.cjs [--playwright <path to playwright package>]
 *
 * The app icon is the mark on a white rounded square (macOS draws no mask
 * of its own). The tray icon is the mark alone, black on transparent, so
 * macOS can treat it as a template image.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const markPath = path.join(root, 'build', 'logo', 'maties-mark.svg');

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

const markSvg = fs.readFileSync(markPath, 'utf8');
const markDataUri = `data:image/svg+xml;base64,${Buffer.from(markSvg).toString('base64')}`;

const iconHtml = (size, { tile }) => `<!doctype html><html><head><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  .icon { width: ${size}px; height: ${size}px; position: relative; overflow: hidden;
    ${tile ? `background: #ffffff; border-radius: ${Math.round(size * 0.2237)}px;` : ''} }
  .icon img { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: ${tile ? Math.round(size * 0.78) : size}px; height: ${tile ? Math.round(size * 0.78) : size}px; }
</style></head><body><div class="icon"><img src="${markDataUri}"></div></body></html>`;

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
      img { width: ${mark}px; height: ${mark}px; }
    </style></head><body><div class="c"><img src="${markDataUri}"></div></body></html>`);
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
  console.log('[brand] rendered icons, icns, ico, logo and tray from', path.relative(root, markPath));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
