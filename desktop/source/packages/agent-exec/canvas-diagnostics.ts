/**
 * Asking for the diagnostics of a canvas, by its path. The request travels
 * as `canvasDiagnosticsArgs` and its answer comes back as
 * `canvasDiagnosticsResult`.
 */
import type { CanvasDiagnosticsArgs, CanvasDiagnosticsResult } from "../proto/generated/agent/v1/canvas_diagnostics_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its answer go by in the wire's envelopes. */
const REQUEST = "canvasDiagnosticsArgs";
const ANSWER = "canvasDiagnosticsResult";

export const canvasDiagnosticsExecutorResource = createResource<Executor<CanvasDiagnosticsArgs, CanvasDiagnosticsResult>, RemoteExecManager, ControlledExecManager>(
  // The asking side: the request is sent over the connection, and the answer under its name is the result.
  (connection) => new ExecutorResource(connection, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  // The working side: the executor is given every request under that name, and its answer goes home.
  (executor, manager) => manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
