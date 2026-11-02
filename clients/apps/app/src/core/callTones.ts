// The call's two sounds (CallTones.swift in ios/SimeonCore, played on the
// Mac by `CallTonePlayer` in ios/Simeon/Voice.swift; the Mac banner's own,
// desktop/source/voice-call/ring.ts; the founder, 9 October 2026: "i want
// sounds for when it rings, and when it hangs up like in the mac"):
//
// - the ring: a soft ringback, the two blended tones a caller hears (440 and
//   480 Hz), 0.8 s of tone with 0.06 s edges and 0.4 s of quiet a cycle;
//   twice before the call connects, then once more at a time while it is
//   still connecting, seven at most;
// - the hang-up: two short, soft notes falling a fifth (784 then 523.25 Hz,
//   0.13 s each, 0.04 s apart), when a call that was live ends.
//
// Made as samples, so no sound file ships; the web plays them with the
// browser's own audio (Web Audio), at the Mac's loudness.

const sampleRate = 44_100
const ringCycleSeconds = 1.2
const ringToneSeconds = 0.8
const ringEdgeSeconds = 0.06
const ringFrequencies = [440, 480]
const hangUpNotes = [784, 523.25]
const hangUpNoteSeconds = 0.13
const hangUpGapSeconds = 0.04
const ringPeak = 0.3
const hangUpPeak = 0.35

export const CallTones = {
  ringsBeforeConnect: 2,
  maxRings: 7,
  ringToneSeconds,
  ringCycleSeconds,
  ringEdgeSeconds,
  ringFrequencies,
  hangUpNotes,
  hangUpNoteSeconds,
  hangUpGapSeconds,
  sampleRate,
  /** The phone's loudness. */
  ringPeak,
  hangUpPeak,
  /** The Mac banner's own loudness (`RING_GAIN` 0.05 on each of the two tones, `HANG_UP_GAIN` 0.07): a Mac's speakers are louder than a phone's. */
  macRingPeak: 0.1,
  macHangUpPeak: 0.07,

  /** `cycles` rings, each its tone and its quiet. */
  ringSamples(cycles: number, peak: number = ringPeak): Float32Array {
    const rate = sampleRate
    const cycle = Math.trunc(ringCycleSeconds * rate)
    const tone = Math.trunc(ringToneSeconds * rate)
    const edge = ringEdgeSeconds * rate
    const count = Math.max(0, cycles)
    const samples = new Float32Array(count * cycle)
    const frequencies = ringFrequencies
    for (let index = 0; index < count; index += 1) {
      for (let n = 0; n < tone; n += 1) {
        const time = n / rate
        const gain = Math.min(1, n / edge, (tone - n) / edge)
        let wave = 0
        for (const frequency of frequencies)
          wave += Math.sin(2 * Math.PI * frequency * time)
        wave /= frequencies.length
        samples[index * cycle + n] = wave * gain * peak
      }
    }
    return samples
  },

  /** The two falling notes: a 0.012 s rise, then a fall to a thousandth over the note. */
  hangUpSamples(peak: number = hangUpPeak): Float32Array {
    const rate = sampleRate
    const note = Math.trunc(hangUpNoteSeconds * rate)
    const gap = Math.trunc(hangUpGapSeconds * rate)
    const attack = 0.012 * rate
    const samples = new Float32Array(hangUpNotes.length * (note + gap))
    let at = 0
    for (const frequency of hangUpNotes) {
      for (let n = 0; n < note; n += 1) {
        const time = n / rate
        const gain =
          n < attack ? n / attack : 0.001 ** ((n - attack) / (note - attack))
        samples[at] = Math.sin(2 * Math.PI * frequency * time) * gain * peak
        at += 1
      }
      at += gap
    }
    return samples
  },

  /** Samples in -1…1 as a 16-bit mono PCM WAV file. */
  wav(samples: ArrayLike<number>): Uint8Array {
    const rate = sampleRate
    const bytes = samples.length * 2
    const data = new DataView(new ArrayBuffer(44 + bytes))
    const ascii = (at: number, word: string) => {
      for (let i = 0; i < word.length; i += 1)
        data.setUint8(at + i, word.charCodeAt(i))
    }
    ascii(0, 'RIFF')
    data.setUint32(4, 36 + bytes, true)
    ascii(8, 'WAVE')
    ascii(12, 'fmt ')
    data.setUint32(16, 16, true)
    data.setUint16(20, 1, true)
    data.setUint16(22, 1, true)
    data.setUint32(24, rate, true)
    data.setUint32(28, rate * 2, true)
    data.setUint16(32, 2, true)
    data.setUint16(34, 16, true)
    ascii(36, 'data')
    data.setUint32(40, bytes, true)
    for (let i = 0; i < samples.length; i += 1) {
      const sample = Math.fround(
        Math.fround(Math.max(-1, Math.min(1, samples[i]!))) * 32767,
      )
      data.setInt16(44 + i * 2, Math.trunc(sample), true)
    }
    return new Uint8Array(data.buffer)
  },
}

/** What plays the call's sounds (`CallTonePlaying`): the browser's audio in the app; nothing in the tests unless a test gives one. */
export interface CallTonePlaying {
  /** Plays `cycles` rings and returns when they are over. */
  ring(cycles: number): Promise<void>
  stopRinging(): void
  hangUp(): void
}

/**
 * The ring and the hang-up in the browser (`CallTonePlayer`): the same
 * samples played from memory through Web Audio, at the Mac's loudness. The
 * ring is over before the call's own audio starts.
 */
export class WebCallTones implements CallTonePlaying {
  private context?: AudioContext
  private ringing?: { source: AudioBufferSourceNode; over: () => void }

  /** The browser's audio, or none (a page that can't play: the call goes on without its sounds). */
  private audio(): AudioContext | undefined {
    if (this.context) return this.context
    if (typeof AudioContext === 'undefined') return undefined
    try {
      this.context = new AudioContext()
    } catch {
      return undefined
    }
    return this.context
  }

  private play(samples: Float32Array): AudioBufferSourceNode | undefined {
    const context = this.audio()
    if (!context) return undefined
    void context.resume().catch(() => {})
    const buffer = context.createBuffer(
      1,
      Math.max(1, samples.length),
      sampleRate,
    )
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    source.start()
    return source
  }

  ring(cycles: number): Promise<void> {
    this.stopRinging()
    const source = this.play(
      CallTones.ringSamples(cycles, CallTones.macRingPeak),
    )
    return new Promise((resolve) => {
      const timer = setTimeout(() => over(), cycles * ringCycleSeconds * 1000)
      const over = () => {
        clearTimeout(timer)
        if (this.ringing?.over === over) this.ringing = undefined
        resolve()
      }
      if (source) this.ringing = { source, over }
    })
  }

  stopRinging(): void {
    const ringing = this.ringing
    this.ringing = undefined
    if (!ringing) return
    try {
      ringing.source.stop()
    } catch {
      // Already over.
    }
    ringing.over()
  }

  hangUp(): void {
    this.play(CallTones.hangUpSamples(CallTones.macHangUpPeak))
  }
}
