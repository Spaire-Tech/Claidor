/**
 * Writing a file. The request travels as `writeArgs` and its answer comes
 * back as `writeResult`.
 */
import type { WriteArgs, WriteResult } from "../proto/generated/agent/v1/write_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

export type WriteExecutorArgs = WriteArgs;
export type WriteExecResponse = WriteResult;
/** What became of the write: one of the answer's kinds (written, refused, no room left…). */
export type WriteExecResult = WriteResult["result"];
export type WriteExecutor = Executor<WriteExecutorArgs, WriteExecResponse>;

/** The names the request and its answer go by in the wire's envelopes. */
const REQUEST = "writeArgs";
const ANSWER = "writeResult";

export const writeExecutorResource = createResource<WriteExecutor, RemoteExecManager, ControlledExecManager>(
  // The asking side: the request is sent over the connection, and the answer under its name is the result.
  (connection) => new ExecutorResource(connection, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  // The working side: the executor is given every request under that name, and its answer goes home.
  (executor, manager) => manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
