import { describe, expect, test } from 'vitest';

import { BUBBLE_GAP_MS, staggerDelays, visibleItems } from './stagger';
import { Speaker, type ThreadItem, ThreadItemKind } from './types';

const bubble = (id: string, from: Speaker = Speaker.Agent): ThreadItem => ({
  kind: ThreadItemKind.Text, id, from, text: id, at: 0,
});
const status = (id: string): ThreadItem => ({
  kind: ThreadItemKind.Status, id, verb: 'Reading', at: 0,
});
const auth = (id: string): ThreadItem => ({
  kind: ThreadItemKind.Auth, id, text: 'Allow?', at: 0,
});

const none = new Set<string>();
const seen = (...ids: string[]): Set<string> => new Set(ids);

describe('staggering a reply', () => {
  test('the first bubble is immediate and the rest follow 420ms apart', () => {
    const delays = staggerDelays([bubble('r:0'), bubble('r:1'), bubble('r:2')], none);
    expect(delays.get('r:0')).toBeUndefined();
    expect(delays.get('r:1')).toBe(BUBBLE_GAP_MS);
    expect(delays.get('r:2')).toBe(BUBBLE_GAP_MS * 2);
  });

  test('never replays history', () => {
    // The one that matters. Opening a conversation with a long history
    // must show it, not perform it — this is why every function here
    // takes the ids that were already on screen.
    const history = [bubble('a:0'), bubble('a:1'), bubble('b:0'), bubble('b:1')];
    expect(staggerDelays(history, seen('a:0', 'a:1', 'b:0', 'b:1')).size).toBe(0);
  });

  test('stages only what is new, counting from the new one', () => {
    const items = [bubble('old:0'), bubble('old:1'), bubble('new:0'), bubble('new:1')];
    const delays = staggerDelays(items, seen('old:0', 'old:1'));
    expect(delays.get('new:0')).toBeUndefined();
    expect(delays.get('new:1')).toBe(BUBBLE_GAP_MS);
  });

  test('what the person said is never held back', () => {
    const delays = staggerDelays([bubble('me', Speaker.Person)], none);
    expect(delays.size).toBe(0);
  });

  test('a card is never held back, and it ends the run', () => {
    // A question waiting for an answer is not something to stage, and the
    // reply after it is a new reply rather than the tail of the last one.
    const delays = staggerDelays([bubble('r:0'), auth('auth:1'), bubble('s:0')], none);
    expect(delays.has('auth:1')).toBe(false);
    expect(delays.has('s:0')).toBe(false);
  });

  test('a status line resets the spacing too', () => {
    const delays = staggerDelays(
      [bubble('r:0'), bubble('r:1'), status('t1'), bubble('s:0'), bubble('s:1')],
      none,
    );
    expect(delays.get('r:1')).toBe(BUBBLE_GAP_MS);
    expect(delays.get('s:0')).toBeUndefined();
    expect(delays.get('s:1')).toBe(BUBBLE_GAP_MS);
  });

  test('a single-bubble reply waits for nothing', () => {
    expect(staggerDelays([bubble('only')], none).size).toBe(0);
  });
});

describe('what is drawn', () => {
  test('held bubbles are absent, and the order of the rest is unchanged', () => {
    const items = [bubble('a'), bubble('b'), bubble('c')];
    expect(visibleItems(items, seen('b')).map(i => i.id)).toEqual(['a', 'c']);
  });

  test('nothing held means nothing hidden', () => {
    const items = [bubble('a'), bubble('b')];
    expect(visibleItems(items, none)).toHaveLength(2);
  });
});
