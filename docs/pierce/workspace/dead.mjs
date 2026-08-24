// A button that does nothing is a promise the product does not keep.
// Walk the reachable screens and report every button with no handler.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await b.newPage({ viewport: { width: 1440, height: 950 } });
await page.goto('file://' + process.argv[2], { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
const c = async (l, e=true) => { try { await page.getByText(l,{exact:e}).first().click({timeout:3500}); await page.waitForTimeout(450); return true; } catch { return false; } };
const dead = new Map();
const scan = async (where) => {
  const rows = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button')) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const has = Object.keys(el).some(k => k.startsWith('__reactProps')) ;
      const props = Object.keys(el).find(k => k.startsWith('__reactProps'));
      const onClick = props ? !!el[props].onClick : null;
      if (onClick === false) out.push((el.innerText || el.getAttribute('title') || '(icon)').trim().slice(0, 40));
    }
    return out;
  });
  for (const r of rows) if (!dead.has(r)) dead.set(r, where);
};
await scan('ask');
await c('Project'); await scan('projects');
await c('price control', false); await scan('project · overview');
for (const t of ['Findings','Versions','Documents']) { await c(t); await scan('project · ' + t.toLowerCase()); }
await c('Check a model'); await scan('check');
await c('Compare workbooks'); await scan('compare');
await c('Settings'); await scan('settings');
await c('House rules'); await scan('settings · rules');
await c('People'); await scan('settings · people');
console.log(dead.size ? [...dead].map(([l, w]) => `${w.padEnd(24)} ${l}`).join('\n') : 'every visible button has a handler');
await b.close();
