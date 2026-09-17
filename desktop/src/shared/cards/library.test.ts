import { createParser } from '@openuidev/lang-core';
import { chatLibrary } from '@openuidev/thesys';
import { describe, expect, test } from 'vitest';

import { cardExamples } from '../../../harness/cardExamples';
import { artifactKindOf } from '../artifacts/constants';
import { splitCardSegments } from './fence';
import { CARD_FENCE, CARD_LIBRARY_VERSION, CARD_ROOT } from './library';

/** The founder's four pictures as programs, with a made-up picture host: what the harness draws. */
const EXAMPLES = cardExamples(name => `https://pictures.example/${name}.jpg`);

describe('the card library', () => {
  test('is OpenUI\'s chat library, whole, at the version the renderer draws with', () => {
    expect(CARD_ROOT).toBe(chatLibrary.root);
    expect(CARD_ROOT).toBe('Card');
    expect(CARD_FENCE).toBe('openui-lang');
    // The version the generator recorded is the package the renderer imports (`prompt.generated.test.ts` regenerates and compares).
    expect(CARD_LIBRARY_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    // The blocks the founder's pictures are made of.
    for (const name of ['Header', 'Image', 'CompositeCardBlock', 'VisualCardBlock', 'OverviewCardBlock', 'EntityList', 'Table', 'Steps', 'ButtonGroup']) {
      expect(chatLibrary.components[name]).toBeDefined();
    }
  });

  test.each(Object.entries(EXAMPLES))('the %s example parses clean against the library', (_screen, example) => {
    const result = createParser(chatLibrary.toJSONSchema()).parse(example.program.join('\n'));
    expect(result.meta.errors).toEqual([]);
    expect(result.meta.unresolved).toEqual([]);
    expect(result.root?.typeName).toBe(CARD_ROOT);
  });

  /**
   * A reply is a text, the block, and a text after it when there is one
   * to write. Not every answer has one: a composed block that opens with
   * its own header and closes with follow-ups says everything it has to
   * say, which is how OpenUI's own answers end and what the brief now
   * teaches. So the trailing text is optional and the block is not.
   */
  test.each(Object.entries(EXAMPLES))('the %s example is a card, not an artifact, once fenced in a reply', (_screen, example) => {
    const reply = `${example.before}\n\n\`\`\`${CARD_FENCE}\n${example.program.join('\n')}\n\`\`\`${example.after ? `\n\n${example.after}` : ''}`;
    const segments = splitCardSegments(reply);
    expect(segments.map(one => one.kind)).toEqual(example.after ? ['text', 'card', 'text'] : ['text', 'card']);
    const card = segments[1];
    if (card.kind !== 'card') throw new Error('not a card');
    expect(artifactKindOf(card.program)).toBeUndefined();
  });

  test('a component the library does not have is an error, not a crash', () => {
    const result = createParser(chatLibrary.toJSONSchema()).parse('root = Card([a])\na = Tile("Canlis")\n');
    expect(result.meta.errors.some(one => one.code === 'unknown-component')).toBe(true);
  });
});
