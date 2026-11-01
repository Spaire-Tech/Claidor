// The store's chats, against the shared core's own tests (ChatDeliveryTests,
// ChatQueueAndThreadTests, ChatRunsTests, the preview and reading tests in
// CoreTests, and SavedChatsTests' server copy and held messages): a chat
// opened and read, a message shown at once and settled, older lines, a
// streamed answer, a message held while the computer is out of reach, a
// thread, and the server's copy while the computer is away.

import { describe, expect, it } from 'vitest'
import { LiveBackend } from './backend'
import { type ChatRow, chatRows } from './chat'
import { Entry } from './entry'
import type { JSONValue } from './json'
import { makeAgent } from './models'
import { AppStore } from './store'
import { FakeBackend, eventually, ms } from './testing'

const texts = (rows: readonly ChatRow[]) =>
  rows.flatMap((row) => (row.kind === 'bubble' ? [row.bubble.text] : []))
const ids = (rows: readonly ChatRow[]) =>
  rows.flatMap((row) => (row.kind === 'bubble' ? [row.bubble.id] : []))
const theo = () => makeAgent({ id: 'theo', name: 'Theo' })

async function attached(
  options: { backend?: FakeBackend; readsServerCopy?: boolean } = {},
) {
  const backend = options.backend ?? new FakeBackend()
  if (backend.agents.length === 0) backend.agents = [theo()]
  // The server keeps a message handed to it (`chats/send` answers `{}`).
  backend.serverAnswers['chats/send'] ??= {}
  const store = new AppStore()
  store.readsServerCopy = options.readsServerCopy ?? false
  await store.attach(backend)
  return { backend, store }
}

const line = (json: Record<string, JSONValue>) => Entry.from(json)!

