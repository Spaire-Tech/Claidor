import { describe, expect, test } from 'vitest';

import { formatStepsDuration, formatStepsFold } from './stepsFold';

describe('the folded steps line', () => {
  test('reads « 4 steps · 12 s »', () => {
    expect(formatStepsFold(4, 12_300)).toBe('4 steps · 12 s');
    expect(formatStepsFold(1, 3_000)).toBe('1 step · 3 s');
  });

  test('drops the time when there is none worth showing', () => {
    expect(formatStepsFold(4, null)).toBe('4 steps');
    expect(formatStepsFold(1, 400)).toBe('1 step');
  });

  test('durations', () => {
    expect(formatStepsDuration(65_000)).toBe('1 min 5 s');
    expect(formatStepsDuration(3_720_000)).toBe('1 h 2 min');
  });
});
