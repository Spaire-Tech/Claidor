const LEGACY_SCHEDULED_TASK_TITLE_RE = /^(\[cron\])\s+/i;

export const hasLegacyScheduledTaskTitle = (title: string): boolean => {
  return LEGACY_SCHEDULED_TASK_TITLE_RE.test(title);
};

export const isScheduledTaskSession = (
  scheduledTaskId: string | null | undefined,
  title: string,
  parentSessionId?: string | null,
): boolean => {
  if (parentSessionId?.trim()) return false;
  return Boolean(scheduledTaskId?.trim()) || hasLegacyScheduledTaskTitle(title);
};

export const getScheduledTaskDisplayTitle = (title: string): string => {
  if (!hasLegacyScheduledTaskTitle(title)) return title;
  const displayTitle = title.replace(LEGACY_SCHEDULED_TASK_TITLE_RE, '').trim();
  return displayTitle || title;
};
