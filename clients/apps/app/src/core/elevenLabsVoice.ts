// The call's voice in the browser (`ElevenLabsVoice` in ios/Simeon/Voice.swift,
// which the Mac shares; the Electron banner's desktop/source/voice-call/
// main.ts): ElevenLabs' own web kit, started with the ticket Simeon Labs'
// server hands out, over WebRTC (LiveKit), with the call's overrides (the
// agent's prompt, its greeting, the language, its voice). The kit's client
// tools (`send_task`, `recall_text_messages`) and what both say come back
// as `VoiceEvent`s; `LiveCall` does the rest.
//
// The kit is loaded only when a call starts. Over WebRTC it reaches
// `wss://livekit.rtc.elevenlabs.io` (and that host over https when a
// connection fails), loads its audio worklet from a blob of its own, and
// never asks for its resampling worklet on jsdelivr, which only its
// WebSocket path loads.

import type { VoiceEvent, VoiceTransport } from './voiceCall'

/** The microphone refused, or none the page may use: the call says "Simeon can't use the microphone". */
export class MicrophoneRefused extends Error {
  constructor() {
    super('The microphone was refused.')
    this.name = 'MicrophoneRefused'
  }
}

/**
 * The browser asks for the microphone, as the iPhone asks before the kit
 * takes it (`requestRecordPermission`). A refusal, or a page that may not
 * have it, is `MicrophoneRefused`; anything else (no microphone at all) is
 * the kit's own failure to connect.
 */
export async function askForMicrophone(): Promise<void> {
  const devices =
    typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
  if (!devices?.getUserMedia) throw new MicrophoneRefused()
  let stream: MediaStream
  try {
    stream = await devices.getUserMedia({ audio: true })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'NotAllowedError' || name === 'SecurityError')
      throw new MicrophoneRefused()
    throw error
  }
  for (const track of stream.getTracks()) track.stop()
}

/**
 * The voice for the calls (the Mac's `ElevenLabsVoice()` in MacSession.swift):
 * ElevenLabs' kit. A development build opened with `?voice=stand-in` takes
 * the stand-in instead (standInVoice.ts), and hands it to the page's checks
 * as `simeonStandInVoice`; the production build has neither.
 */
export function callTransport(): VoiceTransport {
  if (
    // Vite's own flag for a development build, not a setting.
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    import.meta.env.DEV &&
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('voice') === 'stand-in'
  )
    return new StandInLoader()
  return new ElevenLabsVoice()
}

/** The stand-in, loaded as a call starts (a development build only). */
class StandInLoader implements VoiceTransport {
  private voice?: Promise<VoiceTransport>

  private load(): Promise<VoiceTransport> {
    this.voice ??= import('./standInVoice').then(({ StandInVoice }) => {
      const voice = new StandInVoice({
        answersAfter: 0.8,
        greets: true,
        conversationId: 'conv_standin',
      })
      ;(globalThis as { simeonStandInVoice?: unknown }).simeonStandInVoice =
        voice
      return voice
    })
    return this.voice
  }

  async start(
    args: Parameters<VoiceTransport['start']>[0],
    events: (event: VoiceEvent) => void,
  ): Promise<void> {
    return (await this.load()).start(args, events)
  }
  async setMuted(muted: boolean): Promise<void> {
    return (await this.load()).setMuted(muted)
  }
  async say(context: string, nudge: string): Promise<void> {
    return (await this.load()).say(context, nudge)
  }
  async toolResult(id: string, result: string): Promise<void> {
    return (await this.load()).toolResult(id, result)
  }
  async end(call: string): Promise<void> {
    return (await this.load()).end(call)
  }
}

/** ElevenLabs' conversation, as much of it as the call uses. */
interface Conversation {
  endSession(): Promise<void>
  setMicMuted(isMuted: boolean): void
  sendContextualUpdate(text: string): void
  sendUserMessage(text: string): void
}

/** The kit, as much of it as the call uses: `Conversation.startSession`. */
type Kit = Pick<typeof import('@elevenlabs/client'), 'Conversation'>

/** A conversation id the server knows (`conv_…`): the room's own name is not one. */
function conversationId(id: unknown): string | undefined {
  return typeof id === 'string' && id.startsWith('conv_') ? id : undefined
}

/**
 * One call's voice (ios/Simeon/Voice.swift keeps one `conversation` and one
 * `endedEarly` for every call; here each call has its own): hung up, its
 * session is never opened, or is ended the moment it opens, and ending it
 * never touches a later call's.
 */
interface Attempt {
  call: string
  ended: boolean
  conversation?: Conversation
}

