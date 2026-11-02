// A call, as the core's own tests check it: the banner's looks, status and
// waveform, the older call record and the switch (CallBannerTests.swift);
// the call's flow at a hang-up, an error, a dropped line, the seventh ring,
// the working line and the chat's call line (CallFlowTests.swift); the
// prompt, the relayed task and the record (CoreTests.swift's
// `VoiceCallTests`), the tones and the quiet line (`CallSoundAndTurnTests`),
// the call's language (LanguageTests.swift). The demo computer's side of a
// call (Demo.swift's `demoVoice` and its server) is `callComputer` here.

import { describe, expect, it } from 'vitest'
import { SimeonAPIError } from './api'
import {
  CallBanner,
  type CallState,
  DemoCall,
  parseCallRecord,
  voiceCallsEnabled,
} from './call'
import { type CallTonePlaying, CallTones } from './callTones'
import { callClock, chatRows, voiceChatLabel } from './chat'
import { Entry } from './entry'
import { type JSONValue, field } from './json'
import { makeAgent } from './models'
import { StandInVoice } from './standInVoice'
import { FakeBackend, ms } from './testing'
import { LiveCall, VoiceCallText, type VoiceTransport } from './voiceCall'

const quick = () => ms(2)

/** The demo computer's side of `voice:<call>` and the server's call: a request is answered on the outbox a moment later. */
function callComputer() {
  const backend = new FakeBackend()
  backend.agents = [
    makeAgent({
      id: 'theo',
      name: 'Theo',
      title: 'Bookkeeping',
      description: 'Keeps the books.',
    }),
    makeAgent({ id: 'iris', name: 'Iris', title: 'Customer support' }),
  ]
  const outbox: JSONValue[] = []
  const records: JSONValue[] = []
  const appended: JSONValue[] = []
  backend.commandAnswers.getAgentTranscriptTail = () => ({
    entries: [
      {
        kind: 'message',
        id: 'u1',
        role: 'user',
        content: "What's our runway?",
      },
    ],
  })
  backend.commandAnswers.voiceCall = (args): JSONValue => {
    switch (field(args, 'kind')) {
      case 'request':
        outbox.push({
          seq: outbox.length + 1,
          text: `Done: ${field(args, 'request') ?? 'it'}`,
        })
        return { ok: true }
      case 'outbox': {
        const after = Number(field(args, 'after') ?? 0)
        return {
          messages: outbox.filter((m) => Number(field(m, 'seq')) > after),
        }
      }
      case 'ended': {
        const record = field(args, 'record') ?? {}
        records.push(record)
        const lines = field(record, 'transcript')
        return { exchange: Array.isArray(lines) ? lines.length : 0 }
      }
      default:
        return { ok: true }
    }
  }
  backend.commandAnswers.appendSendMessage = (args) => {
    appended.push(args)
    return {}
  }
  backend.serverAnswers['proxy/v1/voice/calls'] = {
    token: 'demo-token',
    conversation_id: 'conv_demo',
    agent_id: 'agent_demo',
  }
  backend.serverAnswers['proxy/v1/voice/calls/conv_demo/end'] = {
    seconds: 0,
    summary: "Bass asked to move the review; it's done.",
    transcript: [
      { speaker: 'agent', text: 'Hey Bass.' },
      { speaker: 'user', text: 'Move the review to Friday.' },
    ],
  }
  return { backend, records, appended }
}

/** The call's states as a test sees them. */
function watching(call: { observe: LiveCall['observe'] }) {
  const all: (CallState | undefined)[] = []
  call.observe((state) => all.push(state))
  return {
    all,
    get last() {
      return all[all.length - 1]
    },
  }
}

/** The call's tones as a test hears them (`FakeTones`): each ring, and the hang-ups. */
class FakeTones implements CallTonePlaying {
  rings: number[] = []
  ringsOver?: number
  stops = 0
  hangUps = 0
  async ring(cycles: number): Promise<void> {
    this.rings.push(cycles)
    await ms(cycles * 40)
    this.ringsOver = Date.now()
  }
  stopRinging(): void {
    this.stops += 1
  }
  hangUp(): void {
    this.hangUps += 1
  }
}

/** The voice that refuses the microphone (`RefusedVoice`). */
class RefusedVoice implements VoiceTransport {
  async start(): Promise<void> {
    const refused = new Error('Permission denied for the microphone')
    refused.name = 'NotAllowedError'
    throw refused
  }
  async setMuted(): Promise<void> {}
  async say(): Promise<void> {}
  async toolResult(): Promise<void> {}
  async end(): Promise<void> {}
}

