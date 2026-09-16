import { describe, expect, test } from 'vitest';

import { latestPersonMessageId, parseReactInput } from './constants';

describe('parseReactInput', () => {
  test('one emoji is accepted', () => {
    expect(parseReactInput({ emoji: '👍' })).toEqual({ emoji: '👍' });
  });

  test('a flag, a skin tone and a heart with its selector stay whole', () => {
    expect(parseReactInput({ emoji: '🇸🇳' })).toEqual({ emoji: '🇸🇳' });
    expect(parseReactInput({ emoji: '👍🏾' })).toEqual({ emoji: '👍🏾' });
    expect(parseReactInput({ emoji: '❤️' })).toEqual({ emoji: '❤️' });
  });

  test('spaces around it are not part of it', () => {
    expect(parseReactInput({ emoji: ' 🙏 ' })).toEqual({ emoji: '🙏' });
  });

  test('two emoji are refused with the reason', () => {
    expect(parseReactInput({ emoji: '👍👍' })).toBe('One emoji only.');
  });

  test('a word is not a reaction', () => {
    expect(parseReactInput({ emoji: 'ok' })).toBe('One emoji only.');
    expect(parseReactInput({ emoji: 'k' })).toBe('That is not an emoji.');
    expect(parseReactInput({ emoji: '7' })).toBe('That is not an emoji.');
  });

  test('nothing is refused', () => {
    expect(parseReactInput({})).toBe('An emoji is required.');
    expect(parseReactInput(undefined)).toBe('An emoji is required.');
    expect(parseReactInput({ emoji: 3 })).toBe('An emoji is required.');
  });
});

describe('latestPersonMessageId', () => {
  test('is the newest thing the person said, not the newest message', () => {
    expect(latestPersonMessageId([
      { id: 'u1', type: 'user' },
      { id: 'a1', type: 'assistant' },
      { id: 'u2', type: 'user' },
      { id: 'a2', type: 'assistant' },
    ])).toBe('u2');
  });

  test('is nothing when the person has said nothing', () => {
    expect(latestPersonMessageId([{ id: 'a1', type: 'assistant' }])).toBeUndefined();
    expect(latestPersonMessageId([])).toBeUndefined();
  });
});
