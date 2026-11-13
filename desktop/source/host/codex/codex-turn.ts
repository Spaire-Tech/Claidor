/**
 * One turn of Codex on the person's computer, for a cloud agent's coding (13
 * November 2026, the founder: "running one in Codex is not built").
 *
 * As a Claude Code turn (`claude-code/claude-code-turn.ts`), with OpenAI's
 * own program, unmodified (`codex exec`, measured on 0.168.0 against a
 * stand-in server; nothing here was run against chatgpt.com):
 *
 * - `codex exec --json … -` reads the task from its input and writes one
 *   JSON event a line: `thread.started` (its session), `item.completed`
 *   (what it said, `agent_message`; a command it ran), `turn.completed` or
 *   `turn.failed`. `codex exec resume <session> -` carries a session on.
 * - It is given a model provider of its own on the command line
 *   (`model_providers.simeon`), whose address is the turn's relay
 *   (`codex-relay.ts`): its calls go to Simeon Labs' server and from there
 *   to ChatGPT on the account the person connected. No ChatGPT sign-in is on
 *   the computer and `codex login` is never run.
 * - Its own settings and sessions are kept in a folder of Simeon's
 *   (`CODEX_HOME`), not the person's `~/.codex`.
 * - It runs its commands without its own sandbox or questions
 *   (`--dangerously-bypass-approvals-and-sandbox`): the computer is the
 *   person's own cloud computer, where Claude Code's Bash runs the same way,
 *   and nobody is there to answer a question.
 *
 * Nothing here logs the task, what Codex said, the code or a credential.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { HOST_LOG_PREFIX, logHostLine } from "../../shared/host-log.js";
import { StreamJsonLines } from "../claude-code/claude-code-turn.js";
import { codexBinary, ensureCodex } from "./codex-install.js";
import { startCodexRelay, type CodexRelay, type CodexRelayDeps } from "./codex-relay.js";

/** Where Codex keeps its settings and its sessions for Simeon's coding (`CODEX_HOME`). */
export const CODEX_HOME = "/home/box/.simeon-codex";
/** The variable Codex reads its provider's key from. Its name has KEY in it, so Codex keeps it from the commands it runs. */
export const CODEX_KEY_ENV = "SIMEON_CODEX_KEY";
const TURN_TIMEOUT_MS = 3 * 60 * 60_000;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The variables of the engine's own environment Codex is given: the machine's, never Simeon's. */
const PASSED_THROUGH = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TMPDIR", "http_proxy", "https_proxy", "no_proxy", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "GIT_SSL_CAINFO"] as const;

export interface CodexTurnInput {
  /** The task, or the follow-up. */
  readonly prompt: string;
  /** The model as Codex names it (`gpt-6.1-sol`), and as Simeon does (`own:chatgpt:gpt-6.1-sol`). */
  readonly model: string;
  readonly modelId: string;
  /** `model_reasoning_effort`; none, Codex's own. */
  readonly effort?: string | undefined;
  /** The session to carry on; none starts one. */
  readonly resume?: string | undefined;
  /** Simeon's brief, given as Codex's developer instructions. */
  readonly brief?: string | undefined;
  readonly cwd: string;
  /** `CODEX_HOME`; `SIMEON_CODEX_HOME` in tests, else `CODEX_HOME` above. */
  readonly home?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly onEvent?: ((event: CodexEvent) => void) | undefined;
  /** How its calls reach Simeon Labs' server. */
  readonly relay: Omit<CodexRelayDeps, "modelId">;
}

export interface CodexEvent {
  readonly type?: string;
  readonly thread_id?: unknown;
  readonly message?: unknown;
  readonly item?: { readonly type?: unknown; readonly text?: unknown; readonly message?: unknown } | null;
  readonly error?: { readonly message?: unknown } | null;
}

/** As a Claude Code turn's (`ClaudeCodeOutcome`): the coding reads both the same way. */
export type CodexOutcome =
  | { readonly kind: "done"; readonly sessionId: string; readonly text: string; readonly turns: number }
  | { readonly kind: "limited"; readonly sessionId?: string | undefined; readonly until?: number | undefined; readonly said: string }
  | { readonly kind: "signed_out"; readonly said: string }
  | { readonly kind: "no_session" }
  | { readonly kind: "not_installed" }
  | { readonly kind: "aborted"; readonly sessionId?: string | undefined }
  | { readonly kind: "failed"; readonly sessionId?: string | undefined; readonly said: string; readonly exitCode: number | null };

/** What Codex said in one event: the words of a finished `agent_message`; "" for anything else. */
export function codexWords(event: CodexEvent): string {
  if (event.type !== "item.completed" || event.item == null || event.item.type !== "agent_message") return "";
  return typeof event.item.text === "string" ? event.item.text : "";
}

/** Codex's arguments for the turn; the task itself goes to its input (`-`). */
export function codexTurnArgs(input: Pick<CodexTurnInput, "model" | "effort" | "resume" | "brief">, relay: Pick<CodexRelay, "baseUrl">): string[] {
  const set = (key: string, value: string): string[] => ["-c", `${key}=${JSON.stringify(value)}`];
  return [
    "exec",
    ...(input.resume === undefined ? [] : ["resume"]),
    "--json",
    "--dangerously-bypass-approvals-and-sandbox",
    "-m", input.model,
    ...set("model_provider", "simeon"),
    ...set("model_providers.simeon.name", "Simeon"),
    ...set("model_providers.simeon.base_url", relay.baseUrl),
    ...set("model_providers.simeon.wire_api", "responses"),
    ...set("model_providers.simeon.env_key", CODEX_KEY_ENV),
    ...(input.effort === undefined ? [] : set("model_reasoning_effort", input.effort)),
    ...(input.brief === undefined || input.brief.trim() === "" ? [] : set("developer_instructions", input.brief)),
    ...(input.resume === undefined ? [] : [input.resume]),
    "-",
  ];
}

