/**
 * What the person's tap on the whole computer landed in (15 October 2026),
 * so the phone opens its keyboard on a text field and puts it away
 * elsewhere. The founder: "when you click on somewhere that you should type,
 * the keyboard to open too. and when you click elsewhere, the keyboard goes
 * away." The phone draws the computer's screen as pixels (noVNC) and cannot
 * see what is under the finger; the agent's Chrome can.
 *
 * Each frame of each page of the agent's Chrome (DevTools, on the port of
 * the agent's display) is given a listener that notes when a real press, of
 * the mouse or of a key, lands in it, and says what its own focused element
 * takes. After a tap the frame with the newest press, newer than any already
 * used, is the one the finger landed in, and its focused element decides
 * the keyboard; after Return (which may move the focus on, to a password
 * field), the frame it was typed in. A sign-in
 * form usually sits in a frame from another address (Apple's on
 * appleid.apple.com does); each frame answers for itself, and a frame of
 * another site, which Chrome runs in a process of its own, through its own
 * DevTools target.
 *
 * Asking Chrome which page "has the focus" was not enough (the first
 * version, the same day): the agent's browser helper drives Chrome through
 * Playwright, which turns focus emulation on in every page it attaches to,
 * so every tab, those behind included, says it has the focus and is
 * visible, and a tab behind could answer for the one in front (measured:
 * Xvfb, xfwm4, a real Chrome window, Playwright attached, clicks as X
 * events: 2 taps in 4 answered wrong).
 *
 * A press not seen (the page loaded since Chrome was last asked, so it had
 * no listener yet): among the pages that got their listener just now, the
 * one Chrome says a real press just reached (its user activation), newest
 * first. `prepare` gives every page its listener before the first tap (the
 * phone asks when the person takes control). Only web pages are seen:
 * Chrome's address bar, its tab strip and other programs answer "", and the
 * phone keeps its keyboard button for them.
 */
import WebSocketModule from "ws";
import { HOST_LOG_PREFIX, logHostLine } from "../../shared/host-log.js";

/** Chrome's DevTools port is this plus the agent's display number (`box/bin/box-chrome`). */
export const TYPING_FOCUS_CDP_PORT_BASE = 9222;
/** How long the tap gets to reach Chrome (it goes by the screen's own connection) before Chrome is asked. */
export const TYPING_FOCUS_SETTLE_MS = 200;
/** No new press seen yet: Chrome is asked again after this long, for a tap still on its way (the screen's connection is not the question's). */
export const TYPING_FOCUS_RETRY_MS = 250;
/** How many times it is asked again before the answer is that the tap landed in no page. */
export const TYPING_FOCUS_RETRIES = 2;

/** The keyboard the phone opens: an input's type, "text" for a text area or an editable block, "" for none. */
export type TypingFocus = "" | "text" | "email" | "password" | "search" | "tel" | "url" | "number";
const KEYBOARDS = new Set<TypingFocus>(["text", "email", "password", "search", "tel", "url", "number"]);

/**
 * Run in each frame (its own JavaScript world). The first time, it leaves a
 * listener that notes the time of every press in the frame, of the mouse or
 * of a key (capture, on the window: before the page's own handlers), kept
 * while the page lives. It answers with that time, whether the listener is
 * new, and what the frame's focused element takes: an input's type, "text",
 * "frame" when the focus is in a frame inside it, or "".
 */
