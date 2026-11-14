/**
 * Asking what conflicts an agent's store has met since a given place in its
 * journal, and whether to move that place on.
 *
 * The resource holds both ends of that trip. Asked from afar, the request
 * goes out in an exec message as `agentStoreConflictArgs` and the answer is
 * read from the first message that comes back with `agentStoreConflictResult`.
 * Served here, a request under that name is handed to the implementation,
 * and what it answers goes back under the answer's name.
 */
import type { AgentStoreConflictArgs, AgentStoreConflictResult } from "../proto/generated/agent/v1/agent_store_conflict_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its answer travel under. */
const REQUEST = "agentStoreConflictArgs";
const ANSWER = "agentStoreConflictResult";

type AgentStoreConflictExecutor = Executor<AgentStoreConflictArgs, AgentStoreConflictResult>;

export const agentStoreConflictExecutorResource = createResource<AgentStoreConflictExecutor, RemoteExecManager, ControlledExecManager>(
  (remote) => new ExecutorResource(remote, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  (implementation, served) => served.register(new SimpleControlledExecHandler(implementation, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
