/**
 * One agent turn run by Claude Code on the person's computer (9 November
 * 2026, docs/your-own-models.md, section 6, step C4): the person chose Claude
 * in AI Models and signed in to Claude Code there (`claude-code-account.ts`).
 *
 * The program is Anthropic's own, unmodified: `claude -p` in stream-json, its
 * session resumed per agent (`--resume`), the agent's brief added to Claude
 * Code's own (`--append-system-prompt-file`), Simeon's tools offered as an MCP
 * server (`--mcp-config`, the engine's), and its permission asks sent to the
 * engine's safety review (`--permission-prompt-tool`). The model calls are
 * Claude Code's, on the person's plan; nothing here calls Anthropic.
 *
 * What comes back is sorted for the engine: done; the plan's limit reached;
 * the sign-in gone; the session to resume gone (the computer was made
 * afresh); Claude Code not installed; failed. Anything but done means the
 * turn runs on Simeon's model instead, and the chat says why once.
 *
 * Nothing here logs the prompt, the brief, a tool's input or a sign-in.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { claudeCodeBinary, claudeCodeEnv, logClaudeCode } from "./claude-code-account.js";
import { ensureClaudeCode } from "./claude-code-install.js";

/** The MCP server name Simeon's tools are offered under: Claude Code calls them `mcp__simeon__<Tool>`. */
export const SIMEON_MCP_SERVER = "simeon";
/** The longest a turn may run before it is stopped (the engine's own turns are bounded by steps, not time). */
const TURN_TIMEOUT_MS = 60 * 60_000;
/** A session id as Claude Code writes them (a UUID). */
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The effort of background work on the person's Claude plan (12 November 2026, the founder: every way of running
 * the agents behaves as Simeon's own models do): the helpers on the computer's screen and in its browser, and the
 * small jobs (the safety review, memory, a summary, a title). The agent's own turns and a general helper keep the
 * effort the person chose. At the person's High, a helper on the screen thought for about 2 s before each click,
 * and the safety review took 6 to 8 s per command.
 */
export const CLAUDE_CODE_BACKGROUND_EFFORT = "low";

/** A picture Claude reads with the prompt: its type (`image/png`…) and its bytes in base64. */
export interface ClaudeCodeImage {
  readonly mediaType: string;
  readonly data: string;
}

export interface ClaudeCodeTurnInput {
  /** What the agent is asked this turn (the person's message, a routine's instruction…). */
  readonly prompt: string;
  /** The person's pictures with it, shown to Claude before the words. */
  readonly images?: readonly ClaudeCodeImage[] | undefined;
  /** `--model`: `opus`, `sonnet`. */
  readonly model: string;
  /** `--effort`: how hard Claude thinks (`low`, `medium`, `high`, `xhigh`, `max`): as the person chose on the composer for the agent's own turns, `low` for background work (`CLAUDE_CODE_BACKGROUND_EFFORT`); none, Claude Code's own. */
  readonly effort?: string | undefined;
  /** The session to resume; none starts a new one (its id is in the outcome). */
  readonly resume?: string | undefined;
  /** Added to Claude Code's own system prompt: the agent's brief. */
  readonly brief?: string | undefined;
  /** In place of Claude Code's own system prompt (`--system-prompt-file`): a small job's own instructions. */
  readonly systemPrompt?: string | undefined;
  /** Claude Code's own tools offered (`--tools`); empty for none, as a small job that only answers in words. */
  readonly tools?: readonly string[] | undefined;
  /** Nothing kept on disk afterwards (`--no-session-persistence`): a one-off job, never resumed. */
  readonly noSessionPersistence?: boolean | undefined;
  /** `{ mcpServers: { simeon: … } }`, written to a private file for `--mcp-config`. */
  readonly mcpServers?: Readonly<Record<string, unknown>> | undefined;
  /** `mcp__simeon__<Tool>` that answers Claude Code's permission asks. */
  readonly permissionPromptTool?: string | undefined;
  /** Claude Code's own tools it may not use this turn. */
  readonly disallowedTools?: readonly string[] | undefined;
  /** Tools it may use without asking (`mcp__simeon`: every tool of Simeon's server, which carry their own cards and reviews). */
  readonly allowedTools?: readonly string[] | undefined;
  readonly maxTurns?: number | undefined;
  /** Where Claude Code works (its project, which keys its sessions). */
  readonly cwd?: string | undefined;
  readonly signal?: AbortSignal | undefined;
  /** Each event Claude Code writes, as it comes. */
  readonly onEvent?: ((event: ClaudeCodeEvent) => void) | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly configDir?: string | undefined;
  readonly timeoutMs?: number | undefined;
}

