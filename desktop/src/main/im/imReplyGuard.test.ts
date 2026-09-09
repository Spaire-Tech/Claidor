import { expect,test } from 'vitest';

import { analyzeIMReply, FAILED_REMINDER_FAILURE_REPLY,UNSCHEDULED_REMINDER_FAILURE_REPLY } from './imReplyGuard';

test('guards IM reminder commitment when no cron.add succeeded', () => {
  const analysis = analyzeIMReply([
    {
      id: 'assistant-1',
      type: 'assistant',
      content: "Sure, in 2 minutes I'll remind you to have a drink.",
      timestamp: Date.now(),
      metadata: {},
    },
  ]);

  expect(analysis.guardApplied).toBe(true);
  expect(analysis.successfulCronAdds).toBe(0);
  expect(analysis.text).toBe(UNSCHEDULED_REMINDER_FAILURE_REPLY);
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
      content: "Sure, in 2 minutes I'll remind you to have a drink.",
      timestamp: Date.now(),
      metadata: {},
    },
  ]);

  expect(analysis.guardApplied).toBe(false);
  expect(analysis.successfulCronAdds).toBe(1);
  expect(analysis.text).toBe("Sure, in 2 minutes I'll remind you to have a drink.");
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
      content: "Scheduled task created successfully! When the time comes, I'll automatically remind you.",
      timestamp: Date.now(),
      metadata: {},
    },
  ]);

  expect(analysis.guardApplied).toBe(true);
  expect(analysis.attemptedCronAdds).toBe(1);
  expect(analysis.successfulCronAdds).toBe(0);
  expect(analysis.text).toBe(FAILED_REMINDER_FAILURE_REPLY);
});

test('does not guard normal non-reminder assistant replies', () => {
  const analysis = analyzeIMReply([
    {
      id: 'assistant-1',
      type: 'assistant',
      content: 'Cloudy in Shanghai today, 18 to 24 degrees.',
      timestamp: Date.now(),
      metadata: {},
    },
  ]);

  expect(analysis.guardApplied).toBe(false);
  expect(analysis.text).toBe('Cloudy in Shanghai today, 18 to 24 degrees.');
});