/** A voice that says it connected only after a while, and counts its ends (`LateVoice`). */
class LateVoice implements VoiceTransport {
  ends = 0
  async start(
    _args: unknown,
    events: Parameters<VoiceTransport['start']>[1],
  ): Promise<void> {
    await ms(150)
    events({ kind: 'connected', conversationId: 'c1' })
  }
  async setMuted(): Promise<void> {}
  async say(): Promise<void> {}
  async toolResult(): Promise<void> {}
  async end(): Promise<void> {
    this.ends += 1
  }
}

/** The tests' voice (`FakeVoice`): connected at once, keeping what it is told. */
const fakeVoice = () => new StandInVoice({ asksMicrophone: false })
/** A voice that never says it connected until told (`UnansweredVoice`). */
class UnansweredVoice extends StandInVoice {
  constructor() {
    super({ asksMicrophone: false })
  }
  override async start(
    args: Parameters<VoiceTransport['start']>[0],
    events: Parameters<VoiceTransport['start']>[1],
  ): Promise<void> {
    this.started = args
    ;(this as unknown as { events: typeof events }).events = events
  }
}

function call(
  phase: CallState['phase'],
  options: {
    speaking?: boolean
    activity?: string
    connected?: number
    ended?: number
  } = {},
): CallState {
  return {
    phase,
    status: phase === 'ringing' ? 'Calling…' : '',
    agentId: 'theo',
    agentName: 'Theo',
    agentColour: 'green',
    isMuted: false,
    agentSpeaking: options.speaking ?? false,
    levels: [],
    lines: [],
    connectedAt: options.connected,
    endedAt: options.ended,
    activity: options.activity,
    failed: false,
  }
}

describe("the Mac's call banner (CallBannerTests)", () => {
  it('looks and says each moment of the call', () => {
    const start = 1_000_000
    expect(CallBanner.look(call('ringing'))).toBe('ringing')
    expect(CallBanner.status(call('ringing'))).toBe('Calling…')
    expect(
      CallBanner.look(call('live', { speaking: true, connected: start })),
    ).toBe('speaking')
    expect(
      CallBanner.status(call('live', { connected: start }), start + 168_000),
    ).toBe('2:48')
    expect(
      CallBanner.status(call('live', { connected: start }), start + 3_723_000),
    ).toBe('1:02:03')
    expect(
      CallBanner.look(
        call('live', {
          activity: 'Sending the agenda to Dana…',
          connected: start,
        }),
      ),
    ).toBe('working')
    expect(
      CallBanner.hasWave(
        call('live', { activity: 'Sending…', connected: start }),
      ),
    ).toBe(false)
    expect(CallBanner.hasWave(call('live', { connected: start }))).toBe(true)
    expect(
      CallBanner.status(
        call('ended', { connected: start, ended: start + 12_000 }),
      ),
    ).toBe('Call ended · 0:12')
    // A call that never connected has no time.
    expect(CallBanner.status(call('ended'))).toBe('Call ended')
    const failed = {
      ...call('ended'),
      failed: true,
      status: VoiceCallText.notSwitchedOn(),
    }
    expect(CallBanner.look(failed)).toBe('failed')
    expect(CallBanner.status(failed)).toBe("Calls aren't switched on yet")
  })

  it('draws the waveform highest in the middle', () => {
    const flat = CallBanner.barHeights([], true)
    expect(flat).toHaveLength(46)
    // Laid flat at the 2-point floor.
    expect(new Set(flat)).toEqual(new Set([2]))
    const loud = CallBanner.barHeights(new Array(24).fill(1), true)
    expect(Math.max(...loud)).toBeCloseTo(
      2 + 16 * Math.sin((Math.PI * 22.5) / 46),
      9,
    )
    expect(loud[0]!).toBeLessThan(3)
    expect(
      Math.max(...CallBanner.barHeights(new Array(24).fill(1), false)),
    ).toBeCloseTo(2 + 12 * Math.sin((Math.PI * 22.5) / 46), 9)
  })

  it('reads an older call record', () => {
    expect(
      parseCallRecord('Voice call · 2:48\n\nWe moved the review to Friday.'),
    ).toEqual({ duration: '2:48', recap: 'We moved the review to Friday.' })
    expect(parseCallRecord('Voice call · 1:02:03')).toEqual({
      duration: '1:02:03',
    })
    expect(parseCallRecord('Voice call at 2:48')).toBeUndefined()
    expect(parseCallRecord('Voice chat · 2:48')).toBeUndefined()
  })

  it('takes calls off only when told', () => {
    expect(voiceCallsEnabled({})).toBe(true)
    expect(voiceCallsEnabled({ SIMEON_VOICE_CALLS: '1' })).toBe(true)
    expect(voiceCallsEnabled({ SIMEON_VOICE_CALLS: ' Off ' })).toBe(false)
    expect(voiceCallsEnabled({ SIMEON_VOICE_CALLS: '0' })).toBe(false)
  })

  it("rings and hangs up at the Mac's loudness", () => {
    const peak = (samples: Float32Array) =>
      Math.max(...Array.from(samples, Math.abs))
    expect(peak(CallTones.ringSamples(1, CallTones.macRingPeak))).toBeCloseTo(
      CallTones.macRingPeak,
      2,
    )
    expect(peak(CallTones.hangUpSamples(CallTones.macHangUpPeak))).toBeCloseTo(
      CallTones.macHangUpPeak,
      2,
    )
  })

  it('keeps a failed call until it is closed, on the Mac', async () => {
    const { backend } = callComputer()
    const lines: string[] = []
    const live = new LiveCall({
      backend,
      transport: new RefusedVoice(),
      personName: () => undefined,
      failedStays: null,
      log: (line) => lines.push(line),
      pause: quick,
    })
    const states = watching(live)
    live.start('theo', 'Theo', 'green')
    await ms(400)
    const last = states.last!
    expect(last.failed).toBe(true)
    expect(CallBanner.status(last)).toBe("Simeon can't use the microphone")
    expect(CallBanner.look(last)).toBe('failed')
    live.dismiss()
    // Close puts it away.
    expect(states.last).toBeUndefined()
    expect(
      lines.some((line) => line.startsWith('call started for agent theo')),
    ).toBe(true)
    expect(lines.some((line) => line.startsWith('call failed:'))).toBe(true)
  })
})

