/**
 * Runs the two flows the founder reported broken, against the real app
 * (`?screen=live`), and says what happened.
 *
 *   node harness/live.mjs            # both
 *   node harness/live.mjs open       # a Word file the agent made, clicked
 *   node harness/live.mjs delete     # the open agent, deleted
 *
 * A pass prints `PASS` per check and `no page errors`; anything else is
 * printed as it was seen, with a screenshot in `harness/shots/`.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const DIST = path.resolve('harness/dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };

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

/** A one-paragraph Word document, built here so the fixture is a real .docx. */
async function docxDataUrl() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>');
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>');
  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:body><w:p><w:r><w:t>Gym Routine — Monday: squats, Wednesday: deadlifts, Friday: rest.</w:t></w:r></w:p>'
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>');
  const base64 = await zip.generateAsync({ type: 'base64' });
  return `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64}`;
}

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const docx = await docxDataUrl();

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
};

async function open() {
  const problems = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  await page.addInitScript(url => { window.__HARNESS__ = { docxDataUrl: url }; }, docx);
  await page.goto(`http://127.0.0.1:${port}/?screen=live`, { waitUntil: 'networkidle' });
  const row = (name) => page.locator('[role=button]', { hasText: name }).first();
  await row('Juno').waitFor({ timeout: 10_000 });
  return { page, problems, row };
}

async function openFile() {
  console.log('\n— a Word file the agent made, clicked —');
  const { page, problems, row } = await open();
  await row('Juno').click();
  const chip = page.locator('button[title$="Gym Routine.docx"]').first();
  await chip.waitFor({ timeout: 10_000 });
  check('the file is a chip in the bubble, named as a person reads it', (await chip.innerText()).trim() === 'Gym Routine.docx');
  await chip.click();

  const files = page.getByRole('button', { name: 'Files', exact: true });
  await files.waitFor({ timeout: 10_000 });
  check('the computer panel opened on Files', (await files.getAttribute('aria-pressed')) === 'true');
  const pages = page.locator('section.docx-preview');
  await pages.first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  check('the Word document is drawn in the panel', (await pages.count()) > 0, `${await pages.count()} page(s)`);
  const text = await page.evaluate(() => document.body.innerText);
  check('its text is on screen', text.includes('Monday: squats'));
  check('Save a copy is offered', (await page.locator('button[title^="Save a copy"]').count()) > 0);
  const sidebar = await page.locator('[role=button]', { hasText: 'Juno' }).first().innerText();
  check('the sidebar row names the file, not the markdown', sidebar.includes('Gym Routine.docx') && !sidebar.includes('['), sidebar.replace(/\n/g, ' | '));
  const opened = await page.evaluate(() => window.__CALLS__['shell.openPath'] ?? []);
  check('the operating system was not asked to open it', opened.length === 0, JSON.stringify(opened));
  await page.screenshot({ path: 'harness/shots/live-open.png' });
  const unknown = await page.evaluate(() => [...new Set(window.__UNKNOWN__)]);
  console.log('bridge calls the fixture did not know:', unknown.join(', ') || 'none');
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no page errors');
  await page.close();
}

async function deleteAgent() {
  console.log('\n— the open agent, deleted —');
  const { page, problems, row } = await open();
  await row('Juno').click();
  await page.getByText('make me a gym routine as a word document').waitFor({ timeout: 10_000 });
  await row('Juno').hover();
  await page.getByLabel('Delete Juno').click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForTimeout(800);

  const text = await page.evaluate(() => document.body.innerText);
  check('Juno is gone from the sidebar', !text.includes('Juno'));
  check("Mira's row still shows her last message", text.includes('Cleared the promotions. Fourteen need you.'));
  check("Main's row still shows its last message", text.includes('Standing by.'));
  check("Main's conversation is open, with its history", text.includes('Are you there?'));
  const lists = await page.evaluate(() => window.__CALLS__['cowork.listSessions'] ?? []);
  const last = lists[lists.length - 1]?.[0];
  check('the session list was reloaded for every agent, not one', lists.length > 0 && !last?.agentId, JSON.stringify(last));

  await row('Mira').click();
  await page.getByText('clear my inbox').waitFor({ timeout: 10_000 }).catch(() => undefined);
  const after = await page.evaluate(() => document.body.innerText);
  check("Mira's conversation still has its history", after.includes('clear my inbox'));
  // Three bubbles, all there the moment the conversation is: history is
  // shown, not performed. Read straight after the first bubble, well
  // inside the second a staged bubble would wait.
  check("all of Mira's three-bubble reply is on screen at once", after.includes('Two look urgent.'));
  await page.screenshot({ path: 'harness/shots/live-delete.png' });
  const unknown = await page.evaluate(() => [...new Set(window.__UNKNOWN__)]);
  console.log('bridge calls the fixture did not know:', unknown.join(', ') || 'none');
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no page errors');
  await page.close();
}

const which = process.argv.slice(2);
if (!which.length || which.includes('open')) await openFile();
if (!which.length || which.includes('delete')) await deleteAgent();

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
