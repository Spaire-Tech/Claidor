import { describe, expect, test } from 'vitest';

import { threadRows } from './Thread';
import { type ChoiceItem, type ThreadItem, ThreadItemKind } from './types';

const question = (id: string, resolved = false): ChoiceItem => ({
  kind: ThreadItemKind.Choice, id, text: id, options: [{ key: 'A', label: 'a' }], at: 0,
  ...(resolved ? { resolved: { answer: 'a' } } : {}),
});
const bubble: ThreadItem = { kind: ThreadItemKind.System, id: 'sys', text: 'x', at: 0 };

describe('threadRows', () => {
  test('open questions from one request become one deck, in order', () => {
    const rows = threadRows([bubble, question('choice:r1:0'), question('choice:r1:1'), question('choice:r1:2')]);
    expect(rows.map(row => row.kind)).toEqual(['item', 'deck']);
    expect(rows[1].kind === 'deck' && rows[1].items.map(one => one.id))
      .toEqual(['choice:r1:0', 'choice:r1:1', 'choice:r1:2']);
  });

  test('two requests are two decks', () => {
    const rows = threadRows([question('choice:r1:0'), question('choice:r2:0')]);
    expect(rows.map(row => row.kind)).toEqual(['deck', 'deck']);
  });

  test('a settled question, or one not from the engine, stays its own row', () => {
    const rows = threadRows([question('choice:r1:0', true), question('choice-1'), question('choice:r1:1')]);
    expect(rows.map(row => row.kind)).toEqual(['item', 'item', 'deck']);
  });
});
