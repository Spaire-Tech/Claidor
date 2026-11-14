/**
 * Sending a shell command that is still running to the background, by the
 * id of the tool call that started it.
 *
 * The resource holds both ends of that trip. Asked from afar, the request
 * goes out in an exec message as `forceBackgroundShellArgs` and the answer is
 * read from the first message that comes back with `forceBackgroundShellResult`.
 * Served here, a request under that name is handed to the implementation,
 * and what it answers goes back under the answer's name.
 */
import type { ForceBackgroundShellArgs, ForceBackgroundShellResult } from "../proto/generated/agent/v1/shell_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its answer travel under. */
const REQUEST = "forceBackgroundShellArgs";
const ANSWER = "forceBackgroundShellResult";

type ForceBackgroundShellExecutor = Executor<ForceBackgroundShellArgs, ForceBackgroundShellResult>;

export const forceBackgroundShellExecutorResource = createResource<ForceBackgroundShellExecutor, RemoteExecManager, ControlledExecManager>(
  (remote) => new ExecutorResource(remote, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  (implementation, served) => served.register(new SimpleControlledExecHandler(implementation, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
