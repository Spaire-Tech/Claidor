/**
 * Asking the side that does the work what a request is surrounded by there:
 * its system, shell, folders, sandbox and the rest of the request's
 * context. The request travels as `requestContextArgs` and its answer comes
 * back as `requestContextResult`.
 */
import type { RequestContextArgs, RequestContextResult } from "../proto/generated/agent/v1/request_context_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its answer go by in the wire's envelopes. */
const REQUEST = "requestContextArgs";
const ANSWER = "requestContextResult";

export const requestContextExecutorResource = createResource<Executor<RequestContextArgs, RequestContextResult>, RemoteExecManager, ControlledExecManager>(
  // The asking side: the request is sent over the connection, and the answer under its name is the result.
  (connection) => new ExecutorResource(connection, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  // The working side: the executor is given every request under that name, and its answer goes home.
  (executor, manager) => manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
