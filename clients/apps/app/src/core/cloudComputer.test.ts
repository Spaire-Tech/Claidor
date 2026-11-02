// The computer's screen, as the shared core checks it (SimeonCore's
// `CloudComputerTests` and `ComputerBookTests`, ComputerStoreTests.swift's
// `ComputerWireTests.testHostEvents`): fixtures/cloud-computer.json is the
// core's own, made there by running the shipped window's `qoe`, `N2e`,
// `Jbn`, `$1t` and `wbn` in Node; the stream's reasons as
// `computer-stream.ts` gives them.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LiveBackend } from './backend'
import {
  type BoxStatus,
  ClipboardBridge,
  ComputerBook,
  type ComputerHelper,
  type ComputerPhase,
  type ComputerPlaceholder,
  type ComputerReadState,
  ComputerStreamLog,
  ScreenCrashes,
  type StreamReasonChange,
  agentPointerFrom,
  boxStatusFrom,
  computerPhase,
  focusedHelper,
  fullPlaceholder,
  helperScreens,
  helperStrip,
  pointerPlace,
  pointerScale,
  pressDelay,
  previewPlaceholder,
  screenURL,
  stepHelper,
  streamNotice,
  streamReasonChange,
  streamWords,
  typingFieldFrom,
  withDeadline,
} from './cloudComputer'
import type { JSONObject, JSONValue } from './json'

interface Copy {
  message: string
  progressPercent: number | null
  isBusy: boolean
  hasRetry: boolean
}

const data = JSON.parse(
  readFileSync(
    new URL('./fixtures/cloud-computer.json', import.meta.url),
    'utf8',
  ),
) as {
  phases: {
    status: JSONValue
    ensuring: boolean
    phase: ComputerPhase
    usable: boolean
  }[]
  previews: {
    read: ComputerReadState
    phase: ComputerPhase
    pull: number | null
    shown: boolean
    copy?: Copy
  }[]
  fulls: {
    read: ComputerReadState
    phase: ComputerPhase
    pull: number | null
    helpers: boolean
    copy: Copy
  }[]
  focus: { asked: string | null; count: number; out: string | null }[]
}

function check(
  got: ComputerPlaceholder | undefined,
  want: Copy,
  label: string,
) {
  expect(got?.message, label).toBe(want.message)
  expect(got?.percent ?? null, label).toBe(want.progressPercent)
  expect(got?.isBusy, label).toBe(want.isBusy)
  expect(got?.hasRetry, label).toBe(want.hasRetry)
}

