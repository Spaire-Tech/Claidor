// Bundle entry for tests/watch-video.test.mjs: the video subagent's
// registration, the Gemini executor and the brief, side by side, so a
// watchVideo turn can be measured offline against a fake Gemini door.
export { createProviderPromptSession, setClaidorCredentialSource, claidorModelForSession, isConfiguredClaidorModelId, claidorReasoningEffortForSession, configuredClaidorVideoModel, runRoutedProviderText, setModelCallLog } from "../../source/host/extensions/inference/provider-session.js";
export { toGeminiRequest, sanitizeGeminiSchema, claidorGeminiEndpoint, usageOf } from "../../source/host/extensions/inference/gemini-direct-generate.js";
export { createSandVideoSubagentConfigs, isVideoSubagentType, WATCH_VIDEO_SUBAGENT_TYPE, VIDEO_REVIEW_SUBAGENT_TYPE } from "../../source/host/runner/tools/sand-video-subagent.js";
export { getSubagentTypeName, isGeminiVideoSubagentType, normalizeSubagentTypeName } from "../../source/packages/agent/tools/core/subagent/subagent-config.js";
export { resolveSubagentModel } from "../../source/packages/agent/tools/task-cluster-internal.js";
export { SubagentModelForcePolicy } from "../../source/packages/agent/tools/subagent-model-force-policy.js";
export { createSubagentModels } from "../../source/packages/agent/tools/core/subagent/models.js";
export { isGeminiModelId } from "../../source/packages/agent/attached-media.js";
export { buildSandBaseSystemPrompt, buildSandSubagentSystemPrompt, DEFAULT_SAND_SYSTEM_PROMPT, isMediaReviewSubagentType } from "../../source/host/runner/system-prompt.js";
export { isVideoSubagentServed, VIDEO_COMING_SOON_SENTENCE, DEFAULT_CLAIDOR_VIDEO_MODEL } from "../../source/shared/video-availability.js";
export { availableModelFromClaidorRow } from "../../source/electron-main/models/claidor-model-catalog.js";
export { SERVED_SWITCH_ENVS } from "../../source/electron-main/box/local-docker-host-connector.js";
