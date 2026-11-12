// One bundle for the agent-turn hook's test: the hook, the sessions, and Simeon's real SendMessage tool.
export * from "../../source/host/claude-code/claude-code-agent-turn.js";
export { ClaudeCodeSessions } from "../../source/host/claude-code/claude-code-turn.js";
export { createSendMessageTool } from "../../source/host/runner/tools/send-message-tool.js";
export { createContext } from "../../source/packages/context/core.js";
export { TurnRuntime } from "../../source/host/extensions/transcript/turn-runtime.js";
// The person's words as the turn hands them over: the engine's own user message, wrapped as the turn keeps it.
export { claudeCodeTurnWords } from "../../source/packages/agent/actions/user-message-action/claude-code-turn-words.js";
export { toRedactedUserMessage } from "../../source/packages/redacted-protos/generated/agent/v1/agent_redacted.js";
export { UserMessage } from "../../source/packages/proto/generated/agent/v1/agent_pb.js";
export { SelectedContext, SelectedImage } from "../../source/packages/proto/generated/agent/v1/selected_context_pb.js";
// The person's pictures as the turn hands them over (12 November 2026).
export { claudeCodeImagesNote, claudeCodeTurnImages } from "../../source/packages/agent/actions/user-message-action/claude-code-turn-images.js";
export { getMinimalJimp } from "../../source/packages/utils/jimp-minimal.js";
export { PrivacyMode } from "../../source/packages/redaction/privacy-mode.js";
// Claude signed out: the roles the server gives, and the chat's model line.
export { setSimeonModelRolesForTest, setSimeonModelRolesSourceForTest } from "../../source/host/extensions/inference/simeon-model-roles.js";
export { noteTurnModel, setTurnModelLine } from "../../source/host/extensions/inference/turn-model.js";
