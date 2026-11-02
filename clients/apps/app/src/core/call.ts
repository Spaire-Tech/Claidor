// A call with an agent as the screens draw it (Call.swift in
// ios/SimeonCore/Sources/SimeonCore): the call's state, the engine that
// places it, what the Mac's banner shows at each moment of it, a call
// written into the chat by an older host, the switch for calls, and the
// review link's scripted call.

import { type CallLine, callClock } from './chat'
import { t } from './l10n'
import { plainError } from './plainWords'

export type CallPhase = 'ringing' | 'live' | 'ended'

/** A voice call as the screens draw it (`CallState`: desktop/demo/call.ts, the Mac's banner states). */
export interface CallState {
  phase: CallPhase
  /** "Calling…", "Call ended", or empty while live. */
  status: string
  agentId: string
  agentName: string
  agentColour: string
  isMuted: boolean
  agentSpeaking: boolean
  /** The waveform: 24 bars, 0 to 1. */
  levels: number[]
  lines: CallLine[]
  /** Milliseconds since the epoch. */
  connectedAt?: number
  endedAt?: number
  /** What the agent is doing for the call ("Sending the agenda to Dana…"), the banner's status line. */
  activity?: string
  /** The call could not start: `status` says why ("Couldn't connect", "Calls aren't switched on yet"…). */
  failed: boolean
}

/** Seconds since the call connected (or until it ended). */
export function callSeconds(call: CallState, now: number = Date.now()): number {
  if (call.connectedAt == null) return 0
  return Math.max(
    0,
    Math.trunc(((call.endedAt ?? now) - call.connectedAt) / 1000),
  )
}

/** A call as it starts: ringing, "Calling…". */
export function ringingCall(
  agentId: string,
  agentName: string,
  colour: string,
): CallState {
  return {
    phase: 'ringing',
    status: callWords.calling(),
    agentId,
    agentName,
    agentColour: colour,
    isMuted: false,
    agentSpeaking: false,
    levels: [],
    lines: [],
    failed: false,
  }
}

/** Places the call, mutes it, ends it; tells the screens each change (`CallEngine`). */
export interface CallEngine {
  start(agentId: string, agentName: string, colour: string): void
  mute(muted: boolean): void
  hangUp(): void
  /** Every change, from now on; undefined when the call is gone. */
  observe(listener: (state: CallState | undefined) => void): void
  /** A finished or failed call put away now (the banner's Close, or its time up). */
  dismiss(): void
}

/**
 * The banner's own sentences (`VoiceCallText.calling` and the rest), read
 * as they are shown, in the language the app is in then.
 */
export const callWords = {
  calling: () => t('Calling…'),
  ended: () => t('Call ended'),
  couldNotConnect: () => t("Couldn't connect"),
  notSwitchedOn: () => t("Calls aren't switched on yet"),
  noMicrophone: () => t("Simeon can't use the microphone"),
  noCredit: () => t('Out of credit for calls'),
}

/** The banner's `data-state`. */
export type BannerLook =
  | 'ringing'
  | 'speaking'
  | 'listening'
  | 'working'
  | 'ended'
  | 'failed'

/**
 * What the Mac's call banner shows for each moment of a call (`CallBanner`:
 * desktop/source/shared/voice-call/call-state.ts `bannerView`, the banner's
 * stylesheet): its look, its status line, the waveform or not, and its
 * buttons.
 */
const bannerBars = 46
const speakingHeight = 16
const listeningHeight = 12

