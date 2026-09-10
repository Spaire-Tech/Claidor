import { expect, test } from 'vitest';

import { buildOpenClawLocalTimeContextPrompt } from './openclawLocalTimeContextPrompt';

test('openclaw local time context prompt makes future at-timestamps explicit', () => {
  const now = new Date('2026-03-15T08:28:00.000Z');
  const prompt = buildOpenClawLocalTimeContextPrompt(now);

  expect(prompt).toMatch(/authoritative current local time/i);
  expect(prompt).toMatch(/Current local datetime: /);
  expect(prompt).toMatch(/UTC[+-]\d{2}:\d{2}/);
  expect(prompt).toMatch(new RegExp(`Current unix timestamp \\(ms\\): ${now.getTime()}`));
  expect(prompt).toMatch(/future ISO 8601 timestamp with an explicit timezone offset/i);
  expect(prompt).toMatch(/Never send an `at` timestamp that is equal to or earlier/i);
});

test('openclaw local time context prompt speaks in the chosen time zone', () => {
  const now = new Date('2026-03-15T08:28:00.000Z');

  const tokyo = buildOpenClawLocalTimeContextPrompt(now, 'Asia/Tokyo');
  expect(tokyo).toContain('Current local datetime: 2026-03-15 17:28:00 (timezone: Asia/Tokyo, UTC+09:00)');
  expect(tokyo).toContain('Current local ISO datetime (no timezone suffix): 2026-03-15T17:28:00');

  const losAngeles = buildOpenClawLocalTimeContextPrompt(now, 'America/Los_Angeles');
  expect(losAngeles).toContain('Current local datetime: 2026-03-15 01:28:00 (timezone: America/Los_Angeles, UTC-07:00)');

  const utc = buildOpenClawLocalTimeContextPrompt(now, 'UTC');
  expect(utc).toContain('Current local datetime: 2026-03-15 08:28:00 (timezone: UTC, UTC+00:00)');
});

test('openclaw local time context prompt falls back to the machine zone for an unknown one', () => {
  const now = new Date('2026-03-15T08:28:00.000Z');
  const machine = buildOpenClawLocalTimeContextPrompt(now);
  const unknown = buildOpenClawLocalTimeContextPrompt(now, 'Nowhere/Town');

  expect(unknown).toBe(machine);
});