describe('the computer against the shipped window', () => {
  it('reads each status as its phase, and its screen only while it runs', () => {
    for (const item of data.phases) {
      const status = boxStatusFrom(item.status)
      expect(computerPhase(status, item.ensuring), JSON.stringify(item)).toBe(
        item.phase,
      )
      expect(screenURL(status) != null, JSON.stringify(item)).toBe(item.usable)
    }
    expect(data.phases).toHaveLength(16)
  })

  it('words a screen not there yet, in the pane and in the full view', () => {
    for (const item of data.previews) {
      const got = previewPlaceholder(
        'Nora',
        item.read,
        item.phase,
        item.pull ?? undefined,
      )
      if (item.shown) check(got, item.copy!, `preview ${JSON.stringify(item)}`)
      else expect(got, `preview ${JSON.stringify(item)}`).toBeUndefined()
    }
    for (const item of data.fulls) {
      const got = fullPlaceholder(
        'Nora',
        item.read,
        item.phase,
        item.pull ?? undefined,
        item.helpers,
      )
      check(got, item.copy, `full ${JSON.stringify(item)}`)
    }
    expect(data.previews.length + data.fulls.length).toBe(108)
  })

  it('lists, focuses, strips and steps through the helpers’ screens', () => {
    const helpers: ComputerHelper[] = ['a', 'b', 'c'].map((id) => ({
      subagentId: id,
      title: id,
    }))
    for (const item of data.focus) {
      const list = helpers.slice(0, item.count)
      expect(focusedHelper(list, item.asked ?? undefined) ?? null).toBe(
        item.out,
      )
    }
    const rows: JSONValue[] = [
      {
        subagentId: '1',
        subagentType: 'computerUse',
        status: 'running',
        title: ' Browse ',
      },
      {
        subagentId: '2',
        subagentType: 'computerUse',
        status: 'done',
        title: 'Old',
      },
      {
        subagentId: '3',
        subagentType: 'task',
        status: 'running',
        title: 'Think',
      },
      {
        subagentId: '4',
        subagentType: 'computerUse',
        status: 'running',
        title: '',
      },
    ]
    expect(helperScreens(rows).map((helper) => helper.title)).toEqual([
      'Browse',
      'Subagent',
    ])
    expect(helperStrip(4)).toEqual({ shown: 4 })
    expect(helperStrip(6)).toEqual({ shown: 3, more: 3 })
    expect(stepHelper(helpers, 'c', 1)).toBe('a')
    expect(stepHelper(helpers, 'a', -1)).toBe('c')
    expect(stepHelper(helpers.slice(0, 1), 'a', 1)).toBeUndefined()
  })

  it('places the agent’s pointer, counts crashes and keeps the clipboard from going round', () => {
    expect(pointerScale(1280)).toBe(1.8)
    expect(pointerScale(100)).toBe(0.75)
    expect(pointerScale(400)).toBeCloseTo((400 / 1280) * 2.85, 9)
    expect(
      pointerPlace({ x: 640, y: 400, type: 'move', at: 0 }, 320, 200).x,
    ).toBe(160)
    expect(pressDelay(0.2)).toBeCloseTo(0.3, 9)
    expect(agentPointerFrom({ x: 10, y: 20 }, 5)).toEqual({
      x: 10,
      y: 20,
      type: 'move',
      at: 5,
    })
    expect(agentPointerFrom({ x: 10 })).toBeUndefined()

    const crashes = new ScreenCrashes()
    const t0 = 0
    expect(crashes.crashed(t0)).toBe(true)
    expect(crashes.crashed(t0 + 30_000)).toBe(true)
    expect(crashes.crashed(t0 + 60_000)).toBe(true)
    expect(crashes.crashed(t0 + 80_000)).toBe(false)
    expect(crashes.gaveUp).toBe(true)
    crashes.reset()
    expect(crashes.crashed(t0 + 200_000)).toBe(true)
    const spaced = new ScreenCrashes()
    for (let i = 0; i < 6; i += 1)
      expect(spaced.crashed(t0 + i * 61_000)).toBe(true)

    const clip = new ClipboardBridge()
    expect(clip.fromBox('')).toBeUndefined()
    expect(clip.fromBox('hello')).toBe('hello')
    expect(clip.fromBox('hello')).toBeUndefined()
    clip.sent('mine')
    expect(clip.fromBox('mine')).toBeUndefined()
    expect(clip.mayRead(t0)).toBe(true)
    expect(clip.mayRead(t0 + 100)).toBe(false)
    expect(clip.mayRead(t0 + 350)).toBe(true)
  })

  it('reads the stream’s reasons and words its notices', () => {
    const set = (reason: string): StreamReasonChange => ({
      kind: 'set',
      reason,
    })
    const cases: [string, StreamReasonChange][] = [
      [
        '[SimeonScreen] state=connected status="" dialog=none',
        { kind: 'clear' },
      ],
      ['local docker: gateway ready', { kind: 'keep' }],
      [
        'box reachability outcome=timeout method=listAgents cause=deadline baseUrl=x',
        set(
          `The computer's gateway did not answer "listAgents" within the deadline.`,
        ),
      ],
      [
        'box reachability outcome=network method=health cause=ECONNRESET baseUrl=x',
        set(
          `The computer's gateway could not be reached for "health" (ECONNRESET).`,
        ),
      ],
      [
        'box reachability outcome=box_blocked method=a cause=b',
        set('The computer is blocked or paused.'),
      ],
      [
        'box reachability outcome=http_500 method=a cause=b',
        set(`The computer's gateway failed "a": http_500 (b).`),
      ],
      [
        'guest load FAILED code=-105 (ERR_NAME_NOT_RESOLVED) url=x mainFrame=true',
        set('The screen page did not load (ERR_NAME_NOT_RESOLVED, -105).'),
      ],
      ['guest renderer gone reason=crashed', set('The screen page crashed.')],
      [
        '[SimeonScreen] state=disconnected status="Failed to connect to server" dialog=none',
        set("noVNC cannot reach the desktop's socket."),
      ],
      [
        '[SimeonScreen] page error: boom at x.js:1',
        set('Error inside the screen page: boom at x.js:1'),
      ],
      [
        'guest console[error] Uncaught TypeError',
        set('Error inside the screen page: Uncaught TypeError'),
      ],
      ['guest loaded url=x', { kind: 'keep' }],
    ]
    for (const [line, want] of cases)
      expect(streamReasonChange(line), line).toEqual(want)
    // The screen's own terms stay in the log (PlainWords, 13 October 2026).
    expect(streamNotice(streamWords.notConnecting, undefined)).toBe(
      "The computer's screen isn't connecting. Try again in a little while.",
    )
    expect(
      streamNotice(
        streamWords.notConnecting,
        "noVNC cannot reach the desktop's socket.",
      ),
    ).toBe(
      "The computer's screen isn't connecting. Try again in a little while.",
    )
    expect(
      streamNotice(
        streamWords.notConnecting,
        'The desktop is asking for a password.',
      ),
    ).toBe(
      "The computer's screen isn't connecting. The desktop is asking for a password.",
    )
  })

  it('keeps the last reason in the tab’s log, cleared once a screen connects', () => {
    const log = new ComputerStreamLog()
    let told = 0
    log.subscribe(() => (told += 1))
    log.write(
      '[SimeonScreen] state=connecting status="" dialog=noVNC_credentials_dlg',
    )
    expect(log.reason).toBe('The desktop is asking for a password.')
    log.write('guest loaded url=about:screen')
    expect(told).toBe(1)
    log.write('[SimeonScreen] state=connected status="Connected" dialog=none')
    expect(log.reason).toBeUndefined()
    expect(log.lines).toHaveLength(3)
    expect(log.notice(streamWords.statusUnreadable)).toBe(
      "The computer's status could not be read. Try again in a little while.",
    )
  })

  it('names the field a click focused (`TypingField`)', () => {
    expect(typingFieldFrom('email')).toBe('email')
    expect(typingFieldFrom('')).toBe('none')
    expect(typingFieldFrom('color')).toBe('text')
  })

  it('gives a call its deadline, and the call goes on', async () => {
    let answer: (value: number) => void = () => {}
    const slow = new Promise<number>((resolve) => (answer = resolve))
    expect(await withDeadline(0.01, slow)).toEqual({ kind: 'timedOut' })
    answer(7)
    expect(await slow).toBe(7)
    expect(await withDeadline(1, Promise.resolve(3))).toEqual({
      kind: 'answered',
      value: 3,
    })
    expect(await withDeadline(1, Promise.reject(new Error('no')))).toEqual({
      kind: 'failed',
    })
  })
})

