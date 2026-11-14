/**
 * Asking for a git diff of a working folder.
 *
 * The resource holds both ends of that trip. Asked from afar, the request
 * goes out in an exec message as `gitDiffRequest` and the answer is
 * read from the first message that comes back with `gitDiffResponse`.
 * Served here, a request under that name is handed to the implementation,
 * and what it answers goes back under the answer's name.
 */
import type { GetDiffRequest, GetDiffResponse } from "../proto/generated/simeon/v1/utils_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its answer travel under. */
const REQUEST = "gitDiffRequest";
const ANSWER = "gitDiffResponse";

type GitDiffExecutor = Executor<GetDiffRequest, GetDiffResponse>;

export const gitDiffExecutorResource = createResource<GitDiffExecutor, RemoteExecManager, ControlledExecManager>(
  (remote) => new ExecutorResource(remote, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  (implementation, served) => served.register(new SimpleControlledExecHandler(implementation, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
