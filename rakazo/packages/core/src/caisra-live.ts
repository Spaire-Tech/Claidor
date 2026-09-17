import type { MessageBlock, ProductEvent, ThreadMessage, ThreadSnapshot } from "@rakazo/contracts";

/**
 * The live thread, reduced to what Caisra draws.
 *
 * **Why this is not `apps/web/src/lib/thread-events.ts`.** Theirs is 639 lines
 * and it is the fuller reduction: peer receipts, subagent detail, search jumps,
 * history pagination, the computer panel's status. It also lives inside their
 * app rather than in a package, so calling it would mean either copying it —
 * duplicate logic that rots — or importing across apps, which puts their file
 * in our merge surface. This covers the events Caisra's conversation actually
 * draws, and it is built out of the same `@rakazo/core` primitives theirs is.
 *
 * **What happens when an event is not one of those.** Nothing is guessed. The
 * reducer says `refetch` and the caller asks the server for the snapshot again.
 * An extra fetch is the cost; a thread quietly out of date is not a cost anyone
 * would notice until it mattered. That is the whole reason this file can be
 * short and still be right.
 */

/** What the reducer decided: a new snapshot, nothing to do, or go and ask. */
export const LiveOutcome = {
  /** The snapshot changed; draw it. */
  Changed: "changed",
  /** The event says nothing about what we draw. */
  Ignored: "ignored",
  /** We do not know what this means. Ask the server for the thread again. */
  Refetch: "refetch",
} as const;
export type LiveOutcome = (typeof LiveOutcome)[keyof typeof LiveOutcome];

export interface LiveResult {
  outcome: LiveOutcome;
  snapshot: ThreadSnapshot;
}

/**
 * Events that carry a message.
 *
 * Taken from `ProductEventType` in their contract rather than guessed. An
 * earlier pass here invented `thread.message.blocks`, which does not exist:
 * the compiler caught it because the enum is closed, which is the good kind
 * of failure.
 */
const MESSAGE_EVENTS: ReadonlySet<ProductEvent["type"]> = new Set([
  "thread.message.created",
  "thread.message.updated",
]);

/** Events that move the run along and change no message. */
const RUN_EVENTS: ReadonlySet<ProductEvent["type"]> = new Set([
  "run.started",
  "run.checkpointed",
  "run.waiting_input",
  "run.completed",
  "run.failed",
  "run.cancelled",
]);

/**
 * Events that carry nothing this conversation draws.
 *
 * The computer ones belong to the panel, which reads the snapshot's own
 * `computer`; the rest are bookkeeping. Each is listed rather than caught by a
 * prefix, so a new one they add lands in `refetch` and not in silence.
 */
const NOT_OURS: ReadonlySet<ProductEvent["type"]> = new Set([
  "thread.message.reaction",
  "thread.meta",
  "computer.status",
  "computer.takeover.requested",
  "computer.takeover.granted",
  "computer.takeover.released",
  "memory.revised",
  "effect.recorded",
  "effect.reconciled",
  "usage.recorded",
  "agent.tool.called",
  "agent.tool.completed",
]);

/** A message out of an event payload, or nothing when the payload is not one. */
function messageOf(event: ProductEvent): ThreadMessage | undefined {
  const payload = event.payload as Partial<ThreadMessage> & { blocks?: unknown };
  if (typeof payload.id !== "string" || !Array.isArray(payload.blocks)) return undefined;
  return {
    id: payload.id,
    threadId: event.threadId,
    seq: event.seq,
    role: payload.role ?? "bot",
    blocks: payload.blocks as MessageBlock[],
    ...(payload.botId ? { botId: payload.botId } : { botId: event.botId }),
    ...(event.runId ? { runId: event.runId } : {}),
    createdAt: payload.createdAt ?? event.createdAt,
  } as ThreadMessage;
}

/**
 * One event against the snapshot.
 *
 * The snapshot is never mutated: a changed one is a new object, so React sees
 * it and an unchanged one costs no render.
 */
export function caisraApplyEvent(snapshot: ThreadSnapshot, event: ProductEvent): LiveResult {
  // An event from another thread is not ours to apply. It is not unknown
  // either, so it does not earn a refetch.
  if (event.threadId !== snapshot.threadId) return { outcome: LiveOutcome.Ignored, snapshot };
  // Already folded in. The stream replays from a cursor on reconnect, so this
  // is the ordinary case rather than an error.
  if (event.seq <= snapshot.cursor) return { outcome: LiveOutcome.Ignored, snapshot };

  const cursor = Math.max(snapshot.cursor, event.seq);

  if (MESSAGE_EVENTS.has(event.type)) {
    const message = messageOf(event);
    if (!message) return { outcome: LiveOutcome.Refetch, snapshot };
    const at = snapshot.messages.findIndex((one) => one.id === message.id);
    const messages =
      at === -1
        ? [...snapshot.messages, message]
        : snapshot.messages.map((one, index) => (index === at ? { ...one, ...message } : one));
    return { outcome: LiveOutcome.Changed, snapshot: { ...snapshot, cursor, messages } };
  }

  if (RUN_EVENTS.has(event.type)) {
    // Only the cursor moves here. Whether the agent is working is read off the
    // snapshot's own `run`, which the next refresh brings, and in the meantime
    // the thread shows what it last knew rather than flickering.
    return { outcome: LiveOutcome.Changed, snapshot: { ...snapshot, cursor } };
  }

  if (NOT_OURS.has(event.type)) {
    return { outcome: LiveOutcome.Changed, snapshot: { ...snapshot, cursor } };
  }

  // `thread.cleared`, `bot.spawned`, `bot.archived`, anything they add later.
  // We do not know; we ask.
  return { outcome: LiveOutcome.Refetch, snapshot };
}

/**
 * Whether the agent is mid-task, from the snapshot the server gave.
 *
 * Their `Run` carries a status; a thread with a running one is a thread whose
 * agent is working, which is the word the sidebar shows and the dots in the
 * header mean.
 */
export function caisraWorking(snapshot: Pick<ThreadSnapshot, "run" | "activeRuns">): boolean {
  if (snapshot.run?.status === "running") return true;
  return (snapshot.activeRuns ?? []).some((run) => run.status === "running");
}

/**
 * Whether a card is waiting on the person.
 *
 * Not the same as working: nothing is happening until they answer, so the
 * header says "Waiting for you" instead of showing the dots.
 */
export function caisraWaiting(snapshot: Pick<ThreadSnapshot, "run" | "activeRuns">): boolean {
  const waiting = (status: string | undefined) => status === "waiting_input";
  if (waiting(snapshot.run?.status)) return true;
  return (snapshot.activeRuns ?? []).some((run) => waiting(run.status));
}
