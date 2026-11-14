/**
 * The connected tools, told to the agent's loop in its own protocol: one
 * server for each provider of tools, every one of them connected.
 */
import { Value, type JsonValue } from "@bufbuild/protobuf";

import { McpStateExecResult, McpStateServer, McpStateSuccess } from "../../packages/proto/generated/agent/v1/mcp_exec_pb.js";
import { McpToolDefinition } from "../../packages/proto/generated/agent/v1/mcp_pb.js";

export interface SandMcpTool {
  providerIdentifier: string;
  name: string;
  toolName: string;
  description?: string;
  inputSchema?: JsonValue;
}

export interface SandMcpProvider {
  getTools(ctx: unknown): Promise<readonly SandMcpTool[]>;
}

/**
 * One tool in the protocol's words. A tool with no description or no schema
 * is told without one; a schema may be any JSON, and one that is not JSON
 * fails here.
 */
function definitionOf(tool: SandMcpTool): McpToolDefinition {
  const { name, providerIdentifier, toolName, description, inputSchema } = tool;
  return new McpToolDefinition({
    name,
    providerIdentifier,
    toolName,
    ...(description === undefined ? {} : { description }),
    ...(inputSchema === undefined ? {} : { inputSchema: Value.fromJson(inputSchema) }),
  });
}

/** One provider as a server. It has no name of its own here: its identifier stands for both. */
function serverOf(identifier: string, tools: readonly SandMcpTool[]): McpStateServer {
  return new McpStateServer({
    serverIdentifier: identifier,
    serverName: identifier,
    status: "connected",
    tools: tools.map((tool) => definitionOf(tool)),
  });
}

export function createSandMcpStateExecutor(provider: SandMcpProvider) {
  return {
    /** Asks the provider afresh at every call, and answers with a success that lists what it gave. */
    async execute(ctx: unknown): Promise<McpStateExecResult> {
      // The tools of each provider: providers in the order each first appears, tools in the order they came.
      const byProvider = new Map<string, SandMcpTool[]>();
      for (const tool of await provider.getTools(ctx)) {
        const sameProvider = byProvider.get(tool.providerIdentifier);
        if (sameProvider === undefined) byProvider.set(tool.providerIdentifier, [tool]);
        else sameProvider.push(tool);
      }
      const servers = Array.from(byProvider, ([identifier, tools]) => serverOf(identifier, tools));
      return new McpStateExecResult({ result: { case: "success", value: new McpStateSuccess({ servers }) } });
    },
  };
}