export class ElevenLabsVoice implements VoiceTransport {
  /** The call speaking now: mute and the notes go to it. */
  private attempt?: Attempt
  private attempts = new Map<string, Attempt>()
  /** The client tools waiting on the call's answer, by the id given to the call. */
  private waiting = new Map<
    string,
    { attempt: Attempt; answer: (result: string) => void }
  >()
  private asked = 0

  /** The kit and the microphone's question, given by the tests. */
  constructor(
    private readonly kit: () => Promise<Kit> = () =>
      import('@elevenlabs/client'),
    private readonly microphone: () => Promise<void> = askForMicrophone,
  ) {}

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
    const attempt: Attempt = this.attempts.get(args.call) ?? {
      call: args.call,
      ended: false,
    }
    this.attempts.set(args.call, attempt)
    if (attempt.ended) return
    this.attempt = attempt
    await this.microphone()
    // Hung up while the browser asked: no session is opened, whatever the answer.
    if (attempt.ended) return
    const { Conversation } = await this.kit()
    if (attempt.ended) return
    type Options = Parameters<typeof Conversation.startSession>[0]
    type Overrides = NonNullable<Options['overrides']>
    // `send_task` and `recall_text_messages` answer once the call has: the kit sends what they return.
    const tool =
      (name: string) =>
      (parameters: unknown): Promise<string> =>
        new Promise((resolve) => {
          if (attempt.ended) return resolve('')
          this.asked += 1
          const id = `${name}-${this.asked}`
          this.waiting.set(id, { attempt, answer: resolve })
          events({
            kind: 'tool',
            name,
            id,
            parameters:
              parameters != null && typeof parameters === 'object'
                ? (parameters as Record<string, never>)
                : {},
          })
        })
    const overrides: Overrides = {
      agent: {
        prompt: { prompt: args.prompt },
        firstMessage: args.firstMessage,
        // A code from ElevenLabs' own list ("en", "fr"); the kit types it as that list.
        language: args.language as NonNullable<
          NonNullable<Overrides['agent']>['language']
        >,
      },
      ...(args.voiceId ? { tts: { voiceId: args.voiceId } } : {}),
    }
    let started: Conversation
    try {
      started = (await Conversation.startSession({
        conversationToken: args.token,
        connectionType: 'webrtc',
        overrides,
        clientTools: {
          send_task: tool('send_task'),
          recall_text_messages: tool('recall_text_messages'),
        },
        onConnect: ({ conversationId: id }) =>
          events({ kind: 'connected', conversationId: conversationId(id) }),
        onConversationMetadata: (metadata) =>
          events({
            kind: 'connected',
            conversationId: conversationId(metadata.conversation_id),
          }),
        onDisconnect: () => events({ kind: 'ended' }),
        onError: (message) => events({ kind: 'failed', message }),
        onModeChange: ({ mode }) =>
          events({ kind: 'agentSpeaking', on: mode === 'speaking' }),
        onVadScore: ({ vadScore }) =>
          events({ kind: 'activity', level: vadScore }),
        onMessage: ({ message, role }) =>
          events({ kind: 'line', fromPerson: role === 'user', text: message }),
      })) as Conversation
    } catch (error) {
      // A call already let go has nothing to fail.
      if (attempt.ended) return
      throw error
    }
    // Hung up while it connected: let it go at once, so no voice speaks after the call ended.
    if (attempt.ended) {
      await started.endSession().catch(() => {})
      return
    }
    attempt.conversation = started
  }

  async setMuted(muted: boolean): Promise<void> {
    this.attempt?.conversation?.setMicMuted(muted)
  }

  async say(context: string, nudge: string): Promise<void> {
    const conversation = this.attempt?.conversation
    conversation?.sendContextualUpdate(context)
    conversation?.sendUserMessage(nudge)
  }

  async toolResult(id: string, result: string): Promise<void> {
    const waiting = this.waiting.get(id)
    this.waiting.delete(id)
    waiting?.answer(result)
  }

  async end(call: string): Promise<void> {
    const attempt = this.attempts.get(call) ?? { call, ended: false }
    this.attempts.set(call, attempt)
    attempt.ended = true
    if (this.attempt === attempt) this.attempt = undefined
    const conversation = attempt.conversation
    attempt.conversation = undefined
    // A tool of this call still waiting is answered with nothing: the call is over.
    for (const [id, waiting] of this.waiting)
      if (waiting.attempt === attempt) {
        this.waiting.delete(id)
        waiting.answer('')
      }
    await conversation?.endSession().catch(() => {})
  }
}
