/**
 * Every step of the box desktop's webview, written to one file the person
 * can paste: the attach (src, partition, which preload, whether it exists),
 * each load event, every console line the page prints, a preload that
 * failed to load, a renderer that went away. The shipped renderer keeps
 * none of this; it only learns "connected" from one message the page
 * sends, so a stream that never connects was invisible.
 */
import { COMPUTER_STREAM_LOG_FILE_NAME } from "../../shared/computer-stream.js";

export { COMPUTER_STREAM_LOG_FILE_NAME };

export const MAX_CONSOLE_LINE_LENGTH = 600;

export interface ComputerStreamLog {
  readonly filePath: string;
  line(text: string): void;
}

export interface ComputerStreamLogDeps {
  readonly filePath: string;
  append(path: string, text: string): void;
  /** Called once, to start the file over for this run. */
  reset?(path: string): void;
  /** Where each line is echoed as well, the process stderr by default. */
  echo?(text: string): void;
  onLine?(line: string): void;
  now?(): Date;
}

export function createComputerStreamLog(deps: ComputerStreamLogDeps): ComputerStreamLog {
  const now = deps.now ?? (() => new Date());
  try { deps.reset?.(deps.filePath); } catch {}
  const log: ComputerStreamLog = {
    filePath: deps.filePath,
    line(text) {
      const stamped = `${now().toISOString()} ${text}`;
      try { deps.append(deps.filePath, `${stamped}\n`); } catch {}
      try { deps.echo?.(`[computer-stream] ${text}`); } catch {}
      try { deps.onLine?.(stamped); } catch {}
    },
  };
  log.line(`computer stream log at ${deps.filePath}`);
  return log;
}

export interface GuestContentsPort {
  on(event: string, listener: (...args: any[]) => void): void;
  getURL?(): string;
  isDestroyed?(): boolean;
}

function truncate(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_CONSOLE_LINE_LENGTH ? `${flat.slice(0, MAX_CONSOLE_LINE_LENGTH)}…` : flat;
}

function guestUrl(contents: GuestContentsPort): string {
  try { return contents.isDestroyed?.() === true ? "(destroyed)" : contents.getURL?.() ?? "?"; } catch { return "?"; }
}

const CONSOLE_LEVELS = ["debug", "info", "warning", "error"] as const;

/** Electron ≥ 32 hands `console-message` one event object; earlier shells spread the fields as arguments. */
export function readConsoleMessage(args: readonly unknown[]): { level: string; message: string } {
  const [event, ...rest] = args;
  const record = (typeof event === "object" && event != null ? event : {}) as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message : typeof rest[1] === "string" ? rest[1] : "";
  let level: string;
  if (typeof record.level === "string") level = record.level;
  else if (typeof record.level === "number") level = CONSOLE_LEVELS[record.level] ?? String(record.level);
  else if (typeof rest[0] === "number") level = CONSOLE_LEVELS[rest[0]] ?? String(rest[0]);
  else level = "info";
  return { level, message };
}

/** Attaches to the guest behind a box desktop webview; every event becomes one line. */
export function observeBoxWebviewGuest(contents: GuestContentsPort, log: ComputerStreamLog): void {
  log.line(`guest created url=${guestUrl(contents)}`);
  contents.on("did-start-loading", () => log.line(`guest loading url=${guestUrl(contents)}`));
  contents.on("did-navigate", (_event: unknown, url: unknown, status: unknown) => {
    log.line(`guest navigated url=${String(url)} status=${status == null ? "?" : String(status)}`);
  });
  contents.on("dom-ready", () => log.line(`guest dom-ready url=${guestUrl(contents)}`));
  contents.on("did-finish-load", () => log.line(`guest loaded url=${guestUrl(contents)}`));
  contents.on("did-fail-load", (_event: unknown, code: unknown, description: unknown, url: unknown, isMainFrame: unknown) => {
    if (code === -3) { log.line(`guest load aborted url=${String(url)} mainFrame=${String(isMainFrame)}`); return; }
    log.line(`guest load FAILED code=${String(code)} (${String(description ?? "")}) url=${String(url)} mainFrame=${String(isMainFrame)}`);
  });
  contents.on("preload-error", (_event: unknown, preloadPath: unknown, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    log.line(`guest preload FAILED path=${String(preloadPath)} error=${truncate(message)}`);
  });
  contents.on("console-message", (...args: unknown[]) => {
    const { level, message } = readConsoleMessage(args);
    log.line(`guest console[${level}] ${truncate(message)}`);
  });
  contents.on("render-process-gone", (_event: unknown, details: unknown) => {
    const reason = typeof details === "object" && details != null ? String((details as { reason?: unknown }).reason ?? "?") : "?";
    log.line(`guest renderer gone reason=${reason}`);
  });
  contents.on("unresponsive", () => log.line("guest unresponsive"));
  contents.on("destroyed", () => log.line("guest destroyed"));
}

export function describeWebviewAttach(input: {
  readonly params: Record<string, unknown>;
  readonly webPreferences: Record<string, unknown>;
  readonly isBox: boolean;
  readonly preloadExists: boolean | undefined;
}): string {
  const { params, webPreferences } = input;
  const preload = typeof webPreferences.preload === "string" ? webPreferences.preload : "(none)";
  return `attach webview box=${input.isBox} src=${typeof params.src === "string" ? params.src : "(none)"} partition=${typeof params.partition === "string" ? params.partition : "(none)"} sandbox=${String(webPreferences.sandbox)} preload=${preload} preloadExists=${input.preloadExists == null ? "?" : String(input.preloadExists)}`;
}
