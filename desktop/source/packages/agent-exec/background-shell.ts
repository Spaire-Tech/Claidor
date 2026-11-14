/**
 * Shells that go on running in the background: starting one
 * (`backgroundShellSpawnArgs`, answered by `backgroundShellSpawnResult`) and
 * typing into one that runs (`writeShellStdinArgs`, answered by
 * `writeShellStdinResult`).
 */
import type {
  BackgroundShellSpawnArgs,
  BackgroundShellSpawnResult,
  WriteShellStdinArgs,
  WriteShellStdinResult,
} from "../proto/generated/agent/v1/background_shell_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names each request and its answer go by in the wire's envelopes. */
const SPAWN = { request: "backgroundShellSpawnArgs", answer: "backgroundShellSpawnResult" } as const;
const INPUT = { request: "writeShellStdinArgs", answer: "writeShellStdinResult" } as const;

export const backgroundShellExecutorResource = createResource<Executor<BackgroundShellSpawnArgs, BackgroundShellSpawnResult>, RemoteExecManager, ControlledExecManager>(
  (connection) => new ExecutorResource(connection, createServerSerializer(SPAWN.request), createClientDeserializer(SPAWN.answer)),
  (executor, manager) => manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(SPAWN.request), createClientSerializer(SPAWN.answer))),
);

export const writeBackgroundShellInputExecutorResource = createResource<Executor<WriteShellStdinArgs, WriteShellStdinResult>, RemoteExecManager, ControlledExecManager>(
  (connection) => new ExecutorResource(connection, createServerSerializer(INPUT.request), createClientDeserializer(INPUT.answer)),
  (executor, manager) => manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(INPUT.request), createClientSerializer(INPUT.answer))),
);
