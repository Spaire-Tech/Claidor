/**
 * The agent's own Chrome tab on the person's phone (15 October 2026). The
 * founder, after an Apple sign-in on the phone: "that computer was so hard to
 * use i was lost. extremely laggy too." The phone showed the whole 1280 by 800
 * desktop at a third of its size, through noVNC. This shows just the tab the
 * agent works in, as Chrome draws it (DevTools' screencast: a JPEG each time
 * the page changes, acknowledged one at a time so a slow phone is never
 * flooded), and while the person is in control the tab is laid out at the
 * phone's own size (DevTools' device metrics, as Chrome's phone preview does).
 * Taps, scrolls, typing and a few keys go back through the same DevTools
 * socket. A sign-in that opens a pop-up is followed into it and back.
 *
 * Chrome drops a DevTools client's device metrics when that client goes, so a
 * viewer that dies without cleaning up leaves the agent's tab as it was.
 */
import WebSocketModule from "ws";
import { readFileSync } from "node:fs";
import { HOST_LOG_PREFIX, clipForHostLog, logHostLine } from "../../shared/host-log.js";
import { tabCommand, type BoxChromeTab } from "../../shared/node/link-wallet/box-chrome-tabs.js";

/** Chrome's DevTools port is this plus the agent's display number (`box/bin/box-chrome`). */
export const TAB_VIEW_CDP_PORT_BASE = 9222;
/** Where the browser helper keeps each agent's tab (`sand-browser-driver-source.ts`, `views-<display>.json`). */
export const TAB_VIEW_STATE_DIR = "/tmp/.sand-browser";
/** Pixels per point of the phone's picture: sharp on a phone's screen, a third of its 3x size. */
export const TAB_VIEW_SCALE = 2;
export const TAB_VIEW_JPEG_QUALITY = 60;
/** How often the tabs are read again, to follow a pop-up and come back from it. */
export const TAB_VIEW_POLL_MS = 1_500;
/** After a tap, how long the page gets to move its focus before it is asked where it went. */
export const TAB_VIEW_FOCUS_SETTLE_MS = 150;
export const TAB_VIEW_MIN_SIDE = 240;
export const TAB_VIEW_MAX_WIDTH = 1_024;
export const TAB_VIEW_MAX_HEIGHT = 2_000;

export interface TabViewRequest {
  /** The phone's view of the page, in points. */
  readonly width: number;
  readonly height: number;
  /** The person is in control: the tab takes the phone's size and is brought to the front. */
  readonly control: boolean;
}

export type TabViewEvent =
  | { readonly type: "tab"; readonly url: string; readonly title: string }
  /** `width` and `height` are the page's own size in CSS pixels: the phone maps a tap with them. */
  | { readonly type: "frame"; readonly jpeg: string; readonly width: number; readonly height: number }
  | { readonly type: "closed"; readonly reason: string };

/** Where the events go; `send` settles once the event is on its way, and fails when the viewer has gone. */
export interface TabViewSink {
  send(event: TabViewEvent): Promise<void>;
}

export type TabViewKey = "Enter" | "Backspace" | "Tab" | "Escape";

export type TabViewInput =
  | { readonly kind: "tap"; readonly x: number; readonly y: number }
  | { readonly kind: "scroll"; readonly x: number; readonly y: number; readonly dx: number; readonly dy: number }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "key"; readonly key: TabViewKey }
  | { readonly kind: "control"; readonly on: boolean };

const KEYS: Readonly<Record<TabViewKey, { readonly code: number; readonly text?: string }>> = {
  Enter: { code: 13, text: "\r" },
  Backspace: { code: 8 },
  Tab: { code: 9 },
  Escape: { code: 27 },
};