function status(
  agent: string,
  state = 'running',
  vnc: string | null = 'http://127.0.0.1:6080/vnc.html',
  extra: JSONObject = {},
): BoxStatus {
  return boxStatusFrom({ agentId: agent, state, vncUrl: vnc, ...extra })!
}

describe('what the window knows of each computer (`ComputerBookTests`)', () => {
  it('reads: one at a time, "Can’t reach…" before any status, a failure keeps the last', () => {
    const book = new ComputerBook()
    expect(book.readState('a')).toBe('unknown')
    const first = book.beginRead('a')!
    expect(book.beginRead('a'), 'one read at a time').toBeUndefined()
    book.readFailed('a', first)
    expect(book.readState('a'), "Can't reach… before any status").toBe('error')
    const retry = book.beginRead('a')!
    expect(book.readState('a'), 'Retry clears the error while it reads').toBe(
      'unknown',
    )
    book.readAnswered('a', retry, status('a'))
    expect(book.readState('a')).toBe('known')
    expect(book.phase('a')).toBe('running')
    const third = book.beginRead('a')!
    book.readFailed('a', third)
    expect(book.readState('a'), 'a failure keeps the last status').toBe('known')
    expect(book.status('a')).toBeDefined()
  })

  it('counts an empty answer as read', () => {
    const book = new ComputerBook()
    const attempt = book.beginRead('a')!
    book.readAnswered('a', attempt, undefined)
    expect(book.readState('a')).toBe('known')
    expect(book.phase('a')).toBe('off')
  })

  it('takes a late answer when nothing newer came, and a push over a read under way', () => {
    const book = new ComputerBook()
    const attempt = book.beginRead('a')!
    book.readFailed('a', attempt)
    book.lateRead('a', attempt, status('a', 'hibernated', null))
    expect(book.phase('a')).toBe('sleeping')
    const next = book.beginRead('a')!
    book.ingest(status('a'))
    book.readAnswered('a', next, status('a', 'absent', null))
    expect(book.phase('a'), 'a push is newer than the read under way').toBe(
      'running',
    )
  })

  it('starts: demanded, one at a time, dropped when the account went', () => {
    const book = new ComputerBook()
    const generation = book.beginEnsure('a')!
    expect(book.demanded.has('a')).toBe(true)
    expect(book.beginEnsure('a')).toBeUndefined()
    expect(book.phase('a')).toBe('starting')
    book.ensureSettled('a', generation, undefined, true)
    expect(book.readState('a')).toBe('error')
    expect(book.phase('a')).toBe('off')
    const again = book.beginEnsure('a')!
    book.reset()
    book.ensureSettled('a', again, status('a'), false)
    expect(
      book.status('a'),
      'a start from before the account went',
    ).toBeUndefined()
    expect(book.demanded.size).toBe(0)
  })

  it('files a status under its agent, with the disk it carries', () => {
    const book = new ComputerBook()
    const attempt = book.beginRead('a')!
    book.readAnswered(
      'a',
      attempt,
      status('b', 'running', 'http://127.0.0.1:6080/vnc.html', {
        diskPressure: { level: 'soft' },
      }),
    )
    expect(book.status('b')).toBeDefined()
    expect(book.diskPressure).toEqual({ level: 'soft' })
    book.ingest(status('b'))
    expect(
      book.diskPressure,
      'a status without pressure clears it',
    ).toBeUndefined()
    book.ingestDiskPressure({ level: 'hard' })
    expect(book.diskPressure).toEqual({ level: 'hard' })
    book.ingestDiskPressure(null)
    expect(book.diskPressure).toBeUndefined()
    expect(book.mostRecent?.agentId).toBe('b')
  })

  it('keeps 32, a watched one among them', () => {
    const book = new ComputerBook()
    book.watch('kept')
    for (let index = 0; index < 40; index += 1)
      book.ingest(status(`agent${index}`))
    expect(book.entries.size).toBe(32)
    expect(book.isWatched('kept'), 'a watched one stays').toBe(true)
  })

  it('reads again what is watched when the stream is back or the window comes forward', () => {
    const book = new ComputerBook()
    book.watch('a')
    book.watch('b')
    book.beginEnsure('b')
    const reading = book.beginRead('a')!
    const { read, ensure } = book.reconnected()
    expect(new Set(read)).toEqual(new Set(['a', 'b']))
    expect(ensure).toEqual(['b'])
    expect(book.beginRead('a'), 'the read under way is dropped').toBeDefined()
    book.readAnswered('a', reading, status('a'))
    expect(book.status('a'), 'its answer is too old').toBeUndefined()
    book.unwatch('a')
    expect(book.focused().read).toEqual(['b'])
  })

  it('moves its version with what a screen sees, not with the same status again', () => {
    const book = new ComputerBook()
    book.ingest(status('a'))
    const seen = book.version
    book.ingest(status('a'))
    expect(book.version).toBe(seen)
    book.ingest(status('a', 'hibernated', null))
    expect(book.version).toBeGreaterThan(seen)
  })
})

describe('the host’s computer events (`ComputerWireTests.testHostEvents`)', () => {
  it('reads each push as the screens want it', () => {
    const [box] = LiveBackend.map({
      channel: 'forever-box',
      payload: {
        agentId: 'a',
        state: 'running',
        vncUrl: 'http://127.0.0.1:6080/vnc.html',
      },
    })
    expect(box?.kind).toBe('computer')
    expect(
      screenURL(boxStatusFrom(box?.kind === 'computer' ? box.status : null)),
    ).toBe('http://127.0.0.1:6080/vnc.html')
    const [disk] = LiveBackend.map({
      channel: 'box-disk-pressure',
      payload: null,
    })
    expect(disk).toEqual({ kind: 'diskPressure', pressure: null })
    const [helpers] = LiveBackend.map({
      channel: 'subagents',
      payload: { parentAgentId: 'a', subagents: [{ subagentId: 's' }] },
    })
    expect(helpers).toEqual({
      kind: 'subagents',
      parentId: 'a',
      subagents: [{ subagentId: 's' }],
    })
    expect(
      LiveBackend.map({
        channel: 'computer-action',
        payload: { agentId: 'a', type: 'click', x: 10, y: 20 },
      }),
    ).toHaveLength(1)
  })
})
