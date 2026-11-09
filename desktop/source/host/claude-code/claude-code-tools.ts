/**
 * The engine's own tools, as Claude Code calls them over MCP
 * (`simeon-mcp-server.ts`; 9 November 2026, docs/your-own-models.md, section
 * 6, step C4). Each keeps its name, its description and its schema, and runs
 * its own `execute` and `render`, exactly as the engine's loop runs them: a
 * SendMessage still lands in the chat through the turn's update, a card
 * still waits for the person.
 *
 * What the loop gives a tool is small (`executeToolCall`, a few notices
 * about the call, the turn's abort signal, the listener a web fetch asks);
 * a call here gets the same, minus the model's history: Claude Code keeps
 * its own. A part of the loop a tool reaches for and this doesn't give is
 * named once in the host log.
 *
 * The tools Claude Code has its own of (files, web search and fetch, its
 * to-do list) are not offered, so the agent never has two of one. The shell
 * is the other way round: Claude Code's own (`Bash`) is turned off for the
 * turn and the engine's `Shell` is offered, because it carries the person's
 * safety review (C4 part 4).
 */
import { randomUUID } from "node:crypto";
import type { BridgeContent, BridgeResult, BridgeTool } from "./simeon-mcp-server.js";

/** The engine's tool identifiers Claude Code has its own tool for. */
export const CLAUDE_CODE_HAS_ITS_OWN: ReadonlySet<string> = new Set([
  "READ", "WRITE", "EDIT", "STR_REPLACE", "MULTI_EDIT", "DELETE", "LS", "GLOB", "GREP", "SEMANTIC_SEARCH",
  "WEB_SEARCH", "WEB_FETCH", "TODO_WRITE",
]);

/**
 * Claude Code's own tools turned off for a turn: its shell, so every command
 * goes through the engine's `Shell` and the person's safety review.
 */
export const CLAUDE_CODE_TOOLS_OFF: readonly string[] = ["Bash", "BashOutput", "KillShell", "KillBash"];

/** A tool as the engine builds it (`createZodAgentTool`). */
export interface EngineTool {
  readonly toolIdentifier: string;
  readonly name: string;
  readonly description?: string;
  readonly descriptionGenerator?: (props: Record<string, unknown>) => string;
  readonly parameters?: { readonly jsonSchema?: unknown } | undefined;
  execute(ctx: unknown, interactionHandler: unknown, argsStream: AsyncIterable<string>, meta: Record<string, unknown>): Promise<unknown>;
  render?(ctx: unknown, output: unknown, props: unknown): unknown;
}

export interface BridgeOptions {
  /** The turn's context, which each call runs in. */
  readonly ctx: unknown;
  /** The turn's abort signal: a tool waiting on the person stops with the turn. */
  readonly signal: AbortSignal;
  /** What a web fetch asks before it reaches a page (the loop's `listener`), when the turn has one. */
  readonly listener?: unknown;
  /** The loop's state handler, for the tools that read the privacy mode and the like. */
  readonly stateHandler?: unknown;
  /** Tools left out besides `CLAUDE_CODE_HAS_ITS_OWN`. */
  readonly skip?: ((tool: EngineTool) => boolean) | undefined;
  readonly log?: ((line: string) => void) | undefined;
  /** Each call Claude Code makes, by the tool's name, as it starts: the turn knows what it said and did after. */
  readonly onCall?: ((name: string) => void) | undefined;
}

/** MCP tool names: letters, digits, `_` and `-`, at most 64. */
export function mcpToolName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
  return cleaned.length > 0 ? cleaned : "tool";
}

/** The part of the loop's interaction handler a tool uses; anything else is named once in the log. */
export function claudeCodeInteractionHandler(options: Pick<BridgeOptions, "signal" | "listener" | "log">, named: Set<string> = new Set()): unknown {
  const known: Record<string, unknown> = {
    emitPartialToolCall: () => {},
    emitToolCallDelta: () => {},
    emitToolCallError: async () => {},
    markToolCallForArgPreservation: () => {},
    getAbortSignal: () => options.signal,
    listener: options.listener,
    // The loop records the call in the model's history and runs it; Claude Code keeps its own history.
    executeToolCall: async (ctx: unknown, _initial: unknown, _toolCallId: string, execute: (ctx: unknown) => Promise<unknown>) => await execute(ctx),
  };
  return new Proxy(known, {
    get(target, property) {
      if (typeof property !== "string") return undefined;
      if (property in target) return target[property];
      if (property !== "then" && !named.has(property)) {
        named.add(property);
        options.log?.(`claude-code tool-handler missing=${property}`);
      }
      return undefined;
    },
  });
}

