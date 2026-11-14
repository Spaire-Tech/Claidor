/**
 * The background work of an agent (a shell left running, a subagent) and
 * the wakeups such work leaves for a conversation, kept in memory.
 *
 * The work is a list of records by id, which can be listed, asked about and
 * aborted. The wakeups are a queue: one waits until its conversation pulls
 * it, and is then held until it is acknowledged or refused. A completion is
 * a wakeup for the conversation called "local".
 */
import { mergeWakeup, type Wakeup } from "./wakeup/index.js";

/** One piece of background work. `abort`, where there is one, stops it. */
interface BackgroundWorkRecord {
  id: string;
  kind: string;
  state: string;
  ownerId?: string | undefined;
  abort?: (() => void) | undefined;
  metadata?: unknown;
}

/** What to keep of the work: only records whose kind, state and owner are the ones named. */
interface BackgroundWorkFilter {
  kind?: string | undefined;
  state?: string | undefined;
  ownerId?: string | undefined;
}

/** A record as it is listed: its `abort` is told only as there or not. */
interface BackgroundWorkSnapshot {
  id: string;
  kind: string;
  state: string;
  ownerId?: string | undefined;
  hasAbort: boolean;
  metadata?: unknown;
}

/** Work that has ended, as it is announced. */
interface BackgroundCompletion {
  taskId: string;
  kind: string;
  [key: string]: unknown;
}

/** A wakeup as this registry queues it: what it carries, and what it came from. */
interface LocalWakeup extends Wakeup {
  payload: unknown;
  source?: string | undefined;
}

/** What a filter can ask of a record. */
const FILTERED_FIELDS = ["kind", "state", "ownerId"] as const;

/** Whether a filter keeps a record. No filter keeps everything, and a name left out or empty asks nothing. */
function keeps(filter: BackgroundWorkFilter | undefined, record: BackgroundWorkRecord): boolean {
  if (!filter) {
    return true;
  }
  return FILTERED_FIELDS.every((field) => !filter[field] || record[field] === filter[field]);
}

/** Stops a piece of work that can be stopped. `abort` is called as the record's own. */
function stop(record: BackgroundWorkRecord): void {
  if (record.abort) {
    record.abort();
  }
}

function snapshotOf(record: BackgroundWorkRecord): BackgroundWorkSnapshot {
  return {
    id: record.id,
    kind: record.kind,
    state: record.state,
    ownerId: record.ownerId,
    hasAbort: Boolean(record.abort),
    metadata: record.metadata,
  };
}

/** What a wakeup is remembered by while it waits or is held: its conversation and its id, as one text. */
function markOf(conversationId: string, id: string): string {
  return `${conversationId}\0${id}`;
}

/**
 * The wakeups of every conversation, oldest first.
 *
 * A wakeup waits until its conversation pulls it. From then on it is held,
 * out of the queue, until it is acknowledged (and gone) or refused (dropped,
 * or put back in front). As long as it waits or is held, a second wakeup of
 * the same conversation and id is not taken. An id can also be turned away
 * for a conversation altogether.
 */
class WakeupQueue {
  /** What waits. */
  private waiting: LocalWakeup[] = [];
  /** What was pulled and is neither acknowledged nor refused yet, by id alone, in the order pulled. */
  private readonly held = new Map<string, LocalWakeup>();
  /** The marks of the wakeups that wait or are held. */
  private readonly taken = new Set<string>();
  /** The ids turned away, by conversation. */
  private readonly turnedAway = new Map<string, Set<string>>();
  /** How many times what waits has changed. */
  private changes = 0;

  /** Lets a wakeup that no longer waits nor is held be taken again. */
  private release(wakeup: LocalWakeup): void {
    this.taken.delete(markOf(wakeup.conversationId, wakeup.id));
  }

