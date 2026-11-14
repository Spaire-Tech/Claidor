/**
 * A wakeup is a note left for a conversation, to be handed to it later. It
 * is known by its conversation and its id. A wakeup may also belong to a
 * group: of one group, a conversation's queue holds only the latest.
 */
export interface Wakeup {
  conversationId: string;
  id: string;
  groupKey?: string;
  [key: string]: unknown;
}

/**
 * The queue with `incoming` taken in. The queue given is never changed: the
 * answer holds a new one.
 *
 * - A wakeup already queued for the same conversation under the same id
 *   adds nothing.
 * - A wakeup of a group takes the place of the queued one of that group in
 *   its conversation (the first, should there be several), and that one is
 *   handed back as `replaced`.
 * - Any other wakeup goes to the end.
 *
 * What goes into the queue is a copy of `incoming`. Having no group means
 * `groupKey` is undefined: every other value is a group.
 */
export function mergeWakeup<T extends Wakeup>(queue: readonly T[], incoming: T): { queue: T[]; replaced?: T } {
  const inItsConversation = (queued: T): boolean => queued.conversationId === incoming.conversationId;

  if (queue.some((queued) => inItsConversation(queued) && queued.id === incoming.id)) {
    return { queue: [...queue] };
  }

  const copy = { ...incoming };
  const place = incoming.groupKey === undefined ? -1 : queue.findIndex((queued) => inItsConversation(queued) && queued.groupKey === incoming.groupKey);
  if (place === -1) {
    return { queue: [...queue, copy] };
  }

  const merged = [...queue];
  const replaced = merged[place];
  merged[place] = copy;
  // A place that was found and holds nothing by now has nothing to hand back.
  return replaced === undefined ? { queue: merged } : { queue: merged, replaced };
}
