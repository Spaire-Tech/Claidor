// A chat's rows, against the shared core's own tests (ChatTests, ChatThreadTests,
// ReactionsTests and SendArgumentTests in ios/SimeonCore/Tests/SimeonCoreTests)
// and the window's own functions run on the same lines (`Fixtures/chat-runs.json`,
// `Fixtures/sender-keys.json`).

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { LiveBackend } from './backend'
import {
  type Bubble,
  type ChatRow,
  aspect,
  callClock,
  callLength,
  chatRows,
  clipped,
  clippedCode,
  exchangeLabel,
  exchangeOf,
  loneLink,
  notShown,
  quoteLine,
  routineVerb,
  rowFor,
  stampText,
  threadCounts,
  threadEntries,
  threadRows,
  threadTitle,
} from './chat'
import {
  displayItems,
  isLoneEmoji,
  isOneEmoji,
  runFlags,
  senderKey,
} from './chatRuns'
import { Entry, appliedChange, transcriptChangeFrom } from './entry'
import type { JSONValue } from './json'
import { offlineMarked } from './store'
import { loadWords } from './words'

// The English tables, as the app loads them before its first screen: the keyed sentences read theirs.
beforeAll(() => loadWords('en'))

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) =>
  JSON.parse(
    readFileSync(
      resolve(
        here,
        '../../../../../ios/SimeonCore/Tests/SimeonCoreTests/Fixtures',
        `${name}.json`,
      ),
      'utf8',
    ),
  ) as Record<string, JSONValue>

const entry = (json: Record<string, JSONValue>) => Entry.from(json)!

function line(
  id: string,
  words: string,
  options: { role?: string; replyTo?: string; branched?: boolean; at: number },
): Entry {
  const json: Record<string, JSONValue> = {
    kind: 'message',
    id,
    role: options.role ?? 'user',
    content: words,
    timestampMs: options.at,
  }
  if (options.replyTo != null) json.replyTo = options.replyTo
  if (options.branched) json.branched = true
  return entry(json)
}

const bubbles = (rows: ChatRow[]): Bubble[] =>
  rows.flatMap((row) => (row.kind === 'bubble' ? [row.bubble] : []))

describe('the runs, as the window makes them', () => {
  it('reads who each line is from as the window does', () => {
    const doc = fixture('sender-keys')
    const entries = Entry.list(doc.entries)
    const keys = doc.keys as [string, string][]
    expect(entries.length).toBe(keys.length)
    entries.forEach((line, index) => {
      expect(line.id).toBe(keys[index]![0])
      expect(senderKey(line)).toBe(keys[index]![1])
    })
  })

  it('makes the display list the window makes', () => {
    const doc = fixture('chat-runs')
    const entries = Entry.list(doc.entries)
    const items = displayItems(entries, doc.unreadAfter as number)
    const expected = (doc.items as { kind: string; ids: string[] }[]).map(
      (item) => `${item.kind}:${(item.ids ?? []).join(',')}`,
    )
    expect(
      items.map(
        (item) => `${item.kind}:${item.entries.map((e) => e.id).join(',')}`,
      ),
    ).toEqual(expected)
  })

  it('draws the runs the window draws', () => {
    const doc = fixture('chat-runs')
    const entries = Entry.list(doc.entries)
    const flags = runFlags(
      entries,
      doc.unreadAfter as number,
      new Set(doc.threads as string[]),
    )
    let checked = 0
    for (const item of doc.items as Record<string, JSONValue>[]) {
      if (typeof item.startsGroup !== 'boolean') continue
      const id = (item.ids as string[])[0]!
      expect(flags[id], id).toEqual({
        startsGroup: item.startsGroup,
        continuesPrevious: item.continuesPrevious ?? false,
        continuesNext: item.continuesNext ?? false,
        aboveThreadChip: item.aboveThreadChip ?? false,
      })
      checked += 1
    }
    expect(checked).toBeGreaterThan(30)
  })
})