export const CallBanner = {
  /** 360 wide, 12 under the menu bar and 16 from the screen's right edge (`voice-call-window.ts`). */
  width: 360,
  insetTop: 12,
  insetRight: 16,
  /** A finished call goes after this; a failed one after this unless the pointer is on it (`call-controller.ts`), in seconds. */
  endedStays: 1.2,
  failedStays: 20,
  /** The waveform: 46 bars, at most 16 above their 2-point floor while the agent speaks, 12 while it listens. */
  bars: bannerBars,
  speakingHeight,
  listeningHeight,
  emptyTranscript: () => t('What you both say shows up here.'),

  look(call: CallState): BannerLook {
    return bannerLook(call)
  },

  /** The line under the name: "Calling…", the time, what the agent is doing, "Call ended · 2:48", or why it failed. */
  status(call: CallState, now: number = Date.now()): string {
    return bannerStatus(call, now)
  },

  /** The waveform shows while the call is live and the agent is not working on something. */
  hasWave(call: CallState): boolean {
    const look = bannerLook(call)
    return look === 'speaking' || look === 'listening'
  },

  /** Each bar's height in points, from the call's levels: highest in the middle, falling off to the edges (`setLevels`). */
  barHeights(
    levels: readonly number[],
    speaking: boolean,
    bars: number = bannerBars,
  ): number[] {
    const amplitude = speaking ? speakingHeight : listeningHeight
    return Array.from({ length: bars }, (_, index) => {
      const window = Math.sin((Math.PI * (index + 0.5)) / bars)
      const level =
        levels.length === 0
          ? 0
          : Math.max(
              0,
              Math.min(1, levels[Math.floor((index * levels.length) / bars)]!),
            )
      return 2 + level * amplitude * window
    })
  },
}

function bannerLook(call: CallState): BannerLook {
  if (call.failed) return 'failed'
  switch (call.phase) {
    case 'ringing':
      return 'ringing'
    case 'ended':
      return 'ended'
    case 'live':
      return call.activity != null
        ? 'working'
        : call.agentSpeaking
          ? 'speaking'
          : 'listening'
  }
}

function bannerStatus(call: CallState, now: number): string {
  switch (bannerLook(call)) {
    case 'ringing':
      return callWords.calling()
    case 'working':
      return call.activity ?? ''
    case 'speaking':
    case 'listening':
      return callClock(callSeconds(call, now))
    case 'ended':
      return call.connectedAt == null
        ? callWords.ended()
        : t`Call ended · ${callClock(callSeconds(call, now))}`
    case 'failed':
      // The voice service's own words never show (PlainWords).
      return call.status === ''
        ? callWords.couldNotConnect()
        : plainError(call.status, callWords.couldNotConnect())
  }
}

/**
 * A call written into the chat by a host from before 2 October 2026
 * (`CallRecord`): one agent message, "Voice call · 2:48" and its recap
 * under a blank line (`callRecordText`); the window draws it as a row that
 * opens on its recap (`__simeonCallRecordParse`).
 */
export interface CallRecord {
  duration: string
  recap?: string
}

const recordPattern =
  /^Voice call · (\d{1,2}:\d{2}(?::\d{2})?)(?:\n\n([\s\S]+))?$/

export function parseCallRecord(words: string): CallRecord | undefined {
  const trimmed = words.trim()
  // Every agent message is asked: most are not, and need no pattern.
  if (!trimmed.startsWith('Voice call · ')) return undefined
  const match = recordPattern.exec(trimmed)
  if (!match) return undefined
  const recap = match[2]?.trim()
  return recap ? { duration: match[1]!, recap } : { duration: match[1]! }
}

/**
 * `SIMEON_VOICE_CALLS`: calls are on unless it says `0`, `off`, `false` or
 * `no` (`voiceCallsEnabled`). A page has no environment of its own, so the
 * web app reads none and calls are on; the Windows app can hand in its own.
 */
export function voiceCallsEnabled(
  environment: Readonly<Record<string, string | undefined>> = {},
): boolean {
  const value = environment.SIMEON_VOICE_CALLS?.trim().toLowerCase()
  return !['0', 'off', 'false', 'no'].includes(value ?? '')
}

type Beat =
  | { kind: 'live' }
  | { kind: 'speak' }
  | { kind: 'listen' }
  | { kind: 'line'; line: CallLine }

/**
 * The review link's scripted call (`DemoCall`, desktop/demo/call.ts), beat
 * for beat: it rings for 2.4 s, Theo-style lines arrive, the waveform moves
 * louder while the agent speaks, and an ended call leaves after 1.2 s, as
 * the Mac's banner does (ENDED_DISMISS_MS).
 */
