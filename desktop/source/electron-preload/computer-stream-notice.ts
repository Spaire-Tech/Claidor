/// <reference lib="dom" />
/**
 * A spinner that never ends, given a sentence. The shipped renderer shows
 * `.sand-box-vnc-pool__connecting` until the box's page reports a live
 * VNC connection and never times out. The main process narrates the
 * stream (computer-stream-log.ts) and forwards each line here; when a
 * spinner has been up for `COMPUTER_STREAM_NOTICE_DELAY_MS`, the last
 * reason those lines gave is painted under it, with the log's path.
 */
import { COMPUTER_STREAM_CHANNEL, computerStreamReason, isComputerStreamMessage } from "../shared/computer-stream.js";

export const COMPUTER_STREAM_NOTICE_ATTR = "data-caisra-screen-notice";
export const COMPUTER_STREAM_NOTICE_DELAY_MS = 20_000;
export const CONNECTING_SELECTOR = ".sand-box-vnc-pool__connecting";
export const NOTICE_LOG_TAG = "[SimeonScreenNotice]";

export interface ComputerStreamNoticeOptions {
  readonly doc?: Document;
  /** Delivers each forwarded log line; returns an unsubscribe. */
  readonly subscribe: (listener: (message: unknown) => void) => () => void;
  readonly delayMs?: number;
  readonly now?: () => number;
  readonly schedule?: (callback: () => void, delayMs: number) => unknown;
  readonly log?: (line: string) => void;
}

export function noticeText(reason: string | null, filePath: string | null): string {
  const parts = ["The computer's screen isn't connecting."];
  parts.push(reason != null && reason.length > 0 ? reason : "No reason was reported yet.");
  if (filePath != null) parts.push(`Details: ${filePath}`);
  return parts.join(" ");
}

function setStyle(element: HTMLElement, declarations: Record<string, string>): void {
  for (const [name, value] of Object.entries(declarations)) element.style.setProperty(name, value);
}

export function installComputerStreamNotice(options: ComputerStreamNoticeOptions): { disconnect(): void } | null {
  const doc = options.doc ?? (typeof document === "undefined" ? undefined : document);
  if (doc == null) return null;
  const now = options.now ?? (() => Date.now());
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const delayMs = options.delayMs ?? COMPUTER_STREAM_NOTICE_DELAY_MS;
  const log = options.log ?? ((line: string) => console.info(line));
  let reason: string | null = null;
  let filePath: string | null = null;
  const seen = new Map<Element, number>();
  let disconnected = false;

  const noticeFor = (spinner: Element): HTMLElement | null => {
    const parent = spinner.parentElement;
    if (parent == null) return null;
    let notice = parent.querySelector(`:scope > [${COMPUTER_STREAM_NOTICE_ATTR}]`) as HTMLElement | null;
    if (notice == null) {
      notice = doc.createElement("div");
      notice.setAttribute(COMPUTER_STREAM_NOTICE_ATTR, "1");
      setStyle(notice, {
        position: "absolute", left: "8px", right: "8px", bottom: "8px", "z-index": "3",
        font: "12px/1.35 -apple-system, system-ui, sans-serif", color: "#8a1c1c",
        background: "rgba(255,255,255,0.92)", "border-radius": "8px", padding: "6px 8px",
        "text-align": "center", "pointer-events": "none", "word-break": "break-word",
      });
      if (parent.style.position === "") parent.style.position = "relative";
      parent.append(notice);
    }
    return notice;
  };

  const sync = (): void => {
    if (disconnected) return;
    const spinners = new Set<Element>(doc.querySelectorAll(CONNECTING_SELECTOR));
    for (const [spinner, since] of seen) {
      if (!spinners.has(spinner) || !spinner.isConnected) {
        seen.delete(spinner);
        spinner.parentElement?.querySelector(`:scope > [${COMPUTER_STREAM_NOTICE_ATTR}]`)?.remove();
        continue;
      }
      if (now() - since >= delayMs) {
        const notice = noticeFor(spinner);
        if (notice != null) {
          const text = noticeText(reason, filePath);
          if (notice.textContent !== text) {
            notice.textContent = text;
            log(`${NOTICE_LOG_TAG} ${text}`);
          }
        }
      }
    }
    for (const spinner of spinners) {
      if (seen.has(spinner)) continue;
      seen.set(spinner, now());
      schedule(sync, delayMs + 50);
    }
    // Stray notices whose spinner is gone.
    for (const notice of doc.querySelectorAll(`[${COMPUTER_STREAM_NOTICE_ATTR}]`)) {
      if (notice.parentElement?.querySelector(`:scope > ${CONNECTING_SELECTOR}`) == null) notice.remove();
    }
  };

  const unsubscribe = options.subscribe((message) => {
    if (!isComputerStreamMessage(message)) return;
    if (message.filePath != null) filePath = message.filePath;
    const next = computerStreamReason(message.line);
    if (next === "") reason = null;
    else if (next != null) reason = next;
    sync();
  });
  const Observer = doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  const observer = new Observer(sync);
  const start = (): void => {
    if (disconnected) return;
    observer.observe(doc.documentElement ?? doc, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    sync();
  };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  return { disconnect() { disconnected = true; observer.disconnect(); unsubscribe(); } };
}

/** The preload must never fail because of a notice. */
export function installComputerStreamNoticeSafely(ipc: { on(channel: string, listener: (event: any, payload?: any) => void): void; off(channel: string, listener: (event: any, payload?: any) => void): void }): { disconnect(): void } | null {
  try {
    return installComputerStreamNotice({
      subscribe: (listener) => {
        const wrapped = (_event: unknown, payload: unknown): void => listener(payload);
        ipc.on(COMPUTER_STREAM_CHANNEL, wrapped);
        return () => ipc.off(COMPUTER_STREAM_CHANNEL, wrapped);
      },
    });
  } catch (error) {
    console.warn(`${NOTICE_LOG_TAG} not installed`, error);
    return null;
  }
}
