// One bundle for the coding agents' test (11 November 2026): the coding run, its runner and the computer's server, GitHub on the computer, the manager and the CloudAgent tool.
export * from "../../source/host/cloud-agents/coding-run.js";
export * from "../../source/host/cloud-agents/coding-runner.js";
export * from "../../source/host/cloud-agents/coding-github.js";
export { SandCloudAgentManager, ON_COMPUTER_FIELDS, statusOf, cloudAgentUrl, cloudAgentLines, MODEL_CONNECT_CARD_TEXT, GITHUB_CARD_TEXT } from "../../source/host/extensions/cloud-agents/cloud-agents-service.js";
export { buildWatchResult } from "../../source/host/extensions/cloud-agents/cloud-agent-poll-loop.js";
export { runCloudAgentAction, summaryLine, CLOUD_AGENT_CHAT_NOTE } from "../../source/host/cloud-agents/cloud-agent-tool.js";
export { buildBoxHomeCategory } from "../../source/host/extensions/box-store-sync/box-store-sync-service.js";
export { assistantWords } from "../../source/host/claude-code/claude-code-turn.js";
export { setSimeonCodingProgramsForTest } from "../../source/host/extensions/inference/simeon-model-roles.js";
