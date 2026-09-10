import { describe, expect, test } from 'vitest';

import { chunkLibrarySections, deriveLibraryTitle, type LibraryTextSection, normalizeLibraryText } from './chunker';
import { LibraryContentLimits } from './contentConstants';

const sentences = (count: number, prefix: string): string => (
  Array.from({ length: count }, (_, index) => `${prefix} sentence number ${index + 1} says something useful.`).join(' ')
);

describe('chunkLibrarySections', () => {
  test('chunks never cross a section and keep its locator', () => {
    const sections: LibraryTextSection[] = [
      { locator: { page: 1 }, text: sentences(40, 'Alpha') },
      { locator: { page: 2 }, text: sentences(40, 'Beta') },
      { locator: { sheet: 'Budget' }, text: 'Item\tAmount\nRent\t2400' },
    ];
    const chunks = chunkLibrarySections(sections);
    expect(chunks.length).toBeGreaterThan(3);
    const normalizedByPage = new Map(sections.map(section => [JSON.stringify(section.locator), normalizeLibraryText(section.text)]));
    chunks.forEach((chunk, index) => {
      expect(chunk.ordinal).toBe(index);
      const sectionText = normalizedByPage.get(JSON.stringify(chunk.locator));
      expect(sectionText).toBeDefined();
      expect(sectionText).toContain(chunk.text);
    });
    expect(chunks.filter(chunk => chunk.text.includes('Alpha')).every(chunk => chunk.locator.page === 1)).toBe(true);
    expect(chunks.filter(chunk => chunk.text.includes('Beta')).every(chunk => chunk.locator.page === 2)).toBe(true);
    // normalizeLibraryText collapses runs of spaces and tabs to one space.
    expect(chunks.find(chunk => chunk.locator.sheet === 'Budget')?.text).toBe('Item Amount\nRent 2400');
  });

  test('consecutive chunks of a long section overlap', () => {
    const chunks = chunkLibrarySections([{ locator: { page: 3 }, text: sentences(60, 'Gamma') }]);
    expect(chunks.length).toBeGreaterThan(2);
    for (let index = 1; index < chunks.length; index += 1) {
      const head = chunks[index].text.slice(0, 40);
      expect(chunks[index - 1].text).toContain(head);
    }
  });

  test('no chunk is longer than chunkChars', () => {
    const longWord = 'x'.repeat(900);
    const chunks = chunkLibrarySections([
      { locator: {}, text: sentences(80, 'Delta') },
      { locator: {}, text: `${longWord} ${sentences(5, 'Epsilon')}` },
    ]);
    const chunkChars = LibraryContentLimits.ChunkChars;
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(chunkChars);
    }
  });

  test('honours the chunk count cap', () => {
    const chunks = chunkLibrarySections(
      [{ locator: { slide: 1 }, text: sentences(200, 'Zeta') }],
      { maxChunks: 3 },
    );
    expect(chunks).toHaveLength(3);
    expect(chunks.map(chunk => chunk.ordinal)).toEqual([0, 1, 2]);
  });

  test('drops empty sections', () => {
    expect(chunkLibrarySections([{ locator: {}, text: '   \n\n  ' }])).toEqual([]);
  });
});

describe('deriveLibraryTitle', () => {
  test('uses the first non-empty line', () => {
    const title = deriveLibraryTitle([
      { locator: {}, text: '\n\n   \n' },
      { locator: { page: 1 }, text: '  Lease agreement  \nThe tenant pays rent.' },
    ], 'lease.docx');
    expect(title).toBe('Lease agreement');
  });

  test('cuts a long first line and falls back to the file name', () => {
    const long = 'A'.repeat(200);
    expect(deriveLibraryTitle([{ locator: {}, text: long }], 'x')).toHaveLength(118);
    expect(deriveLibraryTitle([{ locator: {}, text: long }], 'x').endsWith('…')).toBe(true);
    expect(deriveLibraryTitle([], 'notes.txt')).toBe('notes.txt');
  });
});
