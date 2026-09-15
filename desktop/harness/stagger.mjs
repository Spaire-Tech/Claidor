import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve('harness/dist');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp', '.svg':'image/svg+xml' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/favicon.ico') { res.statusCode = 204; return res.end(); }
  const file = url.pathname === '/' ? '/index.html' : url.pathname;
  try {
    const body = await readFile(path.join(DIST, file));
    res.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream');
    res.end(body);
  } catch { res.statusCode = 404; res.end('nope'); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// Count the bubbles of the arriving reply, by its text, over time.
const NEEDLES = ['Found it.', 'March forecast', 'Want me to open it?'];
const count = () => page.evaluate(ns => {
  const body = document.body.innerText;
  return ns.filter(n => body.includes(n)).length;
}, NEEDLES);

await page.goto(`http://127.0.0.1:${port}/?screen=arriving`, { waitUntil: 'networkidle' });
const t0 = Date.now();
const seen = [];
// The reply lands 600ms after mount and its bubbles are a second apart,
// so the third is due at about 2.6s; sample past that.
for (let i = 0; i < 32; i++) {
  seen.push({ ms: Date.now() - t0, bubbles: await count() });
  await page.waitForTimeout(120);
}
await browser.close(); server.close();

// Report the moment each additional bubble first appeared.
const firstAt = {};
for (const s of seen) if (firstAt[s.bubbles] === undefined) firstAt[s.bubbles] = s.ms;
console.log('bubbles visible over time:', seen.map(s => s.bubbles).join(''));
console.log('first seen at (ms):', JSON.stringify(firstAt));
console.log(errors.length ? 'PAGE ERRORS: ' + errors.join('; ') : 'no page errors');
