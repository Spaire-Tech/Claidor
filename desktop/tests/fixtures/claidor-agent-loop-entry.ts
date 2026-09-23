// Bundle entry for tests/send-message-through-agent-loop.test.mjs: the real
// Agent (packages/agent) built the way a product turn builds it
// (host/runner/turn-agent-composition.ts), driven offline. Everything a
// turn runs between the model stream and the transcript is real here: the
// step loop, the InteractionHandler, the forwarding listener, the tool's
// delivery closure. Only the model server and the transcript sink are fakes.
export { createTurnAgentRunContext } from "../../source/host/runner/turn-run-shell.js";
export {
  createTurnAgentForRun,
  createSandAgentStaticConfig,
  createTurnAgentStreamStart,
} from "../../source/host/runner/turn-agent-composition.js";
export { ToolSetHandle } from "../../source/packages/agent/tools/core.js";
export { InMemoryBlobStore } from "../../source/packages/agent-kv/blob-store.js";
export { CombinedResourceAccessor, resourceEntry } from "../../source/packages/agent-exec/resource-provider.js";
export { requestContextExecutorResource } from "../../source/packages/agent-exec/request-context.js";
export { SandRequestContextExecutor } from "../../source/host/runner/agent-adapters.js";
export {
  ConversationAction,
  ConversationStateStructure,
  UserMessage,
  UserMessageAction,
} from "../../source/packages/proto/generated/agent/v1/agent_pb.js";
export { PrivacyMode } from "../../source/packages/redaction/privacy-mode.js";
export { createContext } from "../../source/packages/context/core.js";
export { loggerKey } from "../../source/packages/context/logger.js";
export { createSendMessageTool, SAND_SEND_MESSAGE_TOOL_NAME } from "../../source/host/runner/tools/send-message-tool.js";
export { setClaidorCredentialSource, setModelCallLog } from "../../source/host/extensions/inference/provider-session.js";
export { DEFAULT_SAND_SYSTEM_PROMPT } from "../../source/host/runner/system-prompt.js";
export { createProductionRunnerContext } from "../../source/host/runner-context-production-provider.js";
export { setHostLogSink } from "../../source/shared/host-log.js";
export { createSandTransport } from "../../source/host/ports/transport.js";
export { sendMessageParameters, isBlankField } from "../../source/host/runner/tools/send-message-schema.js";