/** Codex's environment: the machine's own variables, its folder, the turn's key, and nothing of the engine's. */
export function codexEnv(base: NodeJS.ProcessEnv, options: { readonly home: string; readonly key: string }): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of PASSED_THROUGH) {
    const value = base[name];
    if (typeof value === "string" && value !== "") env[name] = value;
  }
  env.PATH ??= "/usr/local/bin:/usr/bin:/bin";
  env.HOME ??= "/home/box";
  env.SHELL = "/bin/bash";
  env.CODEX_HOME = options.home;
  env[CODEX_KEY_ENV] = options.key;
  // The relay is on this computer: never through a proxy.
  for (const name of ["no_proxy", "NO_PROXY"]) env[name] = [env[name], "127.0.0.1", "localhost"].filter(Boolean).join(",");
  return env;
}

/** What went wrong, from Codex's own last words and its error output. */
export function classifyCodexError(words: string): "limited" | "signed_out" | "no_session" | "failed" {
  if (/no rollout found|thread\/resume failed|session .*not found/i.test(words)) return "no_session";
  if (/usage limit|usage_limit_reached/i.test(words)) return "limited";
  if (/chatgpt_not_connected|ChatGPT isn't connected/i.test(words)) return "signed_out";
  return "failed";
}

const said = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function logCodex(line: string): void {
  logHostLine(`${HOST_LOG_PREFIX} ${line}`);
}

/** Runs one turn to its end; never throws. */
export async function runCodexTurn(input: CodexTurnInput): Promise<CodexOutcome> {
  if (input.signal?.aborted === true) return { kind: "aborted" };
  const base = input.env ?? process.env;
  // Installed at the first coding in Codex; a computer made afresh since installs it again here (the turn waits up to two minutes).
  if (await ensureCodex({ env: base, waitMs: 120_000, log: logCodex }) !== "ready") return { kind: "not_installed" };
  const home = input.home ?? base.SIMEON_CODEX_HOME?.trim() ?? CODEX_HOME;
  let relay: CodexRelay;
  try {
    mkdirSync(home, { recursive: true, mode: 0o700 });
    relay = await startCodexRelay({ ...input.relay, modelId: input.modelId });
  } catch (error) {
    return { kind: "failed", said: `Codex's relay couldn't start: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300), exitCode: null };
  }
  try {
    return await new Promise<CodexOutcome>((resolve) => {
      let sessionId = input.resume;
      let lastText = "";
      let completed = false;
      let failure = "";
      let turns = 0;
      let stderr = "";
      let settled = false;
      const finish = (outcome: CodexOutcome): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        input.signal?.removeEventListener("abort", abort);
        resolve(outcome);
      };
      const lines = new StreamJsonLines((raw) => {
        const event = raw as unknown as CodexEvent;
        if (event.type === "thread.started" && typeof event.thread_id === "string" && SESSION_ID.test(event.thread_id)) sessionId = event.thread_id;
        const words = codexWords(event);
        if (words.trim() !== "") lastText = words;
        if (event.type === "turn.started") turns += 1;
        if (event.type === "turn.completed") completed = true;
        if (event.type === "turn.failed") failure = said(event.error?.message) || failure;
        // Its reconnecting lines are errors too: the last one is the reason.
        if (event.type === "error") failure = said(event.message) || failure;
        try { input.onEvent?.(event); } catch { /* the caller's own trouble */ }
      });
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(codexBinary(base), codexTurnArgs(input, relay), {
          cwd: input.cwd,
          env: codexEnv(base, { home, key: relay.key }),
          stdio: ["pipe", "pipe", "pipe"],
        });
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
        const refused = relay.state();
        if (code === 0 && completed && sessionId !== undefined) {
          finish({ kind: "done", sessionId, text: lastText.trim(), turns });
          return;
        }
        // The first line of its error output says why; the rest is a backtrace.
        const errorLine = stderr.split("\n").map((line) => line.trim()).find((line) => /^error\b/i.test(line)) ?? "";
        const words = failure || errorLine;
        if (refused.limited) { finish({ kind: "limited", sessionId, until: refused.limitedUntilMs, said: words || "usage limit reached" }); return; }
        if (refused.notConnected) { finish({ kind: "signed_out", said: words || "ChatGPT isn't connected" }); return; }
        const kind = classifyCodexError(`${words}\n${errorLine}`);
        if (kind === "limited") finish({ kind, sessionId, until: undefined, said: words });
        else if (kind === "signed_out") finish({ kind, said: words });
        else if (kind === "no_session") finish({ kind });
        else finish({ kind: "failed", sessionId, said: words || `codex exited ${code ?? "on a signal"}`, exitCode: code });
      });
      child.stdin?.on("error", () => { /* closed early: the close event says why */ });
      child.stdin?.end(input.prompt);
    });
  } finally {
    await relay.close().catch(() => undefined);
  }
}