describe('the chat’s rows', () => {
  it('swaps a changed line by its id, or adds it at the end', () => {
    const a = entry({ kind: 'message', id: 'a', role: 'user', content: 'one' })
    const b = entry({
      kind: 'message',
      id: 'b',
      role: 'assistant',
      content: 'tw',
      isStreaming: true,
    })
    const b2 = entry({
      kind: 'message',
      id: 'b',
      role: 'assistant',
      content: 'two',
    })
    let list = appliedChange({ type: 'upsert', agentId: 'x', entry: a }, [])
    list = appliedChange({ type: 'upsert', agentId: 'x', entry: b }, list)
    list = appliedChange(
      transcriptChangeFrom({ type: 'updated', agentId: 'x', entry: b2.raw })!,
      list,
    )
    expect(list.map((e) => e.content)).toEqual(['one', 'two'])
    expect(
      appliedChange(
        transcriptChangeFrom({ type: 'removed', agentId: 'x', id: 'a' })!,
        list,
      ).map((e) => e.id),
    ).toEqual(['b'])
    expect(
      appliedChange(
        transcriptChangeFrom({ type: 'cleared', agentId: 'x' })!,
        list,
      ),
    ).toEqual([])
  })

  it('words exchanges and routines as the window does', () => {
    const scout = { id: 'scout', name: 'Scout' }
    const iris = { id: 'iris', name: 'Iris' }
    const to = (id: string, peer: typeof scout) =>
      entry({
        kind: 'message',
        id,
        role: 'assistant',
        content: 'hi',
        toAgent: peer,
      })
    const from = (id: string, peer: typeof scout) =>
      entry({
        kind: 'message',
        id,
        role: 'user',
        content: 'hi',
        fromAgent: peer,
      })
    expect(exchangeLabel(exchangeOf([to('a', scout)]))).toBe('Messaged')
    expect(exchangeLabel(exchangeOf([from('a', scout)]))).toBe('Message from')
    expect(exchangeOf([to('a', scout), to('b', iris)])).toEqual({
      kind: 'fanout',
      peers: [scout, iris],
    })
    expect(exchangeLabel(exchangeOf([to('a', scout), from('b', scout)]))).toBe(
      '2 messages with',
    )
    const routine = (id: string, action: string, name: string) =>
      entry({
        kind: 'event',
        id,
        event: {
          type: 'automation-changed',
          action,
          automationId: name,
          automationName: name,
        },
      })
    const rows = chatRows([
      routine('r1', 'created', 'Daily brief'),
      routine('r2', 'created', 'Monday check'),
      routine('r3', 'updated', 'Daily brief'),
      routine('r4', 'deleted', 'Old one'),
    ])
    const lines = rows.flatMap((row) =>
      row.kind === 'routines'
        ? [
            `${routineVerb(row.action)} ${row.routines.map((r) => r.name).join('+')}`,
          ]
        : [],
    )
    expect(lines).toEqual([
      'Created Daily brief+Monday check',
      'Deleted Old one',
    ])
  })

  it('puts the New line before the first unread agent line', () => {
    const entries = [
      entry({
        kind: 'message',
        id: 'u',
        role: 'user',
        content: 'hi',
        timestampMs: 1000,
      }),
      entry({
        kind: 'send-message',
        id: 'a',
        message: { type: 'text', content: 'one' },
        timestampMs: 2000,
      }),
      entry({
        kind: 'send-message',
        id: 'b',
        message: { type: 'text', content: 'two' },
        timestampMs: 3000,
      }),
    ]
    const rows = chatRows(entries, { unreadAfter: 2500 })
    expect(
      rows.map((row) => row.id).filter((id) => !id.startsWith('stamp')),
    ).toEqual(['u', 'a', 'unread-divider', 'b'])
  })

  it('quotes what a reply answers', () => {
    const now = 1_760_000_000_000
    const entries = [
      entry({
        kind: 'message',
        id: 'a1',
        role: 'assistant',
        content: 'Thursday is on track:\n12 of 15   tickets are done.',
        timestampMs: now - 60_000,
      }),
      entry({
        kind: 'message',
        id: 'u1',
        role: 'user',
        content: 'Which three are left?',
        replyTo: 'a1',
        timestampMs: now,
      }),
      entry({
        kind: 'message',
        id: 'u2',
        role: 'user',
        content: 'And this?',
        replyTo: 'gone',
        timestampMs: now + 1000,
      }),
    ]
    const shown = bubbles(chatRows(entries))
    expect(shown.length).toBe(3)
    expect(shown[0]!.quote).toBeUndefined()
    expect(shown[1]!.replyTo).toBe('a1')
    expect(shown[1]!.quote).toBe(
      'Thursday is on track: 12 of 15 tickets are done.',
    )
    expect(shown[1]!.timestampMs).toBe(now)
    expect(shown[2]!.quote).toBe('(deleted)')
    expect(quoteLine(entries[0], 10)).toBe('Thursday…')
  })

  it('quotes nothing in an agent’s answer to the only line since', () => {
    const one = [
      line('m1', 'Create a finance agent', { at: 1_000 }),
      line('a1', 'On it', { role: 'assistant', replyTo: 'm1', at: 2_000 }),
      line('a2', 'Hired Nora', { role: 'assistant', replyTo: 'm1', at: 3_000 }),
    ]
    const shown = bubbles(chatRows(one))
    expect(shown.map((b) => b.id)).toEqual(['m1', 'a1', 'a2'])
    expect(shown[1]!.quote).toBeUndefined()
    expect(shown[2]!.quote).toBeUndefined()
    const two = [
      line('m1', 'Create a finance agent', { at: 1_000 }),
      line('m2', 'And a marketing one', { at: 1_500 }),
      line('a1', 'On it', { role: 'assistant', replyTo: 'm1', at: 2_000 }),
      line('a2', 'On it too', { role: 'assistant', replyTo: 'm2', at: 3_000 }),
    ]
    const answers = bubbles(chatRows(two))
    expect(answers.find((b) => b.id === 'a1')?.quote).toBe(
      'Create a finance agent',
    )
    expect(answers.find((b) => b.id === 'a2')?.quote).toBeUndefined()
  })

  it('cuts a long message for drawing', () => {
    expect(clipped('Hello', 3_000)).toEqual({ text: 'Hello', clipped: false })
    const lines = Array.from(
      { length: 400 },
      (_, i) => `Line ${i + 1} of the report.`,
    ).join('\n')
    const cut = clipped(lines, 3_000)
    expect(cut.clipped).toBe(true)
    expect(cut.text.length).toBeLessThanOrEqual(3_001)
    expect(cut.text.endsWith('of the report.')).toBe(true)
    expect(clipped('A'.repeat(2_000_000), 3_000).text.length).toBe(3_001)
    const code = clippedCode(
      Array.from({ length: 500 }, () => 'x'.repeat(5_000)).join('\n'),
      200,
      1_000,
    )
    expect(code.clipped).toBe(true)
    expect(code.text.split('\n').length).toBe(200)
    expect(code.text.split('\n')[0]!.length).toBe(1_001)
  })

  it('draws a repeated line once', () => {
    const json = {
      kind: 'message',
      id: 'm1',
      role: 'assistant',
      content: 'Hello',
      timestampMs: 1_000,
    }
    expect(
      chatRows([entry(json), entry(json)]).filter((row) => row.id === 'm1')
        .length,
    ).toBe(1)
  })

  it('knows the person’s own reactions, the ones the computer marks “me”', () => {
    const message = (reactions: JSONValue[]) =>
      entry({
        id: 'm1',
        kind: 'message',
        role: 'assistant',
        content: 'Done.',
        reactions,
      })
    const marked = message([
      { emoji: '👍', by: 'me' },
      { emoji: '❤️', by: 'agent-2' },
      { emoji: '🎉', by: 'user' },
    ])
    expect(marked.myReactions).toEqual(['👍', '🎉'])
    const row = rowFor(marked)
    expect(row?.kind === 'bubble' && row.bubble.myReactions).toEqual([
      '👍',
      '🎉',
    ])
    expect(row?.kind === 'bubble' && row.bubble.reactions).toEqual([
      '👍',
      '❤️',
      '🎉',
    ])
    const on = message([{ emoji: '👍', by: 'agent-2' }]).togglingMyReaction(
      '👍',
    )
    expect(on.reactions.map((r) => r.by)).toEqual(['agent-2', 'me'])
    expect(on.togglingMyReaction('👍').reactions.map((r) => r.by)).toEqual([
      'agent-2',
    ])
    expect(
      message([])
        .togglingMyReaction('😂')
        .togglingMyReaction('😂')
        .get('reactions'),
    ).toBeUndefined()
  })

  it('keeps every card’s line for step 3, and says so in its place', () => {
    const rows = chatRows([
      entry({
        kind: 'send-message',
        id: 'q',
        message: {
          type: 'widget',
          widget: { prompt: 'What first?', options: [{ label: 'Inbox' }] },
        },
      }),
      entry({
        kind: 'send-message',
        id: 'c',
        message: { type: 'connectors', connectors: ['Gmail', 'Notion'] },
      }),
      entry({ kind: 'tool-call', id: 't' }),
      entry({
        kind: 'send-message',
        id: 'f',
        message: {
          type: 'text',
          content: '```simeon-flights\n{"offers":[{"airline":"Delta"}]}\n```',
        },
      }),
      entry({
        kind: 'send-message',
        id: 'p',
        message: { type: 'permission-request', permission: { title: 'x' } },
      }),
      entry({
        kind: 'send-message',
        id: 'z',
        message: { type: 'something-new' },
      }),
    ])
    expect(
      rows.map((row) => (row.kind === 'card' ? `card:${row.card}` : row.kind)),
    ).toEqual([
      'card:question',
      'card:connectors',
      'card:flights',
      'notice',
      'notice',
    ])
    const last = rows[rows.length - 1]!
    expect(last.kind === 'notice' && last.text).toBe(notShown())
  })
})

