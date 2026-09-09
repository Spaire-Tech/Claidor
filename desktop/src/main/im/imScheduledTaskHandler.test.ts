import { expect,test } from 'vitest';

import {
  isReminderSystemTurn,
  looksLikeIMScheduledTaskCandidate,
  normalizeDetectedScheduledTaskRequest,
} from './imScheduledTaskHandler';

test('normalizes model-detected IM reminder requests into direct cron.add inputs', () => {
  const scheduleAtInput = '2026-03-15T16:30:00+08:00';
  const runAt = new Date(scheduleAtInput);
  const expectedClock = '16:30';
  const parsed = normalizeDetectedScheduledTaskRequest(
    {
      shouldCreateTask: true,
      scheduleAt: scheduleAtInput,
      reminderBody: 'have a drink',
      taskName: 'Have a drink reminder',
    },
    'Remind me to have a drink in 2 minutes',
    new Date('2026-03-15T16:28:00+08:00'),
  );

  expect(parsed).toBeTruthy();
  expect(parsed!.kind).toBe('create');
  expect(parsed!.reminderBody).toBe('have a drink');
  expect(parsed!.taskName).toBe('Have a drink reminder');
  expect(parsed!.payloadText).toBe('⏰ Reminder: have a drink');
  expect(parsed!.delayLabel).toBe('in 2 minutes');
  expect(parsed!.runAt.toISOString()).toBe(runAt.toISOString());
  expect(new Date(parsed!.scheduleAt).toISOString()).toBe(runAt.toISOString());
  expect(parsed!.confirmationText).toMatch(new RegExp(`in 2 minutes \\(${expectedClock}\\): have a drink`, 'u'));
});

test('only uses heuristic as a cheap reminder candidate prefilter', () => {
  expect(looksLikeIMScheduledTaskCandidate('Summarize the notes from today\'s meeting for me')).toBe(false);
  expect(looksLikeIMScheduledTaskCandidate('Remind me to have a drink in 2 minutes')).toBe(true);
});

test('rejects detector payloads without a future timezone-aware timestamp', () => {
  expect(normalizeDetectedScheduledTaskRequest({
    shouldCreateTask: true,
    scheduleAt: '2026-03-15T16:30:00',
    reminderBody: 'drink water',
  }, 'Remind me to drink water', new Date('2026-03-15T16:28:00+08:00'))).toBe(null);
});

test('identifies reminder system turns for async IM delivery', () => {
  expect(isReminderSystemTurn([
    { type: 'assistant', content: 'A normal reply' },
  ])).toBe(false);

  expect(isReminderSystemTurn([
    { type: 'system', content: '⏰ Reminder: have a drink' },
    { type: 'assistant', content: 'Time to have a drink!' },
  ])).toBe(true);
});

test('keeps recognizing legacy reminder system messages during transition', () => {
  expect(isReminderSystemTurn([
    { type: 'system', content: 'System: [Sunday, March 15th, 2026 — 4:30 PM] ⏰ Reminder: have a drink' },
    { type: 'assistant', content: 'Time to have a drink!' },
  ])).toBe(true);
});

test('recognizes plain reminder text turns during runtime hotfix rollout', () => {
  expect(isReminderSystemTurn([
    { type: 'user', content: '⏰ Reminder: time to clock in at work!' },
    { type: 'assistant', content: '⏰ Time is up, go clock in.' },
  ])).toBe(true);
});
