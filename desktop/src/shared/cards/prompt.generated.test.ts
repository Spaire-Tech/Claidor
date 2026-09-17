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
    // Theirs, not ours: the opening that says the whole reply must be code.
    expect(generated.CARD_PROMPT).not.toContain('Your ENTIRE response must be valid openui-lang');
  });

  /**
   * Inline mode is OpenUI's dashboard-editor mode. It carries a section
   * telling the model that a QUESTION gets a plain-text answer and no
   * openui-lang, which in a messages app means no cards at all: every
   * message here is a question. It was on until 18 September and it is
   * why the founder's two threads came back as prose.
   */
  test('is not generated in inline mode, and carries their worked examples', () => {
    expect(generated.CARD_PROMPT).not.toContain('## Inline Mode');
    expect(generated.CARD_PROMPT).not.toContain('Do NOT output any openui-lang code');
    expect(generated.CARD_PROMPT).toContain('## Examples');
    expect(generated.CARD_PROMPT).toContain('Every response is a single `root = Card([...])`');
  });

  /**
   * A form in an answer card is forbidden by the rules two sections
   * later, so teaching eighteen form components was 4,800 characters of
   * contradiction. OpenUI's own reliability guidance puts simplifying
   * the schema first.
   */
  test('does not teach components this app forbids or cannot run', () => {
    for (const name of ['Form(', 'FormControl(', 'Input(', 'Select(', 'Chips(', 'OptionCards(', 'DatePicker(', 'Slider(', 'EditableTable(']) {
      expect(generated.CARD_PROMPT).not.toContain(name);
    }
    // Still taught: the parts a composed answer is actually made of.
    for (const name of ['Header(', 'CalloutV2(', 'Table(', 'Tabs(', 'Steps(', 'Accordion(', 'FollowUpBlock(', 'SectionBlock(']) {
      expect(generated.CARD_PROMPT).toContain(name);
    }
  });

  test('the typeface stylesheet matches what the installed package needs', () => {
    // Every typography token OpenUI bakes Inter into, redeclared under
    // the block with the thread's face; regenerated and compared.
    const file = readFileSync(path.join(__dirname, '../../renderer/design/thread/cards.generated.css'), 'utf8');
    const css = buildCardsCss();
    expect(file).toBe(renderCardsCss(css));
    expect(Object.keys(css.tokens).length).toBeGreaterThan(20);
    // Their 16 is the thread's 14; the weight and the leading are theirs.
    expect(css.tokens['--openui-text-body-default']).toBe('400 14px/1.5 var(--fsr-font-ui)');
    expect(css.tokens['--openui-text-heading-sm']).toBe('600 16px/1.25 var(--fsr-font-ui)');
    expect(file).not.toMatch(/"Inter"/);
  });
});
