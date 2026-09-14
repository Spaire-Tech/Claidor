import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const DIST = path.resolve('harness/dist');
const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp', '.svg':'image/svg+xml' };
const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/favicon.ico') { res.statusCode = 204; return res.end(); }
  const f = u.pathname === '/' ? '/index.html' : u.pathname;
  try { const b = await readFile(path.join(DIST, f)); res.setHeader('content-type', T[path.extname(f)] ?? 'application/octet-stream'); res.end(b); }
  catch { res.statusCode = 404; res.end('no'); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const page = await browser.newPage({ viewport:{width:1280,height:820}, deviceScaleFactor:2 });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://127.0.0.1:${port}/?screen=thread`, { waitUntil:'networkidle' });
const before = (await page.evaluate(() => document.body.innerText)).split('\n').length;
await page.getByLabel('Find in this conversation').first().click();
await page.waitForTimeout(200);
await page.getByPlaceholder('Find in this conversation').fill('slide');
await page.waitForTimeout(300);
const label = await page.evaluate(() => {
  const m = document.body.innerText.match(/\d+ of \d+|No matches/);
  return m ? m[0] : '(none)';
});
const bodyNow = await page.evaluate(() => document.body.innerText);
await page.screenshot({ path: 'harness/shots/find.png' });
console.log('match label:', label);
console.log('thread still shows the matching line:', bodyNow.includes('Slide 14 and slide 19'));
console.log('non-matching line hidden:', !bodyNow.includes('now please'));
await page.getByPlaceholder('Find in this conversation').fill('zzzz');
await page.waitForTimeout(250);
console.log('no-match label:', (await page.evaluate(() => document.body.innerText)).includes('No matches'));
console.log(errs.length ? 'ERRORS: ' + errs.join('; ') : 'no page errors');
await browser.close(); server.close();
