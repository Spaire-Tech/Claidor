// Dictation (mac/Simeon/Dictation.swift; the window's `k9n`, `v9n`): the
// microphone, asked for once by the browser, records; Stop sends the
// recording to Simeon's transcription (`audio/transcriptions`) and what was
// said goes in at the caret, a space before it when the word before runs on.
// Under half a second is dropped; five minutes stops it. A refusal, a
// missing microphone or a failed transcription says so over the words in
// red, in the window's words, until the microphone is tried again.
//
// The browser records in the kind it can (WebM with Opus in Chrome, Edge and
// Firefox, MP4 in Safari); the Mac records AAC in MP4. The transcription
// takes either.

import { NetworkError } from '../core/http'
import { t } from '../l10n'
import { useWatched } from './useStore'

export type DictationPhase = 'idle' | 'asking' | 'recording' | 'transcribing'

/** The window's limits (`h9n`, `p9n`), in seconds. */
export const longest = 300
export const shortest = 0.5

const lines = {
  denied: () =>
    t(
      'Microphone access denied. Please enable microphone permissions in your system settings.',
    ),
  noMicrophone: () =>
    t('No microphone found. Please connect a microphone and try again.'),
  network: () =>
    t('Network connection failed. Please check your internet connection.'),
  failed: () => t('An error occurred with voice input. Please try again.'),
}

/** The line for a microphone the browser would not give (`getUserMedia`'s refusal). */
export function microphoneMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return lines.denied()
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return lines.noMicrophone()
  return lines.failed()
}

/** The window's line for a failed transcription (`ATe`): the network's, or any other. */
export function transcriptionMessage(error: unknown): string {
  if (
    error instanceof NetworkError &&
    (error.kind === 'unreachable' || error.kind === 'timedOut')
  )
    return lines.network()
  return lines.failed()
}

/** What was said, at the caret: a space before it when the word before runs on (`d9n`). */
export function spacedDictation(before: string, words: string): string {
  const last = before.at(-1)
  if (last != null && !/\s/.test(last) && !/^\s/.test(words)) return ` ${words}`
  return words
}

/** A level from the microphone's loudness: -50 dB and below silent, 0 full (the Mac's meter). */
export function levelOf(samples: Float32Array): number {
  let sum = 0
  for (const sample of samples) sum += sample * sample
  const rms = Math.sqrt(sum / Math.max(1, samples.length))
  const decibels = rms > 0 ? 20 * Math.log10(rms) : -160
  return Math.max(0, Math.min(1, (decibels + 50) / 50))
}

/** The kinds the browser may record, best first. */
const kinds = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

function recordingKind(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return kinds.find((kind) => MediaRecorder.isTypeSupported(kind))
}

/** Something a screen watches: its listeners, told of each change. */
class Watched {
  private readonly listeners = new Set<() => void>()
  private version = 0

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  protected changed(): void {
    this.version += 1
    for (const listener of this.listeners) listener()
  }
}

/** The chip's time and sound bars, watched by the chip alone (so only it redraws as they move). */
export class DictationMeter extends Watched {
  /** Seconds recorded. */
  seconds = 0
  /** The five sound bars, 0 to 1, newest last. */
  levels = [0, 0, 0, 0, 0]

  set(seconds: number, level?: number): void {
    this.seconds = seconds
    if (level != null) this.levels = [...this.levels.slice(1), level]
    this.changed()
  }

  reset(): void {
    this.seconds = 0
    this.levels = [0, 0, 0, 0, 0]
    this.changed()
  }
}

/**
 * Dictation's state (the Mac's `Dictation`): its phase, the red line over
 * the words, and what was said, handed to the field.
 */
export class Dictation extends Watched {
  phase: DictationPhase = 'idle'
  /** The red line over the words (`sand-prompt-voice-error`). */
  error?: string
  readonly meter = new DictationMeter()
  /** What was said, for the field. */
  onWords?: (words: string) => void

  /** Each start, stop and cancel; an answer for an older one is dropped. */
  private attempt = 0
  private stream?: MediaStream
  private recorder?: MediaRecorder
  private chunks: Blob[] = []
  private started = 0
  private ticker?: ReturnType<typeof setInterval>
  private context?: AudioContext
  private analyser?: AnalyserNode

  constructor(
    private readonly transcribe: (
      audio: Uint8Array,
      mimeType: string,
    ) => Promise<string>,
  ) {
    super()
  }

  get isListening(): boolean {
    return this.phase === 'asking' || this.phase === 'recording'
  }

  private set(phase: DictationPhase, error?: string): void {
    this.phase = phase
    this.error = error
    this.changed()
  }

