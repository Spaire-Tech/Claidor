// Two calls one after the other, each answered late (the review of step
// 5d): what an earlier call's voice, channel, task or outbox does when it
// comes back after the next call has begun touches only the earlier call.

import { describe, expect, it } from 'vitest'
import type { CallState } from './call'
import { type CallTonePlaying, WebCallTones } from './callTones'
import { ElevenLabsVoice } from './elevenLabsVoice'
import { type JSONValue, field, num, str } from './json'
import { makeAgent } from './models'
import { StandInVoice } from './standInVoice'
import { FakeBackend, eventually, ms } from './testing'
import { LiveCall, VoiceCallText, clamp, prefix } from './voiceCall'

const quick = () => ms(2)

function watching(call: LiveCall) {
  const all: (CallState | undefined)[] = []
  call.observe((state) => all.push(state))
  return {
    all,
    get last() {
      return all[all.length - 1]
    },
  }
}

/** A gate a test opens when it wants. */
function gate() {
  let open = () => {}
  const opened = new Promise<void>((resolve) => (open = resolve))
  return { opened, open }
}

/**
 * A computer whose call commands can be held: the first `voiceCall` of a
 * kind is answered only once its gate opens (and its call's id is kept);
 * each call's outbox is its own, numbered from 1 as the host numbers it.
 */
function racingComputer() {
  const backend = new FakeBackend()
  backend.agents = [makeAgent({ id: 'theo', name: 'Theo' })]
  backend.serverAnswers['proxy/v1/voice/calls'] = {
    token: 'fake-ticket',
    conversation_id: 'conv_1',
  }
  const sent: { kind: string; call: string; args: JSONValue }[] = []
  const holds: {
    kind: string
    gate: ReturnType<typeof gate>
    call?: string
  }[] = []
  const outboxes = new Map<string, { seq: number; text: string }[]>()
  backend.command = async (
    method: string,
    args: JSONValue = {},
  ): Promise<JSONValue> => {
    if (method === 'getAgentTranscriptTail') return { entries: [] }
    if (method !== 'voiceCall') return {}
    const kind = str(field(args, 'kind')) ?? ''
    const call = str(field(args, 'callId')) ?? ''
    sent.push({ kind, call, args })
    const hold = holds.find((one) => one.kind === kind && one.call == null)
    if (hold) {
      hold.call = call
      await hold.gate.opened
    }
    if (kind === 'outbox') {
      const after = num(field(args, 'after')) ?? 0
      return {
        messages: (outboxes.get(call) ?? []).filter((m) => m.seq > after),
      }
    }
    return { ok: true }
  }
  /** The next `voiceCall` of `kind` waits for its gate. */
  const hold = (kind: string) => {
    const held = { kind, gate: gate() } as (typeof holds)[number]
    holds.push(held)
    return held
  }
  return { backend, sent, hold, outboxes }
}

/** The ring as a test hears it, a cycle 20 ms. */
class FakeTones implements CallTonePlaying {
  rings: number[] = []
  async ring(cycles: number): Promise<void> {
    this.rings.push(cycles)
    await ms(cycles * 20)
  }
  stopRinging(): void {}
  hangUp(): void {}
}

/** ElevenLabs' kit as a test drives it: each session opens when the test says, its `onConnect` first, as the kit's. */
function fakeKit() {
  const sessions: {
    options: {
      onConnect?: (props: { conversationId: string }) => void
      onDisconnect?: (details: { reason: string }) => void
    }
    ended: boolean
    open: () => void
  }[] = []
  const kit = async () => ({
    Conversation: {
      startSession: (options: (typeof sessions)[number]['options']) =>
        new Promise((resolve) => {
          const session = {
            options,
            ended: false,
            open: () => {
              options.onConnect?.({ conversationId: `conv_${sessions.length}` })
              resolve(conversation)
            },
          }
          const conversation = {
            async endSession() {
              session.ended = true
              options.onDisconnect?.({ reason: 'user' })
            },
            setMicMuted() {},
            sendContextualUpdate() {},
            sendUserMessage() {},
          }
          sessions.push(session)
        }),
    },
  })
  return { sessions, kit }
}