const finite = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** One input from the phone, checked; undefined for anything else. */
export function parseTabViewInput(value: unknown): TabViewInput | undefined {
  const record = value != null && typeof value === "object" ? value as Record<string, unknown> : {};
  const x = finite(record.x), y = finite(record.y);
  switch (record.kind) {
    case "tap":
      return x === undefined || y === undefined ? undefined : { kind: "tap", x, y };
    case "scroll": {
      const dx = finite(record.dx) ?? 0, dy = finite(record.dy) ?? 0;
      return x === undefined || y === undefined ? undefined : { kind: "scroll", x, y, dx, dy };
    }
    case "text":
      return typeof record.text === "string" && record.text.length > 0 && record.text.length <= 10_000 ? { kind: "text", text: record.text } : undefined;
    case "key":
      return typeof record.key === "string" && Object.hasOwn(KEYS, record.key) ? { kind: "key", key: record.key as TabViewKey } : undefined;
    case "control":
      return typeof record.on === "boolean" ? { kind: "control", on: record.on } : undefined;
    default:
      return undefined;
  }
}

/** The phone's size, held to what a phone or a tablet can ask for. */
export function clampTabViewSize(width: unknown, height: unknown): { readonly width: number; readonly height: number } {
  const clamp = (value: unknown, max: number, fallback: number): number => {
    const number = typeof value === "string" ? Number(value) : finite(value);
    return number === undefined || !Number.isFinite(number) ? fallback : Math.round(Math.min(max, Math.max(TAB_VIEW_MIN_SIDE, number)));
  };
  return { width: clamp(width, TAB_VIEW_MAX_WIDTH, 390), height: clamp(height, TAB_VIEW_MAX_HEIGHT, 700) };
}

// ── DevTools ─────────────────────────────────────────────────────────────────

interface CdpSocket {
  on(event: "open", listener: () => void): void;
  on(event: "message", listener: (data: unknown) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: () => void): void;
  send(data: string): void;
  terminate(): void;
}

export type CdpSocketFactory = (url: string) => CdpSocket;

const WebSocket = WebSocketModule as unknown as new (url: string, options?: Record<string, unknown>) => CdpSocket;
const defaultSocket: CdpSocketFactory = (url) => new WebSocket(url, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });

/** One DevTools socket kept open: commands with replies, and the events the tab sends. */
export class CdpConnection {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  private readonly listeners = new Map<string, Set<(params: Record<string, unknown>) => void>>();
  private readonly closeListeners = new Set<() => void>();
  private closed = false;

  private constructor(private readonly socket: CdpSocket) {
    socket.on("message", (data) => this.receive(data));
    socket.on("close", () => this.shutDown());
    socket.on("error", () => this.shutDown());
  }

  static open(url: string, create: CdpSocketFactory = defaultSocket, timeoutMs = 5_000): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      let socket: CdpSocket;
      try {
        socket = create(url);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        try { socket.terminate(); } catch { /* already gone */ }
        reject(new Error("the tab did not answer"));
      }, timeoutMs);
      socket.on("open", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(new CdpConnection(socket));
      });
      socket.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  get isClosed(): boolean { return this.closed; }

  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, timeoutMs = 5_000): Promise<T> {
    if (this.closed) return Promise.reject(new Error("the tab's connection is closed"));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  on(method: string, listener: (params: Record<string, unknown>) => void): void {
    const set = this.listeners.get(method) ?? new Set();
    set.add(listener);
    this.listeners.set(method, set);
  }

  onClose(listener: () => void): void { this.closeListeners.add(listener); }

  close(): void {
    try { this.socket.terminate(); } catch { /* already gone */ }
    this.shutDown();
  }

  private receive(data: unknown): void {
    let message: { id?: unknown; result?: unknown; error?: { message?: unknown }; method?: unknown; params?: unknown };
    try {
      message = JSON.parse(Buffer.isBuffer(data) ? data.toString("utf8") : String(data)) as typeof message;
    } catch {
      return;
    }
    if (typeof message.id === "number") {
      const waiting = this.pending.get(message.id);
      if (waiting == null) return;
      this.pending.delete(message.id);
      clearTimeout(waiting.timer);
      if (message.error != null) waiting.reject(new Error(typeof message.error.message === "string" ? message.error.message : "DevTools error"));
      else waiting.resolve(message.result ?? {});
      return;
    }
    if (typeof message.method === "string") {
      const params = message.params != null && typeof message.params === "object" ? message.params as Record<string, unknown> : {};
      for (const listener of [...(this.listeners.get(message.method) ?? [])]) {
        try { listener(params); } catch { /* one listener's failure is its own */ }
      }
    }
  }

  private shutDown(): void {
    if (this.closed) return;
    this.closed = true;
    for (const [, waiting] of this.pending) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error("the tab's connection closed"));
    }
    this.pending.clear();
    for (const listener of [...this.closeListeners]) {
      try { listener(); } catch { /* best effort */ }
    }
  }
}

