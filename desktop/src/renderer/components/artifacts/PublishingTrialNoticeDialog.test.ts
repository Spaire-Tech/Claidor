import { describe, expect, test } from 'vitest';

import { formatPublishingTrialDuration } from './PublishingTrialNoticeDialog';

describe('PublishingTrialNoticeDialog', () => {
  test('formats the server-provided two-hour trial duration', () => {
    expect(formatPublishingTrialDuration(2 * 60 * 60)).toBe('2 hr');
  });

  test('keeps minute precision for non-hour trial policies', () => {
    expect(formatPublishingTrialDuration((2 * 60 + 5) * 60)).toBe('2 hr 5 min');
    expect(formatPublishingTrialDuration(30 * 60)).toBe('30 min');
  });
});
