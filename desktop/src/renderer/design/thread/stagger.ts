import { Speaker, type ThreadItem, ThreadItemKind } from './types';

/**
 * Bubbles arriving one after another, the way a person texts.
 *
 * `toThreadItems` already splits a reply into up to three bubbles. Without
 * this they all appear in the same frame, which reads as a memo that
 * happens to have gaps in it. The canvas pushed them 420 ms apart; the
 * founder, having watched it: *"i dont want the second to IMMEDIATELY
 * come. i want a bit of realism. so 1 second might be good between it."*
 * That spacing is most of why the app feels like Messages rather than a
 * chat box.
 *
 * The trap this exists to avoid: opening a conversation with two hundred
 * messages in it must not replay them. So the question is never "is this
 * a bubble" but "did this bubble just arrive", which is why every
 * function here takes the ids that were already on screen.
 */

/** The founder's number, 15 September. The canvas had 420. */
export const BUBBLE_GAP_MS = 1000;

const isAgentBubble = (item: ThreadItem): boolean =>
  item.kind === ThreadItemKind.Text && item.from === Speaker.Agent;

/**
 * How long each item should be held back, in milliseconds.
 *
 * Only newly-arrived agent bubbles are delayed, and only by their place
 * within the run of new bubbles they arrived in — so the first of a reply
 * is immediate and the rest follow. Anything already on screen, anything
 * said before `since` (when the conversation was opened), anything the
 * person said, and every card and status line is immediate: a question
 * waiting for an answer is not something to stage.
 */
export function staggerDelays(
  items: readonly ThreadItem[],
  seen: ReadonlySet<string>,
  since = 0,
): Map<string, number> {
  const delays = new Map<string, number>();
  let position = 0;

  for (const item of items) {
    if (seen.has(item.id)) continue;
    // Said before this conversation was opened: history, however late it
    // loads. A conversation's messages arrive a beat after the click that
    // opens it, so "not seen yet" alone would stage every reply in it.
    if (item.at < since) continue;
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

/** What a sidebar row said last, and when. */
export interface RowText {
  preview: string;
  when: string;
}

/**
 * The rows while the open conversation's reply is still landing.
 *
 * The row under an agent's name shows the reply's last line the moment
 * the reply is final; the thread paces the bubbles a second apart. So
 * for a three-bubble reply the row was two seconds ahead of the thread,
 * and the founder asked for the row to wait for the last bubble too.
 * While bubbles are held, the active row keeps saying what it said
 * before the reply — `settled`, captured by the caller the last time
 * nothing was held. Other rows are untouched: nobody is watching those
 * threads, and their replies are not staged.
 */
export function rowsWhileLanding<Row extends { id: string } & RowText>(
  rows: readonly Row[],
  activeId: string,
  landing: boolean,
  settled: RowText | undefined,
): readonly Row[] {
  if (!landing || !settled) return rows;
  return rows.map(row => (row.id === activeId ? { ...row, preview: settled.preview, when: settled.when } : row));
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
