import type { MessageBlock, ProductEvent, ThreadMessage, ThreadSnapshot } from "@rakazo/contracts";
import { upsertMessageById } from "./message-pages.js";
import { userVisibleMessages } from "./message-visibility.js";
import { ACTIVE_RUN_STATUSES, isActive } from "./run-state.js";

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
    // Theirs, from `message-pages.ts`. An earlier pass hand-rolled this.
    const messages = upsertMessageById(snapshot.messages, message);
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
 * The statuses that mean the person is being waited on rather than the agent
 * working. Both are in `ACTIVE_RUN_STATUSES`; the difference is who moves next.
 */
const HELD: ReadonlySet<string> = new Set(["waiting_input", "waiting_takeover"]);

/** Every run on the thread, whichever field the snapshot carries it in. */
function runsOf(snapshot: Pick<ThreadSnapshot, "run" | "activeRuns">) {
  return [...(snapshot.run ? [snapshot.run] : []), ...(snapshot.activeRuns ?? [])];
}

/**
 * Whether the agent is mid-task.
 *
 * **`isActive` is theirs** (`run-state.ts`), and it is why this function was
 * wrong before. An earlier pass here tested `status === "running"` by hand, so a
 * run that was `queued` or `leased` — which is what a run is for the first
 * moments after you press send — read as idle. The header showed nothing and
 * the sidebar did not say "Working" while the agent was working. Their list is
 * `queued, leased, running, waiting_input, waiting_takeover`, and the only
 * reason to read it any other way is the one below: waiting is not working.
 */
export function caisraWorking(snapshot: Pick<ThreadSnapshot, "run" | "activeRuns">): boolean {
  return runsOf(snapshot).some((run) => isActive(run.status) && !HELD.has(run.status));
}

/**
 * Whether the thread is waiting on the person.
 *
 * Not the same as working: nothing is happening until they answer, so the
 * header says "Waiting for you" instead of showing the dots. `waiting_takeover`
 * counts — the computer is asking for control, and that is also the person's
 * move.
 */
export function caisraWaiting(snapshot: Pick<ThreadSnapshot, "run" | "activeRuns">): boolean {
  return runsOf(snapshot).some((run) => HELD.has(run.status));
}

/**
 * The messages a person is meant to see.
 *
 * **Theirs** (`message-visibility.ts`). An earlier pass drew every message in
 * the snapshot, which would have put a peer run's whole working history into
 * the conversation. There is a rule for this and it was not ours to write.
 *
 * **`includePeerReceipts` is on, and that is a Caisra decision with a reason.**
 * Their option keeps `bot_message_sent` / `bot_message_received` as compact
 * chips while the peer's body stays hidden. The founder's 17 September
 * decision was that every agent posts its own results into the shared
 * conversation and each one speaks for itself — so *that* Comms took something
 * on from Yodo belongs on screen. Caisra already draws it the quiet way: a
 * centred grey line, not a bubble (`caisra-thread.ts`, the `system` row).
 * Turning the option off would hide the handoffs the design exists to show.
 */
export function caisraVisible<T extends { runId?: string; blocks: readonly MessageBlock[] }>(
  messages: readonly T[],
): T[] {
  return userVisibleMessages(messages, { includePeerReceipts: true });
}

/** Their list, re-exported so a caller can see what counts as active. */
export { ACTIVE_RUN_STATUSES };
