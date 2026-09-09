import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  analyzeIMReply,
  UNSCHEDULED_REMINDER_FAILURE_REPLY,
  FAILED_REMINDER_FAILURE_REPLY,
} = require('../dist-electron/main/im/imReplyGuard.js');

test('guards IM reminder commitment when no cron.add succeeded', () => {
  const analysis = analyzeIMReply([
    {
      id: 'assistant-1',
      type: 'assistant',
      content: "Sure, I'll remind you to drink water in 2 minutes.",
      timestamp: Date.now(),
      metadata: {},
    },
  ]);

  assert.equal(analysis.guardApplied, true);
  assert.equal(analysis.successfulCronAdds, 0);
  assert.equal(analysis.text, UNSCHEDULED_REMINDER_FAILURE_REPLY);
});

test('preserves reminder reply when cron.add completed successfully', () => {
  const analysis = analyzeIMReply([
    {
      id: 'tool-use-1',
      type: 'tool_use',
      content: 'Using tool: cron',
      timestamp: Date.now(),
      metadata: {
        toolName: 'cron',
        toolUseId: 'cron-call-1',
        toolInput: { action: 'add' },
      },
    },
    {
      id: 'tool-result-1',
      type: 'tool_result',
      content: '{"id":"job-1"}',
      timestamp: Date.now(),
      metadata: {
        toolUseId: 'cron-call-1',
        toolResult: '{"id":"job-1"}',
        isError: false,
      },
    },
    {
      id: 'assistant-1',
      type: 'assistant',
      content: "Sure, I'll remind you to drink water in 2 minutes.",
      timestamp: Date.now(),
      metadata: {},
    },
  ]);

  assert.equal(analysis.guardApplied, false);
  assert.equal(analysis.successfulCronAdds, 1);
  assert.equal(analysis.text, "Sure, I'll remind you to drink water in 2 minutes.");
});

test('returns explicit failure when cron.add was attempted but failed', () => {
  const analysis = analyzeIMReply([
    {
      id: 'tool-use-1',
      type: 'tool_use',
      content: 'Using tool: cron',
      timestamp: Date.now(),
      metadata: {
        toolName: 'Cron',
        toolUseId: 'cron-call-1',
        toolInput: { action: 'add' },
      },
    },
    {
      id: 'tool-result-1',
      type: 'tool_result',
      content: 'invalid cron.add params',
      timestamp: Date.now(),
      metadata: {
        toolUseId: 'cron-call-1',
        toolResult: 'invalid cron.add params',
        error: 'invalid cron.add params',
        isError: true,
      },
    },
    {
      id: 'assistant-1',
      type: 'assistant',
      content: "Scheduled task created! I'll remind you automatically when the time comes.",
      timestamp: Date.now(),
      metadata: {},
    },
  ]);

  assert.equal(analysis.guardApplied, true);
  assert.equal(analysis.attemptedCronAdds, 1);
  assert.equal(analysis.successfulCronAdds, 0);
  assert.equal(analysis.text, FAILED_REMINDER_FAILURE_REPLY);
});

test('does not guard normal non-reminder assistant replies', () => {
  const analysis = analyzeIMReply([
    {
      id: 'assistant-1',
      type: 'assistant',
      content: 'London is cloudy today, 18 to 24 degrees.',
      timestamp: Date.now(),
      metadata: {},
    },
  ]);

  assert.equal(analysis.guardApplied, false);
  assert.equal(analysis.text, 'London is cloudy today, 18 to 24 degrees.');
});