/** A page tab as Chrome's browser-wide DevTools lists it, with the tab that opened it. */
export interface TabTarget extends BoxChromeTab {
  readonly openerId?: string;
}

/** The page tabs of the Chrome on `port`, from `Target.getTargets` (which, unlike `/json/list`, names each tab's opener). */
export async function listTabTargets(port: number, create: CdpSocketFactory = defaultSocket): Promise<TabTarget[]> {
  let connection: CdpConnection | undefined;
  try {
    const version = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1_500) });
    if (!version.ok) return [];
    const socketUrl = ((await version.json()) as { webSocketDebuggerUrl?: unknown }).webSocketDebuggerUrl;
    if (typeof socketUrl !== "string" || socketUrl.length === 0) return [];
    connection = await CdpConnection.open(socketUrl, create, 2_000);
    const result = await connection.send<{ targetInfos?: unknown }>("Target.getTargets", {}, 2_000);
    const infos = Array.isArray(result.targetInfos) ? result.targetInfos as Record<string, unknown>[] : [];
    return infos.flatMap((info): TabTarget[] => {
      const id = typeof info.targetId === "string" ? info.targetId : "";
      if (info.type !== "page" || id.length === 0) return [];
      const opener = typeof info.openerId === "string" && info.openerId.length > 0 ? info.openerId : undefined;
      return [{
        port,
        id,
        url: typeof info.url === "string" ? info.url : "",
        title: typeof info.title === "string" ? info.title : "",
        socketUrl: `ws://127.0.0.1:${port}/devtools/page/${id}`,
        ...(opener === undefined ? {} : { openerId: opener }),
      }];
    });
  } catch {
    return [];
  } finally {
    connection?.close();
  }
}

/** Which tab is whose, as the browser helper records it. */
export interface BrowserViewsState {
  readonly views: Readonly<Record<string, string>>;
  readonly urls: Readonly<Record<string, string>>;
}

export function readBrowserViews(display: number, dir = TAB_VIEW_STATE_DIR): BrowserViewsState {
  try {
    const parsed = JSON.parse(readFileSync(`${dir}/views-${display}.json`, "utf8")) as { views?: unknown; urls?: unknown };
    const record = (value: unknown): Record<string, string> => value != null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
      : {};
    return { views: record(parsed.views), urls: record(parsed.urls) };
  } catch {
    return { views: {}, urls: {} };
  }
}

/**
 * The agent's tab: the one its browser tools (and OpenPage) use, by id, then
 * by its last address; else the tab in front; else the first.
 */
export async function chooseAgentTab<T extends BoxChromeTab>(
  tabs: readonly T[],
  state: BrowserViewsState,
  agentId: string,
  isVisible: (tab: T) => Promise<boolean>,
): Promise<T | undefined> {
  if (tabs.length === 0) return undefined;
  const mapped = state.views[agentId];
  const byId = mapped === undefined ? undefined : tabs.find((tab) => tab.id === mapped);
  if (byId !== undefined) return byId;
  const lastUrl = state.urls[agentId];
  const byUrl = lastUrl === undefined || lastUrl.length === 0 ? undefined : tabs.find((tab) => tab.url === lastUrl);
  if (byUrl !== undefined) return byUrl;
  const visible = await Promise.all(tabs.map((tab) => isVisible(tab).catch(() => false)));
  return tabs.find((_tab, index) => visible[index] === true) ?? tabs[0];
}

