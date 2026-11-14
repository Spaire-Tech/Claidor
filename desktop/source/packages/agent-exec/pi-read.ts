/**
 * The pi tool set's read: a file, or a stretch of its lines.
 *
 * The resource holds both ends of that trip. Asked from afar, the request
 * goes out in an exec message as `piReadArgs` and the answer is
 * read from the first message that comes back with `piReadResult`.
 * Served here, a request under that name is handed to the implementation,
 * and what it answers goes back under the answer's name.
 */
import type { PiReadExecArgs, PiReadExecResult } from "../proto/generated/agent/v1/pi_read_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its answer travel under. */
const REQUEST = "piReadArgs";
const ANSWER = "piReadResult";

type PiReadExecutor = Executor<PiReadExecArgs, PiReadExecResult>;

export const piReadExecutorResource = createResource<PiReadExecutor, RemoteExecManager, ControlledExecManager>(
  (remote) => new ExecutorResource(remote, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  (implementation, served) => served.register(new SimpleControlledExecHandler(implementation, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
