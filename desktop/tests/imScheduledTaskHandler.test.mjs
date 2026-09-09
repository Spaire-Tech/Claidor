import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  looksLikeIMScheduledTaskCandidate,
  normalizeDetectedScheduledTaskRequest,
  isReminderSystemTurn,
} = require('../dist-electron/main/im/imScheduledTaskHandler.js');

test('normalizes model-detected IM reminder requests into direct cron.add inputs', () => {
  const parsed = normalizeDetectedScheduledTaskRequest(
    {
      shouldCreateTask: true,
      scheduleAt: '2026-03-15T16:30:00+08:00',
      reminderBody: 'drink water',
      taskName: 'drink water reminder',
    },
    'Remind me to drink water in 2 minutes',
    new Date('2026-03-15T16:28:00+08:00'),
  );

  assert.ok(parsed);
  assert.equal(parsed.kind, 'create');
  assert.equal(parsed.reminderBody, 'drink water');
  // The task name keeps the detector's name; the handler only normalizes/suffixes it.
  assert.match(parsed.taskName, /drink water reminder/u);
  // The cron payload is the reminder body behind the stable alarm-clock marker.
  assert.match(parsed.payloadText, /^⏰ .*drink water$/u);
  // The relative delay label is localized wording around the "2 minutes" figure.
  assert.match(parsed.delayLabel, /2/u);
  // scheduleAt may be in any timezone representation; compare as absolute timestamps
  assert.equal(new Date(parsed.scheduleAt).getTime(), new Date('2026-03-15T16:30:00+08:00').getTime());
  // The confirmation names the clock time and the reminder body.
  assert.match(parsed.confirmationText, /16:30/u);
  assert.match(parsed.confirmationText, /drink water/u);
});

test('only uses heuristic as a cheap reminder candidate prefilter', () => {
  assert.equal(looksLikeIMScheduledTaskCandidate("Summarize today's meeting notes for me"), false);
  assert.equal(looksLikeIMScheduledTaskCandidate('Remind me to drink water in 2 minutes'), true);
});

test('rejects detector payloads without a future timezone-aware timestamp', () => {
  assert.equal(normalizeDetectedScheduledTaskRequest({
    shouldCreateTask: true,
    scheduleAt: '2026-03-15T16:30:00',
    reminderBody: 'drink water',
  }, 'Remind me to drink water', new Date('2026-03-15T16:28:00+08:00')), null);
});

test('identifies reminder system turns for async IM delivery', () => {
  assert.equal(isReminderSystemTurn([
    { type: 'assistant', content: 'A regular reply' },
  ]), false);

  assert.equal(isReminderSystemTurn([
    { type: 'system', content: '⏰ Reminder: drink water' },
    { type: 'assistant', content: 'Time to drink some water!' },
  ]), true);
});

test('keeps recognizing legacy reminder system messages during transition', () => {
  assert.equal(isReminderSystemTurn([
    { type: 'system', content: 'System: [Sunday, March 15th, 2026 — 4:30 PM] ⏰ Reminder: drink water' },
    { type: 'assistant', content: 'Time to drink some water!' },
  ]), true);
});

test('recognizes plain reminder text turns during runtime hotfix rollout', () => {
  assert.equal(isReminderSystemTurn([
    { type: 'user', content: '⏰ Reminder: time to clock in! Don\'t forget.' },
    { type: 'assistant', content: '⏰ Time is up, go clock in.' },
  ]), true);
});
