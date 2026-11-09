/**
 * An agent's turn on the person's own Claude plan (9 November 2026,
 * docs/your-own-models.md, section 6, step C4): the hook the agent's
 * user-message handler calls (`ClaudeCodeTurnHook`, its config's
 * `claudeCodeTurn`) when the roles name Claude Code (`claudeCode`).
 *
 * The turn's own tools, built as the engine's loop builds them, are served to
 * Claude Code over MCP for the length of the turn (`simeon-mcp-server.ts`,
 * `claude-code-tools.ts`), with the agent's brief and a line naming them;
 * the agent's session is resumed (`claude-code-turn.ts`). On the first turn
 * of a session the context the loop would send (the person, the time, the
 * agent's notes) goes before the person's words.
 *
 * When Claude Code can't run the turn, the hook says so and the engine's own
 * loop answers on Simeon's model. After the plan's limit, Claude waits until
 * it resets (an hour when Claude Code doesn't say); after the sign-in is
 * gone, five minutes before trying again; when Claude Code isn't installed,
 * an hour. A turn the person stopped is over: it doesn't move to Simeon's.
 */
import { join } from "node:path";
import { HOST_LOG_PREFIX, logHostLine } from "../../shared/host-log.js";
import { simeonModelRoles } from "../extensions/inference/simeon-model-roles.js";
import { getSandRootDir } from "../host-paths.js";
import { bridgeEngineTools, permissionBridgeTool, PERMISSION_TOOL_NAME, type EngineTool } from "./claude-code-tools.js";
import { ClaudeCodeSessions, runAgentClaudeCodeTurn, SIMEON_MCP_SERVER, type ClaudeCodeOutcome } from "./claude-code-turn.js";
import { startSimeonMcpServer } from "./simeon-mcp-server.js";

/** The hook's input, as the agent's handler gives it (`ClaudeCodeTurnHook` in user-message-action-handler.ts). */
export interface ClaudeCodeTurnInput {
  readonly ctx: unknown;
  readonly conversationId: string;
  readonly brief: string;
  readonly context?: string;
  readonly text: string;
  readonly tools: readonly unknown[];
  readonly listener: unknown;
  readonly stateHandler: unknown;
  readonly signal: AbortSignal;
}

export type ClaudeCodeTurnResult = { readonly ran: true; readonly text: string } | { readonly ran: false };

export interface ClaudeCodeTurnHook {
  chosen(conversationId: string): boolean;
  run(input: ClaudeCodeTurnInput): Promise<ClaudeCodeTurnResult>;
}

/** Why Claude didn't answer, for the one line the chat gets (step C4 part 4). */
export type ClaudeCodeFallback = "limited" | "signed_out" | "not_installed" | "failed";

export interface ClaudeCodeAgentTurnOptions {
  readonly sessions: ClaudeCodeSessions;
  /** The model Claude Code runs on; the roles' `claudeCode` by default. */
  readonly model?: () => string | undefined;
  /** Claude Code's permission asks, answered by the person's safety review; none allows (the computer is the agent's own). */
  readonly review?: ((toolName: string, input: Readonly<Record<string, unknown>>, signal: AbortSignal) => Promise<{ allow: boolean; reason?: string }>) | undefined;
  /** Claude didn't answer this turn: the chat says why, once. */
  readonly onFallback?: ((conversationId: string, why: ClaudeCodeFallback, until?: number) => void) | undefined;
  readonly log?: ((line: string) => void) | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly configDir?: string | undefined;
  readonly now?: () => number;
}

const MINUTE = 60_000;

/** The line added to the brief: where Simeon's own tools are. */
export function claudeCodeBriefNote(): string {
  return [
    "## Your Simeon tools",
    `Simeon's own tools are offered to you over MCP as \`mcp__${SIMEON_MCP_SERVER}__<Name>\`: \`mcp__${SIMEON_MCP_SERVER}__SendMessage\` is the SendMessage above, and so on for each tool this brief names. The person sees only what you send with it; your own text is your scratchpad. Your own tools (the shell, files, web search) are Claude Code's.`,
  ].join("\n");
}

