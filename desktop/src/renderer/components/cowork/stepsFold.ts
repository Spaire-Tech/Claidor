import { i18nService } from '../../services/i18n';
import type { ConsolidatedItem } from './messageDisplayUtils';

/** Steps are tool calls; thinking is not a step. */
export const countToolSteps = (items: ConsolidatedItem[]): number => {
  let count = 0;
  for (const item of items) {
    if (item.type === 'tool_group' || item.type === 'tool_result') count += 1;
    else if (item.type === 'media_polling_group') count += Math.max(1, item.group.polls.length);
  }
  return count;
};

/**
 * The line the steps fold into once a turn finishes: « 4 steps · 12 s »
 * (docs/maties/design.md, section 4).
 */
export const formatStepsDuration = (durationMs: number): string => {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return i18nService.t('matiesDurationHours')
      .replace('{hours}', String(hours))
      .replace('{minutes}', String(minutes));
  }
  if (minutes > 0) {
    return i18nService.t('matiesDurationMinutes')
      .replace('{minutes}', String(minutes))
      .replace('{seconds}', String(seconds));
  }
  return i18nService.t('matiesDurationSeconds').replace('{seconds}', String(seconds));
};

export const formatStepsFold = (stepCount: number, durationMs: number | null): string => {
  const count = Math.max(0, stepCount);
  if (durationMs == null || durationMs < 1000) {
    return count === 1
      ? i18nService.t('matiesStepsCountOne')
      : i18nService.t('matiesStepsCount').replace('{count}', String(count));
  }
  const duration = formatStepsDuration(durationMs);
  return count === 1
    ? i18nService.t('matiesStepsFoldOne').replace('{duration}', duration)
    : i18nService.t('matiesStepsFold').replace('{count}', String(count)).replace('{duration}', duration);
};