/** The browser's microphone question: answered when the test allows it. */
function microphoneQuestion() {
  const asked: (() => void)[] = []
  return {
    asked,
    ask: () => new Promise<void>((resolve) => asked.push(resolve)),
    allow: () => asked.splice(0).forEach((answer) => answer()),
  }
}

describe('a call hung up while its voice opens (M1)', () => {
  it('never opens a session when hung up during the microphone question', async () => {
    const { backend } = racingComputer()
    const { sessions, kit } = fakeKit()
    const microphone = microphoneQuestion()
    const live = new LiveCall({
      backend,
      transport: new ElevenLabsVoice(kit as never, microphone.ask),
      personName: () => undefined,
      pause: quick,
    })
    const states = watching(live)
    live.start('theo', 'Theo', 'green')
    await eventually(() => microphone.asked.length === 1)
    live.hangUp()
    // The person clicks Allow after hanging up.
    microphone.allow()
    await ms(50)
    expect(sessions).toHaveLength(0)
    expect(states.all.some((state) => state?.phase === 'live')).toBe(false)
  })

  it("keeps the next call on when the earlier call's voice opens late", async () => {
    const { backend } = racingComputer()
    const { sessions, kit } = fakeKit()
    const microphone = microphoneQuestion()
    const live = new LiveCall({
      backend,
      transport: new ElevenLabsVoice(kit as never, microphone.ask),
      personName: () => undefined,
      pause: quick,
    })
    const states = watching(live)
    // A first call's session is still opening when the person hangs up.
    live.start('theo', 'Theo', 'green')
    await eventually(() => microphone.asked.length === 1)
    microphone.allow()
    await eventually(() => sessions.length === 1)
    live.hangUp()
    await eventually(() => states.last === undefined)
    // They call again; Allow; the second session opens.
    live.start('theo', 'Theo', 'green')
    await eventually(() => microphone.asked.length === 1)
    microphone.allow()
    await eventually(() => sessions.length === 2)
    // The first room connects only now: its own session is let go.
    sessions[0]!.open()
    await ms(10)
    expect(sessions[0]!.ended).toBe(true)
    sessions[1]!.open()
    await ms(50)
    expect(states.last?.phase).toBe('live')
    expect(sessions[1]!.ended).toBe(false)
    live.hangUp()
    await ms(10)
    expect(sessions[1]!.ended).toBe(true)
  })

  it('a stand-in voice let go before it asks never connects', async () => {
    const voice = new StandInVoice({ asksMicrophone: false })
    await voice.end('a')
    let connected = false
    await voice.start(
      { call: 'a', token: 't', prompt: '', firstMessage: '', language: 'en' },
      (event) => (connected ||= event.kind === 'connected'),
    )
    expect(connected).toBe(false)
  })
})

