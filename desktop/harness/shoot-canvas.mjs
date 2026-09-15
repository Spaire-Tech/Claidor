import { chromium } from 'playwright';

/**
 * Photographs the founder's canvas, to put beside the harness's shots.
 *
 *   node harness/shoot-canvas.mjs [canvas.html] [screens…]
 *
 * The canvas is a self-unpacking bundle; it needs a moment after load to
 * inflate its assets. Screens: `thread` (the app as it opens), `apps`
 * (Plugins), `agents`, `agent` (the Engineering Lead's page), `compose`
 * (the To: line), `settings`, `account`. Shots land in `harness/shots/`
 * as `canvas-<screen>.png`.
 */
const args = process.argv.slice(2);
const canvas = args.find(one => one.endsWith('.html'))
  ?? '/home/user/Claidor/docs/product/design/canvas-2026-09-15-type.html';
const screens = args.filter(one => !one.endsWith('.html'));
const wanted = screens.length ? screens : ['thread', 'apps', 'agents', 'agent'];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });
await page.goto(`file://${canvas}`, { waitUntil: 'load' });
await page.waitForTimeout(2500);

const click = async (locator, label) => {
  await locator.click({ timeout: 8000 }).catch(e => console.log(`${label} click failed:`, e.message));
  await page.waitForTimeout(700);
};
const shot = async name => {
  await page.screenshot({ path: `harness/shots/canvas-${name}.png` });
  console.log('shot canvas', name);
};

for (const screen of wanted) {
  if (screen === 'thread') {
    await shot('thread');
  } else if (screen === 'hover') {
    // Rest on the last agent bubble and open the emoji row.
    const bubbles = page.locator('[style*="background:#e9edf2"][style*="border-radius:20px"]');
    const last = bubbles.last();
    await last.hover({ timeout: 8000 }).catch(e => console.log('hover failed:', e.message));
    await page.waitForTimeout(400);
    await shot('hover');
    const react = page.locator('button[style*="width:28px"]').first();
    await click(react, 'react');
    await shot('hover-emoji');
  } else if (screen === 'apps') {
    await click(page.getByText('Apps', { exact: true }).first(), 'apps');
    await shot('apps');
  } else if (screen === 'agents') {
    await click(page.getByText('Apps', { exact: true }).first(), 'apps');
    await click(page.getByRole('button', { name: 'Agents', exact: true }).first(), 'agents');
    await shot('agents');
  } else if (screen === 'agent') {
    await click(page.getByText('Apps', { exact: true }).first(), 'apps');
    await click(page.getByRole('button', { name: 'Agents', exact: true }).first(), 'agents');
    await click(page.getByText('Engineering Lead').first(), 'card');
    await shot('agent');
  } else if (screen === 'compose') {
    await click(page.getByRole('button', { name: '+', exact: true }).first(), 'compose');
    await shot('compose');
    await click(page.getByText('Create new agent').first(), 'new agent');
    await shot('new-agent');
  } else if (screen === 'account') {
    await click(page.getByText('Bass Fall').first(), 'account');
    await shot('account');
  } else if (screen === 'settings') {
    await click(page.getByText('Bass Fall').first(), 'account');
    await click(page.getByText('Settings', { exact: true }).first(), 'settings');
    await shot('settings');
  }
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
}

await browser.close();