/** One line of Claude Code's stream-json output (`system`, `assistant`, `user`, `result`). */
export interface ClaudeCodeEvent {
  readonly type: string;
  readonly subtype?: string;
  readonly session_id?: string;
  readonly [key: string]: unknown;
}

export type ClaudeCodeOutcome =
  /** The turn ran to its end; `text` is Claude Code's last words (sent to the person when it sent them nothing else, `claudeCodeReplyToSend`). */
  | { readonly kind: "done"; readonly sessionId: string; readonly text: string; readonly turns: number }
  /** The plan's limit is reached, until `until` (ms) when Claude Code says. */
  | { readonly kind: "limited"; readonly sessionId?: string | undefined; readonly until?: number | undefined; readonly said: string }
  /** Claude Code isn't signed in any more: the person connects Claude again. */
  | { readonly kind: "signed_out"; readonly said: string }
  /** The session to resume isn't on this computer (made afresh): start a new one. */
  | { readonly kind: "no_session" }
  | { readonly kind: "not_installed" }
  | { readonly kind: "aborted"; readonly sessionId?: string | undefined }
  | { readonly kind: "failed"; readonly sessionId?: string | undefined; readonly said: string; readonly exitCode: number | null };

/** The arguments for one turn (no prompt: it goes in on stdin). */
export function claudeCodeTurnArgs(input: ClaudeCodeTurnInput, files: { brief?: string | undefined; mcp?: string | undefined; system?: string | undefined }, newSession: string | undefined): string[] {
  const args = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--model", input.model];
  if (input.effort !== undefined) args.push("--effort", input.effort);
  if (input.resume !== undefined) args.push("--resume", input.resume);
  else if (newSession !== undefined) args.push("--session-id", newSession);
  if (input.noSessionPersistence === true) args.push("--no-session-persistence");
  if (files.system !== undefined) args.push("--system-prompt-file", files.system);
  if (files.brief !== undefined) args.push("--append-system-prompt-file", files.brief);
  if (input.tools !== undefined) args.push("--tools", input.tools.join(","));
  if (files.mcp !== undefined) args.push("--mcp-config", files.mcp, "--strict-mcp-config");
  if (input.permissionPromptTool !== undefined) args.push("--permission-prompt-tool", input.permissionPromptTool);
  if (input.disallowedTools !== undefined && input.disallowedTools.length > 0) args.push("--disallowedTools", input.disallowedTools.join(","));
  if (input.allowedTools !== undefined && input.allowedTools.length > 0) args.push("--allowedTools", input.allowedTools.join(","));
  if (input.maxTurns !== undefined) args.push("--max-turns", String(input.maxTurns));
  return args;
}

/** The prompt as one stream-json user message: the pictures first, then the words. */
export function claudeCodeUserMessage(prompt: string, images: readonly ClaudeCodeImage[] = []): string {
  const pictures = images.map((image) => ({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } }));
  return `${JSON.stringify({ type: "user", message: { role: "user", content: [...pictures, { type: "text", text: prompt }] } })}\n`;
}

const said = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * When the limit ends, from Claude Code's words: `…limit reached|1794150000`
 * (seconds), or none.
 */
export function limitEnds(words: string): number | undefined {
  const epoch = /\|(\d{10,13})\s*$/.exec(words);
  if (epoch?.[1] === undefined) return undefined;
  const value = Number(epoch[1]);
  return epoch[1].length === 13 ? value : value * 1000;
}

