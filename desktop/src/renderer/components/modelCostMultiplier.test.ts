import { describe, expect, test } from 'vitest';

import { formatCostMultiplier } from './modelCostMultiplier';

describe('formatCostMultiplier', () => {
  test('the divisions that came over the wire read as prices again', () => {
    // Exactly what the founder saw in the model list.
    expect(formatCostMultiplier(0.6666666666666666)).toBe('0.67');
    expect(formatCostMultiplier(3.3333333333333335)).toBe('3.3');
    expect(formatCostMultiplier(0.06666666666666667)).toBe('0.067');
  });

  test('a whole multiplier stays whole', () => {
    expect(formatCostMultiplier(1)).toBe('1');
    expect(formatCostMultiplier(5)).toBe('5');
    expect(formatCostMultiplier(0.2)).toBe('0.2');
  });

  test('a number already short is left alone', () => {
    expect(formatCostMultiplier(12.5)).toBe('12.5');
    expect(formatCostMultiplier(1.5)).toBe('1.5');
  });

  test('nothing sensible to say is said as nothing', () => {
    expect(formatCostMultiplier(0)).toBe('');
    expect(formatCostMultiplier(-1)).toBe('');
    expect(formatCostMultiplier(Number.NaN)).toBe('');
    expect(formatCostMultiplier(Number.POSITIVE_INFINITY)).toBe('');
  });

  test('never long enough to crowd out the name beside it', () => {
    // The fault was a nineteen-character number in a column that refuses to
    // shrink, so the name shrank instead.
    for (const value of [0.6666666666666666, 3.3333333333333335, 0.06666666666666667, 1 / 7]) {
      expect(formatCostMultiplier(value).length).toBeLessThanOrEqual(5);
    }
  });
});
