/**
 * Adopting an agent: the request names the agent to take in, and the answer
 * says what came of it.
 *
 * The resource holds both ends of that trip. Asked from afar, the request
 * goes out in an exec message as `adoptArgs` and the answer is
 * read from the first message that comes back with `adoptResult`.
 * Served here, a request under that name is handed to the implementation,
 * and what it answers goes back under the answer's name.
 */
import type { AdoptArgs, AdoptResult } from "../proto/generated/agent/v1/adopt_tool_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its answer travel under. */
const REQUEST = "adoptArgs";
const ANSWER = "adoptResult";

type AdoptExecutor = Executor<AdoptArgs, AdoptResult>;

export const adoptExecutorResource = createResource<AdoptExecutor, RemoteExecManager, ControlledExecManager>(
  (remote) => new ExecutorResource(remote, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  (implementation, served) => served.register(new SimpleControlledExecHandler(implementation, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
