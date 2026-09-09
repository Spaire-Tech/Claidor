import { describe, expect, test } from 'vitest';

import { DeliveryMode } from '../../../scheduledTask/constants';
import type { ScheduledTask, ScheduledTaskConversationOption } from '../../../scheduledTask/types';
import { i18nService } from '../../services/i18n';
import {
  channelOptionMatchesSelection,
  conversationOptionMatchesValue,
  formatDateTimeMinute,
  formatDeliveryLabel,
  formatElapsedDuration,
  getTaskDisplayStatus,
  stripCronMetadataPrefix,
  TaskDisplayStatus,
} from './utils';

function makeTask(overrides: {
  enabled?: boolean;
  runningAtMs?: number | null;
  lastStatus?: ScheduledTask['state']['lastStatus'];
}): ScheduledTask {
  return {
    id: 'task-1',
    name: 'Task',
    description: '',
    enabled: overrides.enabled ?? true,
    schedule: { kind: 'cron', expr: '0 9 * * *' },
    sessionTarget: 'isolated',
    wakeMode: 'now',
    payload: { kind: 'agentTurn', message: 'hello' },
    delivery: { mode: 'none' },
    agentId: null,
    sessionKey: null,
    state: {
      nextRunAtMs: null,
      lastRunAtMs: null,
      lastStatus: overrides.lastStatus ?? null,
      lastError: null,
      lastDurationMs: null,
      runningAtMs: overrides.runningAtMs ?? null,
      consecutiveErrors: 0,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as ScheduledTask;
}

describe('getTaskDisplayStatus', () => {
  test('running wins over everything, including paused', () => {
    expect(getTaskDisplayStatus(makeTask({ runningAtMs: 123, enabled: false }))).toBe(
      TaskDisplayStatus.Running,
    );
    expect(getTaskDisplayStatus(makeTask({ lastStatus: 'running' }))).toBe(
      TaskDisplayStatus.Running,
    );
  });

  test('disabled task shows paused regardless of last result', () => {
    expect(getTaskDisplayStatus(makeTask({ enabled: false, lastStatus: 'error' }))).toBe(
      TaskDisplayStatus.Paused,
    );
  });

  test('enabled task reflects the last run result', () => {
    expect(getTaskDisplayStatus(makeTask({ lastStatus: 'success' }))).toBe(
      TaskDisplayStatus.Success,
    );
    expect(getTaskDisplayStatus(makeTask({ lastStatus: 'error' }))).toBe(TaskDisplayStatus.Error);
    expect(getTaskDisplayStatus(makeTask({ lastStatus: 'skipped' }))).toBe(
      TaskDisplayStatus.Skipped,
    );
  });

  test('enabled task without any run shows never', () => {
    expect(getTaskDisplayStatus(makeTask({}))).toBe(TaskDisplayStatus.Never);
  });
});

describe('formatElapsedDuration', () => {
  test('formats seconds, minutes and hours', () => {
    expect(formatElapsedDuration(0)).toBe('0s');
    expect(formatElapsedDuration(42_000)).toBe('42s');
    expect(formatElapsedDuration(3 * 60_000 + 12_000)).toBe('3m 12s');
    expect(formatElapsedDuration(65 * 60_000)).toBe('1h 05m');
  });

  test('handles invalid input', () => {
    expect(formatElapsedDuration(-5)).toBe('0s');
    expect(formatElapsedDuration(Number.NaN)).toBe('0s');
  });
});

describe('conversationOptionMatchesValue', () => {
  const conversationId = 'telegram-bot-1:direct:user_johndoe';

  test('matches the saved bare peer id regardless of casing', () => {
    // Saved targets carry the channel-native casing while conversation ids
    // derive from lowercased OpenClaw session keys.
    expect(
      conversationOptionMatchesValue(
        'telegram',
        conversationId,
        'User_JohnDoe',
      ),
    ).toBe(true);
  });

  test('matches full conversation ids and trailing segments', () => {
    expect(conversationOptionMatchesValue('telegram', conversationId, conversationId)).toBe(
      true,
    );
    expect(
      conversationOptionMatchesValue(
        'telegram',
        conversationId,
        'direct:user_johndoe',
      ),
    ).toBe(true);
  });

  test('rejects different peers and empty values', () => {
    expect(
      conversationOptionMatchesValue('telegram', conversationId, 'someone-else'),
    ).toBe(false);
    expect(conversationOptionMatchesValue('telegram', conversationId, '')).toBe(false);
  });
});

describe('channelOptionMatchesSelection', () => {
  test('single-instance options match regardless of the saved accountId', () => {
    const option = { value: 'telegram', label: 'Telegram' };
    expect(channelOptionMatchesSelection(option, 'telegram', undefined)).toBe(true);
    expect(channelOptionMatchesSelection(option, 'telegram', 'telegram-bot-1')).toBe(
      true,
    );
    expect(channelOptionMatchesSelection(option, 'discord', undefined)).toBe(false);
  });

  test('multi-instance options require the exact accountId', () => {
    const option = { value: 'discord', label: 'Production instance', accountId: '5ba0851a' };
    expect(channelOptionMatchesSelection(option, 'discord', '5ba0851a')).toBe(true);
    expect(channelOptionMatchesSelection(option, 'discord', 'other')).toBe(false);
    expect(channelOptionMatchesSelection(option, 'discord', undefined)).toBe(false);
  });
});

describe('formatDeliveryLabel', () => {
  const conversation: ScheduledTaskConversationOption = {
    conversationId: 'telegram-bot-1:direct:user_johndoe',
    platform: 'telegram',
    coworkSessionId: 'session-1',
    lastActiveAt: 1,
    peerKind: 'direct',
    displayName: 'John Doe',
  };

  test('resolves the saved target to the friendly conversation name', () => {
    const label = formatDeliveryLabel(
      {
        mode: DeliveryMode.Announce,
        channel: 'telegram',
        to: 'User_JohnDoe',
      },
      { conversations: [conversation] },
    );
    expect(label).toContain('John Doe');
    expect(label).not.toContain('User_JohnDoe');
  });

  test('falls back to the parsed target when no conversation matches', () => {
    const label = formatDeliveryLabel(
      { mode: DeliveryMode.Announce, channel: 'telegram', to: 'someone-else' },
      { conversations: [conversation] },
    );
    expect(label).toContain('someone-else');
  });

  test('shows the channel instance name the form picker uses, without mode jargon', () => {
    const channels = [
      { value: 'discord', label: 'Instance 1', accountId: 'acc-1' },
      { value: 'discord', label: 'Instance 2', accountId: 'acc-2' },
    ];
    const label = formatDeliveryLabel(
      { mode: DeliveryMode.Announce, channel: 'discord', accountId: 'acc-2', to: 'wangning' },
      { channels },
    );
    expect(label).toContain('Instance 2');
    expect(label).toContain('wangning');
    expect(label).not.toContain(i18nService.t('scheduledTasksFormDeliveryModeAnnounce'));
  });
});

describe('formatDateTimeMinute', () => {
  test('drops seconds from the rendered timestamp', () => {
    const label = formatDateTimeMinute(new Date(2026, 6, 6, 13, 0, 59));
    expect(label).toMatch(/\d{1,2}:\d{2}/);
    expect(label).not.toContain(':59');
  });
});

describe('stripCronMetadataPrefix', () => {
  test('removes the cron routing tag from the prompt', () => {
    expect(
      stripCronMetadataPrefix('[cron:e49b2a3b-0030 Tech briefing] Collect and summarize the news'),
    ).toBe('Collect and summarize the news');
  });

  test('keeps text without a cron tag unchanged', () => {
    expect(stripCronMetadataPrefix('Regular message [cron:not-a-prefix]')).toBe(
      'Regular message [cron:not-a-prefix]',
    );
  });

  test('only strips the leading tag, not later brackets', () => {
    expect(stripCronMetadataPrefix('[cron:id name] keep [this]')).toBe('keep [this]');
  });
});
