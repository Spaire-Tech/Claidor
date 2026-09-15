import {
  SPEECH_MAX_SECONDS,
  SPEECH_PARTIAL_INTERVAL_MS,
  SPEECH_PARTIAL_WINDOW_SECONDS,
  SPEECH_SAMPLE_RATE,
} from '../../shared/speech/constants';

/**
 * One dictation, from the first chunk to the final text.
 *
 * Whisper transcribes a clip, not a stream, so "live" text is a fresh
 * pass over the last few seconds every so often, and the real answer is
 * one pass over everything when the person stops. This keeps the audio,
 * decides when a partial is due, never runs two passes at once, and
 * ignores a partial that comes back after the person has stopped.
 *
 * Pure apart from the transcriber it is handed, so the cadence and the
 * ordering are tested without a microphone or a model.
 */

export type Transcriber = (pcm16: Buffer) => Promise<string>;

export type DictationOptions = {
  sampleRate?: number;
  maxSeconds?: number;
  partialWindowSeconds?: number;
  partialIntervalMs?: number;
  now?: () => number;
};

export class Dictation {
  readonly id: string;
  private readonly chunks: Buffer[] = [];
  private bytes = 0;
  private lastPartialAt = 0;
  private partialRunning = false;
  private stopped = false;
  private readonly sampleRate: number;
  private readonly maxBytes: number;
  private readonly windowBytes: number;
  private readonly partialIntervalMs: number;
  private readonly now: () => number;

  constructor(
    id: string,
    private readonly transcribe: Transcriber,
    options: DictationOptions = {},
  ) {
    this.id = id;
    this.sampleRate = options.sampleRate ?? SPEECH_SAMPLE_RATE;
    this.maxBytes = (options.maxSeconds ?? SPEECH_MAX_SECONDS) * this.sampleRate * 2;
    this.windowBytes = (options.partialWindowSeconds ?? SPEECH_PARTIAL_WINDOW_SECONDS) * this.sampleRate * 2;
    this.partialIntervalMs = options.partialIntervalMs ?? SPEECH_PARTIAL_INTERVAL_MS;
    this.now = options.now ?? (() => Date.now());
    this.lastPartialAt = this.now();
  }

  /** Seconds of audio held. */
  get seconds(): number {
    return this.bytes / (this.sampleRate * 2);
  }

  get full(): boolean {
    return this.bytes >= this.maxBytes;
  }

  /**
   * Take a chunk. Returns false once the cap is reached, so the caller can
   * stop the microphone rather than recording into the void.
   */
  push(chunk: Buffer): boolean {
    if (this.stopped || this.full) return false;
    const room = this.maxBytes - this.bytes;
    const taken = chunk.length > room ? chunk.subarray(0, room) : chunk;
    this.chunks.push(taken);
    this.bytes += taken.length;
    return !this.full;
  }

  /**
   * A partial pass over the tail, when one is due and none is running.
   * Resolves to the text, or null when nothing was attempted or the
   * dictation ended meanwhile.
   */
  async partial(): Promise<string | null> {
    if (this.stopped || this.partialRunning) return null;
    if (this.now() - this.lastPartialAt < this.partialIntervalMs) return null;
    if (this.bytes < this.sampleRate * 2) return null; // under a second: nothing to say yet
    this.partialRunning = true;
    this.lastPartialAt = this.now();
    try {
      const text = await this.transcribe(this.tail());
      return this.stopped ? null : text.trim();
    } finally {
      this.partialRunning = false;
    }
  }

  /** The final pass over everything. Partials after this are dropped. */
  async stop(): Promise<string> {
    this.stopped = true;
    if (this.bytes === 0) return '';
    const text = await this.transcribe(Buffer.concat(this.chunks));
    return text.trim();
  }

  cancel(): void {
    this.stopped = true;
    this.chunks.length = 0;
    this.bytes = 0;
  }

  private tail(): Buffer {
    const all = Buffer.concat(this.chunks);
    return all.length > this.windowBytes ? all.subarray(all.length - this.windowBytes) : all;
  }
}

/** A 44-byte RIFF header for PCM16 mono, so the recogniser gets a WAV. */
export function pcm16ToWav(pcm16: Buffer, sampleRate = SPEECH_SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm16.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm16.length, 40);
  return Buffer.concat([header, pcm16]);
}
