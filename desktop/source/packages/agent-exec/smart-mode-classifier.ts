/**
 * Having an action judged before it is run: the answer is a decision, with
 * the reason when the action is blocked. The request travels as
 * `smartModeClassifierArgs` and its answer comes back as
 * `smartModeClassifierResult`.
 */
import type { SmartModeClassifierArgs, SmartModeClassifierResult } from "../proto/generated/agent/v1/smart_mode_classifier_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its answer go by in the wire's envelopes. */
const REQUEST = "smartModeClassifierArgs";
const ANSWER = "smartModeClassifierResult";

export const smartModeClassifierExecutorResource = createResource<Executor<SmartModeClassifierArgs, SmartModeClassifierResult>, RemoteExecManager, ControlledExecManager>(
  // The asking side: the request is sent over the connection, and the answer under its name is the result.
  (connection) => new ExecutorResource(connection, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  // The working side: the executor is given every request under that name, and its answer goes home.
  (executor, manager) => manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
