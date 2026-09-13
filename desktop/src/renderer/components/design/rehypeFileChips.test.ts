import type { Element, Root } from 'hast';
import { describe, expect, test } from 'vitest';

import rehypeFileChips, { buildFileChipMatcher, FILE_CHIP_CLASS } from './rehypeFileChips';

const paragraph = (value: string): Root => ({
  type: 'root',
  children: [{ type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value }] }],
});

const chipsIn = (tree: Root): Element[] => (
  (tree.children[0] as Element).children.filter((node): node is Element => (
    node.type === 'element' && node.tagName === 'a'
  ))
);

describe('files named in the answer', () => {
  test('an absolute path becomes a chip, punctuation left out', () => {
    const matcher = buildFileChipMatcher([]);
    expect(matcher('See /Users/eva/Documents/budget.xlsx.')).toEqual([
      { start: 4, end: 36, text: '/Users/eva/Documents/budget.xlsx', path: '/Users/eva/Documents/budget.xlsx' },
    ]);
    expect(matcher('Also C:\\Work\\deck.pptx, then')).toMatchObject([{ text: 'C:\\Work\\deck.pptx' }]);
  });

  test('the bare name of a file the turn touched becomes a chip that opens that file', () => {
    const matcher = buildFileChipMatcher(['/Users/eva/Documents/budget.xlsx']);
    expect(matcher('see budget.xlsx, sheet Q3')).toEqual([
      { start: 4, end: 15, text: 'budget.xlsx', path: '/Users/eva/Documents/budget.xlsx' },
    ]);
    // A name the turn never saw stays text.
    expect(matcher('see other.xlsx')).toEqual([]);
    // Part of a longer word is not a match.
    expect(matcher('see old-budget.xlsx')).toEqual([]);
  });

  test('wraps the match in a link with the chip class, keeping the surrounding text', () => {
    const tree = paragraph('Open budget.xlsx and check.');
    rehypeFileChips({ knownFiles: ['/tmp/budget.xlsx'] })(tree);
    const chips = chipsIn(tree);
    expect(chips).toHaveLength(1);
    expect(chips[0].properties).toMatchObject({ href: 'file:///tmp/budget.xlsx', className: [FILE_CHIP_CLASS] });
    const children = (tree.children[0] as Element).children;
    expect(children[0]).toEqual({ type: 'text', value: 'Open ' });
    expect(children[2]).toEqual({ type: 'text', value: ' and check.' });
  });

  test('leaves code and existing links alone', () => {
    const tree: Root = {
      type: 'root',
      children: [{
        type: 'element',
        tagName: 'p',
        properties: {},
        children: [
          { type: 'element', tagName: 'code', properties: {}, children: [{ type: 'text', value: '/tmp/a.txt' }] },
          { type: 'element', tagName: 'a', properties: { href: 'x' }, children: [{ type: 'text', value: '/tmp/b.txt' }] },
        ],
      }],
    };
    rehypeFileChips()(tree);
    const children = (tree.children[0] as Element).children as Element[];
    expect(children[0].children).toEqual([{ type: 'text', value: '/tmp/a.txt' }]);
    expect(children[1].children).toEqual([{ type: 'text', value: '/tmp/b.txt' }]);
  });
});
