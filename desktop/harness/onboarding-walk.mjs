// Walks Yodo's first step in Chromium and photographs each stage, with
// the Mac stood in for by the harness's bridge (`?screen=onboarding`).
//
//   node harness/onboarding-walk.mjs
//
// Shots: onboarding-intro (the big cloud), onboarding-open (the greeting
// and the chips), onboarding-other (the "Something else" field),
// onboarding-role (the reply and the three cards), onboarding-perm (the
// permission card), onboarding-working (allowed, the Mac at work),
// onboarding-done (the result card and Get Started).
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
const page = await browser.newPage({ viewport: { width: 1120, height: 845 }, deviceScaleFactor: 2 });
const problems = [];
page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('response', r => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });

const shot = async name => {
  const file = path.join(OUT, `onboarding-${name}.png`);
  await page.screenshot({ path: file });
  console.log('shot', name, '→', file);
};

await page.goto(`http://127.0.0.1:${port}/?screen=onboarding`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await shot('intro');

// The greeting streams at thirteen words a second; wait for the chips.
await page.getByRole('button', { name: 'Finance', exact: true }).waitFor({ timeout: 20000 });
await page.waitForTimeout(400);
await shot('open');

await page.getByRole('button', { name: 'Something else' }).click();
await page.getByPlaceholder('So what is it you do?').fill('I run a bakery');
await page.waitForTimeout(250);
await shot('other');
await page.getByRole('button', { name: 'Back' }).click();

await page.getByRole('button', { name: 'Founder / Business Owner', exact: true }).click();
await page.getByRole('button', { name: /Leave a riddle/ }).waitFor({ timeout: 20000 });
await page.waitForTimeout(500);
await shot('role');

const messages = page.getByRole('button', { name: /pep talk/ });
const messagesDisabled = await messages.getAttribute('aria-disabled');
console.log('Messages card disabled:', messagesDisabled);

await page.getByRole('button', { name: /Change my theme to dark mode/ }).click();
await page.getByRole('button', { name: 'Allow access' }).waitFor({ timeout: 20000 });
await page.waitForTimeout(400);
await shot('perm');

await page.getByRole('button', { name: 'Allow access' }).click();
await page.waitForTimeout(200);
await shot('working');

await page.getByRole('button', { name: 'Get Started' }).waitFor({ timeout: 30000 });
await page.waitForTimeout(500);
const result = await page.getByText('Appearance — Dark').count();
const opener = await page.getByRole('button', { name: 'Open in Settings' }).count();
console.log('result card:', result, 'open button:', opener);
await shot('done');

await browser.close();
server.close();
if (messagesDisabled !== 'true') problems.push('the Messages card was not disabled');
if (result !== 1 || opener !== 1) problems.push('the result card is missing');
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('onboarding walk: every stage drew, Messages is not pressable, the result card came');
