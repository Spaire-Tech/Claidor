import { describe, expect, test } from 'vitest';

import { lastTurnUsedTools, routeTurn, TurnRoute } from './turnRouting';

describe('routeTurn', () => {
  test('a plain question goes fast', () => {
    for (const text of [
      'What is the capital of Senegal?',
      'how does a Roth IRA work',
      'Is Sweetgreen a healthy option?',
      'Why is the sky blue?',
      'Explain the difference between a bond and a stock.',
    ]) {
      expect(routeTurn({ text }), text).toBe(TurnRoute.Fast);
    }
  });

  test('an ask to do something is a job, whatever the punctuation', () => {
    for (const text of [
      'Find me the healthiest lunch on DoorDash?',
      'can you check my calendar for tomorrow',
      'Order the usual.',
      'Book a table for two at 8?',
      'write a reply to Henderson',
      'please summarize this',
      'go to zillow and compare listings',
    ]) {
      expect(routeTurn({ text }), text).toBe(TurnRoute.Strong);
    }
  });

  test('links, paths and attachments are jobs', () => {
    expect(routeTurn({ text: 'https://doordash.com/store/123 ?' })).toBe(TurnRoute.Strong);
    expect(routeTurn({ text: 'what is in ~/Documents/plan.pdf?' })).toBe(TurnRoute.Strong);
    expect(routeTurn({ text: 'what is this?', hasAttachments: true })).toBe(TurnRoute.Strong);
  });

  test('a word that is also an action verb tips a question to strong, on purpose', () => {
    // "open" is an adjective here and a verb in "open the file"; the rule
    // cannot tell, and doubt goes to the strong model.
    expect(routeTurn({ text: 'Is Sweetgreen open on Sundays?' })).toBe(TurnRoute.Strong);
  });

  test('a room, or a conversation that is already a job, stays strong', () => {
    expect(routeTurn({ text: 'why?', inRoom: true })).toBe(TurnRoute.Strong);
    expect(routeTurn({ text: 'and the other one?', lastTurnUsedTools: true })).toBe(TurnRoute.Strong);
  });

  test('long messages and statements are strong: doubt goes to the strong model', () => {
    expect(routeTurn({ text: 'ok' })).toBe(TurnRoute.Strong);
    expect(routeTurn({ text: 'thanks' })).toBe(TurnRoute.Strong);
    expect(routeTurn({ text: `${'what about '.repeat(30)}?` })).toBe(TurnRoute.Strong);
    expect(routeTurn({ text: '' })).toBe(TurnRoute.Strong);
  });
});

describe('lastTurnUsedTools', () => {
  test('looks only at what came after the last user message', () => {
    expect(lastTurnUsedTools([
      { type: 'user' }, { type: 'tool_use' }, { type: 'tool_result' }, { type: 'assistant' },
    ])).toBe(true);
    expect(lastTurnUsedTools([
      { type: 'user' }, { type: 'tool_use' }, { type: 'assistant' }, { type: 'user' }, { type: 'assistant' },
    ])).toBe(false);
    expect(lastTurnUsedTools([])).toBe(false);
  });
});
