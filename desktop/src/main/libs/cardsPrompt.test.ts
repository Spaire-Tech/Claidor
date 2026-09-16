import { describe, expect, test } from 'vitest';

import { buildManagedCardsPrompt } from './cardsPrompt';

describe('the Cards section of the brief', () => {
  const section = buildManagedCardsPrompt();

  test('teaches every component by its signature, and the fence', () => {
    expect(section.startsWith('## Cards\n')).toBe(true);
    for (const name of ['Stack(', 'Banner(', 'Text(', 'Row(', 'Grid(', 'Tile(', 'Metric(', 'Fact(', 'Table(', 'Button(']) {
      expect(section).toContain(name);
    }
    expect(section).toContain('```openui-lang');
  });

  test('says the rules in our words: texts stay texts, no invented images, one block', () => {
    expect(section).toContain('Your texts stay texts.');
    expect(section).toContain('Never invent, guess or "typical" one.');
    // The one place the engine can get a picture address from: the
    // fetch tool strips images out of pages but returns JSON whole.
    expect(section).toContain('https://en.wikipedia.org/api/rest_v1/page/summary/');
    expect(section).toContain('originalimage.source');
    expect(section).toContain('One block per reply at most.');
    // OpenUI's own opening line, which says the whole reply must be code, is replaced.
    expect(section).not.toContain('Your ENTIRE response must be valid openui-lang');
  });

  test('is small enough to sit in the brief, and generating it sends nothing', () => {
    expect(section.length).toBeLessThan(8_000);
    expect(process.env.OPENUI_TELEMETRY_DISABLED).toBe('1');
  });
});