function contentOf(rendered: unknown): BridgeResult | undefined {
  if (typeof rendered === "string") return { content: [{ type: "text", text: rendered }] };
  if (rendered === null || typeof rendered !== "object") return undefined;
  const parts = (rendered as { content?: unknown }).content;
  if (!Array.isArray(parts)) return undefined;
  const content: BridgeContent[] = [];
  for (const part of parts as Array<Record<string, unknown>>) {
    if (part?.type === "text" && typeof part.text === "string") content.push({ type: "text", text: part.text });
    else if (part?.type === "image" && typeof part.data === "string" && typeof part.mimeType === "string") content.push({ type: "image", data: part.data, mimeType: part.mimeType });
  }
  return { content, ...((rendered as { isError?: unknown }).isError === true ? { isError: true } : {}) };
}

/** The engine's tools for this turn, offered to Claude Code. */
export function bridgeEngineTools(tools: readonly EngineTool[], options: BridgeOptions): BridgeTool[] {
  const descriptionProps: Record<string, unknown> = {
    allTools: Object.fromEntries(tools.map((tool) => [tool.toolIdentifier, { name: tool.name, toolIdentifier: tool.toolIdentifier, parameters: tool.parameters }])),
  };
  const offered: BridgeTool[] = [];
  const names = new Set<string>();
  // A part of the loop a tool reaches for is named once per turn, not once per call.
  const missing = new Set<string>();
  for (const tool of tools) {
    if (CLAUDE_CODE_HAS_ITS_OWN.has(tool.toolIdentifier) || options.skip?.(tool) === true) continue;
    const name = mcpToolName(tool.name);
    if (names.has(name)) continue;
    names.add(name);
    let description = tool.description ?? "";
    try { description = tool.descriptionGenerator?.(descriptionProps) ?? description; } catch { /* the plain one */ }
    const schema = tool.parameters?.jsonSchema;
    const inputSchema = schema !== null && typeof schema === "object" ? schema as Record<string, unknown> : { type: "object", properties: {} };
    offered.push({
      name,
      description,
      inputSchema,
      async call(args, signal) {
        options.onCall?.(tool.name);
        const linked = AbortSignal.any([options.signal, signal]);
        const handler = claudeCodeInteractionHandler({ signal: linked, listener: options.listener, log: options.log }, missing);
        const meta: Record<string, unknown> = { toolCallId: `cc_${randomUUID()}`, ...(options.stateHandler === undefined ? {} : { stateHandler: options.stateHandler }) };
        const argsStream = (async function* () { yield JSON.stringify(args); })();
        try {
          const output = await tool.execute(options.ctx, handler, argsStream, meta);
          const rendered = tool.render === undefined ? undefined : await tool.render(options.ctx, output, {});
          return contentOf(rendered) ?? { content: [{ type: "text", text: "Done." }] };
        } catch (error) {
          return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
        }
      },
    });
  }
  return offered;
}

/** The answer Claude Code's `--permission-prompt-tool` expects. */
export type PermissionAnswer =
  | { readonly behavior: "allow"; readonly updatedInput: Readonly<Record<string, unknown>> }
  | { readonly behavior: "deny"; readonly message: string };

/** The name of the tool Claude Code asks before using one of its own that needs a yes. */
export const PERMISSION_TOOL_NAME = "ReviewPermission";

/**
 * Claude Code's permission asks, answered by the engine's safety review
 * (`review`): allowed with the input unchanged, or refused with the review's
 * reason. A review that fails refuses.
 */
export function permissionBridgeTool(review: (toolName: string, input: Readonly<Record<string, unknown>>, signal: AbortSignal) => Promise<{ allow: boolean; reason?: string }>): BridgeTool {
  return {
    name: PERMISSION_TOOL_NAME,
    description: "Decides whether one of Claude Code's own tool uses may go ahead, under the person's safety review.",
    inputSchema: { type: "object", properties: { tool_name: { type: "string" }, input: { type: "object" }, tool_use_id: { type: "string" } }, required: ["tool_name", "input"] },
    async call(args, signal) {
      const toolName = typeof args.tool_name === "string" ? args.tool_name : "";
      const input = args.input !== null && typeof args.input === "object" && !Array.isArray(args.input) ? args.input as Record<string, unknown> : {};
      let answer: PermissionAnswer;
      try {
        const verdict = await review(toolName, input, signal);
        answer = verdict.allow ? { behavior: "allow", updatedInput: input } : { behavior: "deny", message: verdict.reason ?? "The person's safety review didn't allow this." };
      } catch {
        answer = { behavior: "deny", message: "The safety review couldn't decide, so this wasn't run." };
      }
      return { content: [{ type: "text", text: JSON.stringify(answer) }] };
    },
  };
}
