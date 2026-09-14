import { type ThreadItem, ThreadItemKind } from './types';

/**
 * Finding something in this conversation.
 *
 * The header's magnifier searches the conversation you are in, not every
 * conversation — the sidebar already searches by agent name, and upstream
 * has a separate modal for searching across sessions. One box per
 * question, so neither has to explain itself.
 *
 * Only things that were said are searchable. A status line is the app
 * narrating, and matching "running commands" would be the app finding
 * itself.
 */

const searchable = (item: ThreadItem): string => {
  switch (item.kind) {
    case ThreadItemKind.Text:
    case ThreadItemKind.System:
      return item.text;
    default:
      return '';
  }
};

export interface ThreadMatches {
  /** The ids that matched, in the order they appear. */
  ids: string[];
  /** How many, for "3 of 11". */
  count: number;
}

export function findInThread(items: readonly ThreadItem[], query: string): ThreadMatches {
  const needle = query.trim().toLowerCase();
  if (!needle) return { ids: [], count: 0 };
  const ids = items
    .filter(item => searchable(item).toLowerCase().includes(needle))
    .map(item => item.id);
  return { ids, count: ids.length };
}

/**
 * Which match is current, wrapping at both ends.
 *
 * Wrapping rather than stopping: somebody pressing Enter to walk a list
 * should not have to notice they reached the end of it.
 */
export function stepMatch(count: number, current: number, by: 1 | -1): number {
  if (count <= 0) return 0;
  return ((current + by) % count + count) % count;
}

/** "3 of 11", or "No matches", or empty when nothing has been typed. */
export function matchLabel(query: string, count: number, current: number): string {
  if (!query.trim()) return '';
  if (count === 0) return 'No matches';
  return `${current + 1} of ${count}`;
}
