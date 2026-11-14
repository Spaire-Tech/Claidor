/**
 * The pi tool set's grep: the lines that match a pattern.
 *
 * The resource holds both ends of that trip. Asked from afar, the request
 * goes out in an exec message as `piGrepArgs` and the answer is
 * read from the first message that comes back with `piGrepResult`.
 * Served here, a request under that name is handed to the implementation,
 * and what it answers goes back under the answer's name.
 */
import type { PiGrepExecArgs, PiGrepExecResult } from "../proto/generated/agent/v1/pi_grep_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its answer travel under. */
const REQUEST = "piGrepArgs";
const ANSWER = "piGrepResult";

type PiGrepExecutor = Executor<PiGrepExecArgs, PiGrepExecResult>;

export const piGrepExecutorResource = createResource<PiGrepExecutor, RemoteExecManager, ControlledExecManager>(
  (remote) => new ExecutorResource(remote, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  (implementation, served) => served.register(new SimpleControlledExecHandler(implementation, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
