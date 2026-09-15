import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

/**
 * Builds the whole app-icon set from one 1024×1024 PNG, with nothing but
 * Node and the Chromium that Playwright already ships.
 *
 *   node scripts/make-app-icons.mjs <source-1024.png> [--out build/icons]
 *
 * Writes `png/<N>x<N>.png` for every size electron-builder reads, the
 * macOS `mac/icon.icns` (PNG-encoded entries, the same types `iconutil`
 * emits) and the Windows `win/icon.ico` (PNG-encoded entries, accepted
 * since Vista). The old scripts wanted ImageMagick or `iconutil`, which
 * this machine does not have; the browser resamples at least as well.
 *
 * Every size is produced by halving the source until the next halving
 * would go below the target, then one final high-quality draw — the
 * usual way to keep small icons from going muddy.
 */

const args = process.argv.slice(2);
const source = args.find(one => !one.startsWith('--'));
if (!source) {
  console.error('usage: node scripts/make-app-icons.mjs <source-1024.png> [--out build/icons]');
  process.exit(1);
}
const outFlag = args.indexOf('--out');
const outDir = path.resolve(outFlag >= 0 ? args[outFlag + 1] : 'build/icons');

const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
/** ICNS type code by pixel size; PNG payloads are valid for all of these. */
const ICNS_TYPES = {
  16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10',
};
/** The @2x duplicates iconutil also writes: 16@2x, 32@2x, 128@2x, 256@2x. */
const ICNS_RETINA = { 32: 'ic11', 64: 'ic12', 256: 'ic13', 512: 'ic14' };
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const sourceBytes = fs.readFileSync(source);
const width = sourceBytes.readUInt32BE(16);
const height = sourceBytes.readUInt32BE(20);
if (width !== 1024 || height !== 1024) {
  console.error(`source is ${width}×${height}; it must be 1024×1024`);
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');
const dataUrl = `data:image/png;base64,${sourceBytes.toString('base64')}`;

const rendered = await page.evaluate(async ({ url, sizes }) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const out = {};
  for (const size of sizes) {
    let current = img;
    let currentSize = img.width;
    // Halve until one more halving would undershoot the target.
    while (currentSize / 2 >= size) {
      currentSize /= 2;
      const step = document.createElement('canvas');
      step.width = currentSize;
      step.height = currentSize;
      const ctx = step.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(current, 0, 0, currentSize, currentSize);
      current = step;
    }
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, size, size);
    out[size] = canvas.toDataURL('image/png').split(',')[1];
  }
  return out;
}, { url: dataUrl, sizes: PNG_SIZES });
await browser.close();

const png = {};
for (const size of PNG_SIZES) png[size] = Buffer.from(rendered[size], 'base64');

fs.mkdirSync(path.join(outDir, 'png'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'mac'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'win'), { recursive: true });

for (const size of PNG_SIZES) {
  fs.writeFileSync(path.join(outDir, 'png', `${size}x${size}.png`), png[size]);
}

// ---- ICNS: 'icns' + total length, then (type, length incl. header, data)… ----
const icnsEntries = [];
const entry = (type, data) => {
  const header = Buffer.alloc(8);
  header.write(type, 0, 'ascii');
  header.writeUInt32BE(8 + data.length, 4);
  icnsEntries.push(Buffer.concat([header, data]));
};
for (const [size, type] of Object.entries(ICNS_TYPES)) entry(type, png[Number(size)]);
for (const [size, type] of Object.entries(ICNS_RETINA)) entry(type, png[Number(size)]);
const icnsBody = Buffer.concat(icnsEntries);
const icnsHeader = Buffer.alloc(8);
icnsHeader.write('icns', 0, 'ascii');
icnsHeader.writeUInt32BE(8 + icnsBody.length, 4);
fs.writeFileSync(path.join(outDir, 'mac', 'icon.icns'), Buffer.concat([icnsHeader, icnsBody]));

// ---- ICO: 6-byte header, 16-byte directory entries, then the PNG payloads ----
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // 1 = icon
icoHeader.writeUInt16LE(ICO_SIZES.length, 4);
const dir = [];
const payloads = [];
let offset = 6 + 16 * ICO_SIZES.length;
for (const size of ICO_SIZES) {
  const data = png[size];
  const d = Buffer.alloc(16);
  d[0] = size === 256 ? 0 : size; // 0 means 256
  d[1] = size === 256 ? 0 : size;
  d[2] = 0; // colour count
  d[3] = 0; // reserved
  d.writeUInt16LE(1, 4); // planes
  d.writeUInt16LE(32, 6); // bits per pixel
  d.writeUInt32LE(data.length, 8);
  d.writeUInt32LE(offset, 12);
  dir.push(d);
  payloads.push(data);
  offset += data.length;
}
fs.writeFileSync(path.join(outDir, 'win', 'icon.ico'), Buffer.concat([icoHeader, ...dir, ...payloads]));

console.log(`wrote ${PNG_SIZES.length} PNGs, icon.icns (${Object.keys(ICNS_TYPES).length + Object.keys(ICNS_RETINA).length} entries) and icon.ico (${ICO_SIZES.length} entries) under ${outDir}`);
