// Presses the roster card's buttons and checks what each does, since a
// still screenshot cannot: Swap one, the swap itself, Just two, Add a
// third, Something else, and that Stand them up needs two or three.
//
//   node harness/roster-press.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve('harness/dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

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
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:${port}/?screen=roster`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

const rows = () => page.getByRole('checkbox');
const names = async () => Promise.all((await rows().all()).map(one => one.getAttribute('aria-label')));
const fail = (why) => { console.error('FAIL:', why); process.exitCode = 1; };

const before = await names();
if (before.length !== 3) fail(`expected 3 rows, got ${before.length}`);

// Swap one on the first row opens that lane's alternates; picking one replaces the row in place.
await page.getByRole('button', { name: 'Swap one' }).first().click();
// The Row: a header line (with the Swap one button) and, under it, the alternates.
const alternates = page.locator('button[aria-expanded="true"]').locator('..').locator('..').locator(':scope > div').nth(1).locator('button');
const spareCount = await alternates.count();
if (spareCount < 3 || spareCount > 4) fail(`expected 3–4 alternates, got ${spareCount}`);
await page.screenshot({ path: 'harness/shots/roster-swapping.png' });
const pickName = (await alternates.first().innerText()).split('·')[0].trim();
await alternates.first().click();
const swapped = await names();
if (swapped[0] !== pickName) fail(`expected first row to become ${pickName}, got ${swapped[0]}`);
if (swapped[1] !== before[1] || swapped[2] !== before[2]) fail('the other rows moved');

// Just two drops one; Add a third brings one back.
await page.getByRole('button', { name: 'Just two' }).click();
if ((await names()).length !== 2) fail('Just two did not leave two');
if (await page.getByRole('button', { name: 'Just two' }).count() !== 0) fail('Just two still offered with two rows');
await page.getByRole('button', { name: 'Add a third' }).click();
if ((await names()).length !== 3) fail('Add a third did not make three');

// Unchecking two leaves one: Stand them up cannot be pressed.
await rows().nth(0).click();
await rows().nth(1).click();
const standUp = page.getByRole('button', { name: 'Stand them up' });
if (!(await standUp.isDisabled())) fail('Stand them up pressable with one checked');
await rows().nth(0).click();
if (await standUp.isDisabled()) fail('Stand them up not pressable with two checked');

// Something else opens one line and Tell him waits for text.
await page.getByRole('button', { name: 'Something else' }).click();
const line = page.getByRole('textbox', { name: 'Something else' });
if (!(await line.isVisible())) fail('Something else did not open a line');
if (!(await page.getByRole('button', { name: 'Tell him' }).isDisabled())) fail('Tell him pressable with nothing typed');
await line.fill('someone for grants');
if (await page.getByRole('button', { name: 'Tell him' }).isDisabled()) fail('Tell him not pressable with text');
await page.screenshot({ path: 'harness/shots/roster-something-else.png' });

console.log(process.exitCode ? 'roster press: see failures above' : 'roster press: swap in place, just two, add a third, two-or-three gate, something else — all as the page says');
await browser.close();
server.close();
