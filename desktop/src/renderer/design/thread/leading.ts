import { type ThreadItem, ThreadItemKind } from './types';

/**
 * Whether a bubble starts a turn, and so wants 8px above it.
 *
 * The canvas, verbatim:
 *
 *     const pad = prev && prev.role !== m.role ? " padding-top:8px;" : "";
 *
 * Two consequences worth keeping, because both are what makes a reply
 * read as one thing rather than three:
 *
 *  - The first item in a thread gets nothing. `prev &&` says so.
 *  - Consecutive bubbles from the same speaker sit at the list's own 10px
 *    gap. Only the change of speaker is marked.
 *
 * A status, a system line and an approval card carry their own spacing,
 * so they have no role — which means a bubble after one of them is
 * starting a turn, and does get the space. That is the canvas's behaviour
 * too, and it is right: the shimmer ended, somebody is speaking again.
 */

const speakerOf = (item: ThreadItem | undefined): string | undefined =>
  item?.kind === ThreadItemKind.Text ? item.from : undefined;

export function startsTurn(previous: ThreadItem | undefined, item: ThreadItem): boolean {
  if (item.kind !== ThreadItemKind.Text) return false;
  if (!previous) return false;
  return speakerOf(previous) !== speakerOf(item);
}
