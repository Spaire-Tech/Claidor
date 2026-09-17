/**
 * The composed answer, shot in sections.
 *
 * `shoot.mjs` grows the window to the block's height, which works for a
 * block of cards and not for this one: the thread pane keeps its own
 * height and scrolls inside the window, so a 4,000px block came out as
 * its first screenful over 3,000px of empty ground. This scrolls the
 * thread itself and shoots each screenful, so every part of the answer
 * can actually be looked at.
 *
 *   node harness/cards-plan-walk.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, 'dist');
const PHOTOS = path.resolve(import.meta.dirname, 'shots/photos');
const OUT = path.resolve(import.meta.dirname, 'shots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const file = url.pathname.startsWith('/photos/')
    ? path.join(PHOTOS, url.pathname.slice('/photos/'.length))
    : path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  const target = existsSync(file) ? file : path.join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(target)] ?? 'application/octet-stream' });
  res.end(readFileSync(target));
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1040 }, deviceScaleFactor: 2 });
const problems = [];
page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });

await page.goto(`${origin}/?screen=cards-plan`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);

// The scroller is whatever ancestor of the block actually overflows.
const total = await page.evaluate(() => {
  const block = document.querySelector('[data-card-block]');
  let el = block?.parentElement;
  while (el && el.scrollHeight <= el.clientHeight + 4) el = el.parentElement;
  if (!el) return 0;
  el.dataset.walkScroller = 'yes';
  el.scrollTop = 0;
  return el.scrollHeight;
});
if (!total) throw new Error('no scrolling ancestor found for the card block');

const step = 900;
let shot = 0;
for (let top = 0; top < total; top += step) {
  await page.evaluate(y => {
    const el = document.querySelector('[data-walk-scroller="yes"]');
    if (el) el.scrollTop = y;
  }, top);
  await page.waitForTimeout(450);
  shot += 1;
  await page.screenshot({ path: path.join(OUT, `cards-plan-${shot}.png`) });
}

// The real class names on the parts this stylesheet targets, so a
// selector written from a guess is caught here and not in a screenshot.
const classes = await page.evaluate(() => {
  const seen = new Set();
  document.querySelectorAll('[data-card-block] *').forEach(el => {
    el.classList.forEach(c => { if (/^(openui|c1)-/.test(c)) seen.add(c); });
  });
  return [...seen].sort();
});

console.log(`shot cards-plan-1..${shot} (scroll height ${total})`);
console.log('classes:', classes.join(' '));
console.log(problems.length ? `console errors: ${problems.join(' | ')}` : 'no console errors');
await browser.close();
server.close();
