import { describe, expect, test } from 'vitest';

import type { RosterOption } from '../../../shared/staffing/roster';
import { addThird, canStandUp, justTwo, rosterItem, rosterRequestId, spareAlternates, swapRow } from './rosterCards';
import { ThreadItemKind } from './types';

const row = (slug: string): RosterOption => ({ slug, name: slug, label: 'lane', job: 'job', antiJob: "won't" });
const a = row('a');
const b = row('b');
const c = row('c');
const d = row('d');
const e = row('e');

describe('the roster card as a thread item', () => {
  test('is its own kind, marked so the answer goes to the staffing bridge', () => {
    const item = rosterItem({ requestId: 'req-1', workType: 'Finance', team: [a, b], alternates: [c, d] }, 5);
    expect(item.kind).toBe(ThreadItemKind.Roster);
    expect(item.id).toBe('roster:req-1');
    expect(rosterRequestId(item.id)).toBe('req-1');
    expect(rosterRequestId('staff:req-1')).toBeUndefined();
  });
});

describe('what the buttons do', () => {
  test('Swap one keeps the row\'s place', () => {
    expect(swapRow([a, b, c], 'b', d).map(one => one.slug)).toEqual(['a', 'd', 'c']);
  });

  test('the alternates offered are the ones not on the card', () => {
    expect(spareAlternates([a, d], [c, d, e]).map(one => one.slug)).toEqual(['c', 'e']);
  });

  test('Just two drops an unchecked row first, else the last', () => {
    expect(justTwo([a, b, c], new Set(['a', 'c'])).map(one => one.slug)).toEqual(['a', 'c']);
    expect(justTwo([a, b, c], new Set(['a', 'b', 'c'])).map(one => one.slug)).toEqual(['a', 'b']);
    expect(justTwo([a, b], new Set(['a', 'b'])).map(one => one.slug)).toEqual(['a', 'b']);
  });

  test('Add a third takes the first spare alternate, and never a fourth', () => {
    expect(addThird([a, b], [b, c, d]).map(one => one.slug)).toEqual(['a', 'b', 'c']);
    expect(addThird([a, b, c], [d]).map(one => one.slug)).toEqual(['a', 'b', 'c']);
    expect(addThird([a, b], [a, b]).map(one => one.slug)).toEqual(['a', 'b']);
  });

  test('Stand them up needs two or three checked', () => {
    expect(canStandUp(new Set(['a']))).toBe(false);
    expect(canStandUp(new Set(['a', 'b']))).toBe(true);
    expect(canStandUp(new Set(['a', 'b', 'c']))).toBe(true);
    expect(canStandUp(new Set(['a', 'b', 'c', 'd']))).toBe(false);
  });
});