describe('threads', () => {
  const chat = [
    line('m1', 'Draft the brief', { at: 1_000 }),
    line('r1', 'On it', {
      role: 'assistant',
      replyTo: 'm1',
      branched: true,
      at: 2_000,
    }),
    line('r2', 'Shorter please', { replyTo: 'r1', branched: true, at: 3_000 }),
    line('m2', 'Also book the flight', { at: 4_000 }),
    line('q1', 'Which one?', { role: 'assistant', replyTo: 'm1', at: 5_000 }),
  ]

  it('keeps a thread’s replies out of the chat and counts them under their message', () => {
    const rows = chatRows(chat)
    expect(rows.some((row) => row.id === 'r1' || row.id === 'r2')).toBe(false)
    const at = rows.findIndex((row) => row.id === 'm1')
    const chip = rows[at + 1]!
    expect(
      chip.kind === 'thread' && [chip.rootId, chip.count, chip.side],
    ).toEqual(['m1', 2, 'person'])
    expect([...threadCounts(chat)]).toEqual([['m1', 2]])
    expect(bubbles(rows).find((b) => b.id === 'q1')?.quote).toBe(
      'Draft the brief',
    )
    const answering = [
      ...chat,
      line('a1', 'About that', { replyTo: 'r2', at: 6_000 }),
    ]
    expect(bubbles(chatRows(answering)).find((b) => b.id === 'a1')?.quote).toBe(
      'Shorter please',
    )
  })

  it('keeps a reply whose first message is not here in the chat, unless older lines may hold it', () => {
    const orphan = [
      line('r9', 'A reply to something older', {
        replyTo: 'gone',
        branched: true,
        at: 1_000,
      }),
    ]
    expect(chatRows(orphan).some((row) => row.id === 'r9')).toBe(true)
    expect(
      chatRows(orphan, { mayHoldOlderHistory: true }).some(
        (row) => row.id === 'r9',
      ),
    ).toBe(false)
    expect(threadCounts(orphan).size).toBe(0)
    const event = entry({
      kind: 'event',
      id: 'e1',
      branched: true,
      replyTo: 'm1',
      event: { type: 'name-changed', to: 'Theo' },
    })
    expect(event.isBranched).toBe(false)
  })

  it('is its first message, then its replies', () => {
    expect(threadEntries('m1', chat).map((e) => e.id)).toEqual([
      'm1',
      'r1',
      'r2',
    ])
    const rows = threadRows('m1', chat)
    expect(bubbles(rows).map((b) => b.id)).toEqual(['m1', 'r1', 'r2'])
    expect(rows.some((row) => row.kind === 'thread')).toBe(false)
    expect(threadEntries('m2', chat).map((e) => e.id)).toEqual(['m2'])
  })

  it('takes its title as the window writes it', () => {
    expect(threadTitle(line('a', 'Draft   the\n**brief**', { at: 0 }))).toBe(
      'Draft the brief',
    )
    expect(
      threadTitle(
        line('a', 'Please find the three cheapest flights, then book one', {
          at: 0,
        }),
      ),
    ).toBe('Please find the three cheapest flights…')
    expect(
      threadTitle(line('a', 'See [the brief](https://x.com/b) now', { at: 0 })),
    ).toBe('See the brief now')
    expect(
      threadTitle(line('a', 'https://www.example.com/a/b', { at: 0 })),
    ).toBe('https://www.example.com/a/b')
    expect(threadTitle(line('a', '   ', { at: 0 }))).toBe('Thread')
    expect(
      threadTitle(
        entry({
          kind: 'user-attachment',
          id: 'f',
          file_name: 'photo.png',
          file_path: '/x/photo.png',
        }),
      ),
    ).toBe('Photo')
    expect(
      threadTitle(
        entry({
          kind: 'user-attachment',
          id: 'f',
          file_name: 'brief.pdf',
          file_path: '/x/brief.pdf',
        }),
      ),
    ).toBe('Brief')
    expect(
      threadTitle(
        entry({
          kind: 'send-message',
          id: 's',
          message: { type: 'attachment', url: 'https://example.com/report' },
        }),
      ),
    ).toBe('example.com')
    expect(
      threadTitle(
        entry({
          kind: 'send-message',
          id: 's',
          message: {
            type: 'attachment',
            url: 'file:///home/box/out/Q3%20plan.pdf',
          },
        }),
      ),
    ).toBe('Q3 plan')
    expect(
      threadTitle(
        entry({
          kind: 'send-message',
          id: 's',
          message: { type: 'widget', widget: { prompt: 'Which plan?' } },
        }),
      ),
    ).toBe('Which plan?')
    expect(
      threadTitle(
        entry({
          kind: 'send-message',
          id: 's',
          message: { type: 'cloud-agent', bcId: 'b' },
        }),
      ),
    ).toBe('Cloud agent')
    expect(threadTitle(undefined)).toBe('Thread')
  })
})