  /**
   * Takes a wakeup in, under its id without the spaces around it. Dropped
   * without a word: one with no id, one that already waits or is held, and
   * one whose id is turned away for its conversation.
   */
  add(wakeup: LocalWakeup): void {
    const id = wakeup.id.trim();
    const mark = markOf(wakeup.conversationId, id);
    if (id.length === 0 || this.taken.has(mark)) {
      return;
    }
    if (this.turnedAway.get(wakeup.conversationId)?.has(id)) {
      return;
    }
    this.taken.add(mark);
    const merged = mergeWakeup(this.waiting, { ...wakeup, id });
    this.waiting = merged.queue;
    // The wakeup of its group that it took the place of is gone.
    if (merged.replaced) {
      this.release(merged.replaced);
    }
    this.changes += 1;
  }

  /** Hands over what waits for a conversation, as copies, and holds it from now on. */
  pull(conversationId: string): LocalWakeup[] {
    const pulled = this.waiting.filter((wakeup) => wakeup.conversationId === conversationId);
    if (pulled.length === 0) {
      return [];
    }
    this.waiting = this.waiting.filter((wakeup) => wakeup.conversationId !== conversationId);
    for (const wakeup of pulled) {
      this.held.set(wakeup.id, wakeup);
    }
    this.changes += 1;
    return pulled.map((wakeup) => ({ ...wakeup }));
  }

  /** Pulls for every conversation that has something waiting, in the order each first appears in the queue. */
  pullAll(): LocalWakeup[] {
    const conversations = new Set(this.waiting.map((wakeup) => wakeup.conversationId));
    return [...conversations].flatMap((conversationId) => this.pull(conversationId));
  }

  /** Lets go of held wakeups for good, and hands them back in the order asked. Ids that are not held are passed over. */
  ack(ids: readonly string[]): LocalWakeup[] {
    const acknowledged: LocalWakeup[] = [];
    for (const given of ids) {
      const id = given.trim();
      const wakeup = this.held.get(id);
      if (wakeup === undefined) {
        continue;
      }
      this.held.delete(id);
      this.taken.delete(markOf(wakeup.conversationId, id));
      acknowledged.push(wakeup);
    }
    return acknowledged;
  }

  /**
   * Refuses held wakeups. Without `requeue` they are dropped. With it they
   * go back in front of everything that waits, in the order they were
   * pulled; what waited is merged in behind them, so a newer wakeup of a
   * group still takes the place of an older one put back.
   */
  nack(ids: readonly string[], opts: { requeue: boolean }): void {
    const asked = new Set(ids.map((id) => id.trim()));
    const refused: LocalWakeup[] = [];
    for (const [id, wakeup] of this.held) {
      if (asked.has(id)) {
        refused.push(wakeup);
        this.held.delete(id);
      }
    }
    if (!opts.requeue) {
      for (const wakeup of refused) {
        this.release(wakeup);
      }
      return;
    }
    if (refused.length === 0) {
      return;
    }
    let queue = refused;
    for (const wakeup of this.waiting) {
      const merged = mergeWakeup(queue, wakeup);
      queue = merged.queue;
      if (merged.replaced) {
        this.release(merged.replaced);
      }
    }
    this.waiting = queue;
    this.changes += 1;
  }

  /** Turns an id away for a conversation: its wakeup is dropped if it waits or is held, and none is taken from now on. */
  turnAway(conversationId: string, givenId: string): void {
    const id = givenId.trim();
    if (id.length === 0) {
      return;
    }
    const ids = this.turnedAway.get(conversationId) ?? new Set<string>();
    ids.add(id);
    this.turnedAway.set(conversationId, ids);

    const stillWaiting = this.waiting.filter((wakeup) => wakeup.conversationId !== conversationId || wakeup.id !== id);
    const waited = stillWaiting.length !== this.waiting.length;
    this.waiting = stillWaiting;

    // What is held is known by id alone: the held one is dropped only if it is this conversation's.
    const heldNow = this.held.get(id);
    const wasHeld = heldNow !== undefined && heldNow.conversationId === conversationId;
    if (wasHeld) {
      this.held.delete(id);
    }

    if (waited || wasHeld) {
      this.taken.delete(markOf(conversationId, id));
      this.changes += 1;
    }
  }

  /** Takes an id's wakeups again, in every conversation that turned it away. */
  takeAgain(givenId: string): void {
    const id = givenId.trim();
    for (const [conversationId, ids] of this.turnedAway) {
      if (ids.delete(id) && ids.size === 0) {
        this.turnedAway.delete(conversationId);
      }
    }
  }

