// Walk every reachable screen and state, and report any invented name
// that still reaches the glass. Proof by rendering, not by grepping
// the source: a name in unreachable data is not on screen.
import { chromium } from 'playwright';
const BAD = /Northbank|Calder|Meridian|Ashgrove|Kestrel|Sefton|Thameshead|Falcon|Tolland|Tyne Crossing|Ridgeway|Priya|Tom Reagan|Jack Ferreira|Ollie Fenwick|214,061|3m 41s|v22/;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await b.newPage({ viewport: { width: 1440, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
await page.goto('file://' + process.argv[2], { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

const seen = [];
const look = async (name) => {
  await page.waitForTimeout(500);
  const t = await page.evaluate(() => document.body.innerText);
  const hit = t.match(BAD_RE);
  seen.push({ name, chars: t.length, hit: hit ? hit[0] : '' });
};
await page.evaluate((src) => { window.BAD_RE = new RegExp(src); }, BAD.source);
await page.addInitScript(() => {});
const badIn = async (name) => {
  await page.waitForTimeout(450);
  const t = await page.evaluate(() => document.body.innerText);
  const m = t.match(new RegExp(BAD.source));
  seen.push({ name, chars: t.length, hit: m ? m[0] : '' });
};
const click = async (label, exact = true) => {
  try { await page.getByText(label, { exact }).first().click({ timeout: 4000 }); await page.waitForTimeout(450); return true; }
  catch { seen.push({ name: 'CLICK FAILED: ' + label, chars: 0, hit: '' }); return false; }
};

await badIn('ask');
await click('New chat'); await badIn('ask · history');
await page.fill('textarea[placeholder="Ask anything"]', 'What should I look at first?');
await page.keyboard.press('Enter'); await page.waitForTimeout(3000); await badIn('ask · answer');

await click('Project'); await badIn('projects');
await click('New project'); await badIn('projects · browser');
await click('Cancel');
await click('price control', false); await badIn('project · overview');
await click('What was not checked'); await badIn('project · coverage sheet');
await page.keyboard.press('Escape'); await click('What could not be checked'); // close by backdrop
await page.mouse.click(30, 500); await page.waitForTimeout(300);
for (const tab of ['Findings', 'Versions', 'Documents', 'Overview']) { await click(tab); await badIn('project · ' + tab.toLowerCase()); }

await click('Check a model'); await badIn('check · idle');
await click('h7_new_debt_indexation_fp.xlsx'); await badIn('check · nothing material');
await click('Check another'); await click('assumptions.csv'); await badIn('check · refused');
await click('Choose another file');
await click('Drag a model here'); await page.waitForTimeout(1500); await badIn('check · running');
await page.waitForTimeout(7000); await badIn('check · done');

await click('Compare workbooks'); await badIn('compare · idle');
await click('The original workbook'); await click('The updated workbook'); await click('Find differences');
await badIn('compare · result');
await click('Compare two other workbooks');

await click('Settings'); await badIn('settings · connections');
await click('House rules'); await badIn('settings · house rules');
await click('People'); await badIn('settings · people');
await click('Invite someone'); await badIn('settings · invite');

console.log('screen'.padEnd(30), 'chars'.padStart(6), '  invented name still on screen');
let bad = 0;
for (const s of seen) { if (s.hit) bad++; console.log(s.name.padEnd(30), String(s.chars).padStart(6), '  ', s.hit || '—'); }
console.log('\n' + (bad ? bad + ' SCREENS STILL CARRY AN INVENTED NAME' : 'no invented names on any screen'));
console.log(errors.length ? 'PAGE ERRORS: ' + errors.join(' | ') : 'no page errors');
await b.close();
