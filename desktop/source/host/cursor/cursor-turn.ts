/**
 * One turn of Cursor's command-line agent on the person's computer, for a
 * cloud agent's coding (13 November 2026, the founder: "Cursor now").
 *
 * As a Claude Code turn (`claude-code/claude-code-turn.ts`) and a Codex one
 * (`codex/codex-turn.ts`), with the maker's own program, unmodified (`agent
 * -p`, read and run on 2026.11.11-b912975 with its network cut off, against
 * a stand-in; a turn that reaches a model was not run, and its events below
 * are read from the program's own code):
 *
 * - `agent -p --output-format stream-json "<task>"` writes one JSON event a
 *   line: `system`/`init` (its session), `assistant` (what it said between
 *   its tools, whole), `tool_call`, and `result` at the end (every word of
 *   the turn joined). `--resume <session>` carries a session on.
 * - It has no place for a brief of Simeon's, so a session's first task
 *   begins with it.
 * - It runs on the person's own Cursor sign-in on this computer
 *   (`cursor-account.ts`), on the model their Cursor account uses, and its
 *   calls go to Cursor directly: nothing passes through Simeon Labs' server.
 * - It runs its commands without asking and without its own sandbox
 *   (`--force`, `--sandbox disabled`), and trusts the checkout (`--trust`):
 *   the computer is the person's own cloud computer, where Claude Code's
 *   Bash and Codex run the same way, and nobody is there to answer.
 * - A failure leaves with 1 and one line of error output: no sign-in
 *   ("Authentication required…", or "Your stored authentication is
 *   invalid…" after Cursor refused it), a limit ("[resource_exhausted] …").
 *
 * Nothing here logs the task, what Cursor said, the code or a sign-in.
 */
import { spawn } from "node:child_process";
import { HOST_LOG_PREFIX, logHostLine } from "../../shared/host-log.js";
import { StreamJsonLines } from "../claude-code/claude-code-turn.js";
import { cursorEnv } from "./cursor-account.js";
import { cursorBinary, ensureCursor } from "./cursor-install.js";

const TURN_TIMEOUT_MS = 3 * 60 * 60_000;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The longest task given on the command line (one argument holds 131,072 bytes on Linux). */
export const CURSOR_PROMPT_MAX_BYTES = 100_000;

export interface CursorTurnInput {
  /** The task, or the follow-up. */
  readonly prompt: string;
  /** The model as Cursor names it; none, the one the person's Cursor account uses. */
  readonly model?: string | undefined;
  /** The session to carry on; none starts one. */
  readonly resume?: string | undefined;
  /** Simeon's brief, which a new session's task begins with. */
  readonly brief?: string | undefined;
  readonly cwd: string;
  readonly timeoutMs?: number | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly onEvent?: ((event: CursorEvent) => void) | undefined;
}

export interface CursorEvent {
  readonly type?: string;
  readonly subtype?: string;
  readonly session_id?: unknown;
  readonly is_error?: unknown;
  readonly result?: unknown;
  readonly message?: { readonly role?: unknown; readonly content?: unknown } | null;
}

/** As a Claude Code turn's (`ClaudeCodeOutcome`): the coding reads all three the same way. */
export type CursorOutcome =
  | { readonly kind: "done"; readonly sessionId: string; readonly text: string }
  | { readonly kind: "limited"; readonly sessionId?: string | undefined; readonly until?: number | undefined; readonly said: string }
  | { readonly kind: "signed_out"; readonly said: string }
  | { readonly kind: "no_session" }
  | { readonly kind: "not_installed" }
  | { readonly kind: "aborted"; readonly sessionId?: string | undefined }
  | { readonly kind: "failed"; readonly sessionId?: string | undefined; readonly said: string; readonly exitCode: number | null };

/** What Cursor said in one event: the words of an `assistant` event; "" for anything else. */
export function cursorWords(event: CursorEvent): string {
  if (event.type !== "assistant" || event.message == null || !Array.isArray(event.message.content)) return "";
  return (event.message.content as { type?: unknown; text?: unknown }[])
    .map((part) => (part != null && part.type === "text" && typeof part.text === "string" ? part.text : ""))
    .join("");
}

/** The task as it is given: a new session's begins with the brief; one too long for the command line keeps its end (the person's last words). */
export function cursorPrompt(input: Pick<CursorTurnInput, "prompt" | "brief" | "resume">, maxBytes: number = CURSOR_PROMPT_MAX_BYTES): string {
  const brief = input.resume === undefined ? input.brief?.trim() ?? "" : "";
  const head = brief === "" ? "" : `${brief}\n\n---\n\n`;
  let task = input.prompt;
  const room = Math.max(1_000, maxBytes - Buffer.byteLength(head, "utf8"));
  if (Buffer.byteLength(task, "utf8") > room) {
    const cut = Buffer.from(task, "utf8").subarray(-room).toString("utf8");
    // The first character may be half of one: dropped with the rest of its line.
    task = `(The start of the exchange is left out: it is too long.)\n${cut.slice(cut.indexOf("\n") + 1)}`;
  }
  return `${head}${task}`;
}

