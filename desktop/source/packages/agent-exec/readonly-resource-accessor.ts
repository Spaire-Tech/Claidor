/**
 * What a subagent started read-only gets in place of the tools that change
 * things. Writing, deleting and calling an MCP tool are answered here, with
 * a refusal that says why, and so are the shells unless the caller lets them
 * through. Every other resource is the one the accessor below gives.
 */
import { BackgroundShellSpawnResult } from "../proto/generated/agent/v1/background_shell_exec_pb.js";
import { DeletePermissionDenied, DeleteResult } from "../proto/generated/agent/v1/delete_exec_pb.js";
import { McpPermissionDenied, McpResult } from "../proto/generated/agent/v1/mcp_exec_pb.js";
import { ShellPermissionDenied, ShellResult, ShellStream } from "../proto/generated/agent/v1/shell_exec_pb.js";
import { WritePermissionDenied, WriteResult } from "../proto/generated/agent/v1/write_exec_pb.js";
import { backgroundShellExecutorResource } from "./background-shell.js";
import { deleteExecutorResource } from "./delete.js";
import { mcpExecutorResource } from "./mcp.js";
import type { RemoteExecManager } from "./remote.js";
import { CombinedResourceAccessor, type RemoteResource, type ResourceAccessor } from "./resource-provider.js";
import { shellExecutorResource } from "./shell.js";
import { shellStreamExecutorResource } from "./shell-stream.js";
import { writeExecutorResource } from "./write.js";

/** What the subagent's model is told. */
const REFUSAL =
  "This operation is not allowed in readonly mode. The subagent was launched with readonly: true, which restricts write operations.";

/** What a shell request says of itself, as far as the refusal repeats it. */
interface ShellRequest {
  command?: string | undefined;
  workingDirectory?: string | undefined;
}

/** A shell refused: the command and folder asked for (empty where there was none) with the reason. */
function shellRefused(request: ShellRequest): ShellPermissionDenied {
  return new ShellPermissionDenied({
    command: request.command ?? "",
    workingDirectory: request.workingDirectory ?? "",
    error: REFUSAL,
    isReadonly: true,
  });
}

type Entry = readonly [RemoteResource<unknown, RemoteExecManager>, unknown];

/** The executors that refuse to change a file or call an MCP tool. They are made anew for each accessor. */
function refusingToChange(): Entry[] {
  return [
    [
      writeExecutorResource,
      {
        async execute(_ctx: unknown, request: { path: string }): Promise<WriteResult> {
          const refused = new WritePermissionDenied({ path: request.path, error: REFUSAL, isReadonly: true });
          return new WriteResult({ result: { case: "permissionDenied", value: refused } });
        },
      },
    ],
    [
      deleteExecutorResource,
      {
        async execute(_ctx: unknown, request: { path: string }): Promise<DeleteResult> {
          const refused = new DeletePermissionDenied({ path: request.path, clientVisibleError: REFUSAL, isReadonly: true });
          return new DeleteResult({ result: { case: "permissionDenied", value: refused } });
        },
      },
    ],
    [
      mcpExecutorResource,
      {
        async execute(_ctx: unknown, request: { name: string }): Promise<McpResult> {
          // The tool asked for is named after the reason.
          const refused = new McpPermissionDenied({ error: `${REFUSAL} Tool: ${request.name}`, isReadonly: true });
          return new McpResult({ result: { case: "permissionDenied", value: refused } });
        },
      },
    ],
  ];
}

/** The executors that refuse to run a shell: for one answer, as a stream (one event, then the end), and in the background. */
function refusingShells(): Entry[] {
  return [
    [
      shellExecutorResource,
      {
        async execute(_ctx: unknown, request: ShellRequest): Promise<ShellResult> {
          return new ShellResult({ result: { case: "permissionDenied", value: shellRefused(request) } });
        },
      },
    ],
    [
      shellStreamExecutorResource,
      {
        async *execute(_ctx: unknown, request: ShellRequest): AsyncIterable<ShellStream> {
          yield new ShellStream({ event: { case: "permissionDenied", value: shellRefused(request) } });
        },
      },
    ],
    [
      backgroundShellExecutorResource,
      {
        async execute(_ctx: unknown, request: ShellRequest): Promise<BackgroundShellSpawnResult> {
          return new BackgroundShellSpawnResult({ result: { case: "permissionDenied", value: shellRefused(request) } });
        },
      },
    ],
  ];
}

/**
 * An accessor for a read-only subagent, laid over `baseAccessor`. With
 * `wrapShell` the shells are refused too; without it they are the ones
 * below.
 */
export function createReadonlyResourceAccessor(
  baseAccessor: ResourceAccessor<RemoteExecManager>,
  wrapShell: boolean,
): ResourceAccessor<RemoteExecManager> {
  const refusing = wrapShell ? [...refusingToChange(), ...refusingShells()] : refusingToChange();
  return new CombinedResourceAccessor(baseAccessor, refusing);
}