describe('notices, pictures and links', () => {
  it('draws notices, an agent’s pictures, and when a held message was written', () => {
    const entries = [
      entry({
        kind: 'notice',
        id: 'n1',
        text: 'Simeon joined the group',
        timestampMs: 1_000,
      }),
      entry({
        kind: 'send-message',
        id: 's1',
        timestampMs: 2_000,
        message: {
          type: 'text',
          content: '',
          images: [
            {
              url: 'file:///tmp/a.png',
              alt: 'A chart',
              width: 800,
              height: 600,
            },
            { url: 'https://x.com/b.jpg' },
            { url: 'ftp://nope' },
          ],
        },
      }),
      entry({
        kind: 'message',
        id: 'u1',
        role: 'user',
        content: 'Sent from the plane',
        sentWhileOfflineAtMs: 1_500,
        timestampMs: 3_000,
      }),
    ]
    const rows = chatRows(entries)
    expect(
      rows.some(
        (row) =>
          row.kind === 'notice' &&
          row.id === 'n1' &&
          row.text === 'Simeon joined the group',
      ),
    ).toBe(true)
    const pictures = bubbles(rows).find((b) => b.id === 's1')!
    expect(pictures.images.map((image) => image.url)).toEqual([
      'file:///tmp/a.png',
      'https://x.com/b.jpg',
    ])
    expect(pictures.images[0]!.alt).toBe('A chart')
    expect(aspect(pictures.images[0]!)).toBeCloseTo(800 / 600, 3)
    expect(aspect(pictures.images[1]!)).toBeCloseTo(4 / 3, 3)
    expect(isLoneEmoji(pictures.text, pictures.images.length)).toBe(false)
    expect(quoteLine(entries[1], 96)).toBe('(empty)')
    expect(bubbles(rows).find((b) => b.id === 'u1')?.sentOfflineAtMs).toBe(
      1_500,
    )
  })

  it('draws the person’s sent pictures together, under their message’s stamp', () => {
    const day = 1_760_000_000_000
    const entries = [
      entry({
        kind: 'message',
        id: 'a0',
        role: 'assistant',
        content: 'Earlier',
        timestampMs: day,
      }),
      entry({
        kind: 'user-attachment',
        id: 'p1',
        file_path: '/home/box/attachments/Photo 1.png',
        file_name: 'Photo 1.png',
        batchId: 'b1',
        clientNonce: 'n1',
        width: 1170,
        height: 2532,
      }),
      entry({
        kind: 'user-attachment',
        id: 'p2',
        file_path: '/home/box/attachments/clip.mov',
        batchId: 'b1',
        clientNonce: 'n1',
      }),
      entry({
        kind: 'user-attachment',
        id: 'f1',
        file_path: '/home/box/attachments/brief.pdf',
        batchId: 'b1',
        clientNonce: 'n1',
      }),
      entry({
        kind: 'message',
        id: 'u1',
        role: 'user',
        content: 'What do you read?',
        clientNonce: 'n1',
        timestampMs: day + 3_600_000,
      }),
      entry({
        kind: 'user-attachment',
        id: 'p3',
        file_path: '/home/box/attachments/old.jpg',
      }),
      entry({
        kind: 'message',
        id: 'u2',
        role: 'user',
        content: 'Later',
        timestampMs: day + 7_200_000,
      }),
    ]
    const rows = chatRows(entries)
    const shape = rows.map((row) => {
      if (row.kind === 'stamp') return 'stamp'
      if (row.kind === 'bubble' && row.bubble.images.length > 0)
        return (
          'pictures:' +
          row.bubble.images
            .map((image) => image.url.split('/').pop())
            .join(',') +
          (row.bubble.fromPerson ? ':mine' : '')
        )
      if (row.kind === 'bubble') return row.id
      if (row.kind === 'file') return `file:${row.name}`
      return 'other'
    })
    expect(shape).toEqual([
      'stamp',
      'a0',
      'stamp',
      'pictures:Photo 1.png,clip.mov:mine',
      'file:brief.pdf',
      'u1',
      'stamp',
      'pictures:old.jpg:mine',
      'u2',
    ])
    expect(
      aspect(bubbles(rows).find((b) => b.id === 'p1')!.images[0]!),
    ).toBeCloseTo(1170 / 2532, 3)
  })

  it('says “Sent while offline” only on what this app held and sent', () => {
    const entries = [
      entry({
        kind: 'message',
        id: 'u1',
        role: 'user',
        content: 'From the phone, offline',
        sentWhileOfflineAtMs: 1_500,
        timestampMs: 3_000,
      }),
      entry({
        kind: 'message',
        id: 'u2',
        role: 'user',
        content: 'Held here',
        timestampMs: 4_000,
      }),
    ]
    const shown = bubbles(
      chatRows(offlineMarked(entries, new Map([['u2', 3_900]]))),
    )
    expect(shown.find((b) => b.id === 'u1')?.sentOfflineAtMs).toBeUndefined()
    expect(shown.find((b) => b.id === 'u2')?.sentOfflineAtMs).toBe(3_900)
  })

  it('knows a message that is one link', () => {
    expect(
      new URL(loneLink('  https://github.com/a/b/pull/3 ')!).hostname,
    ).toBe('github.com')
    expect(loneLink('[The brief](https://docs.example.com/x)')).toBe(
      'https://docs.example.com/x',
    )
    expect(loneLink('see https://github.com')).toBeUndefined()
    expect(loneLink('http://plain.example.com')).toBeUndefined()
    expect(loneLink('[a] b](https://x.com)')).toBeUndefined()
    expect(loneLink('[a](https://x.com) and more')).toBeUndefined()
    const linked =
      '{"type":"doc","content":[{"type":"paragraph"},{"type":"paragraph","content":[{"type":"text","text":"the brief","marks":[{"type":"link","attrs":{"href":"https://docs.example.com/x"}}]},{"type":"hardBreak"}]}]}'
    expect(loneLink('the brief', linked)).toBe('https://docs.example.com/x')
    const code =
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"https://x.com","marks":[{"type":"code"}]}]}]}'
    expect(loneLink('https://x.com', code)).toBeUndefined()
    const skill =
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"workflowReference","attrs":{"id":"w"}},{"type":"text","text":" https://x.com"}]}]}'
    expect(loneLink('https://x.com', skill)).toBeUndefined()
  })

  it('makes a link card only of an agent’s finished words and the person’s own', () => {
    const entries = [
      entry({
        kind: 'send-message',
        id: 's1',
        message: { type: 'text', content: 'https://x.com/a' },
      }),
      entry({
        kind: 'send-message',
        id: 's2',
        streaming: true,
        message: { type: 'text', content: 'https://x.com/a' },
      }),
      entry({
        kind: 'send-message',
        id: 's3',
        message: {
          type: 'text',
          content: 'https://x.com/a',
          images: [{ url: 'https://x.com/b.jpg' }],
        },
      }),
      entry({
        kind: 'message',
        id: 'u1',
        role: 'user',
        content: 'https://x.com/a',
      }),
      entry({
        kind: 'message',
        id: 'u2',
        role: 'user',
        content: 'https://x.com/a',
        channel: 'slack',
      }),
      entry({
        kind: 'message',
        id: 'a1',
        role: 'assistant',
        content: 'https://x.com/a',
      }),
    ]
    const links = Object.fromEntries(
      bubbles(chatRows(entries)).map((b) => [b.id, b.loneLink]),
    )
    expect(links.s1).toBeDefined()
    expect(links.s2).toBeUndefined()
    expect(links.s3).toBeUndefined()
    expect(links.u1).toBeDefined()
    expect(links.u2).toBeUndefined()
    expect(links.a1).toBeUndefined()
  })

  it('knows a lone emoji', () => {
    expect(isOneEmoji(' 👍 ')).toBe(true)
    expect(isOneEmoji('❤️')).toBe(true)
    expect(isOneEmoji('👍👍')).toBe(false)
    expect(isOneEmoji('ok')).toBe(false)
    expect(isLoneEmoji('🎉🎉🎉')).toBe(true)
    expect(isLoneEmoji('🎉🎉🎉🎉')).toBe(false)
  })
})

