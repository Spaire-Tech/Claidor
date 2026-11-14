/**
 * Reads a hooks file written for Claude Code as a hooks file of ours, and
 * tells the two kinds of file apart. A plugin may bring either kind
 * (`packages/plugins/loader.ts`).
 *
 * Claude Code's file holds, for each event, a list of entries; an entry
 * holds a matcher and, under `hooks`, a list of scripts. Ours holds, for
 * each step, the list of scripts itself, each with its own matcher.
 *
 * What is read here comes from a file and is not checked first. An entry or
 * a script that is not what the types below say stops the reading with the
 * runtime's own error, as it always did. The plugin loader keeps that
 * error's message as the reason the plugin did not load, and the message
 * quotes the code (`entry.hooks`, `matcher.split`): those names stay.
 *
 * What is read goes on to the check of a hooks file
 * (`validators/hooksConfig.ts`).
 */
import { CLAUDE_EVENT_TO_SIMEON_STEP, CLAUDE_TOOL_TO_SIMEON_TOOL, UNSUPPORTED_CLAUDE_EVENTS, UNSUPPORTED_CLAUDE_TOOLS } from "./claude-code-types.js";

/** Who is told what was left out of a file, and why. Only `warn` is used. */
interface Logger {
  warn(message: string): void;
  info(message: string): void;
}

/** A script as Claude Code's file writes it. */
interface ClaudeScript {
  type?: string;
  command?: string;
  prompt?: string;
  timeout?: number;
}

/** One entry of an event in Claude Code's file. */
interface ClaudeEntry {
  matcher?: string;
  hooks: ClaudeScript[];
}

/** A script as it is handed on: never with a loop limit, never fail-closed. */
interface AgentHookScript {
  type: "command" | "prompt";
  command?: string;
  prompt?: string;
  matcher?: string;
  timeout?: number;
  loop_limit: null;
  failClosed: false;
}

export interface AgentHooksConfig {
  version: 1;
  hooks: Record<string, AgentHookScript[]>;
}

const sayNothing = (): void => {};

/** The logger of a reading that was given none. */
const silentLogger: Logger = { warn: sayNothing, info: sayNothing };

/** The events whose matcher names tools. */
const TOOL_EVENTS: ReadonlySet<string> = new Set(["PreToolUse", "PostToolUse"]);

/**
 * The events whose matcher names what set the event off, with the names
 * Claude Code knows. Nothing here tells one trigger from another, so such a
 * matcher is warned about and the hooks run for every trigger.
 */
const TRIGGERS_BY_EVENT: ReadonlyMap<string, ReadonlySet<unknown>> = new Map([
  ["SessionStart", new Set<unknown>(["startup", "resume", "clear", "compact"])],
  ["PreCompact", new Set<unknown>(["manual", "auto"])],
]);

/** The tool's own name in "mcp__server__tool", which may hold "__" itself. Undefined for any other name, "mcp__server" included. */
function mcpToolName(name: string): string | undefined {
  const start = "mcp__";
  if (!name.startsWith(start)) return undefined;
  const afterServer = name.indexOf("__", start.length);
  return afterServer === -1 ? undefined : name.slice(afterServer + 2);
}

/**
 * A matcher of tools in the names used here: "Bash|Edit" becomes
 * "Shell|Write". Gives "*" when the matcher takes every tool, and null when
 * it names tools and none of them is left.
 *
 * A tool of an MCP server keeps only its own name, after "MCP:". A tool
 * with a name here is written once. A tool that is not in the table is kept
 * as written, however often it comes. A tool that the table says has no
 * name here is left out, and warned about when it is one of the tools known
 * to be unsupported; the warnings are given together, once the whole
 * matcher is read.
 */
function toolMatcherHere(matcher: string | undefined, logger: Logger): string | null {
  if (!matcher || matcher === "*") return "*";
  const names: string[] = [];
  const unsupported: string[] = [];
  for (const tool of matcher.split("|")) {
    const name = tool.trim();
    const ofServer = mcpToolName(name);
    if (ofServer !== undefined) {
      names.push(`MCP:${ofServer}`);
      continue;
    }
    const here = CLAUDE_TOOL_TO_SIMEON_TOOL[name];
    if (here === undefined) names.push(name);
    else if (here !== null) {
      if (!names.includes(here)) names.push(here);
    } else if ((UNSUPPORTED_CLAUDE_TOOLS as readonly string[]).includes(name)) unsupported.push(name);
  }
  for (const name of unsupported) logger.warn(`Tool "${name}" is not supported in Simeon and will be ignored`);
  return names.length === 0 ? null : names.join("|");
}

/**
 * One of Claude Code's scripts as a script of ours: a prompt when its type
 * says so, a command otherwise. Null when it holds no prompt, or no command,
 * to hand on. Only its timeout is carried over besides.
 */
