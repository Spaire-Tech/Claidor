import { describe, expect, test } from 'vitest';

import { startsTurn } from './leading';
import { Speaker, type ThreadItem, ThreadItemKind } from './types';

const said = (from: Speaker, id: string): ThreadItem => ({
  kind: ThreadItemKind.Text, id, from, text: 'x', at: 0,
});
const status: ThreadItem = { kind: ThreadItemKind.Status, id: 's', verb: 'Reading', at: 0 };

describe('startsTurn', () => {
  test('the first item in a thread is never given space above it', () => {
    expect(startsTurn(undefined, said(Speaker.Agent, 'a'))).toBe(false);
  });

  test('a change of speaker starts a turn', () => {
    expect(startsTurn(said(Speaker.Person, 'a'), said(Speaker.Agent, 'b'))).toBe(true);
    expect(startsTurn(said(Speaker.Agent, 'a'), said(Speaker.Person, 'b'))).toBe(true);
  });

  test('a second bubble from the same speaker does not', () => {
    // This is what makes a three-bubble reply read as one reply.
    expect(startsTurn(said(Speaker.Agent, 'a'), said(Speaker.Agent, 'b'))).toBe(false);
  });

  test('a bubble after a shimmer starts a turn', () => {
    expect(startsTurn(status, said(Speaker.Agent, 'b'))).toBe(true);
  });

  test('only bubbles are spaced — the other kinds carry their own', () => {
    expect(startsTurn(said(Speaker.Agent, 'a'), status)).toBe(false);
  });
});