async function tabIsVisible(tab: BoxChromeTab): Promise<boolean> {
  const result = await tabCommand<{ result?: { value?: unknown } }>(tab, "Runtime.evaluate", { expression: "document.visibilityState", returnByValue: true }, 1_500);
  return result?.result?.value === "visible";
}

/** What has the keyboard after a tap: an input's type, "text" for a text area or an editable block, "frame" when it is inside another site's frame (a sign-in form often is), "" for nothing to type into. */
const FOCUS_EXPRESSION = `(() => { const e = document.activeElement; if (!e || e === document.body) return ""; const tag = e.tagName; if (tag === "IFRAME") return "frame"; if (e.isContentEditable || tag === "TEXTAREA") return "text"; if (tag === "INPUT") { const type = (e.getAttribute("type") || "text").toLowerCase(); return ["text", "email", "password", "search", "tel", "url", "number"].includes(type) ? type : ""; } return ""; })()`;

// ── One viewer ───────────────────────────────────────────────────────────────

export interface TabViewDeps {
  readonly listTabs: (port: number) => Promise<TabTarget[]>;
  readonly readViews: (display: number) => BrowserViewsState;
  readonly isVisible: (tab: TabTarget) => Promise<boolean>;
  readonly createSocket: CdpSocketFactory;
  readonly log: (line: string) => void;
  readonly pollMs: number;
  readonly focusSettleMs: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class TabViewer {
  private connection: CdpConnection | undefined;
  /** The tabs followed into, the one shown last. */
  private readonly stack: TabTarget[] = [];
  private readonly known = new Set<string>();
  private closed = false;
  private poll: NodeJS.Timeout | undefined;
  private frames = 0;
  private lastAnnounced = "";
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly agentId: string,
    private readonly port: number,
    private readonly size: { readonly width: number; readonly height: number },
    private control: boolean,
    private readonly sink: TabViewSink,
    private readonly deps: TabViewDeps,
    private readonly onClosed: () => void,
  ) {}

  /** Undefined once the tab is on its way to the phone; else why it can't be. */
  async start(display: number): Promise<string | undefined> {
    const tabs = await this.deps.listTabs(this.port);
    if (tabs.length === 0) return "no-browser";
    const tab = await chooseAgentTab(tabs, this.deps.readViews(display), this.agentId, this.deps.isVisible);
    if (tab === undefined) return "no-tab";
    for (const known of tabs) this.known.add(known.id);
    try {
      await this.attach(tab);
    } catch (error) {
      this.closed = true;
      this.connection?.close();
      this.connection = undefined;
      this.deps.log(`${HOST_LOG_PREFIX} tab-view could not attach agent=${this.agentId} tab=${hostOf(tab.url)}: ${error instanceof Error ? error.message : String(error)}`);
      return "tab-unreachable";
    }
    this.stack.push(tab);
    this.poll = setInterval(() => { void this.serial(() => this.watchTabs()); }, this.deps.pollMs);
    this.poll.unref?.();
    this.deps.log(`${HOST_LOG_PREFIX} tab-view open agent=${this.agentId} tab=${hostOf(tab.url)} control=${this.control} size=${this.size.width}x${this.size.height}`);
    return undefined;
  }

  async input(input: TabViewInput): Promise<Record<string, unknown>> {
    return await this.serial(() => this.apply(input));
  }

