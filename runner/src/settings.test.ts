import { describe, expect, test } from 'vitest';

import { MissingSetting, readSettings } from './settings.js';

const enough = {
  CLAIDOR_API_BASE_URL: 'https://api.example.test/',
  CLAIDOR_MATY_RUNNER_TOKEN: 'a-token',
};

describe('the settings', () => {
  test('refuse to start without Claidor\'s address', () => {
    expect(() => readSettings({ CLAIDOR_MATY_RUNNER_TOKEN: 'a-token' })).toThrow(MissingSetting);
  });

  test('take the address under the name the rest of Claidor uses', () => {
    const settings = readSettings({
      CLAIDOR_BASE_URL: 'https://api.example.test/',
      CLAIDOR_MATY_RUNNER_TOKEN: 'a-token',
    });
    expect(settings.apiBaseUrl).toBe('https://api.example.test');
  });

  test('refuse to start without the runner\'s token', () => {
    expect(() => readSettings({ CLAIDOR_API_BASE_URL: 'https://api.example.test' })).toThrow(MissingSetting);
  });

  test('have no default that would work in production', () => {
    // Nothing secret may come from anywhere but the environment, so an
    // empty environment must produce no settings at all.
    expect(() => readSettings({})).toThrow(MissingSetting);
  });

  test('drop a trailing slash from the address', () => {
    expect(readSettings(enough).apiBaseUrl).toBe('https://api.example.test');
  });

  test('take the intervals from the environment when they are given', () => {
    const settings = readSettings({ ...enough, CLAIDOR_MATY_POLL_INTERVAL_MS: '1234' });
    expect(settings.pollIntervalMs).toBe(1234);
  });

  test('refuse an interval that is not a positive number', () => {
    expect(() => readSettings({ ...enough, CLAIDOR_MATY_POLL_INTERVAL_MS: 'soon' })).toThrow(/positive number/);
    expect(() => readSettings({ ...enough, CLAIDOR_MATY_POLL_INTERVAL_MS: '-1' })).toThrow(/positive number/);
  });
});
