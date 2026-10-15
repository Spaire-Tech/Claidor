/**
 * What the person's tap on the whole computer landed in (15 October 2026),
 * so the phone opens its keyboard on a text field and puts it away
 * elsewhere. The founder: "when you click on somewhere that you should type,
 * the keyboard to open too. and when you click elsewhere, the keyboard goes
 * away." The phone draws the computer's screen as pixels (noVNC) and cannot
 * see what is under the finger; the agent's Chrome can.
 *
 * After the tap, the page that has the keyboard's focus is asked what its
 * focused element is (DevTools, on the port of the agent's display), in
 * every frame of that page: a sign-in form usually sits in a frame from
 * another address (Apple's on appleid.apple.com does), and the page itself
 * only knows "a frame". A frame of another site runs in a process of its
 * own and is asked through its own DevTools target.
 *
 * Only web pages are seen: Chrome's address bar and other programs answer
 * "", and the phone keeps its keyboard button for them.
 */
import WebSocketModule from "ws";
import { HOST_LOG_PREFIX, logHostLine } from "../../shared/host-log.js";

/** Chrome's DevTools port is this plus the agent's display number (`box/bin/box-chrome`). */
export const TYPING_FOCUS_CDP_PORT_BASE = 9222;
/** How long the tap gets to reach Chrome (it goes by the screen's own connection) before Chrome is asked. */
export const TYPING_FOCUS_SETTLE_MS = 200;

/** The keyboard the phone opens: an input's type, "text" for a text area or an editable block, "" for none. */
export type TypingFocus = "" | "text" | "email" | "password" | "search" | "tel" | "url" | "number";
const KEYBOARDS = new Set<TypingFocus>(["text", "email", "password", "search", "tel", "url", "number"]);

/**
 * Run in each frame: null when the frame does not have the focus, "frame"
 * when the focus is in a frame inside it, else the keyboard its focused
 * element takes. Same-origin frames are looked into here; another origin's
 * answers for itself.
 */
export const TYPING_FOCUS_EXPRESSION = `(() => {
  if (!document.hasFocus()) return null;
  let e = document.activeElement;
  for (let depth = 0; e && e.tagName === "IFRAME" && depth < 8; depth++) {
    let inner = null;
    try { inner = e.contentDocument; } catch (error) { inner = null; }
    if (!inner) return "frame";
    e = inner.activeElement;
  }
  if (!e || e.tagName === "BODY" || e.tagName === "HTML") return "";
  if (e.disabled || e.readOnly) return "";
  if (e.isContentEditable || e.tagName === "TEXTAREA") return "text";
  if (e.tagName !== "INPUT") return "";
  const type = (e.getAttribute("type") || "text").toLowerCase();
  return ["text", "email", "password", "search", "tel", "url", "number"].includes(type) ? type : "";
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

type FrameAnswer = TypingFocus | "frame" | null;

function asAnswer(value: unknown): FrameAnswer {
  if (value === null || value === "frame" || value === "") return value as FrameAnswer;
  return typeof value === "string" && KEYBOARDS.has(value as TypingFocus) ? value as TypingFocus : "";
}

/** The answer of every frame in the target's process (each frame's own JavaScript world). */
async function answersOf(target: FocusTarget, create: CdpSocketFactory): Promise<FrameAnswer[]> {
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
    const answers = await Promise.all(ids.map(async (contextId) => {
      const result = await connection!.send<{ result?: { value?: unknown } }>("Runtime.evaluate", { expression: TYPING_FOCUS_EXPRESSION, returnByValue: true, ...(contextId === undefined ? {} : { contextId }) }).catch(() => undefined);
      return asAnswer(result?.result?.value ?? null);
    }));
    await connection.send("Runtime.disable").catch(() => undefined);
    return answers;
  } catch {
    return [];
  } finally {
    connection?.close();
  }
}

/** The keyboard the focused element takes, from the answers of the frames: one that names one, else none. */
function keyboardIn(answers: readonly FrameAnswer[]): TypingFocus | "frame" | null {
  const keyboard = answers.find((answer): answer is TypingFocus => answer !== null && answer !== "frame" && answer !== "");
  if (keyboard !== undefined) return keyboard;
  if (answers.includes("frame")) return "frame";
  return answers.some((answer) => answer !== null) ? "" : null;
}

export interface TypingFocusOptions {
  readonly listTargets?: (port: number) => Promise<FocusTarget[]>;
  readonly createSocket?: CdpSocketFactory;
}

/** What the Chrome on `port` has the keyboard's focus in, now. */
export async function readTypingFocus(port: number, options: TypingFocusOptions = {}): Promise<TypingFocus> {
  const create = options.createSocket ?? defaultSocket;
  const targets = await (options.listTargets ?? ((value: number) => listFocusTargets(value, create)))(port);
  const pages = targets.filter((target) => target.type === "page");
  for (const page of pages) {
    const found = keyboardIn(await answersOf(page, create));
    if (found === null) continue;
    if (found !== "frame") return found;
    // The focus is in a frame of another site, which answers in its own process.
    const frames = targets.filter((target) => target.type === "iframe");
    const inner = keyboardIn((await Promise.all(frames.map((frame) => answersOf(frame, create)))).flat());
    return inner === null || inner === "frame" ? "" : inner;
  }
  return "";
}

export interface TypingFocusesOptions extends TypingFocusOptions {
  /** The agent's display number on the cloud computer (`getAgentWindowIndex`); 1 when it has no other. */
  readonly displayFor: (agentId: string) => number | undefined;
  readonly portFor?: (display: number) => number;
  readonly settleMs?: number;
  readonly log?: (line: string) => void;
}

/** `typingFocus` on the gateway: the agent's Chrome asked, once the tap has had time to land. */
export function createTypingFocus(options: TypingFocusesOptions): (agentId: string) => Promise<{ focus: TypingFocus }> {
  const log = options.log ?? logHostLine;
  return async (agentId) => {
    const display = options.displayFor(agentId) ?? 1;
    const port = (options.portFor ?? ((index: number) => TYPING_FOCUS_CDP_PORT_BASE + index))(display);
    const settleMs = options.settleMs ?? TYPING_FOCUS_SETTLE_MS;
    if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));
    const startedAt = Date.now();
    const focus = await readTypingFocus(port, options);
    log(`${HOST_LOG_PREFIX} typing-focus agent=${agentId} focus=${focus || "none"} ms=${Date.now() - startedAt}`);
    return { focus };
  };
}
