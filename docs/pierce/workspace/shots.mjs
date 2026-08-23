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
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
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
  if (await click('Northbank', false)) {
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
