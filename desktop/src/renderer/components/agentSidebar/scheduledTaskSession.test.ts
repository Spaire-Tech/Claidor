import { describe, expect, test } from 'vitest';

import {
  getScheduledTaskDisplayTitle,
  hasLegacyScheduledTaskTitle,
  isScheduledTaskSession,
} from './scheduledTaskSession';

describe('scheduled task session markers', () => {
  test('marks only top-level persisted or generated legacy scheduled sessions', () => {
    expect(isScheduledTaskSession('job-1', 'Renamed task')).toBe(true);
    expect(isScheduledTaskSession(null, '[cron] Tech briefing')).toBe(true);
    expect(isScheduledTaskSession(undefined, '[Cron] Daily summary')).toBe(true);
    expect(isScheduledTaskSession('job-1', 'Renamed task', 'parent-session')).toBe(false);
    expect(isScheduledTaskSession(null, '[cron] Tech briefing (fork)', 'parent-session')).toBe(false);

    expect(isScheduledTaskSession('   ', 'Regular task')).toBe(false);
    expect(isScheduledTaskSession(null, '[cron]Tech briefing')).toBe(false);
    expect(isScheduledTaskSession(null, '[Cron]Daily summary')).toBe(false);
    expect(isScheduledTaskSession(null, ' [cron] Tech briefing')).toBe(false);
    expect(hasLegacyScheduledTaskTitle('Regular task')).toBe(false);
  });

  test('replaces generated prefixes visually without changing unrelated titles', () => {
    expect(getScheduledTaskDisplayTitle('[cron] Tech briefing')).toBe('Tech briefing');
    expect(getScheduledTaskDisplayTitle('[Cron] Daily summary')).toBe('Daily summary');
    expect(getScheduledTaskDisplayTitle('[cron]')).toBe('[cron]');
    expect(getScheduledTaskDisplayTitle('  Regular task  ')).toBe('  Regular task  ');
  });
});
