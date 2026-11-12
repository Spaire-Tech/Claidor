import {
  backgroundShellExecutorResource,
} from "../../packages/agent-exec/background-shell.js";
import { computerUseExecutorResource } from "../../packages/agent-exec/computer-use.js";
import { readExecutorResource } from "../../packages/agent-exec/read.js";
import {
  RegistryResourceAccessor,
  type ResourceAccessor,
} from "../../packages/agent-exec/resource-provider.js";
import { shellExecutorResource } from "../../packages/agent-exec/shell.js";
import { shellStreamExecutorResource } from "../../packages/agent-exec/shell-stream.js";
import { smartModeClassifierExecutorResource } from "../../packages/agent-exec/smart-mode-classifier.js";
import type {
  Executor,
  RemoteExecManager,
  StreamExecutor,
} from "../../packages/agent-exec/remote.js";
import type { Context } from "../../packages/context/core.js";
import type {
  BackgroundShellSpawnArgs,
  BackgroundShellSpawnResult,
} from "../../packages/proto/generated/agent/v1/background_shell_exec_pb.js";
import type {
  ComputerUseArgs,
  ComputerUseResult,
} from "../../packages/proto/generated/agent/v1/computer_use_tool_pb.js";
import type { ReadArgs, ReadResult } from "../../packages/proto/generated/agent/v1/read_exec_pb.js";
import type { ShellArgs, ShellResult, ShellStream } from "../../packages/proto/generated/agent/v1/shell_exec_pb.js";
import type {
  SmartModeClassifierArgs,
  SmartModeClassifierResult,
} from "../../packages/proto/generated/agent/v1/smart_mode_classifier_exec_pb.js";
import {
  boxAgentWindowIndex,
  boxIsPreparing,
  type CapableBox,
} from "../box/box-capabilities.js";
import { touchSandMonitorBusyLease, type ShellAccessor } from "../box/box-windows.js";
import {
  boxNotReadyMessageForError,
  isNoMonitorComputerUseExecutor,
  SandBoxNoMonitorAvailableError,
  SAND_BOX_NOT_READY_MESSAGE,
} from "../ports/box.js";
import { requestIdKey } from "../../packages/chat-inference-proto/client.js";
import { parseShellTerminalFooter, terminalFileShellId } from "../../shared/background-commands.js";
import { sandQuietWorkOriginKey } from "../sand-quiet-work-origin.js";
import { BOX_TERMINALS_FOLDER } from "../box/loopback-sand-box.js";

export class SandBoxNotReadyError extends Error {
  override readonly name = "SandBoxNotReadyError";
}

export interface RemoteConnection {
  readonly terminalsFolder: string;
  readonly remoteAccessor: ResourceAccessor<RemoteExecManager>;
}

interface NavigationProbe {
  captureBaseline(
    context: Context,
    remoteAccessor: ResourceAccessor<RemoteExecManager>,
    windowIndex: number,
  ): Promise<void> | undefined;
}

export interface RemoteBoxResourceHost {
  readonly remoteBox: CapableBox & {
    ensureReady(context: Context, agentId: string): Promise<RemoteConnection>;
  };
  readonly remoteBoxHasDesktop: boolean;
  readonly preparedRemoteBoxConnection?: Promise<RemoteConnection | undefined>;
  resolveBoxId(): string;
  getConversationId(): string;
  setRemoteBoxTerminalsFolder(folder: string): void;
  readonly autoReviewGate: {
    assertNoPendingApproval(): void;
    currentModes(): Readonly<Record<string, string>>;
  };
  auditShellCommand(
    agentId: string,
    kind: "foreground" | "background",
    command: string,
    target: "box",
    attribution: { readonly turnId?: string; readonly boxId?: string },
  ): void;
  readonly computerUse: {
    getOrCreateNavigationProbe(): NavigationProbe | undefined;
    recordAuditIntent(actionCase: string | undefined): void;
  };
  probeNavigationAfterComputerUse(
    context: Context,
    connection: RemoteConnection,
  ): void;
  readonly autoReviewClassifierExecutor?: Executor<
    SmartModeClassifierArgs,
    SmartModeClassifierResult
  >;
  /**
   * A Shell command on the computer went on in the background (12 November
   * 2026): past its wait, or started there with `block_until_ms: 0`. The
   * runner watches it (`watchBackgroundShell`), so its end wakes the agent,
   * whether the turn that started it runs on Simeon's model or in Claude Code
   * (whose Shell is this same tool, offered over MCP).
   */
  onShellBackgrounded?(shell: { readonly shellId: string; readonly title: string; readonly quietOrigin?: string }): void;
  /**
   * The agent read the end of a background command's output file in a turn
   * (AwaitShell, Read): it has the result, and no wake is due for it.
   */
  onBackgroundShellSeenFinished?(shellId: string): void;
}