describe('a chat opened', () => {
  it('reads the chat’s newest lines for a preview without opening it', async () => {
    const { backend, store } = await attached()
    await store.peek('theo')
    expect(backend.tailed).toEqual(['theo'])
    expect(backend.opened).toEqual([])
    expect(texts(store.rows('theo'))).toEqual(['Hi Theo'])
    await store.peek('theo')
    expect(backend.tailed).toEqual(['theo'])
    await store.open('theo')
    expect(backend.opened).toEqual(['theo'])
  })

  it('stays read while it is on screen', async () => {
    const { backend, store } = await attached()
    await store.open('theo')
    expect(backend.read).toEqual(['theo'])
    const unread = makeAgent({
      id: 'theo',
      name: 'Theo',
      hasUnread: true,
      unreadCount: 1,
      lastActivityAt: 2_000,
    })
    store.apply({ kind: 'agentUpserted', agent: unread })
    expect(store.agent('theo')?.hasUnread).toBe(false)
    await ms(50)
    expect(backend.read.length).toBe(2)
    store.close('theo')
    await ms(50)
    expect(backend.read.length).toBe(3)
    store.apply({
      kind: 'agentUpserted',
      agent: { ...unread, lastActivityAt: 3_000 },
    })
    expect(store.agent('theo')?.hasUnread).toBe(true)
  })

  it('shows an answer that did not stream', async () => {
    const { backend, store } = await attached()
    await store.open('theo')
    expect(backend.opened).toEqual(['theo'])
    expect(texts(store.rows('theo'))).toEqual(['Hi Theo'])
    backend.lines.push({
      kind: 'message',
      id: 'a2',
      role: 'assistant',
      content: 'Here it is.',
      timestampMs: 2_000,
    })
    store.apply({
      kind: 'agentUpserted',
      agent: makeAgent({ id: 'theo', name: 'Theo', lastMessageId: 'a2' }),
    })
    await eventually(() => texts(store.rows('theo')).length === 2)
    expect(texts(store.rows('theo'))).toEqual(['Hi Theo', 'Here it is.'])
    store.close('theo')
    backend.lines.push({
      kind: 'message',
      id: 'a3',
      role: 'assistant',
      content: 'And this.',
      timestampMs: 3_000,
    })
    await store.open('theo')
    expect(texts(store.rows('theo'))).toEqual([
      'Hi Theo',
      'Here it is.',
      'And this.',
    ])
    expect(backend.opened).toEqual(['theo', 'theo', 'theo'])
  })

  it('loads older lines when scrolled up, and keeps them through a fetch of the newest', async () => {
    const backend = new FakeBackend()
    backend.lines = Array.from({ length: 650 }, (_, i) => ({
      kind: 'message',
      id: `m${i + 1}`,
      role: (i + 1) % 2 === 0 ? 'user' : 'assistant',
      content: `Line ${i + 1}`,
      timestampMs: (i + 1) * 1_000,
    }))
    const { store } = await attached({ backend })
    await store.open('theo')
    expect(store.transcripts.theo?.length).toBe(500)
    expect(store.olderBefore.theo).toBe(150)
    await store.loadOlder('theo')
    expect(store.transcripts.theo?.length).toBe(600)
    expect(store.transcripts.theo?.[0]?.id).toBe('m51')
    await store.loadOlder('theo')
    expect(store.transcripts.theo?.[0]?.id).toBe('m1')
    expect(store.olderBefore.theo).toBeUndefined()
    await store.refresh('theo')
    expect(store.transcripts.theo?.length).toBe(650)
  })

  it('redraws only a streamed answer’s row, as a full layout would draw it', async () => {
    const { backend, store } = await attached()
    await store.open('theo')
    const answer = (words: string) =>
      line({
        kind: 'message',
        id: 'a1',
        role: 'assistant',
        content: words,
        isStreaming: true,
        timestampMs: 3_000,
      })
    backend.push({
      kind: 'transcript',
      change: { type: 'upsert', agentId: 'theo', entry: answer('The') },
    })
    await ms(150)
    expect(store.arrived.has('a1')).toBe(true)
    for (const words of [
      'The flight',
      'The flight is',
      'The flight is booked.',
    ])
      backend.push({
        kind: 'transcript',
        change: { type: 'upsert', agentId: 'theo', entry: answer(words) },
      })
    await ms(150)
    const last = store.rows('theo').at(-1)
    expect(last?.kind === 'bubble' && last.bubble.text).toBe(
      'The flight is booked.',
    )
    expect(store.rows('theo')).toEqual(chatRows(store.transcripts.theo ?? []))
  })

  it('says a chat could not load, and loads it on Retry', async () => {
    const backend = new FakeBackend()
    backend.failLoads = true
    const { store } = await attached({ backend })
    await store.open('theo')
    expect(store.loadFailed.has('theo')).toBe(true)
    expect(store.problem).toBeUndefined()
    backend.failLoads = false
    await store.refresh('theo')
    expect(store.loadFailed.has('theo')).toBe(false)
    expect(store.rows('theo').at(-1)?.id).toBe('u1')
  })

  it('counts a message still sending in the runs, as the window counts it', async () => {
    const backend = new FakeBackend()
    const now = Date.now()
    backend.lines = [
      {
        kind: 'send-message',
        id: 'a1',
        message: { type: 'text', content: 'Morning' },
        timestampMs: now - 60_000,
      },
    ]
    const { store } = await attached({ backend })
    await store.open('theo')
    expect(store.runFlags.theo?.a1).toEqual({
      startsGroup: false,
      continuesPrevious: false,
      continuesNext: false,
      aboveThreadChip: false,
    })
    backend.push({ kind: 'connection', live: false })
    await ms(20)
    await store.send('Hi', 'theo')
    await store.send('Still there?', 'theo')
    const mine = store
      .rows('theo')
      .flatMap((row) =>
        row.kind === 'bubble' && row.bubble.fromPerson ? [row.id] : [],
      )
    expect(mine.length).toBe(2)
    expect(store.runFlags.theo?.[mine[0]!]).toEqual({
      startsGroup: true,
      continuesPrevious: false,
      continuesNext: true,
      aboveThreadChip: false,
    })
    expect(store.runFlags.theo?.[mine[1]!]).toEqual({
      startsGroup: false,
      continuesPrevious: true,
      continuesNext: false,
      aboveThreadChip: false,
    })
  })

  it('leaves a thread’s replies out of the chat’s runs', async () => {
    const backend = new FakeBackend()
    backend.lines = [
      {
        kind: 'send-message',
        id: 'a1',
        message: { type: 'text', content: 'Draft?' },
        timestampMs: 1_000,
      },
      {
        kind: 'message',
        id: 'r1',
        role: 'user',
        content: 'in a thread',
        branched: true,
        replyTo: 'a1',
        timestampMs: 2_000,
      },
      {
        kind: 'send-message',
        id: 'a2',
        message: { type: 'text', content: 'Done' },
        timestampMs: 3_000,
      },
    ]
    const { store } = await attached({ backend })
    await store.open('theo')
    expect(store.runFlags.theo?.r1).toBeUndefined()
    expect(store.runFlags.theo?.a1).toEqual({
      startsGroup: false,
      continuesPrevious: false,
      continuesNext: true,
      aboveThreadChip: true,
    })
    expect(store.runFlags.theo?.a2?.continuesPrevious).toBe(false)
  })
})

