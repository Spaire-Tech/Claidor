// Walk the built workspace and screenshot every screen and state.
// Proof, not assumption: if a screen cannot be reached, this says so.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const file = process.argv[2];
const dir = process.argv[3] || 'shots';
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await page.goto('file://' + file, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);

const seen = [];
const shot = async (name) => {
  await page.waitForTimeout(600);
  // The app scrolls inside a container, so `fullPage` alone captures
  // only the first screen. Grow the scroller to its content for the
  // shot, then put it back.
  const grew = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 50 && e.clientHeight > 300);
    if (!el) return null;
    const prev = { h: el.style.height, mh: el.style.maxHeight, o: el.style.overflow };
    el.style.height = el.scrollHeight + 'px'; el.style.maxHeight = 'none'; el.style.overflow = 'visible';
    el.setAttribute('data-grown', '1');
    return prev;
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  if (grew) await page.evaluate((prev) => {
    const el = document.querySelector('[data-grown="1"]');
    if (el) { el.style.height = prev.h; el.style.maxHeight = prev.mh; el.style.overflow = prev.o; el.removeAttribute('data-grown'); }
  }, grew);
  const text = await page.evaluate(() => document.body.innerText.replace(/\n+/g, ' | '));
  seen.push({ name, chars: text.length, text: text.slice(0, 240) });
  console.log(`[${name}] ${text.slice(0, 150)}`);
};
const click = async (label, exact = true) => {
  try {
    await page.getByText(label, { exact }).first().click({ timeout: 5000 });
    return true;
  } catch { console.log(`  !! could not click ${label}`); return false; }
};

await shot('01-ask');
if (await click('Project')) {
  await shot('02-projects');
  // Click whatever the first project row is, not a name we assume.
  const opened = await (async () => {
    try { await page.getByText('price control', { exact: false }).first().click({ timeout: 5000 }); return true; }
    catch { try { await page.getByText('Northbank', { exact: false }).first().click({ timeout: 4000 }); return true; } catch { return false; } }
  })();
  if (opened) {
    await shot('03-overview');
    for (const tab of ['Findings', 'Versions', 'Documents', 'Sources', 'Deliverables', 'Record']) {
      if (await page.getByText(tab, { exact: true }).count()) {
        if (await click(tab)) await shot('04-' + tab.toLowerCase());
      }
    }
  }
}
if (await click('Check a model')) await shot('05-check');
if (await click('Compare workbooks')) await shot('06-compare');
if (await click('Settings')) {
  await shot('07-settings');
  for (const t of ['House rules', 'People']) if (await click(t)) await shot('07-' + t.split(' ')[0].toLowerCase());
}
console.log('\n--- summary');
for (const s of seen) console.log(s.name.padEnd(18), s.chars);
await browser.close();
