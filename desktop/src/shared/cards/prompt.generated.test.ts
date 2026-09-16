import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { buildCards, buildCardsCss, CARD_PROMPT_MARKERS, renderCards, renderCardsCss } from '../../../scripts/generate-artifact-prompts.mjs';
import * as generated from './prompt.generated';

describe('the generated card prompt', () => {
  test('matches what the installed package generates', () => {
    // Regenerate and compare: the file cannot drift from the package.
    expect(renderCards(buildCards())).toBe(renderCards({
      version: generated.CARD_LIBRARY_VERSION,
      root: generated.CARD_ROOT,
      prompt: generated.CARD_PROMPT,
    }));
  });

  test('is OpenUI\'s whole chat prompt with our two markers in it', () => {
    expect(generated.CARD_ROOT).toBe('Card');
    expect(generated.CARD_PROMPT.startsWith(CARD_PROMPT_MARKERS.preamble)).toBe(true);
    expect(generated.CARD_PROMPT).toContain(`- ${CARD_PROMPT_MARKERS.rules}`);
    expect(generated.CARD_PROMPT).toContain('## Component Signatures');
    expect(generated.CARD_PROMPT).toContain('Card(children?:');
    expect(generated.CARD_PROMPT).toContain('## Inline Mode');
    // Theirs, not ours: the opening that says the whole reply must be code.
    expect(generated.CARD_PROMPT).not.toContain('Your ENTIRE response must be valid openui-lang');
  });

  test('the typeface stylesheet matches what the installed package needs', () => {
    // Every typography token OpenUI bakes Inter into, redeclared under
    // the block with the thread's face; regenerated and compared.
    const file = readFileSync(path.join(__dirname, '../../renderer/design/thread/cards.generated.css'), 'utf8');
    const css = buildCardsCss();
    expect(file).toBe(renderCardsCss(css));
    expect(Object.keys(css.tokens).length).toBeGreaterThan(20);
    expect(css.tokens['--openui-text-body-default']).toBe('400 16px/1.5 var(--fsr-font-ui)');
    expect(file).not.toMatch(/"Inter"/);
  });
});
