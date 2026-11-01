// A message's blocks and the styles within a line, against the shared core's
// MarkdownTests and ChatExtrasTests (maths), and the line reading Foundation's
// inline Markdown gives the Mac (bold, italics, code, links, strikethrough),
// then GitHub's bare links.

import { describe, expect, it } from 'vitest'
import {
  autolinks,
  inlineMath,
  inlineRuns,
  markdownBlocks,
  shownWords,
  soleFence,
} from './markdown'

describe('a message’s blocks', () => {
  it('reads headings, lists, tasks, quotes, code, tables and rules', () => {
    const text = [
      '# Plan',
      'Here is **the** list:',
      '',
      '- one',
      '- two',
      '  - nested',
      '1. first',
      '2. second',
      '- [ ] todo',
      '- [x] done',
      '',
      '> quoted',
      '> more',
      '',
      '```swift',
      'let a = 1',
      '```',
      '',
      '| Name | Price |',
      '|:-----|------:|',
      '| Tea  | 3     |',
      '',
      '---',
    ].join('\n')
    const blocks = markdownBlocks(text)
    expect(blocks[0]).toEqual({ type: 'heading', level: 1, text: 'Plan' })
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      text: 'Here is **the** list:',
    })
    const bullets = blocks[2]!
    expect(
      bullets.type === 'list' && !bullets.ordered && bullets.items.length,
    ).toBe(2)
    expect(bullets.type === 'list' && bullets.items[1]!.blocks.length).toBe(2)
    const numbered = blocks[3]!
    expect(
      numbered.type === 'list' && [
        numbered.ordered,
        numbered.start,
        numbered.items.length,
      ],
    ).toEqual([true, 1, 2])
    const tasks = blocks[4]!
    expect(
      tasks.type === 'list' && tasks.items.map((item) => item.checked),
    ).toEqual([false, true])
    expect(blocks[5]).toEqual({
      type: 'quote',
      blocks: [{ type: 'paragraph', text: 'quoted\nmore' }],
    })
    expect(blocks[6]).toEqual({
      type: 'code',
      language: 'swift',
      text: 'let a = 1',
    })
    expect(blocks[7]).toEqual({
      type: 'table',
      header: ['Name', 'Price'],
      alignments: ['leading', 'trailing'],
      rows: [['Tea', '3']],
    })
    expect(blocks[8]).toEqual({ type: 'rule' })
    expect(blocks.length).toBe(9)
  })

  it('knows a message that is one fence', () => {
    expect(soleFence('```simeon-flights\n{"a":1}\n```', 'simeon-flights')).toBe(
      '{"a":1}',
    )
    expect(
      soleFence('Look:\n```simeon-flights\n{}\n```', 'simeon-flights'),
    ).toBeUndefined()
  })

  it('reads display maths on its own lines', () => {
    expect(markdownBlocks('Before\n\n$$\nE = mc^2\n$$\n\nAfter')).toEqual([
      { type: 'paragraph', text: 'Before' },
      { type: 'math', text: 'E = mc^2' },
      { type: 'paragraph', text: 'After' },
    ])
    expect(markdownBlocks('```math\n\\frac{a}{b}\n```')).toEqual([
      { type: 'math', text: '\\frac{a}{b}' },
    ])
    expect(markdownBlocks('$$\na\n$$$\nafter')).toEqual([
      { type: 'math', text: 'a' },
      { type: 'paragraph', text: 'after' },
    ])
    expect(markdownBlocks('$$\na\nb$$')).toEqual([
      { type: 'math', text: 'a\nb$$' },
    ])
    expect(markdownBlocks('$$x$$')).toEqual([
      { type: 'paragraph', text: '$$x$$' },
    ])
    expect(markdownBlocks('\\[ x^2 \\]')).toEqual([
      { type: 'math', text: 'x^2' },
    ])
    expect(markdownBlocks('Text\n\\[\na + b\n\\]\nmore')).toEqual([
      { type: 'paragraph', text: 'Text' },
      { type: 'math', text: 'a + b' },
      { type: 'paragraph', text: 'more' },
    ])
  })

  it('reads maths within a line', () => {
    const parts = inlineMath('The area is $$\\pi r^2$$ for $5')
    expect(parts?.map((part) => part.math)).toEqual([false, true, false])
    expect(parts?.map((part) => part.text)).toEqual([
      'The area is ',
      '\\pi r^2',
      ' for $5',
    ])
    expect(inlineMath('It costs $5 or $6')).toBeUndefined()
    expect(inlineMath('An unclosed $$x')).toBeUndefined()
    expect(inlineMath('Empty $$$$ here')).toBeUndefined()
    expect(markdownBlocks('A line with $$x$$ in it')).toEqual([
      { type: 'paragraph', text: 'A line with $$x$$ in it' },
    ])
    expect(
      inlineMath('So \\( a+b \\) and \\[c\\].')?.map((part) => part.text),
    ).toEqual(['So ', 'a+b', ' and ', 'c', '.'])
    expect(
      inlineMath('Runs: $$$a$$b$$$ end')?.map((part) => part.text),
    ).toEqual(['Runs: ', 'a$$b', ' end'])
    expect(inlineMath('An unclosed \\(x')).toBeUndefined()
  })
})