  /** Whether anything waits: for the conversation named, or for any when none is. */
  waits(conversationId?: string): boolean {
    if (conversationId === undefined) {
      return this.waiting.length > 0;
    }
    return this.waiting.some((wakeup) => wakeup.conversationId === conversationId);
  }

  changeCount(): number {
    return this.changes;
  }
}

/** The conversation that wakeups go to when the work that leaves them names none. */
export const LEGACY_LOCAL_WAKEUP_CONVERSATION_ID = "local";

export class InMemoryBackgroundWorkRegistry {
  private readonly records = new Map<string, BackgroundWorkRecord>();
  private readonly wakeups = new WakeupQueue();

  /** Keeps a record under its id, in the place of an earlier one of that id. The record itself is kept, not a copy. */
  upsertWork(record: BackgroundWorkRecord): void {
    this.records.set(record.id, record);
  }

  /** Forgets a record without stopping its work. Its id is no longer turned away as a wakeup, whether or not there was a record. */
  clearWork(id: string): boolean {
    const wasThere = this.records.delete(id);
    this.wakeups.takeAgain(id);
    return wasThere;
  }

  /** Stops a piece of work and forgets it. Answers false, and does nothing, when there is no such work. */
  abortWork(id: string): boolean {
    const record = this.records.get(id);
    if (!record) {
      return false;
    }
    stop(record);
    this.records.delete(id);
    this.wakeups.takeAgain(id);
    return true;
  }

  hasRunningWork(filter?: BackgroundWorkFilter): boolean {
    for (const record of this.records.values()) {
      if (record.state === "running" && keeps(filter, record)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Stops and forgets every piece of work the filter keeps, and says how
   * many. It goes through the work that is there when it starts, and asks
   * the filter of each record when its turn comes.
   */
  abortAllWork(filter?: BackgroundWorkFilter): number {
    let aborted = 0;
    for (const record of [...this.records.values()]) {
      if (!keeps(filter, record)) {
        continue;
      }
      stop(record);
      aborted += 1;
      this.records.delete(record.id);
      this.wakeups.takeAgain(record.id);
    }
    return aborted;
  }

  listWork(filter?: BackgroundWorkFilter): BackgroundWorkSnapshot[] {
    const listed: BackgroundWorkSnapshot[] = [];
    for (const record of this.records.values()) {
      if (keeps(filter, record)) {
        listed.push(snapshotOf(record));
      }
    }
    return listed;
  }

  enqueue(wakeup: LocalWakeup): void {
    this.wakeups.add(wakeup);
  }

  pull(conversationId: string): LocalWakeup[] {
    return this.wakeups.pull(conversationId);
  }

  ack(ids: readonly string[]): LocalWakeup[] {
    return this.wakeups.ack(ids);
  }

  nack(ids: readonly string[], opts: { requeue: boolean }): void {
    this.wakeups.nack(ids, opts);
  }

  suppress(conversationId: string, id: string): void {
    this.wakeups.turnAway(conversationId, id);
  }

  /** Announces work that has ended: a wakeup for the local conversation, under the task's id. */
  enqueueCompletion(item: BackgroundCompletion): void {
    this.enqueue({
      conversationId: LEGACY_LOCAL_WAKEUP_CONVERSATION_ID,
      id: item.taskId,
      payload: item,
      source: item.kind,
    });
  }

  /** Pulls everything that waits, in every conversation, acknowledges it at once and hands over what it carried. */
  drainCompletions(): unknown[] {
    const pulled = this.wakeups.pullAll();
    this.ack(pulled.map((wakeup) => wakeup.id));
    return pulled.map((wakeup) => wakeup.payload);
  }

  hasPendingCompletions(conversationId?: string): boolean {
    return this.wakeups.waits(conversationId);
  }

  /** A completion someone already waits for needs no wakeup: its task's id is turned away for the local conversation. */
  markAwaitedCompletion(taskId: string): void {
    this.suppress(LEGACY_LOCAL_WAKEUP_CONVERSATION_ID, taskId);
  }

  getWakeupRevision(): number {
    return this.wakeups.changeCount();
  }
}