describe('a message sent', () => {
  it('shows at once, says when it failed, and gives way to the host’s copy', async () => {
    const backend = new FakeBackend()
    backend.failSends = true
    const { store } = await attached({ backend })
    await store.open('theo')
    await store.send('Book the flight', 'theo')
    let rows = store.rows('theo')
    const mine = rows.at(-2)
    const failed = rows.at(-1)
    expect(
      mine?.kind === 'bubble' && [mine.bubble.text, mine.bubble.fromPerson],
    ).toEqual(['Book the flight', true])
    expect(failed?.kind === 'failedSend' && failed.nonce).toBe(mine?.id)

    // Resend: it goes, and the host's copy takes its place.
    backend.failSends = false
    await store.resend(mine!.id, 'theo')
    expect(store.rows('theo').some((row) => row.kind === 'failedSend')).toBe(
      false,
    )
    backend.push({
      kind: 'transcript',
      change: {
        type: 'upsert',
        agentId: 'theo',
        entry: line({
          kind: 'message',
          id: 'u2',
          role: 'user',
          content: 'Book the flight',
          timestampMs: 2_000,
        }),
      },
    })
    await ms(20)
    expect(ids(store.rows('theo'))).toEqual(['u1', 'u2'])
    expect(store.arrived.has('u2')).toBe(false)

    // Known by its nonce, even when the host wrote its text differently.
    await store.send('Thanks', 'theo')
    const waiting = store.rows('theo').at(-1)!
    expect(waiting.id.startsWith('ios-')).toBe(true)
    backend.push({
      kind: 'transcript',
      change: {
        type: 'upsert',
        agentId: 'theo',
        entry: line({
          kind: 'message',
          id: 'u3',
          role: 'user',
          content: 'Thanks!',
          clientNonce: waiting.id,
          timestampMs: 3_000,
        }),
      },
    })
    await ms(20)
    expect(ids(store.rows('theo'))).toEqual(['u1', 'u2', 'u3'])

    // Delete on a failed one: it only leaves the screen.
    backend.failSends = true
    await store.send('Second try', 'theo')
    rows = store.rows('theo')
    const second = rows.at(-1)
    expect(second?.kind).toBe('failedSend')
    store.discardFailed(
      second?.kind === 'failedSend' ? second.nonce : '',
      'theo',
    )
    expect(texts(store.rows('theo'))).not.toContain('Second try')
  })

  it('waits while the computer is out of reach and goes when it is back, marked as written offline', async () => {
    const { backend, store } = await attached()
    await store.open('theo')
    backend.push({ kind: 'connection', live: false })
    await ms(20)
    expect(store.isDown).toBe(true)
    await store.send('Book it', 'theo')
    await store.send('Cancel me', 'theo')
    const queued = store
      .rows('theo')
      .flatMap((row) => (row.kind === 'queuedSend' ? [row.nonce] : []))
    expect(queued.length).toBe(2)
    expect(backend.sent).toEqual([])
    expect(store.cancelQueued(queued[1]!, 'theo')).toBe(true)
    expect(store.rows('theo').some((row) => row.id === queued[1])).toBe(false)
    expect(store.canceledDraft?.scope).toBe('theo')
    expect(store.canceledDraft?.text).toBe('Cancel me')

    backend.push({ kind: 'connection', live: true })
    await eventually(() => backend.sent.length === 1)
    expect(store.isDown).toBe(false)
    expect(backend.sent.map((sent) => sent.text)).toEqual(['Book it'])
    expect(backend.sent[0]?.options.composedAtMs).toBeDefined()
    expect(store.rows('theo').some((row) => row.kind === 'queuedSend')).toBe(
      false,
    )

    await store.send('Thanks', 'theo')
    expect(backend.sent.at(-1)?.options.composedAtMs).toBeUndefined()
    expect(store.cancelQueued('nope', 'theo')).toBe(false)
    expect(store.composerNotice?.text).toBe(
      "This message is already sending and can't be canceled.",
    )
    expect(store.composerNotice?.agentId).toBe('theo')
  })

  it('makes a thread from the chat’s lines, and a reply stays in it', async () => {
    const backend = new FakeBackend()
    backend.lines = [
      {
        kind: 'message',
        id: 'm1',
        role: 'user',
        content: 'Draft the brief',
        timestampMs: 1_000,
      },
      {
        kind: 'message',
        id: 'r1',
        role: 'assistant',
        content: 'On it',
        replyTo: 'm1',
        branched: true,
        timestampMs: 2_000,
      },
    ]
    const { store } = await attached({ backend })
    await store.open('theo')
    expect(store.rows('theo').map((row) => row.id)).toEqual([
      'stamp-m1',
      'm1',
      'thread-m1',
    ])
    store.openThread('m1', 'theo')
    const inThread = () => ids(store.threadRows.theo ?? [])
    expect(inThread()).toEqual(['m1', 'r1'])
    expect(store.threadTitle('m1', 'theo')).toBe('Draft the brief')
    expect(store.threadRootOf('r1', 'theo')).toBe('m1')
    expect(store.threadRootOf('m1', 'theo')).toBeUndefined()
    expect(store.findableEntries('theo').map((e) => e.id)).toEqual(['m1', 'r1'])

    await store.send('Shorter', 'theo', { replyTo: 'm1', inThread: true })
    expect(backend.sent.at(-1)?.options).toEqual({
      replyTo: 'm1',
      isFork: true,
      richText: undefined,
      composedAtMs: undefined,
    })
    expect(inThread().length).toBe(3)
    expect(texts(store.rows('theo'))).not.toContain('Shorter')
    store.closeThread('theo')
    expect(store.threadRows.theo).toBeUndefined()
    expect(store.findableEntries('theo')[0]?.id).toBe('m1')
    expect(store.findableEntries('theo').some((e) => e.id === 'r1')).toBe(false)
  })
})

