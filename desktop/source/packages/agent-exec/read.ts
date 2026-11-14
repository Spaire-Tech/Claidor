/**
 * Reading a file, under two pairs of names that share one request type and
 * one answer type: the plain read (`readArgs`, answered by `readResult`) and
 * the redacted read (`redactedReadArgs`, answered by `redactedReadResult`),
 * which the read tool asks for when it is set to prefer it.
 */
import type { ReadArgs, ReadResult } from "../proto/generated/agent/v1/read_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

export type ReadExecutorArgs = ReadArgs;
export type ReadExecutor = Executor<ReadExecutorArgs, ReadResult>;

/** The names each read's request and answer go by in the wire's envelopes. */
const PLAIN = { request: "readArgs", answer: "readResult" } as const;
const REDACTED = { request: "redactedReadArgs", answer: "redactedReadResult" } as const;

export const readExecutorResource = createResource<ReadExecutor, RemoteExecManager, ControlledExecManager>(
  (connection) => new ExecutorResource(connection, createServerSerializer(PLAIN.request), createClientDeserializer(PLAIN.answer)),
  (executor, manager) => manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(PLAIN.request), createClientSerializer(PLAIN.answer))),
);

export const redactedReadExecutorResource = createResource<Executor<ReadArgs, ReadResult>, RemoteExecManager, ControlledExecManager>(
  (connection) => new ExecutorResource(connection, createServerSerializer(REDACTED.request), createClientDeserializer(REDACTED.answer)),
  (executor, manager) => manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(REDACTED.request), createClientSerializer(REDACTED.answer))),
);
