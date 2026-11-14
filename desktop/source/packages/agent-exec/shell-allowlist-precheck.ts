/**
 * Asking ahead of a run whether a shell command is on the allowlist.
 *
 * The resource holds both ends of that trip. Asked from afar, the request
 * goes out in an exec message as `shellAllowlistPrecheckArgs` and the answer is
 * read from the first message that comes back with `shellAllowlistPrecheckResult`.
 * Served here, a request under that name is handed to the implementation,
 * and what it answers goes back under the answer's name.
 */
import type { ShellAllowlistPrecheckArgs, ShellAllowlistPrecheckResult } from "../proto/generated/agent/v1/shell_allowlist_precheck_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** The names the request and its answer travel under. */
const REQUEST = "shellAllowlistPrecheckArgs";
const ANSWER = "shellAllowlistPrecheckResult";

type ShellAllowlistPrecheckExecutor = Executor<ShellAllowlistPrecheckArgs, ShellAllowlistPrecheckResult>;

export const shellAllowlistPrecheckExecutorResource = createResource<ShellAllowlistPrecheckExecutor, RemoteExecManager, ControlledExecManager>(
  (remote) => new ExecutorResource(remote, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  (implementation, served) => served.register(new SimpleControlledExecHandler(implementation, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