export const TYPING_FOCUS_EXPRESSION = `(() => {
  const key = Symbol.for("simeon.typing-focus");
  let mark = window[key];
  const fresh = mark === undefined;
  if (fresh) {
    mark = { pressedAt: 0 };
    Object.defineProperty(window, key, { value: mark, enumerable: false, configurable: true });
    const note = () => { mark.pressedAt = Date.now(); };
    window.addEventListener("pointerdown", note, true);
    window.addEventListener("mousedown", note, true);
    window.addEventListener("keydown", note, true);
  }
  const kind = (() => {
    const e = document.activeElement;
    if (!e || e.tagName === "BODY" || e.tagName === "HTML") return "";
    if (e.tagName === "IFRAME" || e.tagName === "FRAME") return "frame";
    if (e.disabled || e.readOnly) return "";
    if (e.isContentEditable || e.tagName === "TEXTAREA") return "text";
    if (e.tagName !== "INPUT") return "";
    const type = (e.getAttribute("type") || "text").toLowerCase();
    return ["text", "email", "password", "search", "tel", "url", "number"].includes(type) ? type : "";
  })();
  const activated = navigator.userActivation ? navigator.userActivation.isActive : false;
  return { kind, pressedAt: mark.pressedAt, fresh, focused: document.hasFocus(), activated, born: performance.timeOrigin };
})()`;

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
const defaultSocket: CdpSocketFactory = (url) => new WebSocket(url, { perMessageDeflate: false, maxPayload: 16 * 1024 * 1024 });

/** One DevTools socket: commands with replies, and the events it sends. */
export class CdpConnection {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  private readonly listeners = new Map<string, Set<(params: Record<string, unknown>) => void>>();
  private closed = false;

  private constructor(private readonly socket: CdpSocket) {
    socket.on("message", (data) => this.receive(data));
    socket.on("close", () => this.shutDown());
    socket.on("error", () => this.shutDown());
  }

  static open(url: string, create: CdpSocketFactory = defaultSocket, timeoutMs = 2_000): Promise<CdpConnection> {
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

  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, timeoutMs = 1_500): Promise<T> {
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
  }
}

/** A page or a frame of another site, as Chrome's browser-wide DevTools lists it. */
export interface FocusTarget {
  readonly type: "page" | "iframe";
  readonly id: string;
  readonly socketUrl: string;
}

/** Chrome's pages and out-of-process frames on `port`; none when Chrome is not there. */
export async function listFocusTargets(port: number, create: CdpSocketFactory = defaultSocket): Promise<FocusTarget[]> {
  let connection: CdpConnection | undefined;
  try {
    const version = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1_500) });
    if (!version.ok) return [];
    const socketUrl = ((await version.json()) as { webSocketDebuggerUrl?: unknown }).webSocketDebuggerUrl;
    if (typeof socketUrl !== "string" || socketUrl.length === 0) return [];
    connection = await CdpConnection.open(socketUrl, create);
    const result = await connection.send<{ targetInfos?: unknown }>("Target.getTargets");
    const infos = Array.isArray(result.targetInfos) ? result.targetInfos as Record<string, unknown>[] : [];
    return infos.flatMap((info): FocusTarget[] => {
      const id = typeof info.targetId === "string" ? info.targetId : "";
      if ((info.type !== "page" && info.type !== "iframe") || id.length === 0) return [];
      return [{ type: info.type, id, socketUrl: `ws://127.0.0.1:${port}/devtools/page/${id}` }];
    });
  } catch {
    return [];
  } finally {
    connection?.close();
  }
}

/** One frame's answer (`TYPING_FOCUS_EXPRESSION`), and the page or frame target it came from. */
export interface FrameReport {
  readonly target: string;
  readonly kind: TypingFocus | "frame";
  /** When a press, of the mouse or of a key, last landed in the frame (the computer's clock), 0 for none since its listener came. */
  readonly pressedAt: number;
  /** Its listener came with this very question: a press before it was not seen. */
  readonly fresh: boolean;
  readonly focused: boolean;
  /** A real press or key reached the frame (or a frame inside it) in the last few seconds (`navigator.userActivation.isActive`, Chrome's five). */
  readonly activated: boolean;
  /** When its document was made (`performance.timeOrigin`). */
  readonly born: number;
}

