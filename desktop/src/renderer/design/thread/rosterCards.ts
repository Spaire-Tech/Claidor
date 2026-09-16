import { ROSTER_LIMITS,type RosterAsk, type RosterOption } from '../../../shared/staffing/roster';
import { type RosterItem, ThreadItemKind } from './types';

/**
 * The roster card's arithmetic, pure, so what Swap one, Just two and Add
 * a third do is tested without a window. The founder's page, §5 beat B:
 * exactly two or three, never the full twenty-three.
 */

const ROSTER_ID_PREFIX = 'roster:';

export const rosterItemId = (requestId: string): string => `${ROSTER_ID_PREFIX}${requestId}`;

export const rosterRequestId = (itemId: string): string | undefined =>
  itemId.startsWith(ROSTER_ID_PREFIX) ? itemId.slice(ROSTER_ID_PREFIX.length) : undefined;

export function rosterItem(ask: RosterAsk, at: number): RosterItem {
  return {
    kind: ThreadItemKind.Roster,
    id: rosterItemId(ask.requestId),
    workType: ask.workType,
    team: ask.team,
    alternates: ask.alternates,
    at,
  };
}

/** The alternates not on the card right now, for Swap one and Add a third. */
export function spareAlternates(rows: readonly RosterOption[], alternates: readonly RosterOption[]): RosterOption[] {
  const onCard = new Set(rows.map(one => one.slug));
  return alternates.filter(one => !onCard.has(one.slug));
}

/** Swap one: the row keeps its place, the alternate takes it. */
export function swapRow(rows: readonly RosterOption[], slug: string, replacement: RosterOption): RosterOption[] {
  return rows.map(one => (one.slug === slug ? replacement : one));
}

/** Just two: an unchecked row goes first; otherwise the last one. */
export function justTwo(rows: readonly RosterOption[], checked: ReadonlySet<string>): RosterOption[] {
  if (rows.length <= ROSTER_LIMITS.min) return [...rows];
  const drop = rows.find(one => !checked.has(one.slug)) ?? rows[rows.length - 1];
  return rows.filter(one => one !== drop);
}

/** Add a third: the first spare alternate joins, checked by the caller. */
export function addThird(rows: readonly RosterOption[], alternates: readonly RosterOption[]): RosterOption[] {
  if (rows.length >= ROSTER_LIMITS.max) return [...rows];
  const next = spareAlternates(rows, alternates)[0];
  return next ? [...rows, next] : [...rows];
}

/** Stand them up is pressable with two or three checked. */
export function canStandUp(checked: ReadonlySet<string>): boolean {
  return checked.size >= ROSTER_LIMITS.min && checked.size <= ROSTER_LIMITS.max;
}
