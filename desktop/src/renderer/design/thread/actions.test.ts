import { describe, expect, test } from 'vitest';

import {
  type KeyValueStorage,
  loadReactions,
  messageIdOf,
  QUOTE_LENGTH,
  REACTION_EMOJIS,
  reactionsKey,
  replyQuote,
  saveReactions,
  toggleReaction,
  withReaction,
} from './actions';

describe('reacting to a message', () => {
  test('the six are the canvas\'s, in its order', () => {
    expect(REACTION_EMOJIS).toEqual(['👍', '❤️', '😂', '😮', '😢', '🙏']);
  });

  test('the agent\'s tapback is set, not toggled', () => {
    // An agent saying 👍 twice means it twice; only a person's own press
    // on the same emoji takes it off.
    let reactions = withReaction({}, 'm1', '👍');
    expect(reactions).toEqual({ m1: '👍' });
    const same = withReaction(reactions, 'm1', '👍');
    expect(same).toBe(reactions);
    reactions = withReaction(reactions, 'm1', '❤️');
    expect(reactions).toEqual({ m1: '❤️' });
  });

  test('one reaction per message, and the same one again clears it', () => {
    let reactions = toggleReaction({}, 'm1', '👍');
    expect(reactions).toEqual({ m1: '👍' });
    reactions = toggleReaction(reactions, 'm1', '❤️');
    expect(reactions).toEqual({ m1: '❤️' });
    reactions = toggleReaction(reactions, 'm1', '❤️');
    // Gone, not blank: a stored map should not fill with empty strings.
    expect(reactions).toEqual({});
  });

  test('does not touch the other messages', () => {
    const reactions = toggleReaction({ m1: '👍' }, 'm2', '🙏');
    expect(reactions).toEqual({ m1: '👍', m2: '🙏' });
  });
});

describe('the reply quote', () => {
  test('is the start of the message in curly quotes, with a space to type after', () => {
    expect(replyQuote('Slide 14 and slide 19.')).toBe('“Slide 14 and slide 19.” ');
  });

  test('cuts a long message and says so', () => {
    const long = 'a'.repeat(QUOTE_LENGTH + 10);
    const quote = replyQuote(long);
    expect(quote).toBe(`“${'a'.repeat(QUOTE_LENGTH)}…” `);
  });

  test('unwraps a chip and flattens newlines, because a quote is prose', () => {
    expect(replyQuote('The model is [[Q4 Model v2.xlsx]].\n\nStill in Board.'))
      .toBe('“The model is Q4 Model v2.xlsx. Still in Board.” ');
  });
});

describe('the id to copy', () => {
  test('is the engine message id, whatever the bubble\'s suffix', () => {
    expect(messageIdOf('abc-123')).toBe('abc-123');
    expect(messageIdOf('abc-123:2')).toBe('abc-123');
    expect(messageIdOf('abc-123:f0')).toBe('abc-123');
  });
});

describe('keeping reactions', () => {
  const memory = (): KeyValueStorage & { map: Map<string, string> } => {
    const map = new Map<string, string>();
    return {
      map,
      getItem: key => map.get(key) ?? null,
      setItem: (key, value) => { map.set(key, value); },
    };
  };

  test('round-trips through storage, per conversation', () => {
    const storage = memory();
    saveReactions(storage, 'juno', { m1: '👍' });
    expect(loadReactions(storage, 'juno')).toEqual({ m1: '👍' });
    expect(loadReactions(storage, 'mira')).toEqual({});
    expect(storage.map.has(reactionsKey('juno'))).toBe(true);
  });

  test('a damaged entry is no reactions, not a broken thread', () => {
    const storage = memory();
    storage.setItem(reactionsKey('juno'), '{not json');
    expect(loadReactions(storage, 'juno')).toEqual({});
    storage.setItem(reactionsKey('juno'), JSON.stringify({ m1: 3, m2: '', m3: '🙏' }));
    expect(loadReactions(storage, 'juno')).toEqual({ m3: '🙏' });
  });

  test('no storage at all is fine', () => {
    expect(loadReactions(undefined, 'juno')).toEqual({});
    expect(() => saveReactions(undefined, 'juno', {})).not.toThrow();
  });
});
