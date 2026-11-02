// A stand-in for the call's voice (the tests' `FakeVoice` in the core's
// CoreTests.swift), reached only by the tests and by a development build
// opened with `?voice=stand-in` (`callTransport`); the production build
// never holds it. It asks the browser for the microphone as the real voice
// does, says it connected after a moment, opens with the call's greeting,
// and then does what it is told (`emit`), so a check can show each moment
// of a call without ElevenLabs.

import { askForMicrophone } from './elevenLabsVoice'
import type { VoiceEvent, VoiceTransport } from './voiceCall'

export class StandInVoice implements VoiceTransport {
  started?: {
    call: string
    token: string
    prompt: string
    firstMessage: string
    voiceId?: string
    language: string
  }
  said: string[] = []
  results = new Map<string, string>()
  muted = false
  /** The calls let go, by their ids. */
  endedCalls = new Set<string>()
  private events?: (event: VoiceEvent) => void

  /**
   * `answersAfter` seconds before it says it connected, with
   * `conversationId` when given; `asksMicrophone` false in the tests, which
   * have no browser; `greets` opens with the call's greeting.
   */
  constructor(
    private readonly options: {
      answersAfter?: number
      asksMicrophone?: boolean
      greets?: boolean
      conversationId?: string
    } = {},
  ) {}

  /** The last call started was let go. */
  get ended(): boolean {
    return this.started != null && this.endedCalls.has(this.started.call)
  }

  async start(
    args: {
      call: string
      token: string
      prompt: string
      firstMessage: string
      voiceId?: string
      language: string
    },
    events: (event: VoiceEvent) => void,
  ): Promise<void> {
    // As the real voice: a call let go never opens, whatever the browser answers.
    if (this.endedCalls.has(args.call)) return
    if (this.options.asksMicrophone ?? true) await askForMicrophone()
    if (this.endedCalls.has(args.call)) return
    this.started = args
    this.events = events
    const wait = this.options.answersAfter ?? 0
    if (wait > 0)
      await new Promise((resolve) => setTimeout(resolve, wait * 1000))
    if (this.endedCalls.has(args.call)) return
    events({ kind: 'connected', conversationId: this.options.conversationId })
    if (this.options.greets ?? false)
      events({ kind: 'line', fromPerson: false, text: args.firstMessage })
  }

  /** What the voice's kit would report next, for the call speaking now. */
  emit(event: VoiceEvent): void {
    this.events?.(event)
  }

  async setMuted(muted: boolean): Promise<void> {
    this.muted = muted
  }

  async say(context: string): Promise<void> {
    this.said.push(context)
  }

  async toolResult(id: string, result: string): Promise<void> {
    this.results.set(id, result)
  }

  async end(call: string): Promise<void> {
    this.endedCalls.add(call)
  }
}
