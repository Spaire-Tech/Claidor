// Opens each select on the Settings screen and photographs it open, then
// says whether the menu escaped the card it sits in.
//
// The fault this checks: every group card clips its contents
// (`overflow: hidden`), and a menu positioned inside the row was cut off
// at the card's edge — "every dropdown in settings opens inside the box".
// The menu now renders through a portal at the document root, so its
// rectangle must lie outside the card's and inside the window's.
//
//   node harness/settings-open.mjs
//
// Needs `npx vite build --config harness/vite.config.ts` first.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve('harness/dist');
const OUT = process.env.SHOTS_DIR ?? path.resolve('harness/shots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/favicon.ico') { res.statusCode = 204; res.end(); return; }
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
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });
const problems = [];
page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });

await page.goto(`http://127.0.0.1:${port}/?screen=settings`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const selects = page.locator('button[aria-haspopup="menu"]');
const count = await selects.count();
console.log(`${count} select(s) on the General tab`);

for (let i = 0; i < count; i += 1) {
  const trigger = selects.nth(i);
  const label = await trigger.getAttribute('aria-label');
  await trigger.click();
  const menu = page.locator('[role="menu"]');
  await menu.waitFor({ state: 'visible', timeout: 3000 });
  await page.waitForTimeout(250);

  const verdict = await page.evaluate(() => {
    const menuEl = document.querySelector('[role="menu"]');
    const open = document.querySelector('button[aria-expanded="true"]');
    // The card is the nearest ancestor of the trigger that clips.
    let card = open?.parentElement ?? null;
    while (card && getComputedStyle(card).overflow !== 'hidden') card = card.parentElement;
    const m = menuEl.getBoundingClientRect();
    const c = card?.getBoundingClientRect();
    const t = open.getBoundingClientRect();
    return {
      menu: { top: Math.round(m.top), bottom: Math.round(m.bottom), right: Math.round(m.right), height: Math.round(m.height) },
      card: c ? { top: Math.round(c.top), bottom: Math.round(c.bottom) } : null,
      trigger: { bottom: Math.round(t.bottom) },
      inWindow: m.top >= 0 && m.bottom <= window.innerHeight && m.left >= 0 && m.right <= window.innerWidth,
      belowTrigger: m.top >= t.bottom,
      escapesCard: !!c && m.bottom > c.bottom,
      portaled: menuEl.parentElement === document.body,
    };
  });
  const file = path.join(OUT, `settings-select-${i + 1}.png`);
  await page.screenshot({ path: file });
  console.log(`[${i + 1}] "${label}": portaled=${verdict.portaled} inWindow=${verdict.inWindow} belowTrigger=${verdict.belowTrigger} escapesCard=${verdict.escapesCard} menu=${JSON.stringify(verdict.menu)} card=${JSON.stringify(verdict.card)} → ${file}`);
  if (!verdict.portaled || !verdict.inWindow || !verdict.belowTrigger) problems.push(`select "${label}" is not placed right`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  if (await menu.count()) problems.push(`select "${label}" did not close on Escape`);
}

await browser.close();
server.close();
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('settings selects: open in a portal, placed under their control, inside the window');
