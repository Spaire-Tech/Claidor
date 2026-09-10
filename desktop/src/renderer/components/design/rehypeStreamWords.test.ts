import type { Element, ElementContent, Root, RootContent, Text } from 'hast';
import { describe, expect, test } from 'vitest';

import rehypeStreamWords, { splitWords, STREAM_WORD_CLASS, wrapTextWords } from './rehypeStreamWords';

const text = (value: string): Text => ({ type: 'text', value });
const element = (tagName: string, children: ElementContent[], className?: string[]): Element => ({
  type: 'element',
  tagName,
  properties: className ? { className } : {},
  children,
});
const root = (...children: RootContent[]): Root => ({ type: 'root', children });

const run = (tree: Root): Root => {
  rehypeStreamWords()(tree);
  return tree;
};

const isWordSpan = (node: RootContent): node is Element => (
  node.type === 'element'
  && node.tagName === 'span'
  && Array.isArray(node.properties?.className)
  && node.properties.className.includes(STREAM_WORD_CLASS)
);

const flatten = (nodes: RootContent[]): string => nodes.map((node) => {
  if (node.type === 'text') return node.value;
  if (node.type === 'element') return flatten(node.children);
  return '';
}).join('');

describe('the stream inside markdown', () => {
  test('splits keeping whitespace so line breaks survive', () => {
    expect(splitWords('one two\nthree')).toEqual(['one', ' ', 'two', '\n', 'three']);
    expect(splitWords('  lead')).toEqual(['  ', 'lead']);
    expect(splitWords('')).toEqual([]);
  });

  test('wraps every word of a paragraph and leaves the spaces as text', () => {
    const tree = run(root(element('p', [text('The budget is fine.')])));
    const paragraph = tree.children[0] as Element;
    const spans = paragraph.children.filter(isWordSpan);
    expect(spans).toHaveLength(4);
    expect(spans.map((span) => flatten(span.children))).toEqual(['The', 'budget', 'is', 'fine.']);
    // Whitespace stays a text node between the spans.
    expect(paragraph.children[1]).toEqual({ type: 'text', value: ' ' });
    // Nothing is lost.
    expect(flatten(paragraph.children)).toBe('The budget is fine.');
  });

  test('wraps words inside emphasis and links, keyed by position', () => {
    const tree = run(root(element('p', [
      text('see '),
      element('a', [text('the file')], undefined),
      text(' now'),
    ])));
    const paragraph = tree.children[0] as Element;
    const link = paragraph.children.find((node): node is Element => node.type === 'element' && node.tagName === 'a');
    expect(link?.children.filter(isWordSpan)).toHaveLength(2);
    // A whitespace-only text node is kept as it is, not wrapped.
    expect(paragraph.children[0]).toMatchObject({ type: 'element', tagName: 'span' });
    expect(paragraph.children[1]).toEqual({ type: 'text', value: ' ' });
  });

  test('a code block, inline code and a table reveal whole', () => {
    const tree = run(root(
      element('pre', [element('code', [text('let a = 1;')])]),
      element('p', [text('run '), element('code', [text('npm test')])]),
      element('table', [element('tr', [element('td', [text('Q3 revenue')])])]),
    ));
    const [pre, paragraph, table] = tree.children as Element[];
    const code = pre.children[0] as Element;
    expect(code.children).toEqual([text('let a = 1;')]);
    const inlineCode = paragraph.children[paragraph.children.length - 1] as Element;
    expect(inlineCode.children).toEqual([text('npm test')]);
    const cell = ((table.children[0] as Element).children[0] as Element);
    expect(cell.children).toEqual([text('Q3 revenue')]);
    // The prose next to the code still streams.
    expect(paragraph.children.filter(isWordSpan)).toHaveLength(1);
  });

  test('math and file chips reveal whole', () => {
    const tree = run(root(
      element('span', [text('x = 1')], ['katex']),
      element('a', [text('budget.xlsx')], ['maties-file-chip']),
    ));
    for (const node of tree.children as Element[]) {
      expect(node.children).toEqual([text(node.tagName === 'span' ? 'x = 1' : 'budget.xlsx')]);
    }
  });

  test('a growing prefix keeps the earlier words at the same positions', () => {
    const before = wrapTextWords(text('The budget is fi'));
    const after = wrapTextWords(text('The budget is fine, mostly.'));
    // Same shape up to the word that was still arriving; that word grows in
    // place and only the new one is appended.
    expect(before).toHaveLength(7);
    expect(after).toHaveLength(9);
    for (let at = 0; at < 6; at += 1) {
      expect(after[at]).toEqual(before[at]);
    }
    expect(flatten([before[6]])).toBe('fi');
    expect(flatten([after[6]])).toBe('fine,');
  });
});