describe('times and calls', () => {
  it('writes stamps the window’s way', () => {
    const today = new Date(1_791_400_000_000) // 2026-10-07 19:06 UTC
    const options = { now: today, locale: 'en-US', timeZone: 'UTC' }
    const spaced = (words: string) => words.replace(/\u202f/g, ' ')
    expect(
      stampText(today.getTime() - 60_000, options).startsWith('Today '),
    ).toBe(true)
    expect(
      stampText(today.getTime() - 86_400_000, options).startsWith('Yesterday '),
    ).toBe(true)
    expect(spaced(stampText(today.getTime() - 86_400_000 * 3, options))).toBe(
      'Sun, Oct 4 7:06 PM',
    )
    expect(spaced(stampText(Date.UTC(2025, 9, 7, 15, 12), options))).toBe(
      'Oct 7, 2025 3:12 PM',
    )
  })

  it('writes a call’s length the Mac’s way', () => {
    expect(callLength(71)).toBe('01:11')
    expect(callLength(3725)).toBe('1:02:05')
    expect(callClock(16)).toBe('0:16')
    expect(callClock(724)).toBe('12:04')
  })

  it('folds a call written before calls were one line into one voice chat line', () => {
    const peer = { id: 'voice-call:c1:71', name: 'Voice' }
    const rows = chatRows([
      entry({
        kind: 'message',
        id: 'v1',
        role: 'assistant',
        content: 'Hi',
        toAgent: { ...peer, kind: 'agent' },
        timestampMs: 1_000,
      }),
      entry({
        kind: 'message',
        id: 'v2',
        role: 'user',
        content: 'Hello',
        fromAgent: peer,
        timestampMs: 2_000,
      }),
    ])
    const call = rows.find((row) => row.kind === 'voiceCall')
    expect(
      call?.kind === 'voiceCall' && [call.seconds, call.lines.length],
    ).toEqual([71, 2])
  })
})

