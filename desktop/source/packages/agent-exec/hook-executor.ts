/**
 * Running a hook on the side that does the work. The request travels as
 * `executeHookArgs` and the hook's response comes back as
 * `executeHookResult`.
 */
import type { ExecuteHookArgs, ExecuteHookResult } from "../proto/generated/agent/v1/exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its answer go by in the wire's envelopes. */
const REQUEST = "executeHookArgs";
const ANSWER = "executeHookResult";

export const hookExecutorResource = createResource<Executor<ExecuteHookArgs, ExecuteHookResult>, RemoteExecManager, ControlledExecManager>(
  // The asking side: the request is sent over the connection, and the answer under its name is the result.
  (connection) => new ExecutorResource(connection, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  // The working side: the executor is given every request under that name, and its answer goes home.
  (executor, manager) => manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
