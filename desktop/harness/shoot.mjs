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
    // Photographs for the cards screen live beside the shots, not in
    // the build: `harness/shots/photos/*.jpg`, ignored by git.
    const root = file.startsWith('/photos/') ? path.resolve('harness/shots') : DIST;
    const body = await readFile(path.join(root, file));
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
// The window: the app's default, or `SHOT_VIEWPORT=1440x1400` for a
// tall one when a whole conversation has to fit in one picture.
const [width, height] = (process.env.SHOT_VIEWPORT ?? '1280x820').split('x').map(Number);
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });

page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
// Name the URL. A bare "404 (Not Found)" in the console says a request
// failed and nothing about which, which is one guess away from chasing
// the wrong file.
page.on('response', r => {
  if (r.status() >= 400) problems.push(`${r.status()}: ${r.url()}`);
});
// Nothing the harness draws may call out. OpenUI's chat renderer can
// resolve pictures and send analytics through its cloud when told to;
// it is not told to, and this proves it every run.
page.on('request', r => {
  const url = new URL(r.url());
  if (url.hostname !== '127.0.0.1' && url.protocol !== 'data:' && url.protocol !== 'blob:') problems.push(`left the loopback: ${r.url()}`);
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
  // The artifacts: the chips first, then the deck opened by its chip.
  if (screen === 'artifacts') {
    const chip = page.locator('[data-artifact="presentation"] button, [data-artifact="presentation"] [role="button"]').first();
    await chip.click({ force: true });
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'harness/shots/artifacts-deck.png' });
    console.log('shot artifacts-deck');
    // Their viewer opens on the last slide (the newest, as it streams)
    // and the arrows are buttons, not keys: go by the thumbnails.
    const slides = ['Where we are, and what we ask', 'Revenue by month', 'Three things that moved', 'Where the growth came from'];
    for (let index = 0; index < slides.length; index += 1) {
      await page.getByText(slides[index]).first().click({ force: true });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `harness/shots/artifacts-deck-${index + 1}.png` });
    }
    console.log('shot artifacts-deck-1..4');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const report = page.locator('[data-artifact="report"] button, [data-artifact="report"] [role="button"]').first();
    await report.click({ force: true });
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'harness/shots/artifacts-report.png' });
    console.log('shot artifacts-report');
    // And the report's later pages, by scrolling the viewer.
    for (let step = 1; step <= 3; step += 1) {
      await page.mouse.move(640, 500);
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `harness/shots/artifacts-report-${step}.png` });
    }
    console.log('shot artifacts-report-1..3');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  if (screen.startsWith('cards')) {
    await page.evaluate(() => {
      const row = document.querySelector('[data-thread-item]');
      const list = row?.parentElement;
      if (list) list.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `harness/shots/${screen}-top.png` });
    console.log(`shot ${screen}-top`);
    // The block in full, however tall, so nothing is judged from a crop:
    // the thread scrolls inside the window, so the window grows to fit.
    const blockEl = page.locator('[data-card-block]').first();
    const tall = await blockEl.evaluate(el => el.getBoundingClientRect().height + 400);
    await page.setViewportSize({ width, height: Math.ceil(Math.max(height, tall)) });
    await page.waitForTimeout(300);
    await blockEl.screenshot({ path: `harness/shots/${screen}-block.png` });
    await page.setViewportSize({ width, height });
    console.log(`shot ${screen}-block`);
    // The face inside the block: the founder keeps ours, OpenUI's
    // defaults say Inter, so the shooter says which one drew it.
    const cardFont = await page.evaluate(() => {
      const title = document.querySelector('[data-card-block] h1, [data-card-block] h2, [data-card-block] h3, [data-card-block] [class*="header"]');
      return title ? getComputedStyle(title).fontFamily : 'no title found';
    });
    console.log('card font:', cardFont);
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