describe("the call's flow (CallFlowTests)", () => {
  it('names what the agent is doing', () => {
    const say = VoiceCallText.describeActivity
    expect(say('tool', 'CallMcpTool', 'composio_gmail')).toBe('Using Gmail…')
    expect(say('tool', 'CallMcpTool', 'google_calendar')).toBe(
      'Using Google Calendar…',
    )
    expect(say('tool', 'CallMcpTool', undefined)).toBe('Using an app…')
    expect(say('tool', 'WebSearch', 'flights')).toBe('Searching the web…')
    expect(say('tool', 'Read', '  notes.md ')).toBe('Reading notes.md…')
    expect(say('tool', 'Shell', '')).toBe('Running a command…')
    expect(say('tool', 'McpAuth', 'mcp-gh')).toBe('Signing in to GH…')
    expect(say('tool', 'Something', undefined)).toBe('Working on it…')
    expect(say('thinking', undefined, undefined)).toBeUndefined()
    expect(say('tool', 'Read', 'a'.repeat(50))).toBe(
      `Reading ${'a'.repeat(39)}……`,
    )
  })

  it("draws the chat's call line", () => {
    expect(voiceChatLabel(0, true)).toBe('Voice chat · now')
    expect(voiceChatLabel(168, false)).toBe('Voice chat · 02:48')
    expect(voiceChatLabel(3725, false)).toBe('Voice chat · 1:02:05')
    const live = Entry.from({
      kind: 'event',
      id: 'v1',
      event: { type: 'voice-call', status: 'live', seconds: 0, lines: [] },
      timestampMs: 1_000,
    })!
    const ended = Entry.from({
      kind: 'event',
      id: 'v2',
      event: {
        type: 'voice-call',
        status: 'ended',
        seconds: 168,
        lines: [{ speaker: 'user', text: 'Hi' }],
      },
      timestampMs: 2_000,
    })!
    const calls = chatRows([live, ended]).flatMap((row) =>
      row.kind === 'voiceCall'
        ? [[row.live, row.seconds + row.lines.length * 1_000] as const]
        : [],
    )
    expect(calls.map((one) => one[0])).toEqual([true, false])
    expect(calls.map((one) => one[1])).toEqual([0, 1_168])
  })

  it('ends the call at the click', async () => {
    const { backend } = callComputer()
    const voice = fakeVoice()
    const tones = new FakeTones()
    const live = new LiveCall({
      backend,
      transport: voice,
      personName: () => 'Bass',
      tones,
      quiet: 0.02,
      pause: quick,
    })
    const states = watching(live)
    live.start('theo', 'Theo', 'green')
    await ms(300)
    expect(states.last?.phase).toBe('live')
    live.hangUp()
    // At once: no wait for the voice to let go.
    expect(states.last?.phase).toBe('ended')
    expect(states.last?.status).toBe(VoiceCallText.ended())
    expect(tones.hangUps).toBe(1)
    await ms(50)
    expect(voice.ended).toBe(true)
  })

  it('stays ended when hung up while it rings', async () => {
    const { backend } = callComputer()
    const live = new LiveCall({
      backend,
      transport: fakeVoice(),
      personName: () => 'Bass',
      tones: new FakeTones(),
      failedStays: null,
      pause: quick,
    })
    const states = watching(live)
    live.start('theo', 'Theo', 'green')
    live.hangUp()
    await ms(300)
    // The token landing late never makes it "Couldn't connect".
    expect(states.all.some((state) => state?.failed)).toBe(false)
    expect(states.all.some((state) => state?.phase === 'live')).toBe(false)
  })

  it("leaves the call on at the kit's error once it is live", async () => {
    const { backend } = callComputer()
    const voice = fakeVoice()
    const lines: string[] = []
    const live = new LiveCall({
      backend,
      transport: voice,
      personName: () => 'Bass',
      log: (line) => lines.push(line),
      pause: quick,
    })
    const states = watching(live)
    live.start('theo', 'Theo', 'green')
    await ms(200)
    voice.emit({ kind: 'failed', message: 'data channel hiccup' })
    await ms(20)
    expect(states.last?.phase).toBe('live')
    expect(states.last?.failed).toBe(false)
    expect(lines).toContain('banner: sdk error: data channel hiccup')
  })

  it("says Couldn't connect for a line dropped before it connects", async () => {
    const { backend } = callComputer()
    const voice = new UnansweredVoice()
    const live = new LiveCall({
      backend,
      transport: voice,
      personName: () => 'Bass',
      failedStays: null,
      pause: quick,
    })
    const states = watching(live)
    live.start('theo', 'Theo', 'green')
    await ms(200)
    voice.emit({ kind: 'ended' })
    const last = states.last!
    expect(last.failed).toBe(true)
    expect(CallBanner.status(last)).toBe(VoiceCallText.couldNotConnect())
  })

  it("says Couldn't connect after seven rings without an answer", async () => {
    const tones = new FakeTones()
    // A computer whose server takes its time over the call's token (`SlowBackend`).
    const backend = new FakeBackend()
    backend.agents = [makeAgent({ id: 'theo', name: 'Theo' })]
    backend.server = async () => {
      await ms(3_000)
      return { token: 'late' }
    }
    const live = new LiveCall({
      backend,
      transport: fakeVoice(),
      personName: () => undefined,
      tones,
      failedStays: null,
      pause: quick,
    })
    const states = watching(live)
    live.start('theo', 'Theo', 'green')
    await ms(700)
    expect(tones.rings).toEqual([2, 1, 1, 1, 1, 1])
    const last = states.last!
    expect(last.failed).toBe(true)
    expect(CallBanner.status(last)).toBe(VoiceCallText.couldNotConnect())
  })

  it('lets go of a voice that connects after the hang-up (CallLateVoiceTests)', async () => {
    const { backend } = callComputer()
    const voice = new LateVoice()
    const live = new LiveCall({
      backend,
      transport: voice,
      personName: () => undefined,
      pause: quick,
    })
    const states = watching(live)
    live.start('theo', 'Theo', 'green')
    // While the voice connects.
    await ms(80)
    live.hangUp()
    await ms(250)
    // Never live after the hang-up, and the late voice is ended too.
    expect(states.all.some((state) => state?.phase === 'live')).toBe(false)
    expect(voice.ends).toBeGreaterThanOrEqual(2)
  })
})

