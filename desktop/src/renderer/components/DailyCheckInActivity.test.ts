import { describe, expect, test } from 'vitest';

import { getLocalizedDailyCheckInText } from './DailyCheckInActivity';

// The campaign server may still send Chinese copy; the English UI must swap it
// for the bundled fallback. The fixture is spelled with escapes so this file
// stays free of CJK characters while still exercising that path.
const CJK_SERVER_TEXT = '\u6bcf\u65e5\u79ef\u5206\u793c';

describe('getLocalizedDailyCheckInText', () => {
  test('uses the English fallback when server activity text is Chinese', () => {
    expect(getLocalizedDailyCheckInText(CJK_SERVER_TEXT, 'Daily credit gift')).toBe('Daily credit gift');
  });

  test('keeps English server activity text', () => {
    expect(getLocalizedDailyCheckInText('Daily gift', 'Daily credit gift')).toBe('Daily gift');
  });

  test('falls back when server activity text is blank', () => {
    expect(getLocalizedDailyCheckInText('  ', 'Daily credit gift')).toBe('Daily credit gift');
  });
});