describe('the styles within a line', () => {
  it('reads bold, italics, code, strikethrough and links', () => {
    expect(inlineRuns('Here is **the** list')).toEqual([
      { text: 'Here is ' },
      { text: 'the', bold: true },
      { text: ' list' },
    ])
    expect(inlineRuns('*one* and _two_')).toEqual([
      { text: 'one', italic: true },
      { text: ' and ' },
      { text: 'two', italic: true },
    ])
    expect(inlineRuns('***both***')).toEqual([
      { text: 'both', bold: true, italic: true },
    ])
    expect(inlineRuns('Run `npm test` now')).toEqual([
      { text: 'Run ' },
      { text: 'npm test', code: true },
      { text: ' now' },
    ])
    expect(inlineRuns('~~gone~~ here')).toEqual([
      { text: 'gone', struck: true },
      { text: ' here' },
    ])
    expect(
      inlineRuns('See [the **doc**](https://x.com/d "Title") now'),
    ).toEqual([
      { text: 'See ' },
      { text: 'the ', link: 'https://x.com/d' },
      { text: 'doc', bold: true, link: 'https://x.com/d' },
      { text: ' now' },
    ])
  })

  it('leaves marks that open nothing as they are', () => {
    expect(shownWords('2 * 3 * 4')).toBe('2 * 3 * 4')
    expect(shownWords('snake_case_name')).toBe('snake_case_name')
    expect(shownWords('an ** unclosed')).toBe('an ** unclosed')
    expect(shownWords('[not a link]')).toBe('[not a link]')
    expect(shownWords('\\*not italic\\*')).toBe('*not italic*')
    expect(shownWords('`unclosed code')).toBe('`unclosed code')
  })

  it('keeps code’s marks as words', () => {
    expect(inlineRuns('`**x**` and **y**')).toEqual([
      { text: '**x**', code: true },
      { text: ' and ' },
      { text: 'y', bold: true },
    ])
  })

  it('shows a picture in the words as what it shows, and an address in brackets as a link', () => {
    expect(shownWords('A ![chart](https://x.com/c.png) here')).toBe(
      'A chart here',
    )
    expect(inlineRuns('<https://x.com>')).toEqual([
      { text: 'https://x.com', link: 'https://x.com' },
    ])
    expect(inlineRuns('<bass@simeonlabs.com>')).toEqual([
      { text: 'bass@simeonlabs.com', link: 'mailto:bass@simeonlabs.com' },
    ])
  })

  it('finds bare addresses, leaving the sentence’s stop out', () => {
    expect(autolinks('Go to https://simeonlabs.com/pricing.')).toEqual([
      { text: 'Go to ' },
      {
        text: 'https://simeonlabs.com/pricing',
        url: 'https://simeonlabs.com/pricing',
      },
      { text: '.' },
    ])
    expect(autolinks('(see www.example.com/a)')).toEqual([
      { text: '(see ' },
      { text: 'www.example.com/a', url: 'http://www.example.com/a' },
      { text: ')' },
    ])
    expect(autolinks('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual([
      {
        text: 'https://en.wikipedia.org/wiki/Foo_(bar)',
        url: 'https://en.wikipedia.org/wiki/Foo_(bar)',
      },
    ])
    expect(autolinks('no address here')).toEqual([{ text: 'no address here' }])
    expect(inlineRuns('Open **https://x.com** now')).toEqual([
      { text: 'Open ' },
      { text: 'https://x.com', bold: true, link: 'https://x.com' },
      { text: ' now' },
    ])
  })
})
