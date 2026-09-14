import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve('harness/dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

const problems = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  // The harness page has no favicon and does not need one. Answering
  // rather than 404ing keeps the one real console error visible.
  if (url.pathname === '/favicon.ico') { res.statusCode = 204; res.end(); return; }
  const file = url.pathname === '/' ? '/index.html' : url.pathname;
  try {
    const body = await readFile(path.join(DIST, file));
    res.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream');
    res.end(body);
  } catch {
    problems.push(`404 from the harness server: ${file}`);
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
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });

page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
// Name the URL. A bare "404 (Not Found)" in the console says a request
// failed and nothing about which, which is one guess away from chasing
// the wrong file.
page.on('response', r => {
  if (r.status() >= 400) problems.push(`${r.status()}: ${r.url()}`);
});

const screens = process.argv.slice(2).length ? process.argv.slice(2)
  : ['signin', 'thread', 'choice', 'typing', 'voice', 'signin-error'];

for (const screen of screens) {
  await page.goto(`http://127.0.0.1:${port}/?screen=${screen}`, { waitUntil: 'networkidle' });
  // Give the orb's shader a few frames to draw something.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `harness/shots/${screen}.png` });
  console.log('shot', screen);
}

const orbs = await page.evaluate(() => document.querySelectorAll('cloud-orb').length);
console.log('cloud-orb elements on the last screen:', orbs);
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no console errors');

await browser.close();
server.close();