/** The prompt Claude Code gets: the context on a session's first turn, then the person's words. */
export function claudeCodePrompt(text: string, context: string | undefined, firstOfSession: boolean): string {
  const words = text.trim() === "" ? "(The person sent nothing to read: continue as the brief says.)" : text;
  return firstOfSession && context !== undefined && context.trim() !== "" ? `${context.trim()}\n\n${words}` : words;
}

export function createClaudeCodeAgentTurn(options: ClaudeCodeAgentTurnOptions): ClaudeCodeTurnHook {
  const now = options.now ?? Date.now;
  const model = options.model ?? (() => simeonModelRoles().claudeCode);
  let pausedUntil = 0;

  const fallBack = (conversationId: string, why: ClaudeCodeFallback, pauseMs: number, until?: number): ClaudeCodeTurnResult => {
    pausedUntil = Math.max(pausedUntil, until ?? now() + pauseMs);
    options.onFallback?.(conversationId, why, until);
    return { ran: false };
  };

  return {
    chosen: () => model() !== undefined && now() >= pausedUntil,

    async run(input) {
      const chosenModel = model();
      if (chosenModel === undefined) return { ran: false };
      const started = now();
      const tools = bridgeEngineTools(input.tools as readonly EngineTool[], {
        ctx: input.ctx,
        signal: input.signal,
        listener: input.listener,
        stateHandler: input.stateHandler,
        log: options.log,
      });
      const review = options.review ?? (async () => ({ allow: true }));
      let outcome: ClaudeCodeOutcome;
      const server = await startSimeonMcpServer({ tools: () => [...tools, permissionBridgeTool(review)], signal: input.signal, log: options.log });
      try {
        outcome = await runAgentClaudeCodeTurn(input.conversationId, options.sessions, {
          prompt: claudeCodePrompt(input.text, input.context, options.sessions.get(input.conversationId) === undefined),
          model: chosenModel,
          brief: [input.brief, claudeCodeBriefNote()].filter((part) => part.trim() !== "").join("\n\n"),
          mcpServers: { [SIMEON_MCP_SERVER]: server.config },
          permissionPromptTool: `mcp__${SIMEON_MCP_SERVER}__${PERMISSION_TOOL_NAME}`,
          signal: input.signal,
          env: options.env,
          configDir: options.configDir,
        });
      } finally {
        await server.close();
      }
      options.log?.(`claude-code turn agent=${input.conversationId} model=${chosenModel} outcome=${outcome.kind} tools=${tools.length} ms=${now() - started}`);
      switch (outcome.kind) {
        case "done": return { ran: true, text: outcome.text };
        // The person stopped the turn: it is over, on Claude or not.
        case "aborted": return { ran: true, text: "" };
        case "limited": return fallBack(input.conversationId, "limited", 60 * MINUTE, outcome.until !== undefined && outcome.until > now() ? outcome.until : undefined);
        case "signed_out": return fallBack(input.conversationId, "signed_out", 5 * MINUTE);
        case "not_installed": return fallBack(input.conversationId, "not_installed", 60 * MINUTE);
        // A session it still couldn't find, or a failure: this turn on Simeon's, Claude again next turn after a minute.
        case "no_session":
        case "failed": return fallBack(input.conversationId, "failed", MINUTE);
      }
    },
  };
}

// MARK: The engine's one hook

/** The file, in the box's data root, that keeps each agent's Claude Code session. */
export const CLAUDE_CODE_SESSIONS_FILE = "claude-code-sessions.json";

let engineHook: ClaudeCodeTurnHook | undefined;

/** The engine's hook, made at its first use: sessions on the data volume, lines in the host log. */
export function claudeCodeTurnHook(): ClaudeCodeTurnHook {
  engineHook ??= createClaudeCodeAgentTurn({
    sessions: new ClaudeCodeSessions(join(getSandRootDir(), CLAUDE_CODE_SESSIONS_FILE)),
    log: (line) => logHostLine(`${HOST_LOG_PREFIX} ${line}`),
  });
  return engineHook;
}
