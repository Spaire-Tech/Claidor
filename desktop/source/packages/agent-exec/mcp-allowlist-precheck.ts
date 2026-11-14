/**
 * Asking ahead of a call whether an MCP tool of a given provider is on the
 * allowlist.
 *
 * The resource holds both ends of that trip. Asked from afar, the request
 * goes out in an exec message as `mcpAllowlistPrecheckArgs` and the answer is
 * read from the first message that comes back with `mcpAllowlistPrecheckResult`.
 * Served here, a request under that name is handed to the implementation,
 * and what it answers goes back under the answer's name.
 */
import type { McpAllowlistPrecheckArgs, McpAllowlistPrecheckResult } from "../proto/generated/agent/v1/mcp_allowlist_precheck_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its answer travel under. */
const REQUEST = "mcpAllowlistPrecheckArgs";
const ANSWER = "mcpAllowlistPrecheckResult";

type McpAllowlistPrecheckExecutor = Executor<McpAllowlistPrecheckArgs, McpAllowlistPrecheckResult>;

export const mcpAllowlistPrecheckExecutorResource = createResource<McpAllowlistPrecheckExecutor, RemoteExecManager, ControlledExecManager>(
  (remote) => new ExecutorResource(remote, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  (implementation, served) => served.register(new SimpleControlledExecHandler(implementation, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