describe('the server’s copy and the messages it keeps', () => {
  const linesPath = 'chats/lines?agentId=theo&limit=300'

  it('shows the server’s lines while the computer is away, and the computer’s once it answers', async () => {
    const backend = new FakeBackend()
    backend.failLoads = true
    backend.listError = new Error('away')
    backend.serverAnswers = {
      'chats/agents': {
        agents: [
          { id: 'theo', name: 'Theo' },
          { id: 'iris', name: 'Iris' },
        ],
      },
      [linesPath]: {
        entries: [
          {
            kind: 'message',
            id: 's1',
            role: 'user',
            content: 'Hi Theo',
            timestampMs: 1_000,
          },
          {
            kind: 'send-message',
            id: 's2',
            message: { type: 'text', content: 'On it' },
            timestampMs: 2_000,
          },
        ],
      },
    }
    const store = new AppStore()
    store.readsServerCopy = true
    await store.attach(backend)
    await eventually(() => store.agents.length === 2)
    await store.open('theo')
    await eventually(() => texts(store.rows('theo')).length === 2)
    expect(texts(store.rows('theo'))).toEqual(['Hi Theo', 'On it'])
    expect(store.loadFailed.has('theo')).toBe(false)
    expect(backend.serverPaths).toContain(linesPath)

    backend.failLoads = false
    backend.listError = undefined
    backend.agents = [theo()]
    backend.lines = [
      {
        kind: 'message',
        id: 'u2',
        role: 'user',
        content: 'Book it',
        timestampMs: 4_000,
      },
    ]
    await store.reloadRoster()
    expect(store.agents.map((a) => a.id)).toEqual(['theo'])
    await store.refresh('theo')
    expect(texts(store.rows('theo'))).toEqual(['Book it'])
  })

  it('says “Reconnecting” only while a message waits', async () => {
    const { backend, store } = await attached()
    await store.open('theo')
    store.apply({ kind: 'connection', live: false })
    expect(store.isDown).toBe(true)
    expect(store.waitingToSend).toBe(false)
    await store.send('Later', 'theo')
    expect(store.waitingToSend).toBe(true)
    expect(backend.sent).toEqual([])
    store.apply({ kind: 'connection', live: true })
    await eventually(() => !store.waitingToSend && backend.sent.length > 0)
    expect(store.waitingToSend).toBe(false)
    expect(backend.sent.map((sent) => sent.text)).toEqual(['Later'])
  })

  const handed = (backend: FakeBackend) =>
    backend.serverCalls
      .filter((call) => call.path === 'chats/send')
      .map((call) => call.body as Record<string, JSONValue>)

  it('hands a held message to the server, and to the computer again once it is back', async () => {
    const { backend, store } = await attached({ readsServerCopy: true })
    await store.open('theo')
    backend.failSends = true
    store.apply({ kind: 'connection', live: false })
    await store.send('Book the table', 'theo', { replyTo: 'u1', id: 'ios-m1' })
    await store.send('Then call Iris', 'theo', { id: 'ios-m2' })
    const sentToServer = handed(backend)
    expect(sentToServer.map((body) => body.clientNonce)).toEqual([
      'ios-m1',
      'ios-m2',
    ])
    const first = sentToServer[0]!
    expect([first.agentId, first.prompt, first.replyToId]).toEqual([
      'theo',
      'Book the table',
      'u1',
    ])
    expect(first.attachmentPaths).toEqual([])
    expect(typeof first.composedAtMs).toBe('number')
    expect(first).toEqual(
      LiveBackend.sendArguments(
        'theo',
        'Book the table',
        [],
        { replyTo: 'u1', composedAtMs: first.composedAtMs as number },
        'ios-m1',
      ),
    )
    expect(store.waitingToSend).toBe(false)
    expect(store.rows('theo').some((row) => row.kind === 'queuedSend')).toBe(
      false,
    )
    expect(texts(store.rows('theo')).slice(-2)).toEqual([
      'Book the table',
      'Then call Iris',
    ])
    expect(backend.sent).toEqual([])

    backend.failSends = false
    store.apply({ kind: 'connection', live: true })
    await eventually(() => backend.sent.length === 2)
    expect(backend.sent.map((sent) => sent.text)).toEqual([
      'Book the table',
      'Then call Iris',
    ])
    expect(backend.sent.map((sent) => sent.nonce)).toEqual(['ios-m1', 'ios-m2'])
    expect(backend.sent[0]?.options.replyTo).toBe('u1')
  })

  it('does not tell the agent a message to a sleeping computer was written offline, and reaches the computer at once', async () => {
    const { backend, store } = await attached({ readsServerCopy: true })
    await store.open('theo')
    store.apply({ kind: 'connection', live: false })
    store.apply({ kind: 'computerAsleep', asleep: true })
    await store.send('Book the table', 'theo', { id: 'ios-m1' })
    const body = handed(backend)[0]!
    expect(body.clientNonce).toBe('ios-m1')
    expect(body.composedAtMs).toBeUndefined()
    await eventually(() => backend.wakings === 1)
    expect(backend.wakings).toBe(1)
  })

  it('keeps one with files on the device, and those after it; one the server refuses waits too', async () => {
    const { backend, store } = await attached({ readsServerCopy: true })
    await store.open('theo')
    store.apply({ kind: 'connection', live: false })
    await store.send('The plan', 'theo', {
      files: [{ name: 'plan.pdf', data: new TextEncoder().encode('pdf') }],
      id: 'ios-f1',
    })
    await store.send('Read it', 'theo', { id: 'ios-f2' })
    expect(handed(backend).length).toBe(0)
    expect(store.waitingToSend).toBe(true)

    const refused = new FakeBackend()
    refused.serverFails = true
    const other = (await attached({ backend: refused, readsServerCopy: true }))
      .store
    await other.open('theo')
    other.apply({ kind: 'connection', live: false })
    await other.send('Too long', 'theo', { id: 'ios-r1' })
    expect(handed(refused).length).toBe(1)
    expect(other.waitingToSend).toBe(true)
    expect(other.rows('theo').some((row) => row.kind === 'queuedSend')).toBe(
      true,
    )
  })

  it('hands nothing to the server unless the app reads its copy', async () => {
    const { backend, store } = await attached()
    await store.open('theo')
    store.apply({ kind: 'connection', live: false })
    await store.send('Held', 'theo', { id: 'ios-h1' })
    expect(handed(backend).length).toBe(0)
    expect(store.waitingToSend).toBe(true)
  })
})

