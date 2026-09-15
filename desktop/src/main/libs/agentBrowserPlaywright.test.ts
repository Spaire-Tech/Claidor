import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { parseDevToolsActivePort, PlaywrightDriver } from './agentBrowserPlaywright';

describe('parseDevToolsActivePort', () => {
  test('reads the port and the websocket path Chromium writes', () => {
    expect(parseDevToolsActivePort('34907\n/devtools/browser/6b1f-…\n')).toEqual({
      port: 34907, wsPath: '/devtools/browser/6b1f-…',
    });
  });

  test('refuses anything that is not a port and a path', () => {
    expect(parseDevToolsActivePort('')).toBeNull();
    expect(parseDevToolsActivePort('nope\n/devtools/browser/x')).toBeNull();
    expect(parseDevToolsActivePort('80000\n/devtools/browser/x')).toBeNull();
    expect(parseDevToolsActivePort('1234\nnot-a-path')).toBeNull();
  });
});

/**
 * The driver against a real Chromium started the way Electron will be:
 * `--remote-debugging-port=0` and the port read from `DevToolsActivePort`.
 * The page's target id is read the way the host reads a view's, over a
 * CDP session, so the lookup is exercised end to end. Skipped where the
 * browser is not installed, and says so.
 */
const CHROME = process.env.CAISRA_TEST_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const live = fs.existsSync(CHROME);

describe.skipIf(!live)('PlaywrightDriver, live', () => {
  let userData = '';
  let chrome: ReturnType<typeof spawn> | null = null;
  let driver: PlaywrightDriver | null = null;

  beforeAll(async () => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'caisra-pw-'));
    chrome = spawn(CHROME, [
      '--headless=new', '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${userData}`, 'about:blank',
    ], { stdio: 'ignore' });
    const file = path.join(userData, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(file); i += 1) {
      await new Promise(resolve => { setTimeout(resolve, 100); });
    }
    driver = await PlaywrightDriver.connect(userData);
  }, 30_000);

  afterAll(async () => {
    await driver?.close();
    chrome?.kill();
    fs.rmSync(userData, { recursive: true, force: true });
  });

  test('finds a page by target id, snapshots it with refs, clicks and fills through them', async () => {
    expect(driver).not.toBeNull();
    const { chromium } = await import('playwright-core');
    // Stand in for the host: open a page and read its target id the way Electron's debugger would.
    const probe = await chromium.connectOverCDP(driver!.endpoint);
    const context = probe.contexts()[0];
    const page = await context.newPage();
    await page.setContent(
      '<h1>Shop</h1><a href="#s">Sweetgreen</a>'
      + '<button onclick="document.body.insertAdjacentHTML(\'beforeend\',\'<p>Loaded</p>\')">Order</button>'
      + '<input placeholder="Address">',
    );
    const session = await context.newCDPSession(page);
    const info = await session.send('Target.getTargetInfo') as { targetInfo: { targetId: string } };
    const targetId = info.targetInfo.targetId;

    const ours = await driver!.pageFor(targetId);
    const snapshot = await driver!.snapshot(ours);
    expect(snapshot).toContain('heading "Shop"');
    const order = /button "Order" \[ref=(e\d+)\]/.exec(snapshot)?.[1];
    const address = /textbox "Address" \[ref=(e\d+)\]/.exec(snapshot)?.[1];
    expect(order).toBeTruthy();
    expect(address).toBeTruthy();

    await driver!.click(ours, order!, false);
    await driver!.waitForText(ours, 'Loaded', 2_000);
    await driver!.fill(ours, address!, '12 Rue Foch');
    expect(await ours.locator('input').inputValue()).toBe('12 Rue Foch');

    // A ref that is not a ref is refused before Playwright is asked.
    await expect(driver!.click(ours, 'ax-1-77', false)).rejects.toThrow('not from the current snapshot');
    // A target id nobody opened is never handed out.
    await expect(driver!.pageFor('0000DEADBEEF')).rejects.toThrow('not reachable');

    await probe.close();
  }, 30_000);
});
