import { describe, expect, test } from 'vitest';

import { hasCards, splitCardSegments, stripCards } from './fence';

const reply = `Three worth the trip.

\`\`\`openui-lang
root = Stack([a])
a = Tile("Canlis", "Fine dining")
\`\`\`

Canlis needs booking two weeks out.`;

describe('splitCardSegments', () => {
  test('text, card, text, in the order written', () => {
    expect(splitCardSegments(reply)).toEqual([
      { kind: 'text', text: 'Three worth the trip.' },
      { kind: 'card', program: 'root = Stack([a])\na = Tile("Canlis", "Fine dining")' },
      { kind: 'text', text: 'Canlis needs booking two weeks out.' },
    ]);
  });

  test('a reply with no block is one text segment', () => {
    expect(splitCardSegments('Just words.')).toEqual([{ kind: 'text', text: 'Just words.' }]);
  });

  test('the bare fence the model sometimes writes counts too', () => {
    const segments = splitCardSegments('```openui\nroot = Stack([])\n```');
    expect(segments).toEqual([{ kind: 'card', program: 'root = Stack([])' }]);
  });

  test('another language\'s fence is text, and so is a fence inside a sentence', () => {
    expect(splitCardSegments('```json\n{"a":1}\n```')).toEqual([{ kind: 'text', text: '```json\n{"a":1}\n```' }]);
    expect(splitCardSegments('say ```openui-lang here')).toEqual([{ kind: 'text', text: 'say ```openui-lang here' }]);
  });

  test('an empty block is dropped', () => {
    expect(splitCardSegments('Before\n```openui-lang\n\n```\nAfter')).toEqual([
      { kind: 'text', text: 'Before' },
      { kind: 'text', text: 'After' },
    ]);
  });
});

describe('stripCards and hasCards', () => {
  test('the preview keeps the words and loses the program', () => {
    expect(stripCards(reply)).toBe('Three worth the trip.\n\nCanlis needs booking two weeks out.');
    expect(hasCards(reply)).toBe(true);
    expect(hasCards('Just words.')).toBe(false);
  });
});
