import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logoModule = pathToFileURL(path.join(repoRoot, "scripts/lib/simeon-logo.mjs")).href;
const icnsModule = pathToFileURL(path.join(repoRoot, "scripts/lib/make-icns.mjs")).href;

test("Simeon's mark is twelve petals in a whirl, thin at the top left and full at the right", async () => {
  const { SIMEON_PETALS, simeonLogoSvg, simeonAppIconSvg } = await import(logoModule);
  assert.equal(SIMEON_PETALS.length, 12);
  for (const petal of SIMEON_PETALS) {
    assert.ok(petal.rx > petal.ry && petal.ry > 4, `a petal is an ellipse: ${JSON.stringify(petal)}`);
    assert.ok(Math.hypot(petal.cx - 200, petal.cy - 200) > 60 && Math.hypot(petal.cx - 200, petal.cy - 200) < 100, "each petal sits on the ring");
  }
  const thin = SIMEON_PETALS.filter((petal) => petal.ry < 11);
  const full = SIMEON_PETALS.filter((petal) => petal.ry >= 11);
  assert.equal(thin.length, 4, "four thin strokes at the top left");
  assert.equal(full.length, 8, "eight full petals round the rest");
  assert.ok(thin.every((petal) => petal.cx < 200 && petal.cy < 200));
  const svg = simeonLogoSvg();
  assert.equal((svg.match(/<ellipse /g) ?? []).length, 12);
  assert.match(svg, /viewBox="0 0 400 400"/);
  const icon = simeonAppIconSvg({ size: 512 });
  assert.match(icon, /<rect width="512" height="512" rx="114" fill="#fcfcfc"\/>/);
  assert.equal((icon.match(/<ellipse /g) ?? []).length, 12);
  assert.doesNotMatch(icon, /data:image|<image/, "drawn, never a picture file");
});

test("the mark drawn from the numbers covers the founder's PNG", { skip: process.env.CAISRA_PLAYWRIGHT == null && "set CAISRA_PLAYWRIGHT to rasterise" }, async (t) => {
  const { loadChromium, simeonLogoSvg } = await import(logoModule);
  const { PNG } = await import("pngjs");
  const reference = PNG.sync.read(await readFile(path.join(repoRoot, "brand/simeon-source.png")));
  const chromium = await loadChromium();
  const browser = await chromium.launch({ executablePath: process.env.CAISRA_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:#fff}</style>${simeonLogoSvg()}`);
    const drawn = PNG.sync.read(await page.screenshot({ type: "png" }));
    let both = 0, either = 0;
    for (let index = 0; index < 400 * 400; index += 1) {
      const a = reference.data[index * 4 + 3] > 128 && reference.data[index * 4] < 128;
      const b = drawn.data[index * 4] < 128;
      if (a && b) both += 1;
      if (a || b) either += 1;
    }
    const iou = both / either;
    t.diagnostic(`intersection over union with the founder's PNG: ${iou.toFixed(3)}`);
    assert.ok(iou > 0.85, `intersection over union with the founder's PNG: ${iou.toFixed(3)}`);
  } finally {
    await browser.close();
  }
});

test("an icns packs one PNG per size macOS asks for, and reads back", async () => {
  const { packIcns, readIcnsEntries, ICNS_TYPES } = await import(icnsModule);
  const png = (n) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n, 1)]);
  const icns = packIcns({ 16: png(10), 512: png(30), 1024: png(50) });
  assert.equal(icns.subarray(0, 4).toString("ascii"), "icns");
  assert.equal(icns.readUInt32BE(4), icns.length);
  assert.deepEqual(readIcnsEntries(icns), [
    { type: "icp4", size: 16, bytes: 18 },
    { type: "ic09", size: 512, bytes: 38 },
    { type: "ic10", size: 1024, bytes: 58 },
  ]);
  assert.equal(Object.keys(ICNS_TYPES).length, 7);
  assert.throws(() => packIcns({ 48: png(1) }), /No icns entry type/);
  assert.throws(() => packIcns({ 16: Buffer.from("nope") }), /not a PNG/);
});
