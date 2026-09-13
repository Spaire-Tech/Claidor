import { describe, expect, test } from 'vitest';

import { advanceShown, STREAM_MIN_STEP, STREAM_TICK_MS, streamStep } from './useStreamedText';

describe('the stream clock', () => {
  test('a short answer moves at least two characters a tick', () => {
    expect(streamStep(20)).toBe(STREAM_MIN_STEP);
    expect(streamStep(0)).toBe(STREAM_MIN_STEP);
  });

  test('any long answer unfolds in about ninety ticks, a little over two seconds', () => {
    for (const length of [900, 2_000, 6_000]) {
      let shown = 0;
      let ticks = 0;
      while (shown < length) {
        shown = advanceShown(shown, length);
        ticks += 1;
      }
      expect(ticks).toBeGreaterThanOrEqual(85);
      expect(ticks).toBeLessThanOrEqual(95);
      expect(ticks * STREAM_TICK_MS).toBeLessThan(2_600);
    }
  });

  test('never overshoots the text', () => {
    expect(advanceShown(99, 100)).toBe(100);
    expect(advanceShown(100, 100)).toBe(100);
  });

  test('keeps pace as more text arrives', () => {
    // The step grows with the text, so a burst does not stall the clock.
    expect(streamStep(180)).toBe(2);
    expect(streamStep(1_800)).toBe(20);
  });
});
