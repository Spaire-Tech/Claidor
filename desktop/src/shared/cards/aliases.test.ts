import { createParser } from '@openuidev/lang-core';
import { chatLibrary } from '@openuidev/thesys';
import { describe, expect, test } from 'vitest';

import { CARD_COMPONENT_ALIASES, normaliseCardProgram } from './aliases';

const components = chatLibrary.toSpec().components as Record<string, unknown>;
const parse = (program: string) => createParser(chatLibrary.toJSONSchema()).parse(program);

/** The children the renderer would actually draw, by component name. */
const drawnChildren = (root: unknown): string[] => {
  const children = (root as { props?: { children?: { typeName?: string }[] } } | null)?.props?.children ?? [];
  return children.map(child => child?.typeName ?? '?');
};

describe('the near-miss component names', () => {
  /**
   * The founder's Tokyo itinerary, as a model that learned OpenUI from
   * their public docs would write it. Every component here is real —
   * in the *other* chat library. Against ours it is three unknown
   * components, and what the person sees is the header and one line.
   */
  const asTheModelWroteIt = [
    'root = Card([head, intro, days, next])',
    'head = CardHeader("Three days in Tokyo", "A first-trip itinerary with one classic day, one culture day and one flexible escape")',
    'intro = TextContent("Assuming Tokyo as your base and no fixed bookings yet.")',
    'days = ListBlock([d1, d2], "number")',
    'd1 = ListItem("Day 1 — Shinjuku", "Land, settle, stay east")',
    'd2 = ListItem("Day 2 — Asakusa", "Senso-ji, then the park")',
    'next = Buttons([b1], "row")',
    'b1 = Button("Add a fourth day", {type: "continue_conversation", context: "Add a fourth day"}, "secondary")',
  ].join('\n');

  test('without correction, three quarters of the card is silently dropped', () => {
    const { meta, root } = parse(asTheModelWroteIt);
    const unknown = (meta.errors ?? []).filter(one => one.code === 'unknown-component').map(one => one.component);
    expect(unknown).toEqual(expect.arrayContaining(['CardHeader', 'ListBlock', 'Buttons']));
    // What survives is exactly what the founder saw on 18 September.
    expect(drawnChildren(root)).toEqual(['TextContent']);
  });

  test('with correction, the whole card renders', () => {
    const { program, corrected } = normaliseCardProgram(asTheModelWroteIt);
    expect([...corrected].sort()).toEqual(['Buttons', 'CardHeader', 'ListBlock']);
    const { meta, root } = parse(program);
    expect(meta.errors).toEqual([]);
    expect(meta.unresolved).toEqual([]);
    expect(drawnChildren(root)).toEqual(['Header', 'TextContent', 'List', 'ButtonGroup']);
  });

  test('every alias names a component this library actually has, and takes its arguments in the same order', () => {
    for (const [theirs, ours] of Object.entries(CARD_COMPONENT_ALIASES)) {
      expect(components[ours], `${ours} is not in the chat library`).toBeTruthy();
      expect(components[theirs], `${theirs} is in the library; it must not be aliased away`).toBeUndefined();
    }
  });

  test('leaves alone anything that is not one of those calls', () => {
    const untouched = [
      'root = Card([a, b])',
      'a = Header("Kept", "A name that merely contains Callout is not one")',
      'b = TextContent("The word Buttons in a sentence, and MyCallout(1) too")',
    ].join('\n');
    expect(normaliseCardProgram(untouched).program).toBe(untouched);
    expect(normaliseCardProgram(untouched).corrected).toEqual([]);
  });

  /**
   * `FollowUpItem(text)` is one item; `FollowUpBlock(string[])` is the
   * whole block. Renaming it would parse and be wrong, which is worse
   * than failing, so it stays out of the table on purpose.
   */
  test('does not rename the one pair whose shape differs', () => {
    expect(CARD_COMPONENT_ALIASES.FollowUpItem).toBeUndefined();
    expect(CARD_COMPONENT_ALIASES.Carousel).toBeUndefined();
  });
});
