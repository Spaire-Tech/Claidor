import { Speaker, type ThreadItem, ThreadItemKind } from './types';

/**
 * Bubbles arriving one after another, the way a person texts.
 *
 * `toThreadItems` already splits a reply into up to three bubbles. Without
 * this they all appear in the same frame, which reads as a memo that
 * happens to have gaps in it. The canvas pushes them 420 ms apart, and
 * that spacing is most of why the app feels like Messages rather than a
 * chat box.
 *
 * The trap this exists to avoid: opening a conversation with two hundred
 * messages in it must not replay them. So the question is never "is this
 * a bubble" but "did this bubble just arrive", which is why every
 * function here takes the ids that were already on screen.
 */

/** The canvas's number. */
export const BUBBLE_GAP_MS = 420;

const isAgentBubble = (item: ThreadItem): boolean =>
  item.kind === ThreadItemKind.Text && item.from === Speaker.Agent;

/**
 * How long each item should be held back, in milliseconds.
 *
 * Only newly-arrived agent bubbles are delayed, and only by their place
 * within the run of new bubbles they arrived in — so the first of a reply
 * is immediate and the rest follow. Anything already on screen, anything
 * the person said, and every card and status line is immediate: a
 * question waiting for an answer is not something to stage.
 */
export function staggerDelays(
  items: readonly ThreadItem[],
  seen: ReadonlySet<string>,
): Map<string, number> {
  const delays = new Map<string, number>();
  let position = 0;

  for (const item of items) {
    if (seen.has(item.id)) continue;
    if (!isAgentBubble(item)) {
      // A status, a card, or something the person said resets the run:
      // the next reply is a new reply, not a continuation of this one.
      position = 0;
      continue;
    }
    if (position > 0) delays.set(item.id, position * BUBBLE_GAP_MS);
    position += 1;
  }

  return delays;
}

/**
 * The items to draw right now: everything except bubbles still waiting.
 *
 * Order is preserved, so a held-back bubble does not appear above one
 * that arrived after it.
 */
export function visibleItems(
  items: readonly ThreadItem[],
  held: ReadonlySet<string>,
): ThreadItem[] {
  return items.filter(item => !held.has(item.id));
}

/**
 * Whether to stage at all.
 *
 * Somebody who has asked their computer to stop animating things wants
 * the words, not the performance.
 */
export function prefersInstant(): boolean {
  return typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