describe('the voice speaks as the agent (VoiceCallTests)', () => {
  it("says the Mac's words", () => {
    const prompt = VoiceCallText.prompt({
      name: 'Theo',
      title: 'Bookkeeping',
      description: 'Keeps the books.',
      transcript: [{ fromPerson: true, text: "What's our runway?" }],
      personName: 'Bass',
      teammates: [
        { name: 'Iris', title: 'Customer support' },
        { name: 'Theo', title: '' },
      ],
    })
    expect(
      prompt.startsWith(
        "You are Theo, Bookkeeping, one of Bass's Simeon agents, on a live phone call with Bass.",
      ),
    ).toBe(true)
    expect(prompt).toContain(
      "Your teammates, other agents on Bass's team that you can message, ask and hand work to: Iris (Customer support).",
    )
    expect(prompt).toContain("Bass: What's our runway?")
    expect(
      VoiceCallText.firstMessage({ name: 'Theo', pick: 0, personName: 'Bass' }),
    ).toBe("Hey Bass, it's Theo. What's up?")
    expect(VoiceCallText.firstMessage({ name: 'Theo', pick: 0.99 })).toBe(
      "Theo here. What's on your mind?",
    )
    expect(
      VoiceCallText.workingLabel('Please send the agenda to Dana and Marcus.'),
    ).toBe('Sending the agenda to Dana and Marcus…')
    expect(VoiceCallText.workingLabel('Make a slide')).toBe('Making a slide…')
    expect(VoiceCallText.workingLabel('The usual')).toBe('Working on it…')
  })

  it('relays the task, says the answer and leaves its record', async () => {
    const { backend, records } = callComputer()
    const voice = fakeVoice()
    const live = new LiveCall({
      backend,
      transport: voice,
      personName: () => 'Bass',
      quiet: 0.02,
      pause: quick,
    })
    const states = watching(live)
    live.start('theo', 'Theo', 'green')
    await ms(100)
    expect(voice.started?.token).toBe('demo-token')
    expect(voice.started?.prompt).toContain('You are Theo, Bookkeeping')
    expect(states.last?.phase).toBe('live')
    voice.emit({
      kind: 'tool',
      name: 'send_task',
      id: 't1',
      parameters: { task: 'Send the reminders' },
    })
    await ms(150)
    expect(voice.results.get('t1')).toBe(VoiceCallText.sendTaskAccepted)
    expect(voice.said[0]).toBe(
      VoiceCallText.workCameBack(['Done: Send the reminders']),
    )
    voice.emit({ kind: 'line', fromPerson: true, text: 'Thanks' })
    voice.emit({ kind: 'ended' })
    await ms(200)
    expect(field(records[records.length - 1], 'recap')).toBe(
      "Bass asked to move the review; it's done.",
    )
    expect(states.last).toBeUndefined()
  })

  it("writes the call's line itself for a host that wrote none", async () => {
    const { backend, appended } = callComputer()
    backend.refusedCommands.add('voiceCall')
    const voice = fakeVoice()
    const live = new LiveCall({
      backend,
      transport: voice,
      personName: () => 'Bass',
      pause: quick,
    })
    live.start('theo', 'Theo', 'green')
    await ms(100)
    live.hangUp()
    await ms(100)
    const message = field(appended[0], 'message')
    expect(field(message, 'content')).toBe(
      `Voice call · ${callClock(0)}\n\nBass asked to move the review; it's done.`,
    )
  })
})

