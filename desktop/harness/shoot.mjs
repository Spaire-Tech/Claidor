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
  : ['signin', 'thread', 'files', 'choice', 'typing', 'voice', 'signin-error'];

for (const screen of screens) {
  // `hover` is `thread` with the pointer resting on the agent's last
  // bubble, then its emoji row opened: the cluster only exists on hover.
  const base = screen === 'hover' ? 'thread' : screen;
  await page.goto(`http://127.0.0.1:${port}/?screen=${base}`, { waitUntil: 'networkidle' });
  // Give the orb's shader a few frames to draw something.
  await page.waitForTimeout(1200);
  if (screen === 'hover') {
    const react = page.getByRole('button', { name: 'React' }).last();
    await react.hover({ force: true });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'harness/shots/hover.png' });
    await react.click({ force: true });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'harness/shots/hover-emoji.png' });
    console.log('shot hover, hover-emoji');
    continue;
  }
  await page.screenshot({ path: `harness/shots/${screen}.png` });
  console.log('shot', screen);
  // The thread pins to its newest message, so a screen whose point is
  // higher up gets a second photograph from the top.
  if (screen === 'cards') {
    await page.evaluate(() => {
      const row = document.querySelector('[data-thread-item]');
      const list = row?.parentElement;
      if (list) list.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'harness/shots/cards-top.png' });
    console.log('shot cards-top');
  }
}

// The face: a page set in the system font by mistake looks almost right
// and is wrong everywhere, so the shooter says which one it drew.
const face = await page.evaluate(async () => {
  await document.fonts.ready;
  return {
    switzer400: document.fonts.check('14px Switzer'),
    switzer500: document.fonts.check('500 14px Switzer'),
    body: getComputedStyle(document.body).fontFamily,
  };
});
console.log('font:', JSON.stringify(face));

const orbs = await page.evaluate(() => document.querySelectorAll('cloud-orb').length);
console.log('cloud-orb elements on the last screen:', orbs);
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no console errors');

await browser.close();
server.close();
