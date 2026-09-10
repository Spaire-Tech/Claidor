import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

import AgentTaskRow from './AgentTaskRow';
import { AgentSidebarIndicator } from './constants';
import type { AgentSidebarTaskNode } from './types';

const makeTask = (
  isScheduledTask: boolean,
  overrides: Partial<AgentSidebarTaskNode> = {},
): AgentSidebarTaskNode => ({
  id: isScheduledTask ? 'scheduled-session' : 'regular-session',
  agentId: 'main',
  title: isScheduledTask ? '[Cron] Daily summary' : 'Regular task',
  isScheduledTask,
  status: 'completed',
  pinned: false,
  pinOrder: null,
  updatedAt: 200,
  createdAt: 100,
  indicator: AgentSidebarIndicator.None,
  isSelected: false,
  ...overrides,
});

const renderTask = (
  isScheduledTask: boolean,
  overrides: Partial<AgentSidebarTaskNode> = {},
) => renderToStaticMarkup(
  React.createElement(AgentTaskRow, {
    task: makeTask(isScheduledTask, overrides),
    isBatchMode: false,
    isSelected: false,
    onSelect: vi.fn(),
    onDelete: vi.fn(async () => {}),
    onShare: vi.fn(async () => {}),
    onTogglePin: vi.fn(async () => {}),
    onRename: vi.fn(async () => {}),
    onToggleSelection: vi.fn(),
    onEnterBatchMode: vi.fn(),
  }),
);

test('scheduled task rows show an accessible clock marker without marking regular rows', () => {
  const scheduledHtml = renderTask(true);
  expect(scheduledHtml).toContain('aria-label="Scheduled task"');
  expect(scheduledHtml).toContain('title="Scheduled task"');
  expect(scheduledHtml).toContain('role="img"');
  expect(scheduledHtml).toMatch(/role="img"[^>]*>\s*<svg/);
  expect(scheduledHtml).toContain('Daily summary');
  expect(scheduledHtml).not.toContain('[Cron]');

  expect(renderTask(false)).not.toContain('aria-label="Scheduled task"');
});

test('task rows and hidden action controls remain keyboard reachable', () => {
  const html = renderTask(false);
  expect(html).toContain('role="treeitem"');
  expect(html).toContain('tabindex="0"');
  expect(html).toContain('focus-visible:opacity-100');
});

test('IM task rows show platform icons and hide matching title prefixes', () => {
  const html = renderTask(false, {
    title: '[Telegram] group:o9cq',
    imPlatform: 'telegram',
  });
  expect(html).toContain('src="telegram.svg"');
  expect(html).toContain('aria-label="Telegram"');
  expect(html).toContain('group:o9cq');
  expect(html).not.toContain('[Telegram]');
});