describe('a reaction', () => {
  it('shows at once, and a refusal takes it back', async () => {
    const { backend, store } = await attached()
    backend.lines = [
      { id: 'm1', kind: 'message', role: 'assistant', content: 'Done.' },
    ]
    await store.open('theo')
    const shownWhenSent: string[][] = []
    backend.beforeAnswer = (method) => {
      if (method === 'reactToMessage')
        shownWhenSent.push(store.transcripts.theo?.[0]?.myReactions ?? [])
    }
    await store.react('👍', 'm1', 'theo')
    expect(shownWhenSent).toEqual([['👍']])
    expect(store.transcripts.theo?.[0]?.myReactions).toEqual(['👍'])
    expect(
      backend.commands
        .filter((c) => c.method === 'reactToMessage')
        .map((c) => c.args),
    ).toEqual([{ entryId: 'm1', emoji: '👍', agentId: 'theo' }])
    const row = store.rows('theo')[0]
    expect(row?.kind === 'bubble' && row.bubble.myReactions).toEqual(['👍'])

    backend.refusedCommands.add('reactToMessage')
    await store.react('❤️', 'm1', 'theo')
    expect(store.transcripts.theo?.[0]?.myReactions).toEqual(['👍'])
    expect(store.problem).toBeDefined()
  })
})
