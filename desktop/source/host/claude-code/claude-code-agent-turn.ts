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
 *
 * How a turn ended (`claudeCodeEndingSince`): Claude's last words, and
 * whether it sent the person anything and worked on after. Claude Code
 * answers in its own words more often than through SendMessage; until 9
 * November 2026 those words reached no one, the engine poked Claude three
 * more times in hidden turns ("they received nothing and are still
 * waiting"), the person's next message waited behind them, and the reply
 * that came opened with "Sorry, I missed your last message" (the founder:
 * "TAKING FOREVER TO ANSWER"). The turn runtime now sends those words as
 * the reply (`claudeCodeReplyToSend`) and pokes no one.
 */
import { join } from "node:path";
import { HOST_LOG_PREFIX, logHostLine } from "../../shared/host-log.js";
import { reportClaudeCodeSignedOut, reportClaudeCodeUsage, simeonModelRoles } from "../extensions/inference/simeon-model-roles.js";
import { getSandRootDir } from "../host-paths.js";
import { bridgeEngineTools, CLAUDE_CODE_TOOLS_OFF, permissionBridgeTool, PERMISSION_TOOL_NAME, type BridgeCall, type EngineTool } from "./claude-code-tools.js";
import { ClaudeCodeSessions, runAgentClaudeCodeTurn, SIMEON_MCP_SERVER, usageFromEvent, type ClaudeCodeOutcome, type ClaudeCodePlanWindow } from "./claude-code-turn.js";
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

/**
 * What the turn hands back: whether Claude Code ran it, its last words, and
 * what it said to the person as the model's history (`claudeCodeHistory`),
 * which the handler keeps as the loop keeps its own, also when the turn moves
 * to Simeon's model after Claude spoke.
 */
export type ClaudeCodeTurnResult =
  | { readonly ran: true; readonly text: string; readonly history?: readonly unknown[] }
  | { readonly ran: false; readonly history?: readonly unknown[] };

export interface ClaudeCodeTurnHook {
  chosen(conversationId: string): boolean;
  run(input: ClaudeCodeTurnInput): Promise<ClaudeCodeTurnResult>;
}

/** Why Claude didn't answer, for the one line the chat gets (step C4 part 4). */
export type ClaudeCodeFallback = "limited" | "signed_out" | "not_installed" | "failed";

/** How a turn Claude Code ran to its end finished: its last words, whether it sent the person anything, and whether it worked on after its last message. */
export interface ClaudeCodeEnding {
  readonly at: number;
  readonly text: string;
  readonly spoke: boolean;
  readonly workedAfterSpeaking: boolean;
}

/** The tools that put words in front of the person. */
const SPEAKING_TOOLS: ReadonlySet<string> = new Set(["SendMessage", "ReactToMessage"]);

/** The ending of the calls Claude Code made, in order, and its last words. */
export function claudeCodeEnding(calls: readonly string[], text: string, at: number): ClaudeCodeEnding {
  const lastSpoke = calls.findLastIndex((name) => SPEAKING_TOOLS.has(name));
  const lastWorked = calls.findLastIndex((name) => !SPEAKING_TOOLS.has(name));
  return { at, text, spoke: lastSpoke >= 0, workedAfterSpeaking: lastSpoke >= 0 && lastWorked > lastSpoke };
}

/**
 * The words to send the person after a turn they started, which Claude Code
 * ran: its last words, only when nothing reached them (`owed`). Once it sent
 * them a message, its words after it are its scratchpad, as its brief says,
 * and stay its own. Until 10 November 2026 they were also sent when it worked
 * on after its last message, and its notes to itself reached the person
 * ("I told Bass I'll use Nov 15…", after "Got it, Nov 15"; the founder: "the
 * fact that it talks about me is an issue"). The brief now tells it to send
 * what came of that work itself (`claudeCodeBriefNote`).
 */
export function claudeCodeReplyToSend(ending: ClaudeCodeEnding, owed: boolean): string | undefined {
  const text = ending.text.trim();
  if (text === "") return undefined;
  return owed ? text : undefined;
}

/**
 * What a turn Claude Code ran said to the person, as the model's history
 * (9 November 2026): each message and reaction it sent (a SendMessage or
 * ReactToMessage call and its answer, as the loop keeps them), then its last
 * words. Without it, the history held the person's messages alone, and
 * Simeon's model, answering a later turn, told the person "a few of your
 * messages got dropped on my end" and did the work again. Its other calls
 * (commands, files, connectors) stay in Claude Code's own session.
 */
export function claudeCodeHistory(calls: readonly BridgeCall[], text: string): unknown[] {
  const history: unknown[] = [];
  for (const call of calls) {
    if (!SPEAKING_TOOLS.has(call.name)) continue;
    const answer = call.result.content.filter((part) => part.type === "text").map((part) => (part as { text: string }).text).join("\n");
    history.push({ role: "assistant", content: [{ type: "tool-call", toolCallId: call.id, toolName: call.name, args: call.args }] });
    history.push({ role: "tool", content: [{ type: "tool-result", toolCallId: call.id, toolName: call.name, result: answer, ...(call.result.isError === true ? { isError: true } : {}) }] });
  }
  if (text.trim() !== "") history.push({ role: "assistant", content: text.trim() });
  return history;
}

const endings = new Map<string, ClaudeCodeEnding>();

/** How the last turn Claude Code ran for this agent ended, when it ended at or after `since`. */
export function claudeCodeEndingSince(conversationId: string, since: number): ClaudeCodeEnding | undefined {
  const ending = endings.get(conversationId);
  return ending !== undefined && ending.at >= since ? ending : undefined;
}

export interface ClaudeCodeAgentTurnOptions {
  readonly sessions: ClaudeCodeSessions;
  /** The model Claude Code runs on; the roles' `claudeCode` by default. */
  readonly model?: () => string | undefined;
  /** How hard it thinks (`--effort`); the roles' `claudeCodeEffort` by default. */
  readonly effort?: () => string | undefined;
  /** Claude Code's permission asks, answered by the person's safety review; none allows (the computer is the agent's own). */
  readonly review?: ((toolName: string, input: Readonly<Record<string, unknown>>, signal: AbortSignal) => Promise<{ allow: boolean; reason?: string }>) | undefined;
  /** Claude didn't answer this turn: the chat says why, once. */
  readonly onFallback?: ((conversationId: string, why: ClaudeCodeFallback, until?: number) => void) | undefined;
  /** How much of the plan is used, as Claude Code last said it in the turn (its `rate_limit_event`). */
  readonly onUsage?: ((windows: readonly ClaudeCodePlanWindow[]) => void) | undefined;
  readonly log?: ((line: string) => void) | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly configDir?: string | undefined;
  readonly now?: () => number;
}

const MINUTE = 60_000;

/**
 * The line before the agent's brief (9 November 2026, the founder: "claude
 * code never acts like a software engineer right"). Claude Code's own
 * instructions, which the brief is added to, make it a coding assistant: it
 * looked around the computer with a command or two before answering (each
 * first command waits on the safety review, 7 to 8 seconds) and answered
 * tersely. The agent is told who it is first, and to answer first.
 */
export function claudeCodeBriefLead(): string {
  return [
    "## Who you are",
    "You are not a coding assistant here. You are one of the person's agents in Simeon, as the brief below says: answer as that agent, in its own voice.",
    "Answer the person first. Look at files or run commands only when what they asked needs it.",
  ].join("\n");
}

/** The line added to the brief: where Simeon's own tools are. */
export function claudeCodeBriefNote(): string {
  return [
    "## Your Simeon tools",
    `Simeon's own tools are offered to you over MCP as \`mcp__${SIMEON_MCP_SERVER}__<Name>\`: \`mcp__${SIMEON_MCP_SERVER}__SendMessage\` is the SendMessage above, and so on for each tool this brief names. The person sees only what you send with it; your own text is your scratchpad.`,
    `Run shell commands with \`mcp__${SIMEON_MCP_SERVER}__Shell\`: it carries the person's safety review, and your own Bash is off. Files, web search and web fetch are your own tools.`,
    `Ask the person a question with a question card, \`mcp__${SIMEON_MCP_SERVER}__SendMessage\` with type widget, as the brief says: your own AskUserQuestion is off, because the person would never see it.`,
    "When you answer the person's message and end your turn without having sent them the answer, your final words are sent to them as your reply: write them to the person, not as notes to yourself.",
    `Once you have sent them a message, nothing you write after it reaches them. When you go on working after a message, send what came of it with \`mcp__${SIMEON_MCP_SERVER}__SendMessage\` before you end your turn, written to them: never about them.`,
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
  const effort = options.effort ?? (() => simeonModelRoles().claudeCodeEffort);
  let pausedUntil = 0;
  let toolsNamed = false;

  const fallBack = (conversationId: string, why: ClaudeCodeFallback, pauseMs: number, history: unknown[], until?: number): ClaudeCodeTurnResult => {
    pausedUntil = Math.max(pausedUntil, until ?? now() + pauseMs);
    options.onFallback?.(conversationId, why, until);
    return history.length > 0 ? { ran: false, history } : { ran: false };
  };

  return {
    chosen: () => model() !== undefined && now() >= pausedUntil,

    async run(input) {
      const chosenModel = model();
      if (chosenModel === undefined) return { ran: false };
      const chosenEffort = effort();
      const started = now();
      const calls: string[] = [];
      const answered: BridgeCall[] = [];
      const tools = bridgeEngineTools(input.tools as readonly EngineTool[], {
        onCall: (name) => calls.push(name),
        onResult: (call) => answered.push(call),
        ctx: input.ctx,
        signal: input.signal,
        listener: input.listener,
        stateHandler: input.stateHandler,
        log: options.log,
      });
      // The tools offered, named once a run: the list the engine builds for Claude Code, read from a real turn.
      if (!toolsNamed) {
        toolsNamed = true;
        options.log?.(`claude-code tools offered=${tools.map((tool) => tool.name).join(",")}`);
      }
      // What still asks (a file written, a page fetched) is the agent's own computer, as the engine's own tools there; the shell goes through Shell's review.
      const review = options.review ?? (async () => ({ allow: true }));
      let outcome: ClaudeCodeOutcome;
      let usage: readonly ClaudeCodePlanWindow[] | undefined;
      const server = await startSimeonMcpServer({ tools: () => [...tools, permissionBridgeTool(review)], signal: input.signal, log: options.log });
      try {
        outcome = await runAgentClaudeCodeTurn(input.conversationId, options.sessions, {
          prompt: claudeCodePrompt(input.text, input.context, options.sessions.get(input.conversationId) === undefined),
          model: chosenModel,
          effort: chosenEffort,
          brief: [claudeCodeBriefLead(), input.brief, claudeCodeBriefNote()].filter((part) => part.trim() !== "").join("\n\n"),
          mcpServers: { [SIMEON_MCP_SERVER]: server.config },
          permissionPromptTool: `mcp__${SIMEON_MCP_SERVER}__${PERMISSION_TOOL_NAME}`,
          disallowedTools: CLAUDE_CODE_TOOLS_OFF,
          allowedTools: [`mcp__${SIMEON_MCP_SERVER}`],
          signal: input.signal,
          env: options.env,
          configDir: options.configDir,
          onEvent: (event) => { usage = usageFromEvent(event) ?? usage; },
        });
      } finally {
        await server.close();
      }
      if (usage !== undefined) {
        try { options.onUsage?.(usage); } catch { /* never in the way of the turn */ }
      }
      options.log?.(`claude-code turn agent=${input.conversationId} model=${chosenModel}${chosenEffort === undefined ? "" : ` effort=${chosenEffort}`} outcome=${outcome.kind} tools=${tools.length} ms=${now() - started}`);
      // What it said, whatever the outcome: a turn that moves to Simeon's model after Claude spoke keeps it too.
      const said = claudeCodeHistory(answered, outcome.kind === "done" ? outcome.text : "");
      switch (outcome.kind) {
        case "done":
          endings.set(input.conversationId, claudeCodeEnding(calls, outcome.text, now()));
          return { ran: true, text: outcome.text, history: said };
        // The person stopped the turn: it is over, on Claude or not.
        case "aborted": return said.length > 0 ? { ran: true, text: "", history: said } : { ran: true, text: "" };
        case "limited": return fallBack(input.conversationId, "limited", 60 * MINUTE, said, outcome.until !== undefined && outcome.until > now() ? outcome.until : undefined);
        case "signed_out": return fallBack(input.conversationId, "signed_out", 5 * MINUTE, said);
        case "not_installed": return fallBack(input.conversationId, "not_installed", 60 * MINUTE, said);
        // A session it still couldn't find, or a failure: this turn on Simeon's, Claude again next turn after a minute.
        case "no_session":
        case "failed": return fallBack(input.conversationId, "failed", MINUTE, said);
      }
    },
  };
}

// MARK: The engine's one hook

/** The file, in the box's data root, that keeps each agent's Claude Code session. */
export const CLAUDE_CODE_SESSIONS_FILE = "claude-code-sessions.json";

let engineHook: ClaudeCodeTurnHook | undefined;
let fallbackNotice: ((agentId: string, why: ClaudeCodeFallback) => void) | undefined;
/** The last notice per agent and reason: the chat says why once, not at every turn (at most once an hour). */
const noticed = new Map<string, number>();
const NOTICE_EVERY_MS = 60 * MINUTE;

/** Where the chat's one line goes (the transcript's, `claude-code-notice.ts`), registered when the transcript starts. */
export function setClaudeCodeFallbackNotice(write: ((agentId: string, why: ClaudeCodeFallback) => void) | undefined): void {
  fallbackNotice = write;
}

/** Whether a notice for this agent and reason is due now; when it is, it's counted as said. */
export function claudeCodeNoticeDue(agentId: string, why: ClaudeCodeFallback, now: number = Date.now()): boolean {
  const key = `${agentId}\u0000${why}`;
  const last = noticed.get(key);
  if (last !== undefined && now - last < NOTICE_EVERY_MS) return false;
  noticed.set(key, now);
  return true;
}

/** The engine's hook, made at its first use: sessions on the data volume, lines in the host log. */
export function claudeCodeTurnHook(): ClaudeCodeTurnHook {
  engineHook ??= createClaudeCodeAgentTurn({
    sessions: new ClaudeCodeSessions(join(getSandRootDir(), CLAUDE_CODE_SESSIONS_FILE)),
    log: (line) => logHostLine(`${HOST_LOG_PREFIX} ${line}`),
    onFallback: (agentId, why) => {
      // Signed out: the app shows it, and the agents stop trying Claude until the person connects it again.
      if (why === "signed_out") void reportClaudeCodeSignedOut();
      if (fallbackNotice !== undefined && claudeCodeNoticeDue(agentId, why)) fallbackNotice(agentId, why);
    },
    // How much of the plan is used: the apps show it in AI Models, like Usage & Billing.
    onUsage: (windows) => void reportClaudeCodeUsage(windows),
  });
  return engineHook;
}