  close(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    if (this.poll !== undefined) clearInterval(this.poll);
    const connection = this.connection;
    this.connection = undefined;
    if (connection !== undefined) {
      const wasInControl = this.control;
      void (async () => {
        await connection.send("Page.stopScreencast", {}, 1_000).catch(() => undefined);
        if (wasInControl) await connection.send("Emulation.clearDeviceMetricsOverride", {}, 1_000).catch(() => undefined);
        connection.close();
      })();
    }
    if (reason !== "viewer-closed" && reason !== "viewer-gone") void this.sink.send({ type: "closed", reason }).catch(() => undefined);
    this.deps.log(`${HOST_LOG_PREFIX} tab-view closed agent=${this.agentId} reason=${reason} frames=${this.frames}`);
    this.onClosed();
  }

  /** One thing at a time: an input waits for a tab switch, and a switch for an input. */
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async attach(tab: TabTarget): Promise<void> {
    const connection = await CdpConnection.open(tab.socketUrl, this.deps.createSocket);
    if (this.closed) {
      connection.close();
      return;
    }
    const previous = this.connection;
    this.connection = connection;
    if (previous !== undefined) {
      await previous.send("Page.stopScreencast", {}, 1_000).catch(() => undefined);
      if (this.control) await previous.send("Emulation.clearDeviceMetricsOverride", {}, 1_000).catch(() => undefined);
      previous.close();
    }
    connection.on("Page.screencastFrame", (params) => this.frame(connection, params));
    connection.on("Page.frameNavigated", (params) => {
      const frame = params.frame as { parentId?: unknown } | undefined;
      if (frame?.parentId == null) void this.announce(connection);
    });
    connection.on("Page.loadEventFired", () => { void this.announce(connection); });
    connection.onClose(() => {
      if (this.connection === connection && !this.closed) void this.serial(() => this.leaveTab(tab.id));
    });
    await connection.send("Page.enable");
    if (this.control) await this.applyControl(connection, true);
    await this.startScreencast(connection);
    await this.announce(connection);
  }

  private async startScreencast(connection: CdpConnection): Promise<void> {
    await connection.send("Page.startScreencast", {
      format: "jpeg",
      quality: TAB_VIEW_JPEG_QUALITY,
      maxWidth: Math.round(this.size.width * TAB_VIEW_SCALE),
      maxHeight: Math.round(this.size.height * TAB_VIEW_SCALE),
      everyNthFrame: 1,
    });
  }

  private async applyControl(connection: CdpConnection, on: boolean): Promise<void> {
    if (on) {
      await connection.send("Emulation.setDeviceMetricsOverride", { width: this.size.width, height: this.size.height, deviceScaleFactor: TAB_VIEW_SCALE, mobile: true });
      await connection.send("Page.bringToFront").catch(() => undefined);
    } else {
      await connection.send("Emulation.clearDeviceMetricsOverride").catch(() => undefined);
    }
  }

