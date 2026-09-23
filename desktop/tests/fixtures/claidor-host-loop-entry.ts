// Bundle entry for tests/claidor-host-loop.test.mjs: the host's real tool loop
// and the routed provider session, side by side, so a turn can be driven
// offline against a fake model server.
export { createProviderPromptSession, setClaidorCredentialSource, toCoreMessages } from "../../source/host/extensions/inference/provider-session.js";
export { SimplePromptToolExecutor } from "../../source/packages/agent/tool-stream-executor.js";
export { createZodAgentTool } from "../../source/packages/agent/tools/common.js";
export { createContext } from "../../source/packages/context/core.js";
export { z } from "zod";
export { claidorReasoningEffortForSession, configuredClaidorReasoningEffort, configuredClaidorCheapReasoningEffort, DEFAULT_CLAIDOR_REASONING_EFFORT, DEFAULT_CLAIDOR_CHEAP_REASONING_EFFORT, runRoutedProviderText } from "../../source/host/extensions/inference/provider-session.js";
export { createModelCallBudget, spendModelCall, setModelCallLog, formatModelCallLogLine } from "../../source/host/extensions/inference/provider-session.js";
export { resolveSandAgentStepCap, SAND_AGENT_MAX_STEPS, SAND_HIDDEN_TURN_MAX_STEPS, stepBudgetExceededMessage } from "../../source/shared/inference/turn-step-budget.js";
export { SAND_ONBOARDING_KICKSTART_PROMPT, INTRODUCTION_UNDELIVERED_DETAIL } from "../../source/shared/agents/onboarding.js";