describe("an earlier call's work coming back late (M2)", () => {
  it("closes the earlier call's channel with its own id, and the next call still rings", async () => {
    const { backend, sent, hold } = racingComputer()
    const opening = hold('open')
    const tones = new FakeTones()
    let tickets = 0
    const server = backend.server.bind(backend)
    // The second call's ticket takes a while: it rings on.
    backend.server = async (path, method, body) => {
      if (path === 'proxy/v1/voice/calls' && ++tickets === 2) await ms(80)
      return server(path, method, body)
    }
    const live = new LiveCall({
      backend,
      transport: new StandInVoice({ asksMicrophone: false }),
      personName: () => undefined,
      tones,
      pause: quick,
    })
    const states = watching(live)
    live.start('theo', 'Theo', 'green')
    await eventually(() => opening.call != null)
    const first = opening.call!
    // Hung up while its channel opens, and called again.
    live.hangUp()
    await eventually(() => states.last === undefined)
    tones.rings = []
    live.start('theo', 'Theo', 'green')
    await ms(20)
    // The first call's channel answers only now.
    opening.gate.open()
    await ms(150)
    expect(sent.some((one) => one.kind === 'ended' && one.call === first)).toBe(
      true,
    )
    // The second call rang on past its first two, its own ring not cut.
    expect(tones.rings.length).toBeGreaterThan(2)
    await eventually(() => states.last?.phase === 'live')
    expect(states.last?.phase).toBe('live')
    live.hangUp()
  })

  it("never puts the earlier call's task on the next call's banner", async () => {
    const { backend, hold } = racingComputer()
    const voice = new StandInVoice({ asksMicrophone: false })
    const live = new LiveCall({
      backend,
      transport: voice,
      personName: () => undefined,
      pause: quick,
    })
    const states = watching(live)
    live.start('theo', 'Theo', 'green')
    await eventually(() => states.last?.phase === 'live')
    const asking = hold('request')
    voice.emit({
      kind: 'tool',
      name: 'send_task',
      id: 't1',
      parameters: { task: 'Send the reminders' },
    })
    await eventually(() => asking.call != null)
    live.hangUp()
    await eventually(() => states.last === undefined)
    live.start('theo', 'Theo', 'green')
    await eventually(() => states.last?.phase === 'live')
    const from = states.all.length
    asking.gate.open()
    await ms(50)
    expect(
      states.all
        .slice(from)
        .some((state) => state?.activity === 'Sending the reminders…'),
    ).toBe(false)
    live.hangUp()
  })

  it("says the next call's first reply though the earlier call's outbox answered late", async () => {
    const { backend, hold, outboxes, sent } = racingComputer()
    const voice = new StandInVoice({ asksMicrophone: false })
    const live = new LiveCall({
      backend,
      transport: voice,
      personName: () => undefined,
      quiet: 0.02,
      pause: quick,
    })
    const states = watching(live)
    const reading = hold('outbox')
    live.start('theo', 'Theo', 'green')
    await eventually(() => reading.call != null)
    const first = reading.call!
    outboxes.set(first, [{ seq: 5, text: 'Done: the earlier call' }])
    live.hangUp()
    await eventually(() => states.last === undefined)
    live.start('theo', 'Theo', 'green')
    await eventually(() => states.last?.phase === 'live')
    const second = sent.find(
      (one) => one.kind === 'open' && one.call !== first,
    )!.call
    // The earlier call's outbox answers now, then the next call's first reply comes.
    reading.gate.open()
    await ms(20)
    outboxes.set(second, [{ seq: 1, text: 'Done: the next call' }])
    await eventually(() => voice.said.length > 0)
    expect(voice.said).toEqual([
      VoiceCallText.workCameBack(['Done: the next call']),
    ])
    live.hangUp()
  })
})

describe('the tones let their audio go (L3)', () => {
  it('suspends between tones and closes at sign-out, one context at most', async () => {
    const made: FakeContext[] = []
    class FakeContext {
      state = 'running'
      destination = {}
      constructor() {
        made.push(this)
      }
      async resume() {
        this.state = 'running'
      }
      async suspend() {
        this.state = 'suspended'
      }
      async close() {
        this.state = 'closed'
      }
      createBuffer() {
        return { copyToChannel() {} }
      }
      createBufferSource() {
        const source = {
          onended: null as null | (() => void),
          buffer: null,
          connect() {},
          start() {
            setTimeout(() => source.onended?.(), 5)
          },
          stop() {
            source.onended?.()
          },
        }
        return source
      }
    }
    const was = (globalThis as { AudioContext?: unknown }).AudioContext
    ;(globalThis as { AudioContext?: unknown }).AudioContext = FakeContext
    try {
      const tones = new WebCallTones()
      const ringing = tones.ring(1)
      tones.stopRinging()
      await ringing
      await ms(20)
      expect(made).toHaveLength(1)
      expect(made[0]!.state).toBe('suspended')
      tones.hangUp()
      expect(made[0]!.state).toBe('running')
      tones.close()
      await ms(20)
      expect(made[0]!.state).toBe('closed')
      // Signed out: nothing more plays, and no context is made again.
      tones.hangUp()
      expect(made).toHaveLength(1)
    } finally {
      ;(globalThis as { AudioContext?: unknown }).AudioContext = was
    }
  })
})

describe("the prompt's and the task's limits count characters as Swift does (L4)", () => {
  it('never cuts a flag or a family in half', () => {
    const family = '👨‍👩‍👧‍👦'
    const words = 'a'.repeat(58) + family + 'bcd'
    // 62 characters as Swift counts them: past 60, the first 59 and "…".
    expect(clamp(words, 60)).toBe('a'.repeat(58) + family + '…')
    expect(prefix('🇫🇷🇩🇪🇮🇹', 2)).toBe('🇫🇷🇩🇪')
    expect(clamp('🇫🇷'.repeat(3), 3)).toBe('🇫🇷'.repeat(3))
  })
})
