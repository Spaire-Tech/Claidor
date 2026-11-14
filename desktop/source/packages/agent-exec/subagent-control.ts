/**
 * Sending the subagent of a tool call to the background while it runs. The
 * request travels as `forceBackgroundSubagentArgs` and its answer comes back
 * as `forceBackgroundSubagentResult`.
 */
import type { ForceBackgroundSubagentArgs, ForceBackgroundSubagentResult } from "../proto/generated/agent/v1/subagent_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its answer go by in the wire's envelopes. */
const REQUEST = "forceBackgroundSubagentArgs";
const ANSWER = "forceBackgroundSubagentResult";

export const forceBackgroundSubagentExecutorResource = createResource<Executor<ForceBackgroundSubagentArgs, ForceBackgroundSubagentResult>, RemoteExecManager, ControlledExecManager>(
  // The asking side: the request is sent over the connection, and the answer under its name is the result.
  (connection) => new ExecutorResource(connection, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  // The working side: the executor is given every request under that name, and its answer goes home.
  (executor, manager) => manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