describe('what a message carries', () => {
  it('says it was written offline only when it was held', () => {
    const plain = LiveBackend.sendArguments('theo', 'Hi', [], {}, 'n1')
    expect(plain.composedAtMs).toBeUndefined()
    expect(plain.isFork).toBeUndefined()
    expect(plain.replyToId).toBeUndefined()
    expect(plain.clientNonce).toBe('n1')
    expect(plain.attachmentPaths).toEqual([])
    expect(plain.directAddressedAcceptance).toBe(true)
    expect(
      LiveBackend.sendArguments('theo', 'Hi', [], { composedAtMs: 1_234 })
        .composedAtMs,
    ).toBe(1_234)
    const thread = LiveBackend.sendArguments('theo', 'Hi', [], {
      replyTo: 'm1',
      isFork: true,
      richText: '{"type":"doc"}',
    })
    expect([thread.replyToId, thread.isFork, thread.richText]).toEqual([
      'm1',
      true,
      '{"type":"doc"}',
    ])
    expect(
      LiveBackend.sendArguments('theo', 'Hi', [], { isFork: true }).isFork,
    ).toBeUndefined()
    expect(
      String(
        LiveBackend.sendArguments('theo', 'Hi', [], {}).clientNonce,
      ).startsWith('ios-'),
    ).toBe(true)
  })
})
