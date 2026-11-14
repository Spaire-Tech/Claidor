/**
 * Running a shell command and following it as it runs: its output, its
 * start and its end come back one event at a time. The request travels as
 * `shellStreamArgs` and each event comes back as `shellStream`.
 */
import type { ShellArgs, ShellStream } from "../proto/generated/agent/v1/shell_exec_pb.js";
import { SimpleControlledStreamExecHandler } from "./controlled.js";
import { StreamExecutorResource, type RemoteExecManager, type StreamExecutor } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its events go by in the wire's envelopes. */
const REQUEST = "shellStreamArgs";
const EVENT = "shellStream";

export const shellStreamExecutorResource = createResource<StreamExecutor<ShellArgs, ShellStream>, RemoteExecManager, ControlledExecManager>(
  // The asking side: the request is sent over the connection, and every event under its name is handed on.
  (connection) => new StreamExecutorResource(connection, createServerSerializer(REQUEST), createClientDeserializer(EVENT)),
  // The working side: the executor is given every request under that name, and each of its events goes home.
  (executor, manager) => manager.register(new SimpleControlledStreamExecHandler(executor, createServerDeserializer(REQUEST), createClientSerializer(EVENT))),
);