describe('the tones and the quiet line (CallSoundAndTurnTests)', () => {
  it("are the Mac's tones", () => {
    const ring = CallTones.ringSamples(2)
    expect(ring.length).toBe(2 * Math.trunc(1.2 * 44_100))
    // 0.8 s of tone, 0.4 s of quiet, a cycle; soft edges; never louder than its peak.
    expect(ring[0]).toBe(0)
    const part = (from: number, to: number) =>
      Math.max(...Array.from(ring.slice(from, to), Math.abs))
    expect(
      part(Math.trunc(0.4 * 44_100), Math.trunc(0.41 * 44_100) + 1),
    ).toBeGreaterThan(0.05)
    expect(part(Math.trunc(0.9 * 44_100), Math.trunc(1.2 * 44_100))).toBe(0)
    expect(part(0, ring.length)).toBeLessThanOrEqual(0.3001)
    const hangUp = CallTones.hangUpSamples()
    expect(hangUp.length).toBe(
      2 * (Math.trunc(0.13 * 44_100) + Math.trunc(0.04 * 44_100)),
    )
    expect(CallTones.hangUpNotes).toEqual([784, 523.25])
    const wav = CallTones.wav([0, 1, -1])
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF')
    expect(wav.length).toBe(44 + 6)
    expect([...wav.slice(-4)]).toEqual([0xff, 0x7f, 0x01, 0x80])
  })

  it('rings twice before the voice and ends with the hang-up', async () => {
    const { backend } = callComputer()
    const voice = fakeVoice()
    const tones = new FakeTones()
    const live = new LiveCall({
      backend,
      transport: voice,
      personName: () => 'Bass',
      tones,
      quiet: 0.02,
      pause: quick,
    })
    live.start('theo', 'Theo', 'green')
    await ms(300)
    expect(tones.rings[0]).toBe(2)
    // The voice starts once the ring is over.
    expect(voice.started).toBeDefined()
    expect(tones.ringsOver).toBeDefined()
    expect(tones.hangUps).toBe(0)
    live.hangUp()
    await ms(100)
    // A live call ends with the hang-up tone.
    expect(tones.hangUps).toBe(1)
  })

  it('says work that came back only once the voice has finished', async () => {
    const { backend } = callComputer()
    const voice = fakeVoice()
    const live = new LiveCall({
      backend,
      transport: voice,
      personName: () => 'Bass',
      quiet: 0.05,
      pause: quick,
    })
    const states = watching(live)
    live.start('theo', 'Theo', 'green')
    await ms(100)
    voice.emit({ kind: 'agentSpeaking', on: true })
    voice.emit({
      kind: 'tool',
      name: 'send_task',
      id: 't1',
      parameters: { task: 'Update the routine' },
    })
    await ms(400)
    // Nothing is pushed in while the voice talks.
    expect(voice.said).toEqual([])
    voice.emit({ kind: 'agentSpeaking', on: false })
    await ms(300)
    // Said once the line is quiet.
    expect(voice.said).toHaveLength(1)
    expect(voice.said[0]).toContain('they can see it done')
    // The nudge that makes the voice speak is not shown as the person's words.
    voice.emit({
      kind: 'transcript',
      lines: [
        { fromPerson: false, text: 'On it.' },
        { fromPerson: true, text: VoiceCallText.workCameBackNudge },
      ],
    })
    await ms(50)
    expect(states.last?.lines.map((line) => line.text)).toEqual(['On it.'])
    live.hangUp()
  })
})