function scriptHere(script: ClaudeScript, matcher: string | undefined): AgentHookScript | null {
  // The timeout is read before anything else. A script that is null or
  // missing fails on this line, and the error names this field.
  const timeout = script.timeout;
  const isPrompt = script.type === "prompt";
  const toRun = isPrompt ? script.prompt : script.command;
  if (!toRun) return null;
  const rest = {
    loop_limit: null,
    failClosed: false,
    ...(matcher ? { matcher } : {}),
    ...(timeout === undefined ? {} : { timeout }),
  } as const;
  return isPrompt ? { type: "prompt", prompt: toRun, ...rest } : { type: "command", command: toRun, ...rest };
}

/**
 * The scripts of one entry, as scripts of ours. An entry's matcher is kept
 * only where it names tools. Where it names tools and none is left, the
 * entry gives nothing, and its scripts are not looked at.
 */
function scriptsOfEntry(entry: ClaudeEntry, event: string, logger: Logger): AgentHookScript[] {
  let matcher: string | undefined;
  if (TOOL_EVENTS.has(event)) {
    const tools = toolMatcherHere(entry.matcher, logger);
    if (tools === null) {
      logger.warn(`All tools in matcher "${entry.matcher}" are unsupported, skipping hooks`);
      return [];
    }
    if (tools !== "*") matcher = tools;
  } else if (TRIGGERS_BY_EVENT.get(event)?.has(entry.matcher)) {
    logger.warn(`${event} trigger matcher "${entry.matcher}" is not supported in Simeon, hooks will fire for all triggers`);
  }
  const scripts: AgentHookScript[] = [];
  for (const script of entry.hooks) {
    const here = scriptHere(script, matcher);
    if (here) scripts.push(here);
  }
  return scripts;
}

/** The scripts of every entry of one event, one entry after the other. */
function scriptsOfEvent(event: string, entries: unknown, logger: Logger): AgentHookScript[] {
  const scripts: AgentHookScript[] = [];
  if (Array.isArray(entries)) {
    // An entry's scripts are handed on in one call, as they always were. More
    // scripts than a call can carry end the reading with the runtime's RangeError.
    for (const entry of entries) scripts.push(...scriptsOfEntry(entry as ClaudeEntry, event, logger));
  } else if (entries !== undefined) {
    logger.warn(`Claude Code event "${event}" has invalid value (expected array), skipping`);
  }
  return scripts;
}

/**
 * The `hooks` of a Claude Code hooks file, as a hooks file of ours. The
 * events keep the file's order, and an event that leaves no script is left
 * out. An event with no step here, or that is not known at all, is warned
 * about and passed over.
 */
export function transformClaudeHooksToConfig(claudeHooks: Record<string, unknown>, logger: Logger = silentLogger): AgentHooksConfig {
  const hooks: Record<string, AgentHookScript[]> = {};
  for (const [event, entries] of Object.entries(claudeHooks)) {
    if ((UNSUPPORTED_CLAUDE_EVENTS as readonly string[]).includes(event)) {
      logger.warn(`Claude Code event "${event}" is not supported in Simeon and will be ignored`);
      continue;
    }
    // Looked up as any field of the table is, so a name that every object
    // has ("toString") finds something too, and is taken for a step.
    const step = (CLAUDE_EVENT_TO_SIMEON_STEP as Record<string, string | null | undefined>)[event];
    if (!step) {
      logger.warn(`Unknown Claude Code event "${event}", skipping`);
      continue;
    }
    const scripts = scriptsOfEvent(event, entries, logger);
    if (scripts.length > 0) hooks[step] = [...(hooks[step] ?? []), ...scripts];
  }
  return { version: 1, hooks };
}

/** What the first thing in a step's list says about its file, when it says anything. */
function toldBy(first: unknown): "simeon" | "claude-code" | undefined {
  if (typeof first !== "object" || first === null) return undefined;
  if ("hooks" in first && Array.isArray(first.hooks)) return "claude-code";
  if ("command" in first || "prompt" in first || "type" in first) return "simeon";
  return undefined;
}

/**
 * Whose hooks file this is. The first step whose list starts with something
 * telling decides: an entry with a list under `hooks` is Claude Code's, a
 * script with a command, a prompt or a type is ours.
 */
export function detectHooksSchema(value: unknown): "simeon" | "claude-code" | "unknown" {
  if (typeof value !== "object" || value === null) return "unknown";
  const hooks = (value as Record<string, unknown>).hooks;
  if (typeof hooks !== "object" || hooks === null) return "unknown";
  for (const list of Object.values(hooks)) {
    if (!Array.isArray(list) || list.length === 0) continue;
    const told = toldBy(list[0]);
    if (told !== undefined) return told;
  }
  return "unknown";
}
