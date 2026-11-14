/**
 * The shell command of the mini-swe-agent tool set. It takes and gives what
 * the ordinary shell does, under names of its own.
 *
 * The resource holds both ends of that trip. Asked from afar, the request
 * goes out in an exec message as `miniSweAgentBashArgs` and the answer is
 * read from the first message that comes back with `miniSweAgentBashResult`.
 * Served here, a request under that name is handed to the implementation,
 * and what it answers goes back under the answer's name.
 */
import type { ShellArgs, ShellResult } from "../proto/generated/agent/v1/shell_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its answer travel under. */
const REQUEST = "miniSweAgentBashArgs";
const ANSWER = "miniSweAgentBashResult";

type MiniSweAgentBashExecutor = Executor<ShellArgs, ShellResult>;

export const miniSweAgentBashExecutorResource = createResource<MiniSweAgentBashExecutor, RemoteExecManager, ControlledExecManager>(
  (remote) => new ExecutorResource(remote, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  (implementation, served) => served.register(new SimpleControlledExecHandler(implementation, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
