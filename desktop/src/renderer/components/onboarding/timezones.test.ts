import { describe, expect, test } from 'vitest';

import {
  formatTimezoneLabel,
  formatTimezoneOffset,
  formatTimezoneOption,
  listTimezones,
  timezoneCity,
  timezoneOffsetMinutes,
  timezoneRegionName,
} from './timezones';

const JANUARY = new Date('2026-01-15T12:00:00Z');
const JULY = new Date('2026-07-15T12:00:00Z');

describe('timezone labels', () => {
  test('names the zone the friendly way the founder drew it', () => {
    expect(formatTimezoneLabel('America/Los_Angeles', JANUARY)).toBe('Pacific (Los Angeles)');
    expect(formatTimezoneLabel('America/Los_Angeles', JULY)).toBe('Pacific (Los Angeles)');
    expect(formatTimezoneLabel('Europe/Paris', JULY)).toBe('Central European (Paris)');
    expect(formatTimezoneLabel('Asia/Kolkata', JULY)).toBe('India (Kolkata)');
  });

  test('turns underscores into spaces in the city', () => {
    expect(timezoneCity('America/New_York')).toBe('New York');
    expect(timezoneCity('Africa/Dakar')).toBe('Dakar');
    expect(timezoneCity('UTC')).toBe('UTC');
  });

  test('says UTC alone for the UTC zones', () => {
    expect(formatTimezoneLabel('UTC', JULY)).toBe('UTC');
    expect(formatTimezoneLabel('Etc/UTC', JULY)).toBe('UTC');
    expect(timezoneRegionName('UTC', JULY)).toBe('UTC');
  });

  test('computes the offset right now, daylight time included', () => {
    expect(timezoneOffsetMinutes('America/Los_Angeles', JANUARY)).toBe(-480);
    expect(timezoneOffsetMinutes('America/Los_Angeles', JULY)).toBe(-420);
    expect(timezoneOffsetMinutes('Asia/Kolkata', JULY)).toBe(330);
    expect(timezoneOffsetMinutes('Africa/Dakar', JULY)).toBe(0);
  });

  test('prints the offset as GMT with a real minus sign', () => {
    expect(formatTimezoneOffset('America/Los_Angeles', JULY)).toBe('GMT−7');
    expect(formatTimezoneOffset('Asia/Kolkata', JULY)).toBe('GMT+5:30');
    expect(formatTimezoneOffset('Africa/Dakar', JULY)).toBe('GMT');
  });

  test('falls back to the offset when the zone has no name', () => {
    const label = timezoneRegionName('Etc/GMT+3', JULY);
    expect(label).toBe('GMT−3');
  });

  test('the picker option carries the label and the offset', () => {
    expect(formatTimezoneOption('America/Los_Angeles', JULY)).toBe('Pacific (Los Angeles) · GMT−7');
  });

  test('lists the runtime zones with the machine zone always present', () => {
    const zones = listTimezones('America/Los_Angeles');
    expect(zones).toContain('America/Los_Angeles');
    expect(zones).toContain('Europe/Paris');
    expect(listTimezones('Mars/Olympus_Mons')[0]).toBe('Mars/Olympus_Mons');
  });
});
