// Find in the chat (⌘F): which lines hold the words and how often
// (SimeonCore's ChatFind.swift), and where they show in the words on screen
// (`FindMarks`, `FindLine` and `FindText` in mac/Simeon/Find.swift).

import type { Entry } from './entry'
import { field, isObject, str } from './json'
import { type MarkdownBlock, inlineMath, shownWords } from './markdown'

/** One time the words appear: in which line (its row has the line's id), and which time in it (0 for the first). */
export interface FindMatch {
  rowId: string
  occurrence: number
}

export const sameMatch = (a?: FindMatch, b?: FindMatch) =>
  a != null && b != null && a.rowId === b.rowId && a.occurrence === b.occurrence

/**
 * Every time what is typed appears in the lines on screen, oldest first,
 * matched without regard to capitals (`ChatFind.matches`, the window's
 * `f_n`). It reads a message's words (not agents talking to each other), a
 * question's prompt, an email draft's subject and body, a Slack draft's body
 * and a notice.
 */
export function findMatches(
  query: string,
  entries: readonly Entry[],
): FindMatch[] {
  if (query.trim() === '') return []
  const needle = query.toLowerCase()
  const out: FindMatch[] = []
  for (const entry of entries) {
    const haystack = findableText(entry).toLowerCase()
    if (haystack.length < needle.length) continue
    let from = 0
    let occurrence = 0
    for (;;) {
      const found = haystack.indexOf(needle, from)
      if (found < 0) break
      out.push({ rowId: entry.id, occurrence })
      occurrence += 1
      from = found + needle.length
    }
  }
  return out
}

/** The words of a line that find reads (the window's `d_n`). */
export function findableText(entry: Entry): string {
  switch (entry.kind) {
    case 'message':
      return entry.teammate == null ? (entry.content ?? '') : ''
    case 'send-message': {
      const message = entry.message
      if (!isObject(message)) return ''
      switch (str(field(message, 'type'))) {
        case 'text':
          return str(field(message, 'content')) ?? ''
        case 'widget':
          return str(field(field(message, 'widget'), 'prompt')) ?? ''
        case 'email-draft': {
          const draft = field(message, 'draft')
          return (
            (str(field(draft, 'subject')) ?? '') +
            '\n' +
            (str(field(draft, 'body')) ?? '')
          )
        }
        case 'slack-draft':
          return str(field(field(message, 'draft'), 'body')) ?? ''
        default:
          return ''
      }
    }
    case 'notice':
      return str(entry.get('text')) ?? ''
    default:
      return ''
  }
}

/**
 * Where find stands among `matches` (`ChatControl.findIndex`, the window's
 * `h_n`): the match stepped to while it is still there, else the place it
 * had (or the last place left), and with nothing stepped to for these
 * words, the newest.
 */
export function findIndex(
  matches: readonly FindMatch[],
  choice: { query: string; match: FindMatch; index: number } | undefined,
  query: string,
): number | undefined {
  if (matches.length === 0) return undefined
  if (!choice || choice.query !== query) return matches.length - 1
  const at = matches.findIndex((match) => sameMatch(match, choice.match))
  return at >= 0 ? at : Math.min(choice.index, matches.length - 1)
}

/** Next (`delta` 1) or Previous (-1) from `current`, round at either end (`p_n`). */
export function steppedIndex(
  current: number,
  delta: number,
  count: number,
): number {
  return (((current + delta) % count) + count) % count
}

/**
 * What find lights in a row's words (`FindMarks`): every time the words
 * appear, and which of those times in these words is the current match
 * (none when it is not in this row). The window lights the words on screen
 * in the row's order and finds the current match by its count there, so
 * `current` is that count less the times the words appear before.
 */
export class FindMarks {
  constructor(
    /** What is found, in small letters (not trimmed). */
    readonly needle: string,
    readonly current?: number,
  ) {}

  /** Where the needle appears in `text` (UTF-16, as the window counts), left to right, none overlapping. */
  ranges(text: string): { start: number; end: number }[] {
    if (this.needle === '') return []
    const lower = text.toLowerCase()
    // A letter whose small form is longer would move every place after it: then search the words as they are.
    const haystack = lower.length === text.length ? lower : text
    const out: { start: number; end: number }[] = []
    let from = 0
    while (from < haystack.length) {
      const found = haystack.indexOf(this.needle, from)
      if (found < 0) break
      out.push({ start: found, end: found + this.needle.length })
      from = found + this.needle.length
    }
    return out
  }

  /** The same marks for the words after `text`. */
  skipping(text: string): FindMarks {
    if (this.current == null) return this
    return new FindMarks(this.needle, this.current - this.ranges(text).length)
  }
}

export type FindMark = 'match' | 'current'

/** The marks over one run of words (`FindLine`): the ranges found in it and which of them is current. */
export class FindLine {
  private constructor(
    readonly ranges: { start: number; end: number }[],
    readonly current: number | undefined,
  ) {}

  static of(marks: FindMarks | undefined, text: string): FindLine | undefined {
    if (!marks) return undefined
    const found = marks.ranges(text)
    if (found.length === 0) return undefined
    return new FindLine(found, marks.current)
  }

  /** `words`, which start at `offset` in the run, cut where the marks begin and end. */
  cut(words: string, offset: number): { text: string; mark?: FindMark }[] {
    const end = offset + words.length
    const out: { text: string; mark?: FindMark }[] = []
    let cursor = offset
    this.ranges.forEach((range, index) => {
      const low = Math.max(range.start, cursor)
      const high = Math.min(range.end, end)
      if (low >= high) return
      if (low > cursor)
        out.push({ text: words.slice(cursor - offset, low - offset) })
      out.push({
        text: words.slice(low - offset, high - offset),
        mark: index === this.current ? 'current' : 'match',
      })
      cursor = high
    })
    if (cursor < end) out.push({ text: words.slice(cursor - offset) })
    return out
  }
}

/**
 * The words a message's block shows, in order, as find counts them on
 * screen (`FindText.of`): what the Markdown leaves of a paragraph, a heading,
 * a list's items, a quote, a code block and a table's cells. Numbers and
 * bullets, maths and diagrams are not words in the window either.
 */
export function findTextOf(block: MarkdownBlock): string {
  switch (block.type) {
    case 'paragraph':
      return inlineMath(block.text) != null ? '' : shownWords(block.text)
    case 'heading':
      return shownWords(block.text)
    case 'list':
      return block.items
        .map((item) => item.blocks.map(findTextOf).join(''))
        .join('')
    case 'quote':
      return block.blocks.map(findTextOf).join('')
    case 'code':
      return block.language?.toLowerCase() === 'mermaid' ? '' : block.text
    case 'table':
      return tableCells(block.header, block.rows).map(shownWords).join('')
    default:
      return ''
  }
}

/** A table's cells as the window lays them out: the heading row, then each row as wide as the heading. */
export function tableCells(
  header: readonly string[],
  rows: readonly string[][],
): string[] {
  const out = [...header]
  for (const row of rows)
    for (let column = 0; column < header.length; column++)
      out.push(row[column] ?? '')
  return out
}

/** Each block's marks, find's current match counted past the blocks before it (`MessageBlocks.lines`). */
export function marksPerBlock(
  blocks: readonly MarkdownBlock[],
  marks: FindMarks | undefined,
): (FindMarks | undefined)[] {
  if (marks?.current == null) return blocks.map(() => marks)
  const out: (FindMarks | undefined)[] = []
  let next = marks
  for (const block of blocks) {
    out.push(next)
    next = next.skipping(findTextOf(block))
  }
  return out
}
