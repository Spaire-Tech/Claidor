/**
 * The ring, made with WebAudio (no sound file ships): a soft ringback, the
 * two blended tones a caller hears (440 and 480 Hz), quiet, with gentle
 * edges. One cycle is 0.8 s of tone and 0.4 s of quiet.
 */
export const RING_TONE_SECONDS = 0.8;
export const RING_CYCLE_SECONDS = 1.2;
const RING_GAIN = 0.05;
const RING_EDGE_SECONDS = 0.06;

export interface Ringer {
  /** Plays `cycles` rings and resolves when they are over. */
  ring(cycles: number): Promise<void>;
  stop(): void;
}

export function createRinger(createContext: () => AudioContext = () => new AudioContext()): Ringer {
  let context: AudioContext | null = null;
  let stopped = false;
  const nodes: AudioScheduledSourceNode[] = [];
  return {
    async ring(cycles) {
      if (stopped || cycles <= 0) return;
      try {
        context ??= createContext();
        if (context.state === "suspended") await context.resume().catch(() => {});
        const master = context.createGain();
        master.gain.value = RING_GAIN;
        master.connect(context.destination);
        const start = context.currentTime + 0.05;
        for (let cycle = 0; cycle < cycles; cycle += 1) {
          const at = start + cycle * RING_CYCLE_SECONDS;
          const envelope = context.createGain();
          envelope.gain.setValueAtTime(0, at);
          envelope.gain.linearRampToValueAtTime(1, at + RING_EDGE_SECONDS);
          envelope.gain.setValueAtTime(1, at + RING_TONE_SECONDS - RING_EDGE_SECONDS);
          envelope.gain.linearRampToValueAtTime(0, at + RING_TONE_SECONDS);
          envelope.connect(master);
          for (const frequency of [440, 480]) {
            const oscillator = context.createOscillator();
            oscillator.type = "sine";
            oscillator.frequency.value = frequency;
            oscillator.connect(envelope);
            oscillator.start(at);
            oscillator.stop(at + RING_TONE_SECONDS + 0.02);
            nodes.push(oscillator);
          }
        }
      } catch {
        // No audio output is not a reason to fail the call; the wait still happens.
      }
      await new Promise<void>((resolve) => setTimeout(resolve, Math.round(cycles * RING_CYCLE_SECONDS * 1000)));
    },
    stop() {
      stopped = true;
      for (const node of nodes.splice(0)) { try { node.stop(); } catch {} }
      void context?.close().catch(() => {});
      context = null;
    },
  };
}

/**
 * The tone a finished call makes (2 October 2026, the founder: "make a sound
 * for when it hang up, apple style"): two short, soft notes falling a fifth,
 * like a phone's call-ended tone. Its own audio context, since the ringer's
 * is closed once the call connects.
 */
export const HANG_UP_NOTES: readonly number[] = [784, 523.25];
const HANG_UP_NOTE_SECONDS = 0.13;
const HANG_UP_GAP_SECONDS = 0.04;
const HANG_UP_GAIN = 0.07;

export function playHangUpTone(createContext: () => AudioContext = () => new AudioContext()): void {
  try {
    const context = createContext();
    const master = context.createGain();
    master.gain.value = HANG_UP_GAIN;
    master.connect(context.destination);
    const start = context.currentTime + 0.02;
    HANG_UP_NOTES.forEach((frequency, index) => {
      const at = start + index * (HANG_UP_NOTE_SECONDS + HANG_UP_GAP_SECONDS);
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(1, at + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.001, at + HANG_UP_NOTE_SECONDS);
      envelope.connect(master);
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(envelope);
      oscillator.start(at);
      oscillator.stop(at + HANG_UP_NOTE_SECONDS + 0.02);
    });
    const total = HANG_UP_NOTES.length * (HANG_UP_NOTE_SECONDS + HANG_UP_GAP_SECONDS) + 0.2;
    setTimeout(() => { void context.close().catch(() => {}); }, Math.round(total * 1000));
  } catch {
    // No audio output: the call still ends.
  }
}
