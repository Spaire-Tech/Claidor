/**
 * The steps of an agent's work at which a hook can run. A step's name is
 * also its value: that value is the key a hooks file is written with, and
 * what the rest of the engine names the step by.
 *
 * The order of the steps is part of what is shown: a hooks file that names
 * an unknown step is answered with this list, in this order.
 */
export const HookStep = {
  // Shell commands and MCP tools.
  beforeShellExecution: "beforeShellExecution",
  beforeMCPExecution: "beforeMCPExecution",
  afterShellExecution: "afterShellExecution",
  afterMCPExecution: "afterMCPExecution",

  // Files.
  beforeReadFile: "beforeReadFile",
  afterFileEdit: "afterFileEdit",
  beforeTabFileRead: "beforeTabFileRead",
  afterTabFileEdit: "afterTabFileEdit",

  // The turn.
  stop: "stop",
  beforeSubmitPrompt: "beforeSubmitPrompt",
  afterAgentResponse: "afterAgentResponse",
  afterAgentThought: "afterAgentThought",

  // The session and its subagents.
  sessionStart: "sessionStart",
  sessionEnd: "sessionEnd",
  preCompact: "preCompact",
  subagentStart: "subagentStart",
  subagentStop: "subagentStop",

  // Tools of any kind.
  preToolUse: "preToolUse",
  postToolUse: "postToolUse",
  postToolUseFailure: "postToolUseFailure",

  // The workspace.
  workspaceOpen: "workspaceOpen",
} as const;

/** The value of any one step. */
export type HookStepValue = typeof HookStep[keyof typeof HookStep];
