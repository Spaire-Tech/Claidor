// SimeonCore's ChatFindTests (ChatExtrasTests.swift), translated, with the
// Mac's marks (Find.swift) on the words on screen.

import { describe, expect, it } from 'vitest'
import {
  FindLine,
  FindMarks,
  findIndex,
  findMatches,
  findTextOf,
  marksPerBlock,
  steppedIndex,
} from './chatFind'
import { Entry } from './entry'
import type { JSONValue } from './json'
import { markdownBlocks } from './markdown'

const entry = (json: JSONValue) => Entry.from(json)!
const line = (id: string, text: string, role = 'assistant') =>
  entry({ kind: 'message', id, role, content: text })

describe('find in the chat', () => {
  it("counts every time the words appear, as the window's find reads", () => {
    const entries = [
      line('a', 'Send me your RESUME, the resume'),
      line('b', 'the résumé is attached', 'user'),
      entry({
        kind: 'user-attachment',
        id: 'f',
        file_name: 'resume.pdf',
        file_path: '/x/resume.pdf',
      }),
      entry({ kind: 'notice', id: 'n', text: 'Resume saved' }),
      entry({
        kind: 'send-message',
        id: 'd',
        message: {
          type: 'email-draft',
          draft: { subject: 'Resume', body: 'Attached: resume' },
        },
      }),
      entry({
        kind: 'message',
        id: 't',
        role: 'assistant',
        content: 'resume for Iris',
        toAgent: { id: 'iris', name: 'Iris' },
      }),
    ]
    // Capitals don't count, accents do; a file's name and agents talking to each other are not read.
    expect(findMatches('resume', entries)).toEqual([
      { rowId: 'a', occurrence: 0 },
      { rowId: 'a', occurrence: 1 },
      { rowId: 'n', occurrence: 0 },
      { rowId: 'd', occurrence: 0 },
      { rowId: 'd', occurrence: 1 },
    ])
    expect(findMatches('  ', entries)).toEqual([])
    // Matches do not overlap.
    expect(findMatches('aa', [line('x', 'aaaa')]).length).toBe(2)
  })

  it('starts at the newest and steps as the window does', () => {
    const found = ['a', 'b', 'f'].map((rowId) => ({ rowId, occurrence: 0 }))
    expect(findIndex(found, undefined, 'x')).toBe(2)
    expect(steppedIndex(1, 1, 3)).toBe(2)
    expect(steppedIndex(2, 1, 3)).toBe(0)
    expect(steppedIndex(0, -1, 3)).toBe(2)
    // Nothing chosen counts as the newest.
    expect(steppedIndex(findIndex(found, undefined, 'x')!, 1, 3)).toBe(0)
    expect(steppedIndex(findIndex(found, undefined, 'x')!, -1, 3)).toBe(1)
    expect(findIndex([], undefined, 'x')).toBeUndefined()
    // The match stepped to while it is there; gone, its place; other words, the newest.
    const choice = { query: 'x', match: found[1]!, index: 1 }
    expect(findIndex(found, choice, 'x')).toBe(1)
    expect(findIndex([found[0]!, found[2]!], choice, 'x')).toBe(1)
    expect(findIndex(found, choice, 'y')).toBe(2)
  })

  it('marks the words on screen, the current one counted past the words before', () => {
    const marks = new FindMarks('ab', 1)
    expect(marks.ranges('xAbyab')).toEqual([
      { start: 1, end: 3 },
      { start: 4, end: 6 },
    ])
    const marked = FindLine.of(marks, 'xAbyab')!
    expect(marked.cut('xAbyab', 0)).toEqual([
      { text: 'x' },
      { text: 'Ab', mark: 'match' },
      { text: 'y' },
      { text: 'ab', mark: 'current' },
    ])
    // A run that starts inside the words: its own part of a mark.
    expect(marked.cut('yab', 3)).toEqual([
      { text: 'y' },
      { text: 'ab', mark: 'current' },
    ])
    expect(marks.skipping('ab ab').current).toBe(-1)
    expect(FindLine.of(marks, 'nothing')).toBeUndefined()
    // Each block counted past the ones before: the second paragraph holds the current one.
    const blocks = markdownBlocks('An **ab** here\n\nAnd ab there')
    expect(findTextOf(blocks[0]!)).toBe('An ab here')
    expect(
      marksPerBlock(blocks, new FindMarks('ab', 1)).map((m) => m?.current),
    ).toEqual([1, 0])
  })
})
