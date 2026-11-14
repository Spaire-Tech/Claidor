/**
 * MCP servers as the agents' tools see them: the names the built-in
 * providers go by, what is written to a tool's file, what a change to the
 * servers' leases covers, why a server's tools cannot be used, and the four
 * MCP requests as resources (calling a tool, listing and reading a server's
 * resources, and asking for the servers' state).
 */
import type { JsonValue } from "@bufbuild/protobuf";
import type {
  ListMcpResourcesExecArgs,
  ListMcpResourcesExecResult,
  McpArgs,
  McpResult,
  McpStateExecArgs,
  McpStateExecResult,
  ReadMcpResourceExecArgs,
  ReadMcpResourceExecResult,
} from "../proto/generated/agent/v1/mcp_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

export const SIMEON_PLAYWRIGHT_PROVIDER_ID = "cursor-browser-extension";
export const SIMEON_IDE_BROWSER_PROVIDER_ID = "simeon-ide-browser";
export const SIMEON_SELF_CONTROL_PROVIDER_ID = "simeon-dev-control";
export const CUSTOM_USER_TOOLS_PROVIDER_ID = "custom-user-tools";

/** The servers a person is never asked to sign in to. */
export const NON_AUTHENTICATABLE_MCP_PROVIDER_IDS = new Set([
  "cursor-app-control",
  "cursor-backend-control",
  SIMEON_PLAYWRIGHT_PROVIDER_ID,
  SIMEON_IDE_BROWSER_PROVIDER_ID,
  SIMEON_SELF_CONTROL_PROVIDER_ID,
  CUSTOM_USER_TOOLS_PROVIDER_ID,
  "fsd",
]);

export const SIMEON_DYNAMIC_TOOLS_NAMESPACE = "simeon";

/** The namespace the first-party tools were under before it was renamed. Tool calls saved back then still carry it. */
const EARLIER_TOOLS_NAMESPACE = "cursor";

/** Whether a namespace is the first-party one, under its name of today or its earlier one. */
export function isFirstPartyToolsNamespace(namespace: string | undefined): boolean {
  return namespace === SIMEON_DYNAMIC_TOOLS_NAMESPACE || namespace === EARLIER_TOOLS_NAMESPACE;
}

export const BROWSER_MCP_PROVIDER_IDS = new Set([SIMEON_SELF_CONTROL_PROVIDER_ID, SIMEON_IDE_BROWSER_PROVIDER_ID]);

/** What made the servers' leases change. */
export enum McpLeaseChangeReason {
  Snapshots = "simeon_mcp_lease_snapshot_store",
  Status = "simeon_mcp_lease_server_status",
  Settings = "simeon_mcp_lease_settings",
  Providers = "simeon_mcp_lease_providers",
  Unknown = "simeon_mcp_lease_unknown",
}

export interface McpToolFileLike {
  readonly toolName: string;
  readonly description?: string | undefined;
  readonly inputSchema?: unknown;
  readonly outputSchema?: unknown;
  readonly plugin?: string | undefined;
  readonly marketplace?: string | undefined;
  readonly pluginId?: string | undefined;
  readonly marketplaceId?: string | undefined;
}

export interface McpInputSchemaLike {
  readonly inputSchemaJson?: string | undefined;
  readonly inputSchema?: { toJson(): JsonValue } | undefined;
}

/** A change to the servers' leases. One that names no servers is a change to all of them. */
export interface McpLeaseChangeEvent {
  readonly serverIdentifiers?: readonly string[] | undefined;
  readonly reason?: string | undefined;
}

export function supportsInteractiveMcpAuth(serverIdentifier: string): boolean {
  return !NON_AUTHENTICATABLE_MCP_PROVIDER_IDS.has(serverIdentifier);
}

/** What is written to a tool's file. Every key is there, undefined where the tool has nothing for it. */
export function buildMcpToolFileContent(tool: McpToolFileLike): {
  readonly name: string;
  readonly description: string | undefined;
  readonly arguments: unknown;
  readonly outputSchema: unknown;
  readonly plugin: string | undefined;
  readonly marketplace: string | undefined;
  readonly pluginId: string | undefined;
  readonly marketplaceId: string | undefined;
} {
  return {
    // The file calls the tool's name `name` and its input schema `arguments`; the rest keeps its name.
    name: tool.toolName,
    description: tool.description,
    arguments: tool.inputSchema,
    outputSchema: tool.outputSchema,
    plugin: tool.plugin,
    marketplace: tool.marketplace,
    pluginId: tool.pluginId,
    marketplaceId: tool.marketplaceId,
  };
}

