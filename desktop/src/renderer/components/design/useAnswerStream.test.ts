import { describe, expect, test } from 'vitest';

import { isAnswerLive } from './useAnswerStream';
import { advanceShown, STREAM_TICK_MS } from './useStreamedText';

/** Walk the clock over an answer that arrives in bursts, then stops. */
const simulate = (bursts: number[], ticksBetweenBursts: number) => {
  let received = 0;
  let shown = 0;
  let ticks = 0;
  let streaming = true;
  const liveAfterStop: boolean[] = [];
  for (let at = 0; at < bursts.length; at += 1) {
    received += bursts[at];
    for (let tick = 0; tick < ticksBetweenBursts; tick += 1) {
      shown = advanceShown(shown, received);
      ticks += 1;
    }
  }
  streaming = false;
  while (isAnswerLive(streaming, shown, received)) {
    liveAfterStop.push(true);
    shown = advanceShown(shown, received);
    ticks += 1;
  }
  return { received, shown, ticks, liveAfterStop };
};

describe('the answer stream prefix', () => {
  test('a finished answer is not live', () => {
    expect(isAnswerLive(false, 120, 120)).toBe(false);
    expect(isAnswerLive(false, 0, 0)).toBe(false);
  });

  test('stays live after the model stops until the rest has unfolded', () => {
    expect(isAnswerLive(false, 40, 120)).toBe(true);
    expect(isAnswerLive(true, 120, 120)).toBe(true);
  });

  test('a 2,000-character answer that lands in one burst unfolds in about two seconds', () => {
    const result = simulate([2_000], 0);
    expect(result.shown).toBe(2_000);
    expect(result.liveAfterStop.length).toBeGreaterThan(0);
    const seconds = (result.ticks * STREAM_TICK_MS) / 1000;
    expect(seconds).toBeGreaterThan(2);
    expect(seconds).toBeLessThan(2.6);
  });

  test('bursts never make the clock jump: each tick reveals a bounded step', () => {
    let received = 0;
    let shown = 0;
    const steps: number[] = [];
    for (const burst of [10, 900, 5, 1_085]) {
      received += burst;
      for (let tick = 0; tick < 5; tick += 1) {
        const next = advanceShown(shown, received);
        steps.push(next - shown);
        shown = next;
      }
    }
    // The biggest single step over a 2,000-character answer is ~22 characters.
    expect(Math.max(...steps)).toBeLessThanOrEqual(Math.round(received / 90) + 1);
  });

  test('whatever is left after the stop finishes at the same pace, then stops', () => {
    const result = simulate([600, 600, 800], 3);
    expect(result.shown).toBe(result.received);
    expect(isAnswerLive(false, result.shown, result.received)).toBe(false);
  });
});