describe("a call hears and speaks the app's language (LanguageTests)", () => {
  it('in English, French, Spanish and the later languages', () => {
    expect(VoiceCallText.language('en')).toBe('en')
    expect(VoiceCallText.language('fr-CA')).toBe('fr')
    // A language the server's voice agent was not given is English.
    expect(VoiceCallText.language('ja')).toBe('en')
    expect(VoiceCallText.language('tlh')).toBe('en')
    const english = VoiceCallText.prompt({
      name: 'Theo',
      title: '',
      description: '',
      transcript: [],
      personName: 'Bass',
      teammates: [],
    })
    expect(english).toBe(
      VoiceCallText.prompt({
        name: 'Theo',
        title: '',
        description: '',
        transcript: [],
        personName: 'Bass',
        teammates: [],
        language: 'en',
      }),
    )
    expect(english).not.toContain('Language:')
    const french = VoiceCallText.prompt({
      name: 'Theo',
      title: '',
      description: '',
      transcript: [],
      personName: 'Bass',
      teammates: [],
      language: 'fr',
    })
    expect(
      french.endsWith(
        'Language:\n- Speak French for the whole call. If they speak another language to you, answer in theirs.\n- Say "tu" to them, warm and direct, never stiff, unless they ask for "vous" or their messages above say "vous".\n- Names stay as they are: Simeon, your name and your teammates\' names, and the names of apps (Gmail, Slack, Shop).',
      ),
    ).toBe(true)
    const greet = (pick: number, language: string, personName?: string) =>
      VoiceCallText.firstMessage({ name: 'Theo', pick, personName, language })
    expect(greet(0, 'fr', 'Bass')).toBe(
      'Salut Bass, c’est Theo. Quoi de neuf ?',
    )
    expect(greet(0.99, 'fr')).toBe(
      'Theo à l’appareil. Qu’est-ce que tu as en tête ?',
    )
    const greetings = new Set(
      [0, 0.2, 0.4, 0.6, 0.8].map((pick) => greet(pick, 'fr')),
    )
    expect(greetings.size).toBe(5)
    for (const greeting of greetings) {
      expect(greeting).not.toContain('!')
      expect(greeting).not.toContain(' ?')
    }
    expect(VoiceCallText.language('es-MX')).toBe('es')
    expect(VoiceCallText.languageRule('es')).toContain(
      '- Say "tú" to them, warm and direct, never stiff, unless they ask for "usted" or their messages above say "usted".',
    )
    expect(greet(0, 'es', 'Bass')).toBe('Hola Bass, soy Theo. ¿Qué tal?')
    expect(greet(0.99, 'es')).toBe('Theo al habla. ¿Qué tienes en mente?')
    expect(VoiceCallText.languageRule('pt-BR')).toContain(
      '- Speak Brazilian Portuguese for the whole call.',
    )
    // No Japanese call: English.
    expect(
      VoiceCallText.prompt({
        name: 'Theo',
        title: '',
        description: '',
        transcript: [],
        personName: 'Bass',
        teammates: [],
        language: 'ja',
      }),
    ).toBe(english)
    // The later languages (21 October 2026): each its familiar "you", five calm greetings with the name.
    const englishGreetings = new Set(
      [0, 0.2, 0.4, 0.6, 0.8].map((pick) => greet(pick, 'en', 'Bass')),
    )
    for (const [tag, code, familiar, formal] of [
      ['de-AT', 'de', 'du', 'Sie'],
      ['nl', 'nl', 'je', 'u'],
      ['it', 'it', 'tu', 'Lei'],
      ['pt-BR', 'pt', 'você', 'o senhor/a senhora'],
      ['sv', 'sv', 'du', 'ni'],
      ['pl', 'pl', 'ty', 'Pan/Pani'],
      ['tr', 'tr', 'sen', 'siz'],
    ] as const) {
      expect(VoiceCallText.language(tag)).toBe(code)
      expect(VoiceCallText.languageRule(tag)).toContain(
        `- Say "${familiar}" to them, warm and direct, never stiff, unless they ask for "${formal}" or their messages above say "${formal}".`,
      )
      const theirs = new Set(
        [0, 0.2, 0.4, 0.6, 0.8].map((pick) => greet(pick, tag, 'Bass')),
      )
      expect(theirs.size).toBe(5)
      for (const greeting of theirs) {
        expect(greeting).toContain('Theo')
        expect(englishGreetings.has(greeting)).toBe(false)
        expect(greeting).not.toContain('!')
      }
    }
  })

  it('speaks French from its first word when started in French', async () => {
    const { backend } = callComputer()
    const voice = fakeVoice()
    const live = new LiveCall({
      backend,
      transport: voice,
      personName: () => 'Bass',
      tones: new FakeTones(),
      quiet: 0.02,
      language: () => 'fr',
      pause: quick,
    })
    live.start('theo', 'Theo', 'green')
    await ms(300)
    expect(voice.started?.language).toBe('fr')
    const first = voice.started?.firstMessage ?? ''
    expect(first.includes('Theo') && first.endsWith(' ?')).toBe(true)
    expect(voice.started?.prompt).toContain('Speak French for the whole call.')
    live.hangUp()
  })
})

describe("the review link's scripted call", () => {
  it('rings, goes live, and leaves after it ends', async () => {
    const demo = new DemoCall(20)
    const states = watching(demo)
    demo.start('theo', 'Theo', 'green')
    expect(states.last?.phase).toBe('ringing')
    await ms(300)
    expect(states.last?.phase).toBe('live')
    demo.hangUp()
    expect(states.last?.phase).toBe('ended')
    await ms(1_300)
    expect(states.last).toBeUndefined()
  })
})

// The server's refusals, as `connect` says them.
describe("the server's refusals", () => {
  for (const [status, words] of [
    [503, "Calls aren't switched on yet"],
    [402, 'Out of credit for calls'],
    [500, "Couldn't connect"],
  ] as const) {
    it(`a ${status} says "${words}"`, async () => {
      const { backend } = callComputer()
      backend.server = async () => {
        throw new SimeonAPIError('Refused.', status)
      }
      const live = new LiveCall({
        backend,
        transport: fakeVoice(),
        personName: () => undefined,
        failedStays: null,
        pause: quick,
      })
      const states = watching(live)
      live.start('theo', 'Theo', 'green')
      await ms(50)
      expect(CallBanner.status(states.last!)).toBe(words)
    })
  }
})
