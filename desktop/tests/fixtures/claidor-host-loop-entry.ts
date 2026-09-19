// Bundle entry for tests/claidor-host-loop.test.mjs: the host's real tool loop
// and the routed provider session, side by side, so a turn can be driven
// offline against a fake model server.
export { createProviderPromptSession, setClaidorCredentialSource, toCoreMessages } from "../../source/host/extensions/inference/provider-session.js";
export { SimplePromptToolExecutor } from "../../source/packages/agent/tool-stream-executor.js";
export { createZodAgentTool } from "../../source/packages/agent/tools/common.js";
export { createContext } from "../../source/packages/context/core.js";
export { z } from "zod";
