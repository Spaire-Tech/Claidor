// Bundle entry for tests/connector-replay.test.mjs: the real Agent loop of
// tests/fixtures/simeon-agent-loop-entry.ts, plus the connector tools a turn
// offers (GetMcpTools, SearchPlugins, GetMcpServerStatus, ProposeConnector),
// so a conversation from an OpenAI log can be replayed offline and its model
// calls counted.
export * from "./simeon-agent-loop-entry.js";
export { createGetMcpToolsTool } from "../../source/packages/agent/tools/mcp/get-mcp-tools.js";
export { McpDescriptor, McpToolDescriptor, McpMetaToolOptions } from "../../source/packages/proto/generated/agent/v1/mcp_pb.js";
export { createMcpManagementTools } from "../../source/host/runner/tools/sand-mcp-management-tools.js";
