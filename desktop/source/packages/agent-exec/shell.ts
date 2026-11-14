/**
 * Running a shell command for one answer that says what became of it. The
 * request travels as `shellArgs` and its answer comes back as `shellResult`.
 */
import type { ShellArgs, ShellResult } from "../proto/generated/agent/v1/shell_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

export type ShellExecutorArgs = ShellArgs;
export type ShellExecResponse = ShellResult;
/** What became of the command: one of the answer's kinds (it ran, it failed, it was refused…). */
export type ShellExecResult = ShellResult["result"];
export type ShellExecutor = Executor<ShellExecutorArgs, ShellExecResponse>;

/** The names the request and its answer go by in the wire's envelopes. */
const REQUEST = "shellArgs";
const ANSWER = "shellResult";

export const shellExecutorResource = createResource<ShellExecutor, RemoteExecManager, ControlledExecManager>(
  // The asking side: the request is sent over the connection, and the answer under its name is the result.
  (connection) => new ExecutorResource(connection, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  // The working side: the executor is given every request under that name, and its answer goes home.
  (executor, manager) => manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
