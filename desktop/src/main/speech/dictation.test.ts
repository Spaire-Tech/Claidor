import { describe, expect, test } from 'vitest';

import { Dictation, pcm16ToWav } from './dictation';

/** n seconds of silence at 16 kHz, 16-bit mono. */
const seconds = (n: number): Buffer => Buffer.alloc(n * 16_000 * 2);

describe('Dictation', () => {
  test('holds audio, reports seconds, caps at the limit', () => {
    const dictation = new Dictation('d', async () => '', { maxSeconds: 3 });
    expect(dictation.push(seconds(2))).toBe(true);
    expect(dictation.seconds).toBe(2);
    // The third second fills it; what is over the cap is dropped, not kept.
    expect(dictation.push(seconds(2))).toBe(false);
    expect(dictation.seconds).toBe(3);
    expect(dictation.full).toBe(true);
    expect(dictation.push(seconds(1))).toBe(false);
  });

  test('a partial waits its interval, needs a second of audio, and never overlaps', async () => {
    let clock = 0;
    let running = 0;
    let peak = 0;
    let resolveFirst: ((text: string) => void) | undefined;
    const calls: number[] = [];
    const transcribe = (pcm: Buffer): Promise<string> => {
      running += 1;
      peak = Math.max(peak, running);
      calls.push(pcm.length);
      return new Promise(resolve => {
        const done = (text: string): void => { running -= 1; resolve(text); };
        if (!resolveFirst) resolveFirst = done;
        else done('later');
      });
    };
    const dictation = new Dictation('d', transcribe, { partialIntervalMs: 1_000, now: () => clock });

    // Too soon and too little.
    expect(await dictation.partial()).toBeNull();
    dictation.push(seconds(2));
    clock = 500;
    expect(await dictation.partial()).toBeNull();

    // Due: one pass starts, and a second attempt while it runs does nothing.
    clock = 1_000;
    const first = dictation.partial();
    expect(await dictation.partial()).toBeNull();
    resolveFirst?.(' hello ');
    expect(await first).toBe('hello');
    expect(peak).toBe(1);

    // The next one is due again after the interval.
    clock = 2_000;
    expect(await dictation.partial()).toBe('later');
    expect(calls).toHaveLength(2);
  });

  test('a partial is taken from the tail, the final from everything', async () => {
    const lengths: number[] = [];
    const dictation = new Dictation('d', async pcm => { lengths.push(pcm.length); return 'x'; }, {
      partialWindowSeconds: 2, partialIntervalMs: 0, now: () => 10_000,
    });
    dictation.push(seconds(5));
    await dictation.partial();
    await dictation.stop();
    expect(lengths).toEqual([seconds(2).length, seconds(5).length]);
  });

  test('a partial that lands after stop is dropped, and stop on silence is empty', async () => {
    const releases: ((text: string) => void)[] = [];
    const dictation = new Dictation('d', () => new Promise(resolve => { releases.push(resolve); }), {
      partialIntervalMs: 0, now: () => 10_000,
    });
    dictation.push(seconds(1));
    const partial = dictation.partial();
    const stopped = dictation.stop();
    // The partial's pass finishes after stop began: its words are not shown.
    releases[0]('late words');
    expect(await partial).toBeNull();
    releases[1]('final words');
    expect(await stopped).toBe('final words');

    const empty = new Dictation('e', async () => 'should not run');
    expect(await empty.stop()).toBe('');
  });

  test('cancel forgets the audio', async () => {
    const dictation = new Dictation('d', async () => 'no');
    dictation.push(seconds(1));
    dictation.cancel();
    expect(dictation.seconds).toBe(0);
    expect(dictation.push(seconds(1))).toBe(false);
  });
});

describe('pcm16ToWav', () => {
  test('writes a 44-byte RIFF header for 16 kHz mono PCM', () => {
    const wav = pcm16ToWav(Buffer.alloc(320), 16_000);
    expect(wav.length).toBe(364);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(4)).toBe(36 + 320);
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(16_000);
    expect(wav.readUInt32LE(28)).toBe(32_000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(40)).toBe(320);
  });
});
