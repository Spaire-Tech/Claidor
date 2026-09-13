/**
 * Time zones for the Welcome step: the machine's list, and a friendly
 * label (« Pacific (Los Angeles) ») derived from the zone's name and its
 * offset right now. Pure, so it is tested.
 */

const UTC_ZONES = new Set(['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT', 'Etc/Universal', 'Universal', 'Zulu', 'Etc/Zulu']);

/** Every zone the runtime knows, with the machine's zone included even when the list is short. */
export const listTimezones = (machineTimezone: string): string[] => {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  let zones: string[] = [];
  try {
    zones = intl.supportedValuesOf ? intl.supportedValuesOf('timeZone') : [];
  } catch {
    zones = [];
  }
  if (machineTimezone && !zones.includes(machineTimezone)) {
    zones = [machineTimezone, ...zones];
  }
  return zones.length > 0 ? zones : ['UTC'];
};

/** « America/Los_Angeles » → « Los Angeles »; « UTC » → « UTC ». */
export const timezoneCity = (zone: string): string => {
  const last = zone.split('/').pop() ?? zone;
  return last.replace(/_/g, ' ');
};

const timeZoneNamePart = (zone: string, now: Date, style: 'long' | 'short'): string | null => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: style }).formatToParts(now);
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? null;
  } catch {
    return null;
  }
};

/** Minutes east of UTC for the zone at `now` (Los Angeles in July: -420). */
export const timezoneOffsetMinutes = (zone: string, now: Date): number => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(now);
    const read = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? '0');
    const wallClockUtc = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second'));
    const nowSeconds = Math.floor(now.getTime() / 1000) * 1000;
    return Math.round((wallClockUtc - nowSeconds) / 60000);
  } catch {
    return 0;
  }
};

/** « GMT−7 », « GMT+5:30 », « GMT » (a real minus sign, as the design prints figures). */
export const formatTimezoneOffset = (zone: string, now: Date): string => {
  const minutes = timezoneOffsetMinutes(zone, now);
  if (minutes === 0) return 'GMT';
  const sign = minutes < 0 ? '−' : '+';
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const rest = absolute % 60;
  return `GMT${sign}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
};

/**
 * The zone's own name, shorn of « Standard Time »: « Pacific », « Central
 * European », « India ». A zone with no name (the runtime says « GMT+3 »)
 * gets its offset instead.
 */
export const timezoneRegionName = (zone: string, now: Date): string => {
  if (UTC_ZONES.has(zone)) return 'UTC';
  const long = timeZoneNamePart(zone, now, 'long');
  if (long && !/^(GMT|UTC)[+-−]?\d/.test(long)) {
    const trimmed = long
      .replace(/\s+(Standard|Daylight|Summer)\s+Time$/i, '')
      .replace(/\s+Time$/i, '')
      .trim();
    if (trimmed) return trimmed;
  }
  return formatTimezoneOffset(zone, now);
};

/** « Pacific (Los Angeles) »; « UTC » alone for the UTC zones. */
export const formatTimezoneLabel = (zone: string, now: Date = new Date()): string => {
  if (UTC_ZONES.has(zone)) return 'UTC';
  const region = timezoneRegionName(zone, now);
  const city = timezoneCity(zone);
  if (!zone.includes('/')) return region === city ? region : `${region} (${city})`;
  return `${region} (${city})`;
};

/** The option text of the picker: the label and the offset, so zones sort by eye. */
export const formatTimezoneOption = (zone: string, now: Date = new Date()): string => (
  `${formatTimezoneLabel(zone, now)} · ${formatTimezoneOffset(zone, now)}`
);
