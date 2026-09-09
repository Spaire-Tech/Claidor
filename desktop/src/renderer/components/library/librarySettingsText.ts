/**
 * Plain words for the Settings → Library screen.
 *
 * Pure functions only: no React, no Electron, no i18n service. The caller
 * passes its own `t(key)` so the module can be unit tested with a small
 * dictionary. Every key it uses is prefixed `librarySettings`.
 */
import {
  LibraryContentPhase,
  type LibraryContentStatus,
} from '../../../shared/library/contentConstants';

export type LibrarySettingsTranslate = (key: string) => string;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Thousands separators only; no decimals, no abbreviations. */
export const formatLibraryCount = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) return '0';
  return Math.round(value).toLocaleString('en-US');
};

const fill = (template: string, values: Record<string, string>): string => (
  Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(value),
    template,
  )
);

/**
 * "just now", "2 minutes ago", "3 hours ago", "yesterday", or a short date
 * such as "Sep 7, 2026" for anything older than two days.
 */
export const formatLibraryRelativeTime = (
  timestamp: number,
  now: number,
  t: LibrarySettingsTranslate,
): string => {
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < MINUTE_MS) return t('librarySettingsTimeJustNow');
  if (elapsed < HOUR_MS) {
    const minutes = Math.floor(elapsed / MINUTE_MS);
    return minutes === 1
      ? t('librarySettingsTimeMinuteAgo')
      : fill(t('librarySettingsTimeMinutesAgo'), { count: formatLibraryCount(minutes) });
  }
  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    return hours === 1
      ? t('librarySettingsTimeHourAgo')
      : fill(t('librarySettingsTimeHoursAgo'), { count: formatLibraryCount(hours) });
  }
  if (elapsed < 2 * DAY_MS) return t('librarySettingsTimeYesterday');
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/** What the library is doing right now, in plain words. */
export const describeLibraryPhase = (
  status: Pick<LibraryContentStatus, 'phase' | 'queuedCount' | 'error'>,
  t: LibrarySettingsTranslate,
): string => {
  switch (status.phase) {
    case LibraryContentPhase.Off:
      return t('librarySettingsPhaseOff');
    case LibraryContentPhase.Starting:
      return t('librarySettingsPhaseStarting');
    case LibraryContentPhase.Scanning:
      return t('librarySettingsPhaseScanning');
    case LibraryContentPhase.Indexing:
      return fill(t('librarySettingsPhaseIndexing'), {
        count: formatLibraryCount(status.queuedCount),
      });
    case LibraryContentPhase.Idle:
      return t('librarySettingsPhaseIdle');
    case LibraryContentPhase.Paused:
      return t('librarySettingsPhasePaused');
    case LibraryContentPhase.Error: {
      const error = (status.error ?? '').trim();
      return error
        ? fill(t('librarySettingsPhaseError'), { error })
        : t('librarySettingsPhaseErrorNoDetail');
    }
    default:
      return t('librarySettingsPhaseIdle');
  }
};

/** "1,240 documents, last updated 2 minutes ago" (the second half only when known). */
export const describeLibraryDocuments = (
  status: Pick<LibraryContentStatus, 'documentCount' | 'lastIndexedAt'>,
  now: number,
  t: LibrarySettingsTranslate,
): string => {
  const documents = status.documentCount === 1
    ? t('librarySettingsDocumentsOne')
    : fill(t('librarySettingsDocumentsMany'), { count: formatLibraryCount(status.documentCount) });
  if (typeof status.lastIndexedAt !== 'number' || status.lastIndexedAt <= 0) {
    return documents;
  }
  const updated = fill(t('librarySettingsLastUpdated'), {
    time: formatLibraryRelativeTime(status.lastIndexedAt, now, t),
  });
  return `${documents}, ${updated}`;
};

/** "3 files could not be read", or '' when every file was read. */
export const describeLibraryFailures = (
  status: Pick<LibraryContentStatus, 'failedCount'>,
  t: LibrarySettingsTranslate,
): string => {
  if (!(status.failedCount > 0)) return '';
  return status.failedCount === 1
    ? t('librarySettingsFailedOne')
    : fill(t('librarySettingsFailedMany'), { count: formatLibraryCount(status.failedCount) });
};