/** The plan's limit as Claude Code's stream says it (2.1.311, read from the program): a `rate_limit_event` rejected, or an API error coded `usage_limit_reached`; its reset in seconds since 1970. */
export function limitFromEvent(event: ClaudeCodeEvent): { readonly until?: number | undefined } | undefined {
  const reset = (info: unknown): number | undefined => {
    const at = (info as { resetsAt?: unknown } | undefined)?.resetsAt;
    return typeof at === "number" && at > 0 ? (at < 1e12 ? at * 1000 : at) : undefined;
  };
  if (event.type === "rate_limit_event") {
    const info = event.rate_limit_info as { status?: unknown } | undefined;
    return info?.status === "rejected" ? { until: reset(info) } : undefined;
  }
  const message = event.message as Record<string, unknown> | undefined;
  for (const holder of [event as Record<string, unknown>, message ?? {}]) {
    if (holder.is_api_error_message === true && holder.api_error_code === "usage_limit_reached") {
      return { until: reset((holder.api_error_params as { rate_limit_info?: unknown } | undefined)?.rate_limit_info) };
    }
  }
  return undefined;
}

/** How much of the plan is used, one window: 0 to 100 (past 100 when the plan lets usage run on), and its reset in milliseconds. */
export interface ClaudeCodePlanWindow {
  readonly kind: "five_hour" | "weekly";
  readonly usedPercent: number;
  readonly resetsAt?: number | undefined;
}

/**
 * How much of the plan is used, as Claude Code's stream says it (9 November
 * 2026; 2.1.311, read from the program): its `rate_limit_event`, sent when
 * the plan's limits change, carries `unifiedWindows` with `five_hour` and
 * `seven_day`, each a `utilization` (1 is the whole window) and `resetsAt`
 * (seconds since 1970). Older ones carry the one window in `rateLimitType`
 * and `utilization`. None when the event says nothing of it.
 */
export function usageFromEvent(event: ClaudeCodeEvent): readonly ClaudeCodePlanWindow[] | undefined {
  if (event.type !== "rate_limit_event") return undefined;
  const info = event.rate_limit_info as Record<string, unknown> | undefined;
  if (info === undefined || info === null || typeof info !== "object") return undefined;
  const window = (kind: ClaudeCodePlanWindow["kind"], part: unknown): ClaudeCodePlanWindow | undefined => {
    const { utilization, resetsAt } = (part ?? {}) as { utilization?: unknown; resetsAt?: unknown };
    if (typeof utilization !== "number" || !Number.isFinite(utilization) || utilization < 0) return undefined;
    const reset = typeof resetsAt === "number" && resetsAt > 0 ? (resetsAt < 1e12 ? resetsAt * 1000 : resetsAt) : undefined;
    return { kind, usedPercent: Math.min(Math.round(utilization * 1000) / 10, 1000), ...(reset === undefined ? {} : { resetsAt: reset }) };
  };
  const unified = info.unifiedWindows as Record<string, unknown> | undefined;
  const windows = unified !== undefined && unified !== null && typeof unified === "object"
    ? [window("five_hour", unified.five_hour), window("weekly", unified.seven_day)]
    : [info.rateLimitType === "five_hour" ? window("five_hour", info) : info.rateLimitType === "seven_day" ? window("weekly", info) : undefined];
  const said = windows.filter((one): one is ClaudeCodePlanWindow => one !== undefined);
  return said.length > 0 ? said : undefined;
}

/** What Claude Code's error words mean for the engine. */
export function classifyClaudeCodeError(words: string): "limited" | "signed_out" | "no_session" | "failed" {
  if (/no conversation found with session id/i.test(words)) return "no_session";
  if (/usage limit|limit reached|limit will reset|resets? (?:at|in)\b/i.test(words)) return "limited";
  if (/\/login|not logged in|log ?in again|invalid api key|oauth token (?:has )?expired|token (?:has )?expired|authentication[_ ](?:error|failed)|unauthori[sz]ed/i.test(words)) return "signed_out";
  return "failed";
}

