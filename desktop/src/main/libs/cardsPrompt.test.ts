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

  /**
   * The founder's two threads on 18 September came back as prose, every
   * turn. The cause was in this section: OpenUI's inline mode told the
   * model to answer questions in plain text, and our own rules made a
   * block the exception rather than the rule. These assertions are the
   * fix, held down.
   */
  test('inline mode is gone: it forbids cards for anything shaped like a question', () => {
    expect(section).not.toContain('## Inline Mode');
    expect(section).not.toContain('Do NOT output any openui-lang code');
    expect(section).not.toContain('The existing dashboard stays unchanged');
  });

  test('a block is the default, not the exception', () => {
    expect(section).toContain('A block is the normal way to answer, not a special occasion.');
    expect(section).toContain('Every response is a single `root = Card([...])`');
    expect(section).toContain('Use `FollowUpBlock` at the END of a Card');
    // The two clauses that produced the meal-plan wall of text.
    expect(section).not.toContain('a plan in prose: no block');
    expect(section).not.toContain('No Header and no title line');
  });

  test('says the rules in our words: one block, whole blocks, no invented pictures', () => {
    // One card block, and the artifact that may follow it. The founder,
    // 18 September: the agent should write the plan up as a document in
    // the same reply, unasked. Two of my rules forbade that and neither
    // was a limit of the code.
    expect(section).toContain('One card block per reply; a reply may also carry one artifact block after it');
    expect(section).toContain('Every block is complete on its own.');
    expect(section).toContain('Never invent, guess or pattern-match an image address');
    // The picture rule no longer sends the agent on a browser detour per
    // photograph; a URL already in a search result is the cheap path.
    expect(section).not.toContain('https://en.wikipedia.org/api/rest_v1/page/summary/');
    expect(section).toContain('## Rules in this app');
    expect(section).not.toContain('@@CAISRA');
    expect(section).not.toContain('Your ENTIRE response must be valid openui-lang');
  });

  /**
   * `Action([...])` and the `@` builtins parse, and parse to an
   * unevaluated node the renderer cannot act on, because this app does
   * not wire OpenUI's v0.5 runtime. A button written that way draws and
   * does nothing, so nothing in the brief may demonstrate one.
   */
  test('teaches object-literal actions, and nothing the renderer cannot run', () => {
    expect(section).toContain('{type: "continue_conversation", context: "..."}');
    expect(section).toContain('`Action([...])` and `@` builtins are part of the language this app does not run');
    expect(section).not.toMatch(/=\s*Action\(\[@/);
  });

  test('carries worked examples, which it did not before', () => {
    expect(section).toContain('## Examples');
    // The composed answer: one Card holding a header, prose, a note, a
    // picture block, a table, tabs, steps, an accordion and follow-ups.
    expect(section).toContain('Example 2 — A long answer, composed of several parts in one Card');
    for (const part of ['Header(', 'CalloutV2(', 'VisualCardBlock(', 'InlineHeader(', 'Tabs(', 'Steps(', 'Accordion(', 'FollowUpBlock(']) {
      expect(section.slice(section.indexOf('## Examples'))).toContain(part);
    }
  });

  test('closes with the verification checklist, after the rules and not before them', () => {
    expect(section.indexOf('## Rules in this app')).toBeGreaterThan(-1);
    expect(section.indexOf('## Final Verification')).toBeGreaterThan(section.indexOf('## Rules in this app'));
  });

  test('is small enough to sit in the brief with everything else', () => {
    // Grew on 18 September from 19,000 to about 25,000: OpenUI's four
    // worked examples and their chat rules, neither of which the model
    // was given before. The brief as a whole must still clear the
    // engine's cut, which the runtime test holds.
    expect(section.length).toBeLessThan(28_000);
  });
});
