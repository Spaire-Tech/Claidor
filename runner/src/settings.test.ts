import { describe, expect, test } from 'vitest';

import { MissingSetting, readSettings } from './settings.js';

const enough = {
  SIMEON_API_BASE_URL: 'https://api.example.test/',
  SIMEON_MATY_RUNNER_TOKEN: 'a-token',
};

describe('the settings', () => {
  test('refuse to start without the API\'s address', () => {
    expect(() => readSettings({ SIMEON_MATY_RUNNER_TOKEN: 'a-token' })).toThrow(MissingSetting);
  });

  test('take the address under the name the API uses', () => {
    const settings = readSettings({
      SIMEON_BASE_URL: 'https://api.example.test/',
      SIMEON_MATY_RUNNER_TOKEN: 'a-token',
    });
    expect(settings.apiBaseUrl).toBe('https://api.example.test');
  });

  test('refuse to start without the runner\'s token', () => {
    expect(() => readSettings({ SIMEON_API_BASE_URL: 'https://api.example.test' })).toThrow(MissingSetting);
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
    const settings = readSettings({ ...enough, SIMEON_MATY_POLL_INTERVAL_MS: '1234' });
    expect(settings.pollIntervalMs).toBe(1234);
  });

  test('refuse an interval that is not a positive number', () => {
    expect(() => readSettings({ ...enough, SIMEON_MATY_POLL_INTERVAL_MS: 'soon' })).toThrow(/positive number/);
    expect(() => readSettings({ ...enough, SIMEON_MATY_POLL_INTERVAL_MS: '-1' })).toThrow(/positive number/);
  });

  test('still read the earlier CLAIDOR_ names', () => {
    const settings = readSettings({
      CLAIDOR_API_BASE_URL: 'https://api.example.test/',
      CLAIDOR_MATY_RUNNER_TOKEN: 'a-token',
      CLAIDOR_MATY_POLL_INTERVAL_MS: '999',
    });
    expect(settings.apiBaseUrl).toBe('https://api.example.test');
    expect(settings.runnerToken).toBe('a-token');
    expect(settings.pollIntervalMs).toBe(999);
  });

  test('prefer the SIMEON_ name when both are set', () => {
    const settings = readSettings({
      ...enough,
      CLAIDOR_MATY_RUNNER_TOKEN: 'old-token',
      CLAIDOR_API_BASE_URL: 'https://old.example.test',
    });
    expect(settings.runnerToken).toBe('a-token');
    expect(settings.apiBaseUrl).toBe('https://api.example.test');
  });
});