/** Reads stream-json lines as they come; a line that isn't JSON is ignored (Claude Code writes only JSON on stdout). */
export class StreamJsonLines {
  private rest = "";
  constructor(private readonly each: (event: ClaudeCodeEvent) => void) {}
  push(chunk: string): void {
    this.rest += chunk;
    let newline = this.rest.indexOf("\n");
    while (newline >= 0) {
      this.line(this.rest.slice(0, newline));
      this.rest = this.rest.slice(newline + 1);
      newline = this.rest.indexOf("\n");
    }
  }
  end(): void {
    if (this.rest.trim() !== "") this.line(this.rest);
    this.rest = "";
  }
  private line(raw: string): void {
    const trimmed = raw.trim();
    if (trimmed === "") return;
    try {
      const event = JSON.parse(trimmed) as unknown;
      if (event !== null && typeof event === "object" && typeof (event as { type?: unknown }).type === "string") this.each(event as ClaudeCodeEvent);
    } catch {
      // Not an event.
    }
  }
}

/** Runs one turn to its end; never throws. */
export async function runClaudeCodeTurn(input: ClaudeCodeTurnInput): Promise<ClaudeCodeOutcome> {
  if (input.signal?.aborted === true) return { kind: "aborted" };
  // Installed at Connect; a computer made afresh since installs it again here (the turn waits up to two minutes).
  if (await ensureClaudeCode({ env: input.env ?? process.env, waitMs: 120_000, log: logClaudeCode }) !== "ready") return { kind: "not_installed" };
  const newSession = input.resume === undefined ? randomUUID() : undefined;
  const folder = mkdtempSync(path.join(os.tmpdir(), "simeon-claude-turn-"));
  const files: { brief?: string; mcp?: string; system?: string } = {};
  try {
    if (input.systemPrompt !== undefined && input.systemPrompt.trim() !== "") {
      files.system = path.join(folder, "system.md");
      writeFileSync(files.system, input.systemPrompt, { mode: 0o600 });
    }
    if (input.brief !== undefined && input.brief.trim() !== "") {
      files.brief = path.join(folder, "brief.md");
      writeFileSync(files.brief, input.brief, { mode: 0o600 });
    }
    if (input.mcpServers !== undefined) {
      files.mcp = path.join(folder, "mcp.json");
      writeFileSync(files.mcp, JSON.stringify({ mcpServers: input.mcpServers }), { mode: 0o600 });
    }
    return await new Promise<ClaudeCodeOutcome>((resolve) => {
      // Claude Code's own Bash tool runs in bash, as on any computer it's installed on.
      const env: Record<string, string> = { ...claudeCodeEnv(input.env ?? process.env, { configDir: input.configDir }), SHELL: "/bin/bash" };
      const cwd = input.cwd ?? env.HOME;
      let sessionId = input.resume ?? newSession;
      let result: ClaudeCodeEvent | undefined;
      let lastText = "";
      let stderr = "";
      // The plan's limit, as soon as Claude Code says it: the turn stops rather than wait for the reset.
      let limited: { until?: number | undefined } | undefined;
      let settled = false;
      const finish = (outcome: ClaudeCodeOutcome): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        input.signal?.removeEventListener("abort", abort);
        resolve(outcome);
      };
      const lines = new StreamJsonLines((event) => {
        if (typeof event.session_id === "string" && SESSION_ID.test(event.session_id)) sessionId = event.session_id;
        if (event.type === "assistant") {
          const content = (event.message as { content?: unknown } | undefined)?.content;
          if (Array.isArray(content)) {
            const words = content.filter((part): part is { type: string; text: string } => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("");
            if (words !== "") lastText = words;
          }
        }
        if (event.type === "result") result = event;
        const limit = limited === undefined ? limitFromEvent(event) : undefined;
        if (limit !== undefined) {
          limited = limit;
          child.kill("SIGTERM");
          setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
        }
        try { input.onEvent?.(event); } catch { /* the caller's own trouble */ }
      });
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(claudeCodeBinary(input.env ?? process.env), claudeCodeTurnArgs(input, files, newSession), {
          ...(cwd === undefined ? {} : { cwd }),
          env,
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
        if (limited !== undefined) { finish({ kind: "limited", sessionId, until: limited.until, said: "usage limit reached" }); return; }
        const words = said(result?.result) || said(stderr);
        const failed = result === undefined || result.is_error === true || (result.subtype !== undefined && result.subtype !== "success");
        if (!failed && sessionId !== undefined) {
          finish({ kind: "done", sessionId, text: said(result?.result) || lastText, turns: typeof result?.num_turns === "number" ? result.num_turns : 0 });
          return;
        }
        const kind = classifyClaudeCodeError(`${words}\n${said(stderr)}`);
        if (kind === "limited") finish({ kind, sessionId, until: limitEnds(words), said: words });
        else if (kind === "signed_out") finish({ kind, said: words });
        else if (kind === "no_session") finish({ kind });
        else finish({ kind: "failed", sessionId, said: words || `claude exited ${code ?? "on a signal"}`, exitCode: code });
      });
      child.stdin?.on("error", () => { /* closed early: the close event says why */ });
      child.stdin?.end(claudeCodeUserMessage(input.prompt, input.images));
    });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

// MARK: Each agent's session

/** Where a turn's Claude Code session is kept between its turns. */
export interface ClaudeCodeSessionStore {
  get(agentId: string): string | undefined;
  set(agentId: string, sessionId: string): void;
  forget(agentId: string): void;
}

/** A helper's sessions, for the engine's run only: a helper is done when its task is (`subagent-runtime.ts`). */
export class ClaudeCodeMemorySessions implements ClaudeCodeSessionStore {
  private readonly all = new Map<string, string>();
  get(agentId: string): string | undefined { return this.all.get(agentId); }
  set(agentId: string, sessionId: string): void { if (SESSION_ID.test(sessionId)) this.all.set(agentId, sessionId); }
  forget(agentId: string): void { this.all.delete(agentId); }
}

/** Each agent's Claude Code session, kept on the data volume (`claude-code-sessions.json`). */
export class ClaudeCodeSessions implements ClaudeCodeSessionStore {
  constructor(private readonly file: string) {}

  private read(): Record<string, string> {
    try {
      const value = JSON.parse(readFileSync(this.file, "utf8")) as unknown;
      if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
      const kept: Record<string, string> = {};
      for (const [agent, id] of Object.entries(value as Record<string, unknown>)) if (typeof id === "string" && SESSION_ID.test(id)) kept[agent] = id;
      return kept;
    } catch {
      return {};
    }
  }

  get(agentId: string): string | undefined {
    return this.read()[agentId];
  }

  set(agentId: string, sessionId: string): void {
    if (!SESSION_ID.test(sessionId)) return;
    const all = this.read();
    if (all[agentId] === sessionId) return;
    all[agentId] = sessionId;
    this.write(all);
  }

  forget(agentId: string): void {
    const all = this.read();
    if (!(agentId in all)) return;
    delete all[agentId];
    this.write(all);
  }

  private write(all: Record<string, string>): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, `${JSON.stringify(all)}\n`, { mode: 0o600 });
  }
}

/**
 * A turn with the agent's own session: resumed when it has one, started
 * afresh when the computer no longer has it, and kept for the next turn.
 */
export async function runAgentClaudeCodeTurn(agentId: string, sessions: ClaudeCodeSessionStore, input: Omit<ClaudeCodeTurnInput, "resume">): Promise<ClaudeCodeOutcome> {
  const resume = sessions.get(agentId);
  let outcome = await runClaudeCodeTurn({ ...input, resume });
  if (outcome.kind === "no_session" && resume !== undefined) {
    sessions.forget(agentId);
    outcome = await runClaudeCodeTurn({ ...input, resume: undefined });
  }
  const id = "sessionId" in outcome ? outcome.sessionId : undefined;
  // Kept whenever Claude Code may have it; one it never made answers "no_session" next time, and a new one starts.
  if (id !== undefined) sessions.set(agentId, id);
  return outcome;
}
