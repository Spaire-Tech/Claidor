import { describe, expect, test } from 'vitest';

import { findInThread, matchLabel, stepMatch } from './search';
import { Speaker, type ThreadItem, ThreadItemKind } from './types';

const said = (id: string, text: string, from: Speaker = Speaker.Agent): ThreadItem => ({
  kind: ThreadItemKind.Text, id, from, text, at: 0,
});
const status = (id: string, verb: string): ThreadItem => ({
  kind: ThreadItemKind.Status, id, verb, at: 0,
});
const system = (id: string, text: string): ThreadItem => ({
  kind: ThreadItemKind.System, id, text, at: 0,
});

const THREAD: ThreadItem[] = [
  said('a', 'Slide 14 and slide 19 use last quarter’s headcount.'),
  said('b', 'check the deck', Speaker.Person),
  status('c', 'Running commands'),
  system('d', 'Juno can run commands on your computer from now on.'),
];

describe('finding something in a conversation', () => {
  test('matches what was said, either way round', () => {
    expect(findInThread(THREAD, 'slide').ids).toEqual(['a']);
    expect(findInThread(THREAD, 'deck').ids).toEqual(['b']);
  });

  test('ignores case', () => {
    expect(findInThread(THREAD, 'HEADCOUNT').count).toBe(1);
  });

  test('does not match a status line', () => {
    // A status is the app narrating. Matching "running commands" would be
    // the app finding itself.
    expect(findInThread(THREAD, 'running commands').count).toBe(0);
  });

  test('does match a system line, which is something that happened', () => {
    expect(findInThread(THREAD, 'from now on').ids).toEqual(['d']);
  });

  test('an empty query finds nothing rather than everything', () => {
    expect(findInThread(THREAD, '').count).toBe(0);
    expect(findInThread(THREAD, '   ').count).toBe(0);
  });
});

describe('walking the matches', () => {
  test('wraps at both ends', () => {
    // Somebody pressing Enter down a list should not have to notice they
    // reached the bottom of it.
    expect(stepMatch(3, 2, 1)).toBe(0);
    expect(stepMatch(3, 0, -1)).toBe(2);
  });

  test('does nothing when there is nothing to walk', () => {
    expect(stepMatch(0, 0, 1)).toBe(0);
    expect(stepMatch(0, 0, -1)).toBe(0);
  });
});

describe('the count beside the box', () => {
  test('counts from one, the way a person does', () => {
    expect(matchLabel('slide', 11, 2)).toBe('3 of 11');
  });

  test('says so when there are none, and nothing before you type', () => {
    expect(matchLabel('zzz', 0, 0)).toBe('No matches');
    expect(matchLabel('', 0, 0)).toBe('');
  });
});