/** A schema read from its text. Text that is not JSON gives nothing, as no text does. */
export function parseMcpInputSchemaJson(inputSchemaJson: string | undefined): JsonValue | undefined {
  if (inputSchemaJson === undefined) return undefined;
  try {
    return JSON.parse(inputSchemaJson) as JsonValue;
  } catch {
    return undefined;
  }
}

/** A tool's input schema: read from its text, or, where the text gives nothing or null, asked of the schema the tool holds. */
export function mcpInputSchemaToJson(tool: McpInputSchemaLike): JsonValue | undefined {
  return parseMcpInputSchemaJson(tool.inputSchemaJson) ?? tool.inputSchema?.toJson();
}

export function isFullMcpLeaseInvalidation(event: McpLeaseChangeEvent | undefined): boolean {
  return event === undefined || event.serverIdentifiers === undefined;
}

/**
 * Two changes as one. With fewer than two the first is given back as it is,
 * and a third is not looked at. The reason is the first one's, or the
 * second's when the first has none.
 */
export function mergeMcpLeaseEvents(
  ...events: Array<McpLeaseChangeEvent | undefined>
): McpLeaseChangeEvent | undefined {
  const [first, second] = events;
  if (events.length < 2) return first;
  const reason = (): string | undefined => first?.reason ?? second?.reason;
  const all = (): McpLeaseChangeEvent => ({ serverIdentifiers: undefined, reason: reason() });

  if (isFullMcpLeaseInvalidation(second)) return all();
  if (first === undefined) return second;
  if (isFullMcpLeaseInvalidation(first)) return all();
  // Both name their servers: each server once, the first change's before the second's. A list of null adds none.
  const servers = new Set([...(first.serverIdentifiers ?? []), ...(second?.serverIdentifiers ?? [])]);
  return { serverIdentifiers: [...servers], reason: reason() };
}

/** What is said of a server whose tools cannot be used, by the state it is in. */
const UNAVAILABLE_BECAUSE: ReadonlyMap<string, string> = new Map([
  ["needsAuth", "This MCP server requires authentication before its tools can be used."],
  ["error", "This MCP server failed during live tool discovery. Its tools are unavailable until the connection is fixed."],
  ["loading", "This MCP server is still loading; tools may not be available yet."],
]);

export function mcpServerUnavailableReason(status: string): string | undefined {
  return UNAVAILABLE_BECAUSE.get(status);
}

/** The names each MCP request and its answer go by in the wire's envelopes. */
const CALL = { request: "mcpArgs", answer: "mcpResult" } as const;
const LIST_RESOURCES = { request: "listMcpResourcesExecArgs", answer: "listMcpResourcesExecResult" } as const;
const READ_RESOURCE = { request: "readMcpResourceExecArgs", answer: "readMcpResourceExecResult" } as const;
const STATE = { request: "mcpStateExecArgs", answer: "mcpStateExecResult" } as const;

/** Calling a tool of an MCP server. */
export const mcpExecutorResource = createResource<Executor<McpArgs, McpResult>, RemoteExecManager, ControlledExecManager>(
  (connection) => new ExecutorResource(connection, createServerSerializer(CALL.request), createClientDeserializer(CALL.answer)),
  (executor, manager) => {
    manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(CALL.request), createClientSerializer(CALL.answer)));
  },
);

/** Listing the resources MCP servers offer. */
export const listMcpResourcesExecutorResource = createResource<Executor<ListMcpResourcesExecArgs, ListMcpResourcesExecResult>, RemoteExecManager, ControlledExecManager>(
  (connection) => new ExecutorResource(connection, createServerSerializer(LIST_RESOURCES.request), createClientDeserializer(LIST_RESOURCES.answer)),
  (executor, manager) => {
    manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(LIST_RESOURCES.request), createClientSerializer(LIST_RESOURCES.answer)));
  },
);

/** Reading one resource of an MCP server. */
export const readMcpResourceExecutorResource = createResource<Executor<ReadMcpResourceExecArgs, ReadMcpResourceExecResult>, RemoteExecManager, ControlledExecManager>(
  (connection) => new ExecutorResource(connection, createServerSerializer(READ_RESOURCE.request), createClientDeserializer(READ_RESOURCE.answer)),
  (executor, manager) => {
    manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(READ_RESOURCE.request), createClientSerializer(READ_RESOURCE.answer)));
  },
);

/** Asking for the state of MCP servers. */
export const mcpStateExecutorResource = createResource<Executor<McpStateExecArgs, McpStateExecResult>, RemoteExecManager, ControlledExecManager>(
  (connection) => new ExecutorResource(connection, createServerSerializer(STATE.request), createClientDeserializer(STATE.answer)),
  (executor, manager) => {
    manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(STATE.request), createClientSerializer(STATE.answer)));
  },
);
