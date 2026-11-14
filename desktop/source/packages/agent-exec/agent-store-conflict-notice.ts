/**
 * The conflict notices of the agent's store. The requests here go to
 * whichever executor holds the notices: look for them (after a sync or
 * without one), mark them read, give them back, or note written paths whose
 * eager check was put off. The far side keeps no notices, so its executor
 * answers every request with nothing done.
 */
import { createResource } from "./resource-provider.js";

export interface Executor<Args = unknown, Result = unknown, Context = unknown, Options = unknown> {
  execute(ctx: Context, args: Args, options?: Options): Promise<Result>;
}

/** Whose notices are meant. */
type InConversation = { conversationId?: string };
type SyncRequest = InConversation & { writtenPaths?: readonly string[]; timeoutMs?: number; eager?: boolean };

/** The conversation as a request names it: its id when one was given (an empty one counts), nothing otherwise. */
function conversationOf(asked: InConversation | null | undefined): { conversationId?: string } {
  const id = asked?.conversationId;
  return id === undefined ? {} : { conversationId: id };
}

/** Syncs, then answers with the notices there are. Only what the caller gave is sent, and eagerness only when it is `true`. */
export function conflictNoticeSyncAndPeek(executor: Executor, ctx: unknown, args?: SyncRequest | null, options?: unknown): Promise<unknown> {
  const request: Record<string, unknown> = { op: "syncAndPeek", ...conversationOf(args) };
  if (args?.writtenPaths !== undefined) request.writtenPaths = args.writtenPaths;
  if (args?.timeoutMs !== undefined) request.timeoutMs = args.timeoutMs;
  if (args?.eager === true) request.eager = true;
  return executor.execute(ctx, request, options);
}

/** Answers with the notices there are, without a sync. */
export function conflictNoticePeek(executor: Executor, ctx: unknown, args?: InConversation | null, options?: unknown): Promise<unknown> {
  return executor.execute(ctx, { op: "peek", ...conversationOf(args) }, options);
}

/** Marks notices as read. With none to mark, nothing is asked. */
export async function conflictNoticeAck(executor: Executor, ctx: unknown, eventIds: readonly string[], args?: InConversation | null, options?: unknown): Promise<void> {
  if (eventIds.length === 0) return;
  await executor.execute(ctx, { op: "ack", eventIds, ...conversationOf(args) }, options);
}

/** Gives notices back, to be told again later. With none to give back, nothing is asked. */
export async function conflictNoticeRelease(executor: Executor, ctx: unknown, eventIds: readonly string[], args?: InConversation | null, options?: unknown): Promise<void> {
  if (eventIds.length === 0) return;
  await executor.execute(ctx, { op: "release", eventIds, ...conversationOf(args) }, options);
}

/** Notes the paths written whose eager check was put off. With no paths, nothing is asked. */
export async function conflictNoticeNoteDeferredEagerWrittenPaths(executor: Executor, ctx: unknown, writtenPaths: readonly string[], args?: InConversation | null, options?: unknown): Promise<void> {
  if (writtenPaths.length === 0) return;
  await executor.execute(ctx, { op: "noteDeferredEagerWrittenPaths", writtenPaths, ...conversationOf(args) }, options);
}

/** What the far side says it did, for the requests that change something. */
const NOTHING_DONE: ReadonlyMap<unknown, string> = new Map<unknown, string>([
  ["ack", "acked"],
  ["release", "released"],
  ["noteDeferredEagerWrittenPaths", "noted"],
]);

/** The far side's executor: it has no notices, so it did nothing to none, and has none to show. */
export class RemoteAgentStoreConflictNoticeStub implements Executor<Record<string, unknown>, Record<string, unknown>> {
  async execute(_ctx: unknown, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const did = NOTHING_DONE.get(args.op);
    return did === undefined ? { kind: "not-applicable" } : { kind: did, count: 0 };
  }
}

export const agentStoreConflictNoticeExecutorResource = createResource(
  (_remote: unknown) => new RemoteAgentStoreConflictNoticeStub(),
  // Nothing is registered on the working side.
  (_implementation: RemoteAgentStoreConflictNoticeStub, _controlled: unknown) => {},
);
