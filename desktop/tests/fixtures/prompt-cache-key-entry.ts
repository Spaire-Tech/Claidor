// One bundle, so the context key the test sets is the one the executor reads.
export * from "../../source/host/extensions/inference/provider-session.js";
// The key the real loop sets (packages/agent/index.ts), not the look-alike
// in chat-inference-proto/client.ts.
export { conversationIdKey } from "../../source/packages/agent/utils/request-id.js";
export { createContext } from "../../source/packages/context/core.js";
