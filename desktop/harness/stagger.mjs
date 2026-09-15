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
// In the thread only: the sidebar row shows the reply's last line too,
// and counting that would make a bubble appear before it had.
const count = () => page.evaluate(ns => {
  let text = document.body.innerText;
  for (const row of document.querySelectorAll('[role=button]')) text = text.replace(row.innerText, '');
  return ns.filter(n => text.includes(n)).length;
}, NEEDLES);
// And whether the row under Juno's name has moved on to the reply yet.
// It must not before the last bubble is down.
const rowSaysReply = () => page.evaluate(() => {
  const row = [...document.querySelectorAll('[role=button]')].find(el => el.innerText.includes('Juno'));
  return Boolean(row && row.innerText.includes('Want me to open it?'));
});

await page.goto(`http://127.0.0.1:${port}/?screen=arriving`, { waitUntil: 'networkidle' });
const t0 = Date.now();
const seen = [];
// The reply lands 600ms after mount and its bubbles are a second apart,
// so the third is due at about 2.6s; sample past that.
for (let i = 0; i < 32; i++) {
  seen.push({ ms: Date.now() - t0, bubbles: await count(), row: await rowSaysReply() });
  await page.waitForTimeout(120);
}
await browser.close(); server.close();

// Report the moment each additional bubble first appeared.
const firstAt = {};
for (const s of seen) if (firstAt[s.bubbles] === undefined) firstAt[s.bubbles] = s.ms;
console.log('bubbles visible over time:', seen.map(s => s.bubbles).join(''));
console.log('first seen at (ms):', JSON.stringify(firstAt));
const rowAt = seen.find(s => s.row)?.ms;
const early = seen.some(s => s.row && s.bubbles < NEEDLES.length);
console.log(`row shows the reply at (ms): ${rowAt ?? 'never'}; before the last bubble: ${early ? 'YES — wrong' : 'no'}`);
console.log(errors.length ? 'PAGE ERRORS: ' + errors.join('; ') : 'no page errors');
