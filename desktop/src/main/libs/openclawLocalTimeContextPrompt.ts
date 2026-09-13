function pad(value: number): string {
  return String(value).padStart(2, '0');
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function isSupportedTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The zone the prompt speaks in: the one asked for when the runtime knows it, else the machine's. */
function resolveTimeZone(timezone?: string): string {
  const requested = timezone?.trim();
  if (requested && isSupportedTimeZone(requested)) return requested;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function formatDateTime(parts: ZonedParts): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function formatIsoWithoutTimezone(parts: ZonedParts): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function formatUtcOffset(date: Date, parts: ZonedParts): string {
  const wallClockAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offsetMinutes = Math.round((wallClockAsUtc - (date.getTime() - date.getMilliseconds())) / 60_000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  return `${sign}${pad(hours)}:${pad(minutes)}`;
}

/**
 * The current time as the engine should see it. `timezone` is the person's
 * chosen zone (`app.timezone`, docs/maties/onboarding.md); without it, or
 * when the runtime does not know it, the machine's zone is used.
 */
export function buildOpenClawLocalTimeContextPrompt(now = new Date(), timezone?: string): string {
  const timeZone = resolveTimeZone(timezone);
  const parts = zonedParts(now, timeZone);
  const utcOffset = formatUtcOffset(now, parts);

  return [
    '## Local Time Context',
    '- Treat this section as the authoritative current local time for this machine.',
    `- Current local datetime: ${formatDateTime(parts)} (timezone: ${timeZone}, UTC${utcOffset})`,
    `- Current local ISO datetime (no timezone suffix): ${formatIsoWithoutTimezone(parts)}`,
    `- Current unix timestamp (ms): ${now.getTime()}`,
    '- For relative time requests (e.g. "1 minute later", "tomorrow 9am"), compute from this local time unless the user specifies another timezone.',
    '- When calling `cron.add` with `schedule.kind: "at"`, send a future ISO 8601 timestamp with an explicit timezone offset.',
    '- Never send an `at` timestamp that is equal to or earlier than the current local time.',
  ].join('\n');
}
