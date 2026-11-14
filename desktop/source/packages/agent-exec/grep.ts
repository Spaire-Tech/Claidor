/**
 * Searching the contents of files for a pattern.
 *
 * The resource holds both ends of that trip. Asked from afar, the request
 * goes out in an exec message as `grepArgs` and the answer is
 * read from the first message that comes back with `grepResult`.
 * Served here, a request under that name is handed to the implementation,
 * and what it answers goes back under the answer's name.
 */
import type { GrepArgs, GrepResult } from "../proto/generated/agent/v1/grep_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its answer travel under. */
const REQUEST = "grepArgs";
const ANSWER = "grepResult";

type GrepExecutor = Executor<GrepArgs, GrepResult>;

export const grepExecutorResource = createResource<GrepExecutor, RemoteExecManager, ControlledExecManager>(
  (remote) => new ExecutorResource(remote, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  (implementation, served) => served.register(new SimpleControlledExecHandler(implementation, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