  private frame(connection: CdpConnection, params: Record<string, unknown>): void {
    const sessionId = params.sessionId;
    const ack = (): void => { void connection.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined); };
    if (typeof params.data !== "string" || connection !== this.connection || this.closed) {
      ack();
      return;
    }
    const metadata = params.metadata != null && typeof params.metadata === "object" ? params.metadata as Record<string, unknown> : {};
    const width = finite(metadata.deviceWidth) ?? this.size.width;
    const height = finite(metadata.deviceHeight) ?? this.size.height;
    this.frames += 1;
    // The next picture only once this one is on its way: a slow phone is sent fewer, never a backlog.
    this.sink.send({ type: "frame", jpeg: params.data, width, height }).then(ack, () => this.close("viewer-gone"));
  }

  private async announce(connection: CdpConnection): Promise<void> {
    const result = await connection.send<{ result?: { value?: unknown } }>("Runtime.evaluate", { expression: "JSON.stringify([location.href, document.title])", returnByValue: true }).catch(() => undefined);
    if (connection !== this.connection || this.closed) return;
    let url = "", title = "";
    try {
      const parsed = JSON.parse(typeof result?.result?.value === "string" ? result.result.value : "[]") as unknown[];
      url = typeof parsed[0] === "string" ? parsed[0] : "";
      title = typeof parsed[1] === "string" ? parsed[1] : "";
    } catch { /* an unreadable page keeps its last address */ }
    const key = `${url}\n${title}`;
    if (url.length === 0 || key === this.lastAnnounced) return;
    this.lastAnnounced = key;
    await this.sink.send({ type: "tab", url, title }).catch(() => this.close("viewer-gone"));
  }

  private async apply(input: TabViewInput): Promise<Record<string, unknown>> {
    const connection = this.connection;
    if (connection === undefined || this.closed) return { ok: false, reason: "no-view" };
    try {
      switch (input.kind) {
        case "tap": {
          const at = { x: input.x, y: input.y };
          await connection.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...at, button: "none", buttons: 0 });
          await connection.send("Input.dispatchMouseEvent", { type: "mousePressed", ...at, button: "left", buttons: 1, clickCount: 1 });
          await connection.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...at, button: "left", buttons: 0, clickCount: 1 });
          await sleep(this.deps.focusSettleMs);
          const focused = await connection.send<{ result?: { value?: unknown } }>("Runtime.evaluate", { expression: FOCUS_EXPRESSION, returnByValue: true }, 1_500).catch(() => undefined);
          const focus = typeof focused?.result?.value === "string" ? focused.result.value : "";
          return { ok: true, focus };
        }
        case "scroll":
          await connection.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: input.x, y: input.y, deltaX: input.dx, deltaY: input.dy });
          return { ok: true };
        case "text":
          await connection.send("Input.insertText", { text: input.text });
          return { ok: true };
        case "key": {
          const key = KEYS[input.key];
          const base = { key: input.key, code: input.key, windowsVirtualKeyCode: key.code, nativeVirtualKeyCode: key.code };
          await connection.send("Input.dispatchKeyEvent", { type: key.text === undefined ? "rawKeyDown" : "keyDown", ...base, ...(key.text === undefined ? {} : { text: key.text, unmodifiedText: key.text }) });
          await connection.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
          return { ok: true };
        }
        case "control": {
          if (input.on === this.control) return { ok: true, control: this.control };
          this.control = input.on;
          await connection.send("Page.stopScreencast").catch(() => undefined);
          await this.applyControl(connection, input.on);
          await this.startScreencast(connection);
          this.deps.log(`${HOST_LOG_PREFIX} tab-view control agent=${this.agentId} on=${input.on}`);
          return { ok: true, control: this.control };
        }
      }
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  /** A pop-up the shown tab opened is followed; the shown tab gone, the one before it comes back. */
  private async watchTabs(): Promise<void> {
    if (this.closed) return;
    const tabs = await this.deps.listTabs(this.port);
    if (this.closed || tabs.length === 0) return;
    const shown = new Set(this.stack.map((tab) => tab.id));
    const fresh = tabs.filter((tab) => !this.known.has(tab.id));
    for (const tab of fresh) this.known.add(tab.id);
    const popup = fresh.find((tab) => tab.openerId !== undefined && shown.has(tab.openerId));
    if (popup !== undefined) {
      try {
        await this.attach(popup);
        this.stack.push(popup);
        this.deps.log(`${HOST_LOG_PREFIX} tab-view followed a pop-up agent=${this.agentId} tab=${hostOf(popup.url)}`);
      } catch { /* the pop-up closed before it could be shown */ }
      return;
    }
    const current = this.stack.at(-1);
    if (current !== undefined && !tabs.some((tab) => tab.id === current.id)) await this.leaveTab(current.id, tabs);
  }

  private async leaveTab(id: string, listed?: readonly TabTarget[]): Promise<void> {
    if (this.closed || this.stack.at(-1)?.id !== id) return;
    this.stack.pop();
    const tabs = listed ?? await this.deps.listTabs(this.port);
    while (this.stack.length > 0) {
      const previous = this.stack.at(-1)!;
      if (tabs.some((tab) => tab.id === previous.id)) {
        try {
          await this.attach(previous);
          return;
        } catch { /* gone as well */ }
      }
      this.stack.pop();
    }
    this.close("tab-closed");
  }
}

