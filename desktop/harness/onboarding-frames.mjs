// Measures how smoothly Yodo's first step streams: samples frame gaps
// while the greeting is typing and reports how many frames were late.
//
//   node harness/onboarding-frames.mjs
//
// Needs `npx vite build --config harness/vite.config.ts` first. This
// machine draws with a software GPU, so the absolute numbers are worse
// than a Mac's; the point is before-versus-after on the same machine.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve('harness/dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 6000);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = url.pathname === '/' ? '/index.html' : url.pathname;
  try {
    const body = await readFile(path.join(DIST, file));
    res.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1120, height: 845 }, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:${port}/?screen=onboarding`, { waitUntil: 'networkidle' });
// Past the intro cloud, into the greeting.
await page.waitForTimeout(2400);

const stats = await page.evaluate((sampleMs) => new Promise(resolve => {
  const gaps = [];
  let last = performance.now();
  const start = last;
  const tick = now => {
    gaps.push(now - last);
    last = now;
    if (now - start < sampleMs) requestAnimationFrame(tick);
    else resolve(gaps);
  };
  requestAnimationFrame(tick);
}), SAMPLE_MS);

const sorted = [...stats].sort((a, b) => a - b);
const mean = stats.reduce((a, b) => a + b, 0) / stats.length;
const p95 = sorted[Math.floor(sorted.length * 0.95)];
const late = stats.filter(gap => gap > 33).length;
const veryLate = stats.filter(gap => gap > 100).length;
console.log(JSON.stringify({
  frames: stats.length,
  meanMs: Number(mean.toFixed(1)),
  p95Ms: Number(p95.toFixed(1)),
  maxMs: Number(sorted[sorted.length - 1].toFixed(1)),
  lateOver33ms: late,
  lateOver100ms: veryLate,
}));

await browser.close();
server.close();