  /** Start voice input: the browser asks for the microphone (the first time), then recording starts. */
  start(): void {
    if (this.phase !== 'idle') return
    this.attempt += 1
    const current = this.attempt
    this.set('asking')
    const media =
      typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
    if (!media?.getUserMedia || recordingKind() == null) {
      this.fail(lines.noMicrophone())
      return
    }
    media.getUserMedia({ audio: true }).then(
      (stream) => {
        if (current !== this.attempt || this.phase !== 'asking') {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        this.record(stream)
      },
      (error: unknown) => {
        if (current === this.attempt) this.fail(microphoneMessage(error))
      },
    )
  }

  private record(stream: MediaStream): void {
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, { mimeType: recordingKind() })
    } catch {
      for (const track of stream.getTracks()) track.stop()
      this.fail(lines.failed())
      return
    }
    this.stream = stream
    this.recorder = recorder
    this.chunks = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data)
    }
    try {
      recorder.start()
    } catch {
      this.release()
      this.fail(lines.noMicrophone())
      return
    }
    // The sound bars: the microphone's loudness, read every 60 ms.
    try {
      this.context = new AudioContext()
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = 1024
      this.context.createMediaStreamSource(stream).connect(this.analyser)
    } catch {
      this.context = undefined
      this.analyser = undefined
    }
    this.started = performance.now()
    this.meter.reset()
    this.set('recording')
    const samples = new Float32Array(1024)
    this.ticker = setInterval(() => {
      if (this.phase !== 'recording') return
      const elapsed = (performance.now() - this.started) / 1000
      let level: number | undefined
      if (this.analyser) {
        this.analyser.getFloatTimeDomainData(samples)
        level = levelOf(samples)
      }
      this.meter.set(Math.floor(elapsed), level)
      if (elapsed >= longest) void this.stop()
    }, 60)
  }

  /** Stop dictation: the recording goes to be transcribed; what was said goes to the field. */
  async stop(): Promise<void> {
    if (this.phase === 'asking') {
      this.attempt += 1
      this.set('idle')
      return
    }
    const recorder = this.recorder
    if (this.phase !== 'recording' || !recorder) return
    clearInterval(this.ticker)
    this.ticker = undefined
    const length = (performance.now() - this.started) / 1000
    const kind = recorder.mimeType || recordingKind() || 'audio/webm'
    const ended = new Promise<void>((done) => {
      recorder.onstop = () => done()
    })
    recorder.stop()
    this.phase = 'transcribing'
    const current = this.attempt
    await ended
    this.release()
    if (current !== this.attempt) return
    const recording = new Blob(this.chunks, { type: kind })
    this.chunks = []
    if (length < shortest || recording.size === 0) {
      this.set('idle')
      return
    }
    this.set('transcribing')
    try {
      const words = await this.transcribe(
        new Uint8Array(await recording.arrayBuffer()),
        kind,
      )
      if (current !== this.attempt || this.phase !== 'transcribing') return
      this.set('idle')
      if (words !== '') this.onWords?.(words)
    } catch (error) {
      if (current !== this.attempt) return
      this.set('idle', transcriptionMessage(error))
    }
  }

  /** Escape, a message sent, or the chat closing: nothing is sent. */
  cancel(): void {
    this.attempt += 1
    clearInterval(this.ticker)
    this.ticker = undefined
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null
      this.recorder.stop()
    }
    this.chunks = []
    this.release()
    if (this.phase !== 'idle') this.set('idle', this.error)
  }

  private fail(message: string): void {
    this.release()
    this.set('idle', message)
  }

  /** The microphone let go (the browser's recording light goes out), the meter reset. */
  private release(): void {
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    this.stream = undefined
    this.recorder = undefined
    void this.context?.close().catch(() => undefined)
    this.context = undefined
    this.analyser = undefined
    this.meter.reset()
  }
}

/**
 * The recording chip in Send's place (`sand-recording-chip`): 28 high,
 * padded 4 10, round, on the grey wash (darker under the pointer), 6 apart:
 * Stop (a 10-point square, 2 round, in the text colour), the time (14 on 22,
 * tabular, "0:07"), and five sound bars (2 wide, 2 apart, 18 by 13, at 60%).
 * It stops dictation; Escape in the field cancels it.
 */
export function RecordingChip({
  meter,
  stop,
}: {
  meter: DictationMeter
  stop: () => void
}) {
  useWatched(meter)
  const seconds = meter.seconds
  return (
    <button
      type="button"
      className="recording-chip"
      title={t('Stop dictation')}
      aria-label={t('Stop dictation')}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation()
        stop()
      }}
    >
      <span className="recording-stop" aria-hidden="true" />
      <span className="recording-time">
        {`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
      </span>
      <span className="recording-bars" aria-hidden="true">
        {meter.levels.map((level, index) => (
          <span key={index} style={{ height: Math.max(3, 13 * level) }} />
        ))}
      </span>
    </button>
  )
}

/** Start voice input (`sand-prompt-mic`): the grey microphone inside the field while there is nothing to send, in a 36 target. */
export function MicButton({ start }: { start: () => void }) {
  return (
    <button
      type="button"
      className="mic-button"
      title={t('Start voice input')}
      aria-label={t('Start voice input')}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation()
        start()
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        >
          <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" />
          <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" />
        </g>
      </svg>
    </button>
  )
}

/** Transcribing: the small spinner in Send's place. */
export function Transcribing() {
  return (
    <span
      className="transcribing"
      role="status"
      aria-label={t('Transcribing voice input…')}
    >
      <span className="transcribing-wheel" aria-hidden="true" />
    </span>
  )
}
