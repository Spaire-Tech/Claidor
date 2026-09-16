import { createParser } from '@openuidev/lang-core';
import { describe, expect, test } from 'vitest';

import { CARD_COMPONENTS, CARD_FENCE, CARD_LIBRARY, cardImageUrl } from './library';

/** The pictures the founder sent, as programs: a restaurant answer, a trip plan, a tournament page. */
export const RESTAURANTS = `root = Stack([intro, places, kpi], "Best restaurants in Seattle", "From iconic fine dining to artisanal soba")
intro = Text("Seattle's food is Pacific Northwest seafood first.", "muted")
places = Row([a, b, c])
a = Tile("Canlis", "Panoramic views & iconic fine dining", "Fine dining", "https://example.com/canlis.jpg", "Book")
b = Tile("The Walrus & The Carpenter", "Fresh Pacific oysters & Muscadet", "Seafood")
c = Tile("Spinasse", "Hand-cut tajarin & Piedmontese Italian", "Italian")
kpi = Grid([Fact("Price", "$$ to $$$$"), Fact("Book ahead", "Two weeks for Canlis")])
`;

export const TRIP = `root = Stack([hero, summary, days])
hero = Banner("Tokyo Trip Itinerary", "7 days grouped by neighbourhood, pace and travel time")
summary = Row([Metric("Trip length", "7 days"), Metric("Best base", "Ginza or Shinjuku", "Easy transit")])
days = Row([d1, d2, d3])
d1 = Tile("Shinjuku arrival", "Easy first day to reset after landing", "Day 1")
d2 = Tile("Harajuku + Shibuya", "Vibrant culture and iconic sights", "Day 2")
d3 = Tile("Asakusa + Ueno", "Traditional Tokyo", "Day 3")
`;

export const COMPARISON = `root = Stack([table, next], "Three hotels compared")
table = Table(["Hotel", "Area", "From"], [["Plaza Athénée", "8e", "€1,100"], ["George V", "8e", "€1,400"], ["Le Bristol", "8e", "€1,250"]])
next = Button("Show me the cheapest week", "Find the cheapest week at Plaza Athénée")
`;

describe('the card library', () => {
  test('is ten components, Stack at the root', () => {
    expect(CARD_COMPONENTS.map(one => one.name)).toEqual([
      'Stack', 'Banner', 'Text', 'Row', 'Grid', 'Tile', 'Metric', 'Fact', 'Table', 'Button',
    ]);
    expect(CARD_LIBRARY.root).toBe('Stack');
    expect(CARD_FENCE).toBe('openui-lang');
  });

  test.each([
    ['the restaurants', RESTAURANTS],
    ['the trip', TRIP],
    ['the comparison', COMPARISON],
  ])('%s program parses clean against the library', (_name, program) => {
    const result = createParser(CARD_LIBRARY.toJSONSchema()).parse(program);
    expect(result.meta.errors).toEqual([]);
    expect(result.meta.unresolved).toEqual([]);
    expect(result.root?.typeName).toBe('Stack');
  });

  test('required arguments come first, so a Tile with only a name is a Tile', () => {
    const result = createParser(CARD_LIBRARY.toJSONSchema()).parse('root = Stack([a])\na = Tile("Canlis")\n');
    expect(result.meta.errors).toEqual([]);
  });

  test('an invented image address gets past the parser, so the renderer refuses it', () => {
    // The schema says `url`; OpenUI's parser checks types, not formats.
    const result = createParser(CARD_LIBRARY.toJSONSchema()).parse('root = Stack([a])\na = Tile("Canlis", "x", "y", "a picture of canlis")\n');
    expect(result.meta.errors).toEqual([]);
    expect(cardImageUrl('a picture of canlis')).toBeUndefined();
    expect(cardImageUrl('http://example.com/a.jpg')).toBeUndefined();
    expect(cardImageUrl('javascript:alert(1)')).toBeUndefined();
    expect(cardImageUrl(' https://example.com/canlis.jpg ')).toBe('https://example.com/canlis.jpg');
    expect(cardImageUrl(undefined)).toBeUndefined();
  });

  test('a component the library does not have is an error, not a crash', () => {
    const result = createParser(CARD_LIBRARY.toJSONSchema()).parse('root = Stack([a])\na = Chart([1, 2, 3])\n');
    expect(result.meta.errors.some(one => one.code === 'unknown-component')).toBe(true);
  });
});
