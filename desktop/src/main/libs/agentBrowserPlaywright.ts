import fs from 'fs';
import path from 'path';
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright-core';

/**
 * Playwright at the wheel of the in-app browser.
 *
 * The founder, after an afternoon of DoorDash: *"lets use Playwright."*
 * Until now the host drove its `WebContentsView`s through hand-written
 * Chrome DevTools calls: a synthetic `element.click()`, a snapshot cut
 * from the raw accessibility tree, and (since 15 September) a wait we
 * wrote ourselves. Playwright does all three better and has for years:
 * a click waits until the element is attached, visible, stable and
 * receives events, and dispatches real pointer events; the snapshot is
 * the same reference-tagged tree Microsoft's own browser MCP hands to
 * models; `fill` knows about React inputs.
 *
 * **How it reaches the views.** Electron starts with
 * `--remote-debugging-port=0`; Chromium picks a free loopback port and
 * writes it to `DevToolsActivePort` in the app's data directory.
 * Playwright connects to that port and sees every page the app has —
 * including the app's own window. This driver never hands that window
 * out: a view is looked up by its DevTools target id, which the host
 * reads from the view itself, so the agent only ever gets the pages it
 * opened. Any other process on the machine could reach the port, which
 * is the trade the founder accepted ("I want playwrit"), stated in
 * `review.md` item 50.
 *
 * **When it is not there.** No port file (an Electron that ignored the
 * switch, a packaging that lost it) means `connect()` returns null and
 * the host keeps its old driver. The log says which is in charge.
 */

export type DevToolsEndpoint = { port: number; wsPath: string };

/** Parse Chromium's `DevToolsActivePort`: a port on line one, a ws path on line two. */
export function parseDevToolsActivePort(contents: string): DevToolsEndpoint | null {
  const [portLine, pathLine] = contents.trim().split(/\r?\n/);
  const port = Number(portLine);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) return null;
  const wsPath = (pathLine ?? '').trim();
  if (!wsPath.startsWith('/')) return null;
  return { port, wsPath };
}

export function readDevToolsEndpoint(userDataDir: string): DevToolsEndpoint | null {
  const file = path.join(userDataDir, 'DevToolsActivePort');
  try {
    return parseDevToolsActivePort(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** The one selector engine that turns a snapshot ref into an element. */
const refSelector = (ref: string): string => `aria-ref=${ref}`;

const REF_PATTERN = /^e\d+$/;

export class PlaywrightDriver {
  private browser: Browser | null = null;
  private readonly byTarget = new Map<string, Page>();
  private readonly targetOf = new WeakMap<Page, string>();

  constructor(private readonly cdpUrl: string) {}

  /** Connect over the app's own debugging port, or null when there is none. */
  static async connect(userDataDir: string): Promise<PlaywrightDriver | null> {
    const endpoint = readDevToolsEndpoint(userDataDir);
    if (!endpoint) return null;
    const driver = new PlaywrightDriver(`http://127.0.0.1:${endpoint.port}`);
    await driver.open();
    return driver;
  }

  get endpoint(): string {
    return this.cdpUrl;
  }

  async open(): Promise<void> {
    if (this.browser) return;
    const browser = await chromium.connectOverCDP(this.cdpUrl, { timeout: 10_000 });
    this.browser = browser;
    browser.once('disconnected', (): void => {
      if (this.browser === browser) this.browser = null;
      this.byTarget.clear();
    });
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    this.byTarget.clear();
    // Disconnect from the app's own Chromium; never close it.
    await browser?.close().catch((): undefined => undefined);
  }

  /**
   * The Playwright page for one of the host's views, by its DevTools
   * target id. Pages the host did not open are never returned.
   */
  async pageFor(targetId: string): Promise<Page> {
    const cached = this.byTarget.get(targetId);
    if (cached && !cached.isClosed()) return cached;
    if (!this.browser) await this.open();
    for (const context of this.browser!.contexts()) {
      for (const page of context.pages()) {
        if (page.isClosed()) continue;
        const known = this.targetOf.get(page) ?? await this.readTargetId(context, page);
        if (known === targetId) {
          this.byTarget.set(targetId, page);
          return page;
        }
      }
    }
    throw new Error('The in-app browser page is not reachable through Playwright; take a new snapshot.');
  }

  /** The reference-tagged tree the agent reads. Refs look like `e12`. */
  async snapshot(page: Page): Promise<string> {
    return page.locator('body').ariaSnapshot({ mode: 'ai' });
  }

  async click(page: Page, ref: string, doubleClick: boolean): Promise<void> {
    const locator = page.locator(refSelector(requireRef(ref)));
    if (doubleClick) await locator.dblclick({ timeout: 10_000 });
    else await locator.click({ timeout: 10_000 });
  }

  async fill(page: Page, ref: string, value: string): Promise<void> {
    await page.locator(refSelector(requireRef(ref))).fill(value, { timeout: 10_000 });
  }

  async hover(page: Page, ref: string): Promise<void> {
    await page.locator(refSelector(requireRef(ref))).hover({ timeout: 10_000 });
  }

  async press(page: Page, key: string): Promise<void> {
    await page.keyboard.press(key);
  }

  async type(page: Page, text: string): Promise<void> {
    await page.keyboard.type(text);
  }

  async drag(page: Page, fromRef: string, toRef: string): Promise<void> {
    await page.locator(refSelector(requireRef(fromRef)))
      .dragTo(page.locator(refSelector(requireRef(toRef))), { timeout: 10_000 });
  }

  async uploadFile(page: Page, ref: string, filePath: string): Promise<void> {
    await page.locator(refSelector(requireRef(ref))).setInputFiles(filePath, { timeout: 10_000 });
  }

  async waitForText(page: Page, text: string, timeoutMs: number): Promise<void> {
    await page.getByText(text).first().waitFor({ state: 'visible', timeout: timeoutMs });
  }

  /** The element's box, for a cropped screenshot. */
  async boundingBox(page: Page, ref: string): Promise<{ x: number; y: number; width: number; height: number }> {
    const box = await page.locator(refSelector(requireRef(ref))).boundingBox({ timeout: 10_000 });
    if (!box) throw new Error(`Browser element ${ref} has no visible box.`);
    return box;
  }

  private async readTargetId(context: BrowserContext, page: Page): Promise<string | undefined> {
    try {
      const session = await context.newCDPSession(page);
      const info = await session.send('Target.getTargetInfo') as { targetInfo?: { targetId?: string } };
      await session.detach().catch((): undefined => undefined);
      const targetId = info.targetInfo?.targetId;
      if (targetId) this.targetOf.set(page, targetId);
      return targetId;
    } catch {
      return undefined;
    }
  }
}

function requireRef(ref: string): string {
  const trimmed = ref.trim();
  if (!REF_PATTERN.test(trimmed)) {
    throw new Error(`Browser element reference "${ref}" is not from the current snapshot. Take a new snapshot and use its refs (e12).`);
  }
  return trimmed;
}
