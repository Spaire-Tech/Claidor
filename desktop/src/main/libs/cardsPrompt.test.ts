import { describe, expect, test } from 'vitest';

import { buildManagedCardsPrompt } from './cardsPrompt';

describe('the Cards section of the brief', () => {
  const section = buildManagedCardsPrompt();

  test('teaches OpenUI\'s chat library by its signatures, and the fence', () => {
    expect(section.startsWith('## Cards\n')).toBe(true);
    for (const name of ['Card(children?:', 'Header(', 'Image(', 'CompositeCardBlock(', 'CompositeCardItem(', 'VisualCardBlock(', 'OverviewCardBlock(', 'EntityList(', 'Table(', 'Steps(', 'ButtonGroup(', 'Button(']) {
      expect(section).toContain(name);
    }
    expect(section).toContain('```openui-lang');
    expect(section).toContain('## Hoisting & Streaming');
  });

  test('says the rules in our words: texts stay texts, one block, whole blocks, no invented pictures', () => {
    expect(section).toContain('Your texts stay texts.');
    expect(section).toContain('One block per reply at most.');
    expect(section).toContain('Every block is complete on its own.');
    expect(section).toContain('Never invent, guess or "typical" one.');
    // The one place the engine can get a picture address from: the
    // fetch tool strips images out of pages but returns JSON whole.
    expect(section).toContain('https://en.wikipedia.org/api/rest_v1/page/summary/');
    expect(section).toContain('originalimage.source');
    expect(section).toContain('## Rules in this app');
    // Our words replaced the markers, and OpenUI's opening line.
    expect(section).not.toContain('@@CAISRA');
    expect(section).not.toContain('Your ENTIRE response must be valid openui-lang');
  });

  test('is small enough to sit in the brief with everything else', () => {
    // OpenUI's chat prompt is about 15,000 characters; the brief as a
    // whole must stay under the engine's cut (the runtime test).
    expect(section.length).toBeLessThan(20_000);
  });
});