function hostOf(url: string): string {
  try { return clipForHostLog(new URL(url).hostname, 80) || "blank"; } catch { return "blank"; }
}

// ── Every agent's viewer ─────────────────────────────────────────────────────

export interface TabViewsOptions {
  /** The agent's display number on the cloud computer (`getAgentWindowIndex`); 1 when it has no other. */
  readonly displayFor: (agentId: string) => number | undefined;
  readonly log?: (line: string) => void;
  readonly listTabs?: (port: number) => Promise<TabTarget[]>;
  readonly readViews?: (display: number) => BrowserViewsState;
  readonly isVisible?: (tab: TabTarget) => Promise<boolean>;
  readonly createSocket?: CdpSocketFactory;
  readonly portFor?: (display: number) => number;
  readonly pollMs?: number;
  readonly focusSettleMs?: number;
}

export type TabViewOpenResult =
  | { readonly ok: true; close(reason?: string): void }
  | { readonly ok: false; readonly reason: string };

/** One viewer per agent: a second phone (or the same one again) takes the agent's tab over from the first. */
export class TabViews {
  private readonly viewers = new Map<string, TabViewer>();
  private readonly deps: TabViewDeps;

  constructor(private readonly options: TabViewsOptions) {
    const createSocket = options.createSocket ?? defaultSocket;
    this.deps = {
      listTabs: options.listTabs ?? ((port) => listTabTargets(port, createSocket)),
      readViews: options.readViews ?? ((display) => readBrowserViews(display)),
      isVisible: options.isVisible ?? tabIsVisible,
      createSocket,
      log: options.log ?? logHostLine,
      pollMs: options.pollMs ?? TAB_VIEW_POLL_MS,
      focusSettleMs: options.focusSettleMs ?? TAB_VIEW_FOCUS_SETTLE_MS,
    };
  }

  async open(agentId: string, request: TabViewRequest, sink: TabViewSink): Promise<TabViewOpenResult> {
    this.viewers.get(agentId)?.close("replaced");
    const display = this.options.displayFor(agentId) ?? 1;
    const port = (this.options.portFor ?? ((index: number) => TAB_VIEW_CDP_PORT_BASE + index))(display);
    const size = clampTabViewSize(request.width, request.height);
    const created: TabViewer = new TabViewer(agentId, port, size, request.control, sink, this.deps, () => {
      if (this.viewers.get(agentId) === created) this.viewers.delete(agentId);
    });
    this.viewers.set(agentId, created);
    const problem = await created.start(display);
    if (problem !== undefined) {
      if (this.viewers.get(agentId) === created) this.viewers.delete(agentId);
      this.deps.log(`${HOST_LOG_PREFIX} tab-view unavailable agent=${agentId} reason=${problem}`);
      return { ok: false, reason: problem };
    }
    return { ok: true, close: (reason = "viewer-closed") => created.close(reason) };
  }

  async input(agentId: string, value: unknown): Promise<Record<string, unknown>> {
    const input = parseTabViewInput(value);
    if (input === undefined) return { ok: false, reason: "bad-input" };
    const viewer = this.viewers.get(agentId);
    if (viewer === undefined) return { ok: false, reason: "no-view" };
    return await viewer.input(input);
  }

  isOpen(agentId: string): boolean { return this.viewers.has(agentId); }

  closeAll(reason = "host-stopping"): void {
    for (const viewer of [...this.viewers.values()]) viewer.close(reason);
  }
}