export class DemoCall implements CallEngine {
  private static readonly script: [number, Beat][] = [
    [2.4, { kind: 'live' }],
    [3.0, { kind: 'speak' }],
    [
      3.2,
      {
        kind: 'line',
        line: { fromPerson: false, text: 'Hey Bass. What can I do for you?' },
      },
    ],
    [5.2, { kind: 'listen' }],
    [
      7.6,
      {
        kind: 'line',
        line: {
          fromPerson: true,
          text: 'Can you move the launch review to Friday?',
        },
      },
    ],
    [8.4, { kind: 'speak' }],
    [
      8.6,
      {
        kind: 'line',
        line: {
          fromPerson: false,
          text: "Done. It's Friday at 2 pm, and Dana and Marcus have the new time.",
        },
      },
    ],
    [11.8, { kind: 'listen' }],
    [
      14.2,
      { kind: 'line', line: { fromPerson: true, text: 'Perfect, thanks.' } },
    ],
    [14.8, { kind: 'speak' }],
    [
      15.0,
      {
        kind: 'line',
        line: { fromPerson: false, text: 'Anytime. Anything else?' },
      },
    ],
    [16.8, { kind: 'listen' }],
  ]

  private state?: CallState
  private listeners: ((state: CallState | undefined) => void)[] = []
  private timers: ReturnType<typeof setTimeout>[] = []

  /** `speed` above 1 plays the script faster (the screenshots use it). */
  constructor(private readonly speed = 1) {}

  observe(listener: (state: CallState | undefined) => void): void {
    this.listeners.push(listener)
    listener(this.state)
  }

  private update(change: (call: CallState) => void): void {
    if (!this.state) return
    const next = copied(this.state)
    change(next)
    this.set(next)
  }

  private set(value: CallState | undefined): void {
    this.state = value
    for (const listener of [...this.listeners]) listener(value)
  }

  private after(seconds: number, run: () => void): void {
    this.timers.push(setTimeout(run, (seconds / this.speed) * 1000))
  }

  start(agentId: string, agentName: string, colour: string): void {
    if (this.state) return
    this.set(ringingCall(agentId, agentName, colour))
    for (const [at, beat] of DemoCall.script) {
      this.after(at, () => {
        switch (beat.kind) {
          case 'live':
            this.update((call) => {
              call.phase = 'live'
              call.status = ''
              call.connectedAt = Date.now()
            })
            return
          case 'speak':
            this.update((call) => (call.agentSpeaking = true))
            return
          case 'listen':
            this.update((call) => (call.agentSpeaking = false))
            return
          case 'line':
            this.update((call) => call.lines.push(beat.line))
        }
      })
    }
    // The waveform: a voice's loudness, bar by bar, louder while the agent speaks.
    const wave = () => {
      this.update((call) => {
        if (call.phase !== 'live') return
        const loud = call.agentSpeaking ? 1 : call.isMuted ? 0 : 0.35
        call.levels = Array.from(
          { length: 24 },
          () => loud * (0.25 + Math.random() * 0.75),
        )
      })
      this.timers.push(setTimeout(wave, 90))
    }
    this.timers.push(setTimeout(wave, 90))
  }

  mute(muted: boolean): void {
    this.update((call) => (call.isMuted = muted))
  }

  hangUp(): void {
    const current = this.state
    const running = this.timers
    this.timers = []
    if (!current || current.phase === 'ended') return
    for (const timer of running) clearTimeout(timer)
    this.update((call) => {
      call.phase = 'ended'
      call.status = callWords.ended()
      call.agentSpeaking = false
      call.levels = []
      call.endedAt = Date.now()
    })
    this.timers.push(setTimeout(() => this.set(undefined), 1200))
  }

  dismiss(): void {}
}

/** A call's state with its own lists, to change without touching the one shown. */
export function copied(call: CallState): CallState {
  return { ...call, levels: [...call.levels], lines: [...call.lines] }
}
