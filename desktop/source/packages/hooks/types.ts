/**
 * What the engine knows about each hook step besides its name: which check
 * its answer goes through, and which steps share a trait.
 */
import { HookStep } from "./hook-step.js";
import { validateAfterAgentResponseResponse } from "./validators/afterAgentResponseResponse.js";
import { validateAfterAgentThoughtResponse } from "./validators/afterAgentThoughtResponse.js";
import { validateAfterEditFileResponse } from "./validators/afterEditFileResponse.js";
import { validateAfterMCPExecutionResponse } from "./validators/afterMCPExecutionResponse.js";
import { validateAfterShellExecutionResponse } from "./validators/afterShellExecutionResponse.js";
import { validateAfterTabFileEditResponse } from "./validators/afterTabFileEditResponse.js";
import { validateBeforeCommandExecutionHookResponse } from "./validators/beforeCommandExecutionHookResponse.js";
import { validateBeforePromptSubmitResponse } from "./validators/beforePromptSubmitResponse.js";
import { validateBeforeReadFileResponse } from "./validators/beforeReadFileResponse.js";
import { validateBeforeTabFileReadResponse } from "./validators/beforeTabFileReadResponse.js";
import { validatePostToolUseFailureResponse } from "./validators/postToolUseFailureResponse.js";
import { validatePostToolUseResponse } from "./validators/postToolUseResponse.js";
import { validatePreCompactResponse } from "./validators/preCompactResponse.js";
import { validatePreToolUseResponse } from "./validators/preToolUseResponse.js";
import { validateSessionEndResponse } from "./validators/sessionEndResponse.js";
import { validateSessionStartResponse } from "./validators/sessionStartResponse.js";
import { validateStopResponse } from "./validators/stopResponse.js";
import { validateSubagentStartResponse } from "./validators/subagentStartResponse.js";
import { validateSubagentStopResponse } from "./validators/subagentStopResponse.js";
import { validateWorkspaceOpenResponse } from "./validators/workspaceOpenResponse.js";

/** The steps whose hooks may hand the model more context with their answer. */
export const HOOK_STEPS_SUPPORTING_ADDITIONAL_CONTEXT = new Set([
  HookStep.sessionStart,
  HookStep.beforeSubmitPrompt,
  HookStep.preToolUse,
  HookStep.postToolUse,
  HookStep.postToolUseFailure,
]);

/**
 * The check of a hook's answer, for every step. Several steps share one
 * check: the two before a shell command or an MCP tool, the two after a
 * tool, the two stops, and the seven whose answer only has to be an object.
 */
export const HookResponseValidatorMap = {
  [HookStep.beforeShellExecution]: validateBeforeCommandExecutionHookResponse,
  [HookStep.beforeMCPExecution]: validateBeforeCommandExecutionHookResponse,
  [HookStep.afterShellExecution]: validateAfterShellExecutionResponse,
  [HookStep.afterMCPExecution]: validateAfterMCPExecutionResponse,
  [HookStep.beforeReadFile]: validateBeforeReadFileResponse,
  [HookStep.afterFileEdit]: validateAfterEditFileResponse,
  [HookStep.beforeTabFileRead]: validateBeforeTabFileReadResponse,
  [HookStep.afterTabFileEdit]: validateAfterTabFileEditResponse,
  [HookStep.beforeSubmitPrompt]: validateBeforePromptSubmitResponse,
  [HookStep.stop]: validateStopResponse,
  [HookStep.afterAgentResponse]: validateAfterAgentResponseResponse,
  [HookStep.afterAgentThought]: validateAfterAgentThoughtResponse,
  [HookStep.sessionStart]: validateSessionStartResponse,
  [HookStep.sessionEnd]: validateSessionEndResponse,
  [HookStep.preCompact]: validatePreCompactResponse,
  [HookStep.subagentStart]: validateSubagentStartResponse,
  [HookStep.subagentStop]: validateSubagentStopResponse,
  [HookStep.preToolUse]: validatePreToolUseResponse,
  [HookStep.postToolUse]: validatePostToolUseResponse,
  [HookStep.postToolUseFailure]: validatePostToolUseFailureResponse,
  [HookStep.workspaceOpen]: validateWorkspaceOpenResponse,
} as const;

/** The steps whose answer may carry a permission. */
export const PERMISSION_HOOK_STEPS = [
  HookStep.beforeShellExecution,
  HookStep.beforeMCPExecution,
  HookStep.beforeReadFile,
  HookStep.beforeTabFileRead,
  HookStep.subagentStart,
  HookStep.preToolUse,
] as const;

/** The steps of a workspace's own life. */
export const WORKSPACE_LIFECYCLE_STEPS = [HookStep.workspaceOpen] as const;
