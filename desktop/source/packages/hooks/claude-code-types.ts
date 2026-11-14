/**
 * The names Claude Code's hooks files use, beside the names used here. A
 * plugin may bring a hooks file written for Claude Code; these tables are
 * what it is read with (`claude-code-mapper.ts`).
 *
 * The tables are read when a file is read, not copied when the engine
 * loads.
 */
import { HookStep } from "./hook-step.js";

/** Each of Claude Code's events and the step it is here. Null: the event has no step here. */
export const CLAUDE_EVENT_TO_SIMEON_STEP = {
  PreToolUse: HookStep.preToolUse,
  PermissionRequest: null,
  PostToolUse: HookStep.postToolUse,
  UserPromptSubmit: HookStep.beforeSubmitPrompt,
  Stop: HookStep.stop,
  SubagentStop: HookStep.subagentStop,
  SessionStart: HookStep.sessionStart,
  SessionEnd: HookStep.sessionEnd,
  PreCompact: HookStep.preCompact,
  Notification: null,
} as const;

/** The same table read the other way, for the events that have a step. */
function eventsBySteps(): { [k: string]: string } {
  const events: { [k: string]: string } = {};
  for (const [event, step] of Object.entries(CLAUDE_EVENT_TO_SIMEON_STEP)) {
    if (step !== null) events[step] = event;
  }
  return events;
}

/** Each step that one of Claude Code's events stands for, and that event. Made once, when the engine loads. */
export const SIMEON_STEP_TO_CLAUDE_EVENT = eventsBySteps();

/** Each of Claude Code's tools and the tool it is here. Null: the tool has no name here. */
export const CLAUDE_TOOL_TO_SIMEON_TOOL: Readonly<Record<string, string | null>> = {
  Bash: "Shell",
  Read: "Read",
  Write: "Write",
  Edit: "Write",
  Glob: null,
  Grep: "Grep",
  WebFetch: "WebFetch",
  WebSearch: "WebSearch",
  Task: "Task",
};

/** The tools a matcher is warned about when it names them. */
export const UNSUPPORTED_CLAUDE_TOOLS = ["Glob"] as const;

/** The events a hooks file is warned about when it holds them. */
export const UNSUPPORTED_CLAUDE_EVENTS = ["Notification", "PermissionRequest"] as const;
