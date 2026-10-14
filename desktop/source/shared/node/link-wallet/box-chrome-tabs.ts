// The cloud computer's Chrome tabs, read over Chrome's own DevTools doors
// (14 October 2026): the HTTP list of tabs on a DevTools port, and one tab's
// own socket for one command. The checkout card's picture is taken this way:
// until now it went through Playwright, which the host found only where the
// computer's image put it and which, on connecting, attaches to every tab of
// that Chrome, so one tab Chrome had put to sleep (Memory Saver) held the
// whole connection until it timed out. Either way the card came without its
// picture, and nothing said why (the founder's Gumroad checkout, 14 October
// 2026). One tab's socket needs neither, and each failure now has its line.

import WebSocketModule from "ws";

/** One page tab as Chrome lists it on a DevTools port (`/json/list`). */
export interface BoxChromeTab {
  readonly port: number;
  readonly id: string;
  readonly url: string;
  readonly title: string;
  /** The site's icon as Chrome has it, when it has one. */
  readonly faviconUrl?: string;
  readonly socketUrl: string;
}

interface TabSocket {
  on(event: "open", listener: () => void): void;
  on(event: "message", listener: (data: unknown) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: () => void): void;
  send(data: string): void;
  terminate(): void;
}

const WebSocket = WebSocketModule as unknown as new (url: string, options?: Record<string, unknown>) => TabSocket;

const text = (value: unknown): string => typeof value === "string" ? value : "";

/** "shop.example.com" from an address or a bare domain, without "www.". */
export function hostOfAddress(value: string): string {
  try { return new URL(value.includes("://") ? value : `https://${value}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { return value.toLowerCase(); }
}

/** The page tabs of the Chrome on `port`; none when no Chrome answers there. */
export async function listBoxChromeTabs(port: number, timeoutMs = 1500): Promise<BoxChromeTab[]> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return [];
    const rows = await response.json() as unknown;
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((row): BoxChromeTab[] => {
      const record = row != null && typeof row === "object" ? row as Record<string, unknown> : {};
      const socketUrl = text(record.webSocketDebuggerUrl);
      if (record.type !== "page" || socketUrl.length === 0 || text(record.id).length === 0) return [];
      const favicon = text(record.faviconUrl);
      return [{ port, id: text(record.id), url: text(record.url), title: text(record.title), ...(favicon.length > 0 ? { faviconUrl: favicon } : {}), socketUrl }];
    });
  } catch {
    return [];
  }
}

/** The tabs on these ports, in the ports' order. */
export async function listTabsOn(ports: readonly number[], timeoutMs = 1500): Promise<BoxChromeTab[]> {
  return (await Promise.all(ports.map((port) => listBoxChromeTabs(port, timeoutMs)))).flat();
}

/**
 * The tabs showing the checkout the agent named: its address first, then any
 * tab on that site (shop.example.com, checkout.shop.example.com), in the
 * order given. Never a tab on another site.
 */
export function tabsShowing(tabs: readonly BoxChromeTab[], hint: string): BoxChromeTab[] {
  const wanted = hint.trim();
  if (wanted.length === 0) return [];
  const site = hostOfAddress(wanted);
  const byAddress = tabs.filter((tab) => tab.url.includes(wanted));
  const bySite = tabs.filter((tab) => !byAddress.includes(tab) && (hostOfAddress(tab.url) === site || hostOfAddress(tab.url).endsWith(`.${site}`)));
  return [...byAddress, ...bySite];
}

/**
 * One DevTools command to one tab, over that tab's own socket; its result,
 * or undefined when the tab doesn't answer in time (asleep, or not drawn)
 * or answers with an error. The socket is closed either way.
 */
export function tabCommand<T = Record<string, unknown>>(tab: BoxChromeTab, method: string, params: Record<string, unknown> = {}, timeoutMs = 5000): Promise<T | undefined> {
  return new Promise((resolve) => {
    let socket: TabSocket;
    let settled = false;
    const finish = (value: T | undefined): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.terminate(); } catch { /* already closed */ }
      resolve(value);
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    try {
      socket = new WebSocket(tab.socketUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
    } catch {
      clearTimeout(timer);
      resolve(undefined);
      return;
    }
    socket.on("open", () => { try { socket.send(JSON.stringify({ id: 1, method, params })); } catch { finish(undefined); } });
    socket.on("message", (data) => {
      let message: { id?: unknown; result?: unknown; error?: unknown };
      try { message = JSON.parse(Buffer.isBuffer(data) ? data.toString("utf8") : String(data)) as typeof message; } catch { return; }
      if (message.id !== 1) return;
      finish(message.error == null && message.result != null && typeof message.result === "object" ? message.result as T : undefined);
    });
    socket.on("error", () => finish(undefined));
    socket.on("close", () => finish(undefined));
  });
}

/** Brings a tab to the front of its window (Chrome wakes a tab it had put to sleep). */
export async function activateTab(tab: BoxChromeTab): Promise<void> {
  await fetch(`http://127.0.0.1:${tab.port}/json/activate/${encodeURIComponent(tab.id)}`, { signal: AbortSignal.timeout(2000) }).catch(() => undefined);
}

/** Whether a tab answers at all: a tab Chrome put to sleep never does. */
async function answers(tab: BoxChromeTab, timeoutMs: number): Promise<{ readonly answered: boolean; readonly visible: boolean }> {
  const result = await tabCommand<{ result?: { value?: unknown } }>(tab, "Runtime.evaluate", { expression: "document.visibilityState", returnByValue: true }, timeoutMs);
  return { answered: result !== undefined, visible: result?.result?.value === "visible" };
}

/**
 * Wakes the tabs Chrome put to sleep on one DevTools port, so Playwright can
 * connect to that Chrome (it attaches to every tab, and a sleeping one never
 * answers), then gives the front back to the tab that had it. The browser
 * helper does the same before each of its calls (`sand-browser-driver-source.ts`).
 * Best effort, within `budgetMs`.
 */
export async function wakeSleepingTabs(port: number, budgetMs = 15_000): Promise<number> {
  const tabs = await listBoxChromeTabs(port);
  if (tabs.length === 0) return 0;
  const states = await Promise.all(tabs.map((tab) => answers(tab, 1500)));
  let asleep = tabs.filter((_tab, index) => states[index]?.answered !== true);
  if (asleep.length === 0) return 0;
  const front = tabs.find((_tab, index) => states[index]?.visible === true);
  const woken = asleep.length;
  const deadline = Date.now() + budgetMs;
  while (asleep.length > 0 && Date.now() < deadline) {
    for (const tab of asleep) await activateTab(tab);
    const again = await Promise.all(asleep.map((tab) => answers(tab, 1500)));
    asleep = asleep.filter((_tab, index) => again[index]?.answered !== true);
  }
  if (front != null) await activateTab(front);
  return woken - asleep.length;
}