function asReport(target: string, value: unknown): FrameReport | undefined {
  if (value == null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const kind = record.kind === "frame" || (typeof record.kind === "string" && KEYBOARDS.has(record.kind as TypingFocus)) ? record.kind as TypingFocus | "frame" : "";
  const number = (field: unknown): number => typeof field === "number" && Number.isFinite(field) ? field : 0;
  return { target, kind, pressedAt: number(record.pressedAt), fresh: record.fresh === true, focused: record.focused === true, activated: record.activated === true, born: number(record.born) };
}

/** Every frame's answer in the target's process (each frame's own JavaScript world). */
async function reportsOf(target: FocusTarget, create: CdpSocketFactory): Promise<FrameReport[]> {
  let connection: CdpConnection | undefined;
  try {
    connection = await CdpConnection.open(target.socketUrl, create);
    const contexts: number[] = [];
    connection.on("Runtime.executionContextCreated", (params) => {
      const context = params.context as { id?: unknown; auxData?: { isDefault?: unknown } } | undefined;
      if (typeof context?.id === "number" && context.auxData?.isDefault === true) contexts.push(context.id);
    });
    // Chrome names every existing frame's world before it answers this.
    await connection.send("Runtime.enable");
    const ids = contexts.length > 0 ? contexts : [undefined];
    const reports = await Promise.all(ids.map(async (contextId) => {
      const result = await connection!.send<{ result?: { value?: unknown } }>("Runtime.evaluate", { expression: TYPING_FOCUS_EXPRESSION, returnByValue: true, ...(contextId === undefined ? {} : { contextId }) }).catch(() => undefined);
      return asReport(target.id, result?.result?.value);
    }));
    await connection.send("Runtime.disable").catch(() => undefined);
    return reports.filter((report): report is FrameReport => report !== undefined);
  } catch {
    return [];
  } finally {
    connection?.close();
  }
}

/** Every frame of every page and of every other site's frame, each with its listener from now on. */
async function allReports(targets: readonly FocusTarget[], create: CdpSocketFactory): Promise<FrameReport[]> {
  return (await Promise.all(targets.map((target) => reportsOf(target, create)))).flat();
}

/** The keyboard a frame's own answer asks for ("frame": the focus went on into a frame inside it, which answers for itself). */
const keyboardOf = (report: FrameReport): TypingFocus => report.kind === "frame" ? "" : report.kind;

/** The frame a press newer than `after` landed in, the newest; undefined when none did. */
export function pressedFrame(reports: readonly FrameReport[], after: number): FrameReport | undefined {
  let newest: FrameReport | undefined;
  for (const report of reports) {
    if (report.pressedAt > after && (newest === undefined || report.pressedAt > newest.pressedAt)) newest = report;
  }
  return newest;
}

/**
 * No press seen: it landed in a page that had no listener yet (loaded since
 * Chrome was last asked). Among the frames that got theirs with this
 * question, one Chrome says a real press just reached, focused, with a
 * field, the newest document first; else none. (A field the agent left
 * focused in a tab behind is focused too, under the helper's focus
 * emulation, but no press reached it in the last seconds.)
 */
export function unwatchedKeyboard(reports: readonly FrameReport[]): TypingFocus {
  const candidates = reports.filter((report) => report.fresh && report.activated && report.focused && keyboardOf(report) !== "");
  candidates.sort((a, b) => b.born - a.born);
  return candidates[0] === undefined ? "" : keyboardOf(candidates[0]);
}

export interface TypingFocusOptions {
  readonly listTargets?: (port: number) => Promise<FocusTarget[]>;
  readonly createSocket?: CdpSocketFactory;
  readonly retryMs?: number;
  readonly retries?: number;
}

export interface TypingFocusReading {
  readonly focus: TypingFocus;
  /** How it was found: the frame a press landed in, a page with no listener yet, or nothing to go by. */
  readonly by: "press" | "unwatched" | "none";
  readonly frames: number;
  /** The newest press seen (the computer's clock), for the next question to go past. */
  readonly lastPressAt: number;
}

/**
 * What the tap that came after `after` focused, in the Chrome on `port`.
 * Every frame keeps its listener from here on.
 */
export async function readTypingFocus(port: number, options: TypingFocusOptions & { readonly after?: number } = {}): Promise<TypingFocusReading> {
  const create = options.createSocket ?? defaultSocket;
  const after = options.after ?? 0;
  const list = options.listTargets ?? ((value: number) => listFocusTargets(value, create));
  const first = await allReports(await list(port), create);
  let reports = first;
  let pressed = pressedFrame(reports, after);
  // The tap may still be on its way: again, a moment later.
  for (let retry = 0; pressed === undefined && retry < (options.retries ?? TYPING_FOCUS_RETRIES); retry += 1) {
    await new Promise((resolve) => setTimeout(resolve, options.retryMs ?? TYPING_FOCUS_RETRY_MS));
    reports = await allReports(await list(port), create);
    pressed = pressedFrame(reports, after);
  }
  const lastPressAt = Math.max(after, ...reports.map((report) => report.pressedAt));
  if (pressed !== undefined) return { focus: keyboardOf(pressed), by: "press", frames: reports.length, lastPressAt };
  // The listeners that came with the first question mark the pages the tap could not be seen in.
  const focus = unwatchedKeyboard(first);
  return { focus, by: focus === "" ? "none" : "unwatched", frames: reports.length, lastPressAt };
}

/** Gives every frame of the Chrome on `port` its listener, so the next tap is seen; the newest press so far. */
export async function prepareTypingFocus(port: number, options: TypingFocusOptions = {}): Promise<number> {
  const create = options.createSocket ?? defaultSocket;
  const reports = await allReports(await (options.listTargets ?? ((value: number) => listFocusTargets(value, create)))(port), create);
  return Math.max(0, ...reports.map((report) => report.pressedAt));
}

export interface TypingFocusesOptions extends TypingFocusOptions {
  /** The agent's display number on the cloud computer (`getAgentWindowIndex`); 1 when it has no other. */
  readonly displayFor: (agentId: string) => number | undefined;
  readonly portFor?: (display: number) => number;
  readonly settleMs?: number;
  readonly log?: (line: string) => void;
}

/**
 * `typingFocus` on the gateway: the agent's Chrome asked, once the tap has
 * had time to land; `prepare` (the person takes control) only gives every
 * page its listener. The newest press used is kept per Chrome, so an earlier
 * tap is never taken for this one.
 */
export function createTypingFocus(options: TypingFocusesOptions): (agentId: string, prepare?: boolean) => Promise<{ focus: TypingFocus }> {
  const log = options.log ?? logHostLine;
  const seen = new Map<number, number>();
  return async (agentId, prepare = false) => {
    const display = options.displayFor(agentId) ?? 1;
    const port = (options.portFor ?? ((index: number) => TYPING_FOCUS_CDP_PORT_BASE + index))(display);
    const startedAt = Date.now();
    if (prepare) {
      seen.set(port, Math.max(seen.get(port) ?? 0, await prepareTypingFocus(port, options)));
      log(`${HOST_LOG_PREFIX} typing-focus prepared agent=${agentId} port=${port} ms=${Date.now() - startedAt}`);
      return { focus: "" };
    }
    const settleMs = options.settleMs ?? TYPING_FOCUS_SETTLE_MS;
    if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));
    const reading = await readTypingFocus(port, { ...options, after: seen.get(port) ?? 0 });
    seen.set(port, Math.max(seen.get(port) ?? 0, reading.lastPressAt));
    log(`${HOST_LOG_PREFIX} typing-focus agent=${agentId} port=${port} focus=${reading.focus || "none"} by=${reading.by} frames=${reading.frames} ms=${Date.now() - startedAt}`);
    return { focus: reading.focus };
  };
}
