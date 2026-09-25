// Bundle entry for tests/sand-loop-tool.test.mjs: the host's real tool loop
// and the routed provider session beside the toolset factories that hand the
// loop Grok Bot's Sand-shaped box tools, so a Computer call can be driven
// offline through the code every real turn runs.
export { createProviderPromptSession, setClaidorCredentialSource } from "../../source/host/extensions/inference/provider-session.js";
export { SimplePromptToolExecutor } from "../../source/packages/agent/tool-stream-executor.js";
export { executeToolResultOrError, renderToolResultOrError } from "../../source/packages/agent/tools/core.js";
export { createContext } from "../../source/packages/context/core.js";
export {
  createTurnBrowserToolFactory,
  createTurnCloudAgentToolFactory,
  createTurnComputerToolFactory,
  createTurnScreenshotToolFactory,
} from "../../source/host/runner/tools/turn-toolset.js";
export { adaptBrowserTool, browserToolParameters, createSandLoopTool } from "../../source/host/runner/tools/sand-loop-tool.js";
export { cloudAgentToolParameters } from "../../source/host/cloud-agents/cloud-agent-tool-parameters.js";
