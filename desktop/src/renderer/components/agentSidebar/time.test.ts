import { afterEach, expect, test, vi } from 'vitest';

import { formatAgentTaskRelativeTime } from './time';

const now = 1_700_000_000_000;

afterEach(() => {
  vi.restoreAllMocks();
});

test('formatAgentTaskRelativeTime uses English compact minute hour and day units', () => {
  vi.spyOn(Date, 'now').mockReturnValue(now);

  expect(formatAgentTaskRelativeTime(now - 30 * 1000).compact).toBe('1m');
  expect(formatAgentTaskRelativeTime(now - 4 * 60000).compact).toBe('4m');
  expect(formatAgentTaskRelativeTime(now - 60 * 60000).compact).toBe('60m');
  expect(formatAgentTaskRelativeTime(now - 61 * 60000).compact).toBe('1h');
  expect(formatAgentTaskRelativeTime(now - 10 * 3600000).compact).toBe('10h');
  expect(formatAgentTaskRelativeTime(now - 25 * 3600000).compact).toBe('1d');
});

test('formatAgentTaskRelativeTime switches to week month and year units', () => {
  vi.spyOn(Date, 'now').mockReturnValue(now);

  expect(formatAgentTaskRelativeTime(now - 7 * 86400000).compact).toBe('1w');
  expect(formatAgentTaskRelativeTime(now - 30 * 86400000).compact).toBe('1mo');
  expect(formatAgentTaskRelativeTime(now - 360 * 86400000).compact).toBe('1y');
});