/** What a read of a background command's output file shows of its end: the command's id when the file has its footer. */
export function finishedTerminalRead(args: Pick<ReadArgs, "path">, result: ReadResult, folders: readonly string[]): string | undefined {
  if (result.result.case !== "success") return undefined;
  const shellId = terminalFileShellId(args.path, folders);
  if (shellId === undefined) return undefined;
  const output = (result.result.value as { readonly output?: { readonly case?: string; readonly value?: unknown } }).output;
  const content = output?.case === "content" && typeof output.value === "string"
    ? output.value
    : output?.case === "data" && output.value instanceof Uint8Array ? new TextDecoder().decode(output.value) : undefined;
  return content !== undefined && parseShellTerminalFooter(content).isComplete ? shellId : undefined;
}

export function createRemoteBoxResourceAccessor(host: RemoteBoxResourceHost) {
  const box = host.remoteBox;
  const boxId = host.resolveBoxId();
  const agentId = host.getConversationId();
  let connectionPromise: Promise<RemoteConnection | undefined> | undefined;
  const preparedConnection = host.preparedRemoteBoxConnection;

  const connect = async (context: Context): Promise<RemoteConnection> => {
    if (boxIsPreparing(box, boxId)) {
      throw new SandBoxNotReadyError(SAND_BOX_NOT_READY_MESSAGE);
    }
    try {
      const connection = await (
        connectionPromise ??= (async () =>
          await preparedConnection ?? box.ensureReady(context, boxId))()
      );
      if (connection == null) throw new Error(SAND_BOX_NOT_READY_MESSAGE);
      host.setRemoteBoxTerminalsFolder(connection.terminalsFolder);
      return connection;
    } catch (error) {
      connectionPromise = undefined;
      throw new SandBoxNotReadyError(boxNotReadyMessageForError(error), { cause: error });
    }
  };

  const audit = (
    context: Context,
    kind: "foreground" | "background",
    command: string,
  ): void => {
    const turnId = context.get(requestIdKey);
    host.auditShellCommand(agentId, kind, command, "box", {
      ...(turnId === undefined ? {} : { turnId }),
      boxId,
    });
  };
  const guardAutoReviewBarrier = (): void => host.autoReviewGate.assertNoPendingApproval();
  const noteBackgrounded = (context: Context, args: ShellArgs, shellId: number): void => {
    if (host.onShellBackgrounded === undefined || shellId <= 0) return;
    const described = args.description?.trim() ?? "";
    const quietOrigin = context.get(sandQuietWorkOriginKey);
    try {
      host.onShellBackgrounded({
        shellId: String(shellId),
        title: described.length > 0 ? described : args.command,
        ...(typeof quietOrigin === "string" ? { quietOrigin } : {}),
      });
    } catch {
      // The command runs on; only its wake is lost.
    }
  };

  const ownsMonitorForShellNavigationAudit = (connection: RemoteConnection): boolean => {
    if (!host.remoteBoxHasDesktop) return false;
    try {
      return !isNoMonitorComputerUseExecutor(
        connection.remoteAccessor.get(computerUseExecutorResource),
      );
    } catch {
      return false;
    }
  };

  const awaitShellNavigationBaseline = async (
    context: Context,
    connection: RemoteConnection,
  ): Promise<void> => {
    if (!ownsMonitorForShellNavigationAudit(connection)) return;
    await host.computerUse.getOrCreateNavigationProbe()?.captureBaseline(
      context.withDetached(),
      connection.remoteAccessor,
      boxAgentWindowIndex(box, boxId) ?? 1,
    );
  };

  const probeNavigationAfterShell = (
    context: Context,
    connection: RemoteConnection,
  ): void => {
    if (ownsMonitorForShellNavigationAudit(connection)) {
      host.probeNavigationAfterComputerUse(context, connection);
    }
  };

  const accessor = new RegistryResourceAccessor();
  accessor.register(shellStreamExecutorResource, {
    execute: (context: Context, args: ShellArgs, options) => (async function* () {
      guardAutoReviewBarrier();
      audit(context, "foreground", args.command);
      const connection = await connect(context);
      guardAutoReviewBarrier();
      await awaitShellNavigationBaseline(context, connection);
      guardAutoReviewBarrier();
      try {
        for await (const event of connection.remoteAccessor.get(shellStreamExecutorResource).execute(
          context,
          args,
          options,
        )) {
          // Watched before the tool answers: the wake is armed whatever the turn does next.
          if (event.event.case === "backgrounded") noteBackgrounded(context, args, event.event.value.shellId);
          yield event;
        }
      } finally {
        probeNavigationAfterShell(context, connection);
      }
    })(),
  } satisfies StreamExecutor<ShellArgs, ShellStream>);
  accessor.register(backgroundShellExecutorResource, {
    execute: async (
      context: Context,
      args: BackgroundShellSpawnArgs,
      options,
    ): Promise<BackgroundShellSpawnResult> => {
      guardAutoReviewBarrier();
      audit(context, "background", args.command);
      const connection = await connect(context);
      guardAutoReviewBarrier();
      await awaitShellNavigationBaseline(context, connection);
      guardAutoReviewBarrier();
      try {
        return await connection.remoteAccessor.get(backgroundShellExecutorResource).execute(
          context,
          args,
          options,
        );
      } finally {
        probeNavigationAfterShell(context, connection);
      }
    },
  } satisfies Executor<BackgroundShellSpawnArgs, BackgroundShellSpawnResult>);
  accessor.register(readExecutorResource, {
    execute: async (
      context: Context,
      args: ReadArgs,
      options,
    ): Promise<ReadResult> => {
      const connection = await connect(context);
      const result = await connection.remoteAccessor.get(readExecutorResource).execute(
        context,
        args,
        options,
      );
      if (host.onBackgroundShellSeenFinished !== undefined) {
        const finished = finishedTerminalRead(args, result, [connection.terminalsFolder, BOX_TERMINALS_FOLDER]);
        if (finished !== undefined) {
          try { host.onBackgroundShellSeenFinished(finished); } catch { /* the read is answered all the same */ }
        }
      }
      return result;
    },
  } satisfies Executor<ReadArgs, ReadResult>);
  accessor.register(shellExecutorResource, {
    execute: async (
      context: Context,
      args: ShellArgs,
      options,
    ): Promise<ShellResult> => {
      guardAutoReviewBarrier();
      const connection = await connect(context);
      guardAutoReviewBarrier();
      return await connection.remoteAccessor.get(shellExecutorResource).execute(
        context,
        args,
        options,
      );
    },
  } satisfies Executor<ShellArgs, ShellResult>);
  accessor.register(computerUseExecutorResource, {
    execute: async (
      context: Context,
      args: ComputerUseArgs,
      options,
    ): Promise<ComputerUseResult> => {
      const connection = await connect(context);
      let ownsMonitorForNavigationAudit = false;
      try {
        const inner = connection.remoteAccessor.get(computerUseExecutorResource);
        if (isNoMonitorComputerUseExecutor(inner)) {
          throw new SandBoxNoMonitorAvailableError();
        }
        ownsMonitorForNavigationAudit = true;
        const windowIndex = boxAgentWindowIndex(box, boxId) ?? 1;
        void host.computerUse.getOrCreateNavigationProbe()?.captureBaseline(
          context.withDetached(),
          connection.remoteAccessor,
          windowIndex,
        );
        await touchSandMonitorBusyLease(
          context,
          connection.remoteAccessor as ShellAccessor,
          windowIndex,
        );
        guardAutoReviewBarrier();
        const result = await inner.execute(context, args, options);
        host.computerUse.recordAuditIntent(args.actions[0]?.action.case);
        return result;
      } catch (error) {
        if (error instanceof SandBoxNoMonitorAvailableError) {
          connectionPromise = undefined;
          throw new SandBoxNotReadyError(boxNotReadyMessageForError(error), { cause: error });
        }
        throw error;
      } finally {
        if (ownsMonitorForNavigationAudit) {
          host.probeNavigationAfterComputerUse(context, connection);
        }
      }
    },
  } satisfies Executor<ComputerUseArgs, ComputerUseResult>);

  if (
    host.autoReviewClassifierExecutor !== undefined
    && Object.values(host.autoReviewGate.currentModes()).some(mode => mode !== "off")
  ) {
    accessor.register(
      smartModeClassifierExecutorResource,
      host.autoReviewClassifierExecutor,
    );
  }
  return accessor;
}