/** Cursor's arguments for the turn; the task is the last one. */
export function cursorTurnArgs(input: Pick<CursorTurnInput, "prompt" | "model" | "resume" | "brief" | "cwd">): string[] {
  return [
    "-p",
    "--output-format", "stream-json",
    "--force",
    "--trust",
    "--sandbox", "disabled",
    "--workspace", input.cwd,
    ...(input.model === undefined || input.model.trim() === "" ? [] : ["--model", input.model.trim()]),
    ...(input.resume === undefined ? [] : ["--resume", input.resume]),
    cursorPrompt(input),
  ];
}

/** What went wrong, from Cursor's own error output. */
export function classifyCursorError(words: string, resumed: boolean): "limited" | "signed_out" | "no_session" | "failed" {
  if (/Authentication required|stored authentication is invalid|agent login|Not logged in|\[unauthenticated\]/i.test(words)) return "signed_out";
  if (/\[resource_exhausted\]|usage limit|rate limit|quota/i.test(words)) return "limited";
  if (resumed && /\[not_found\]|(?:chat|session|conversation)[^\n]{0,80}not found|No previous chats found|No conversation ID found/i.test(words)) return "no_session";
  return "failed";
}

function logCursor(line: string): void {
  logHostLine(`${HOST_LOG_PREFIX} ${line}`);
}

/** Runs one turn to its end; never throws. */
export async function runCursorTurn(input: CursorTurnInput): Promise<CursorOutcome> {
  if (input.signal?.aborted === true) return { kind: "aborted" };
  const base = input.env ?? process.env;
  // Installed when Cursor was connected; a computer made afresh since installs it again here (the turn waits up to five minutes).
  if (await ensureCursor({ env: base, waitMs: 5 * 60_000, log: logCursor }) !== "ready") return { kind: "not_installed" };
  return await new Promise<CursorOutcome>((resolve) => {
    let sessionId = input.resume;
    let lastText = "";
    let said = "";
    let result: string | undefined;
    let refused = false;
    let stderr = "";
    let settled = false;
    const finish = (outcome: CursorOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", abort);
      resolve(outcome);
    };
    const lines = new StreamJsonLines((raw) => {
      const event = raw as unknown as CursorEvent;
      if (typeof event.session_id === "string" && SESSION_ID.test(event.session_id)) sessionId = event.session_id;
      const words = cursorWords(event);
      if (words.trim() !== "") { lastText = words; said += words; }
      if (event.type === "result") {
        result = typeof event.result === "string" ? event.result : "";
        refused = event.is_error === true || (typeof event.subtype === "string" && event.subtype !== "success");
      }
      try { input.onEvent?.(event); } catch { /* the caller's own trouble */ }
    });
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cursorBinary(base), cursorTurnArgs(input), { cwd: input.cwd, env: cursorEnv(base), stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      finish({ kind: "not_installed" });
      return;
    }
    const abort = (): void => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    };
    const timer = setTimeout(abort, input.timeoutMs ?? TURN_TIMEOUT_MS);
    timer.unref();
    input.signal?.addEventListener("abort", abort, { once: true });
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => lines.push(chunk));
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => { if (stderr.length < 8_000) stderr += chunk; });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish(error.code === "ENOENT" ? { kind: "not_installed" } : { kind: "failed", sessionId, said: error.message, exitCode: null });
    });
    child.on("close", (code) => {
      lines.end();
      if (input.signal?.aborted === true) { finish({ kind: "aborted", sessionId }); return; }
      if (code === 0 && result !== undefined && !refused && sessionId !== undefined) {
        // The result is every word of the turn joined; what follows the words already heard is its answer, else the last heard.
        const tail = result.startsWith(said) ? result.slice(said.length).trim() : "";
        finish({ kind: "done", sessionId, text: tail || lastText.trim() || result.trim() });
        return;
      }
      const errorLine = stderr.split("\n").map((line) => line.trim()).find((line) => /^error\b/i.test(line)) ?? stderr.split("\n").map((line) => line.trim()).find((line) => line !== "") ?? "";
      const words = (refused && result ? result : errorLine).slice(0, 600);
      const kind = classifyCursorError(`${words}\n${stderr}`, input.resume !== undefined);
      if (kind === "limited") finish({ kind, sessionId, until: undefined, said: words });
      else if (kind === "signed_out") finish({ kind, said: words });
      else if (kind === "no_session") finish({ kind });
      else finish({ kind: "failed", sessionId, said: words || `Cursor's program exited ${code ?? "on a signal"}`, exitCode: code });
    });
  });
}
