import { describe, expect, test } from 'vitest';

import { buildInfoFrom, describeBuild, DEV_BUILD } from './constants';

describe('the build stamp', () => {
  test('is read from the packaged package.json', () => {
    expect(buildInfoFrom({ version: '2026.9.4', build: { commit: '09309433', builtAt: '2026-09-15T07:41:02.000Z' } }))
      .toEqual({ commit: '09309433', builtAt: '2026-09-15T07:41:02.000Z' });
  });

  test('a checkout has no stamp and says so', () => {
    expect(buildInfoFrom({ version: '2026.9.4' })).toBe(DEV_BUILD);
    expect(buildInfoFrom(undefined)).toBe(DEV_BUILD);
    expect(buildInfoFrom({ build: { commit: '' } })).toBe(DEV_BUILD);
  });

  test('reads back as one line', () => {
    expect(describeBuild('2026.9.4', { commit: '09309433', builtAt: '2026-09-15T07:41:02.000Z' }))
      .toBe('2026.9.4 (09309433, built 2026-09-15 07:41 UTC)');
    expect(describeBuild('2026.9.4', { commit: '09309433', builtAt: '' })).toBe('2026.9.4 (09309433)');
    expect(describeBuild('2026.9.4', DEV_BUILD)).toBe('2026.9.4 (dev checkout)');
  });
});
