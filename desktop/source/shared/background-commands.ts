/**
 * A command an agent leaves running in the background on its computer
 * (12 November 2026, the founder: "a long command keeps running in the
 * background, and the agent is woken automatically when it finishes").
 *
 * The computer's command runner (`box-exec-daemon/server.ts`) moves a Shell
 * command to the background when it outlives its wait (`block_until_ms`), or
 * at once for `block_until_ms: 0`, and writes its output to a file in the
 * terminals folder. The engine watches that file (`watchBackgroundShell`,
 * `runner/background-work.ts`) and wakes the agent with the result when the
 * command ends (`completion-revivals.ts`), even after its turn has ended.
 *
 * The limit: a background command is stopped after two hours. That is long
 * enough for an install, a build, a test suite, a deployment or a cloud
 * service being set up, and it bounds how long a forgotten server or a hung
 * command keeps the computer awake (a running background command holds it,
 * `host-busy.ts`). The agent is woken when a command is stopped at the limit,
 * as when it ends by itself.
 */
export const BACKGROUND_COMMAND_LIMIT_MS = 2 * 60 * 60 * 1_000;

/** The limit as the agents read it in their instructions and in a stopped command's file. */
export const BACKGROUND_COMMAND_LIMIT_WORDS = "2 hours";

/**
 * How long a background command (or the wake kept for one after a restart)
 * holds the computer awake after it was last seen at work: its limit and ten
 * minutes more, so a command is never put to sleep under while it may still
 * run, and a wake whose command is long gone does not hold the computer for
 * ever.
 */
export const BACKGROUND_COMMAND_HOLD_MS = BACKGROUND_COMMAND_LIMIT_MS + 10 * 60 * 1_000;

/**
 * What a background command's output file says of its end. The file opens
 * with a header (`---`, `pid:`, `command:`…, `---`) and gets a footer when the
 * command ends: `exit_code:`, `elapsed_ms:`, `ended_at:`, and `stopped:` when
 * the runner stopped it at its limit. A footer with `error:` and `ended_at:`
 * and no exit code says the end could not be recorded (the runner itself
 * restarted under the command).
 */
export interface TerminalFooter {
  readonly isComplete: boolean;
  readonly exitCode?: number;
  readonly isStreamFailure?: boolean;
  /** Why the runner stopped the command (its limit), when it did. */
  readonly stopped?: string;
}

export function parseShellTerminalFooter(content: string): TerminalFooter {
  const match = content.match(/\n---\n([\s\S]*?)\n---\s*$/);
  if (match == null) return { isComplete: false };
  const footer = match[1] ?? "";
  const stoppedLine = footer.match(/(?:^|\n)stopped:\s*([^\n]*)/)?.[1]?.trim();
  const stopped = stoppedLine === undefined || stoppedLine.length === 0 ? undefined : unquoted(stoppedLine);
  const exit = footer.match(/(?:^|\n)exit_code:\s*([^\n]*)/);
  if (exit != null) {
    const raw = (exit[1] ?? "").trim();
    const parsed = Number(raw);
    return { isComplete: true, ...(raw && Number.isInteger(parsed) ? { exitCode: parsed } : {}), ...(stopped === undefined ? {} : { stopped }) };
  }
  return /(?:^|\n)error:\s*([^\n]*)/.test(footer) && /(?:^|\n)ended_at:\s*\S/.test(footer)
    ? { isComplete: true, isStreamFailure: true }
    : { isComplete: false };
}

function unquoted(value: string): string {
  if (!value.startsWith("\"")) return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}

/**
 * The id of the background command whose output file `path` is, when it is
 * one: `<terminals folder>/<id>.txt`, in any of the folders given.
 */
export function terminalFileShellId(path: string, folders: readonly string[]): string | undefined {
  for (const folder of folders) {
    const base = folder.endsWith("/") ? folder.slice(0, -1) : folder;
    if (base.length === 0 || !path.startsWith(`${base}/`)) continue;
    const match = /^(\d+)\.txt$/.exec(path.slice(base.length + 1));
    if (match?.[1] !== undefined) return match[1];
  }
  return undefined;
}
