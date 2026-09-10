import { describe, expect, test } from 'vitest';

import { LibraryContentPhase } from '../../../shared/library/contentConstants';
import {
  describeLibraryCloudOnly,
  describeLibraryDocuments,
  describeLibraryFailures,
  describeLibraryPhase,
  formatLibraryCount,
  formatLibraryRelativeTime,
} from './librarySettingsText';

// A copy of the English words from i18n.ts; the test must not import the
// i18n service (it reaches into the renderer config service).
const words: Record<string, string> = {
  librarySettingsPhaseOff: 'Off',
  librarySettingsPhaseStarting: 'Starting up',
  librarySettingsPhaseScanning: 'Looking for documents',
  librarySettingsPhaseIndexing: 'Reading documents… {count} to go',
  librarySettingsPhaseIdle: 'Up to date',
  librarySettingsPhasePaused: 'Paused',
  librarySettingsPhaseError: 'Could not start: {error}',
  librarySettingsPhaseErrorNoDetail: 'Could not start.',
  librarySettingsDocumentsOne: '1 document',
  librarySettingsDocumentsMany: '{count} documents',
  librarySettingsLastUpdated: 'last updated {time}',
  librarySettingsFailedOne: '1 file could not be read',
  librarySettingsFailedMany: '{count} files could not be read',
  librarySettingsCloudOnlyOne: '1 file is in iCloud but not on this Mac. Open it once to bring it here.',
  librarySettingsCloudOnlyMany: '{count} files are in iCloud but not on this Mac. Open them once to bring them here.',
  librarySettingsTimeJustNow: 'just now',
  librarySettingsTimeMinuteAgo: '1 minute ago',
  librarySettingsTimeMinutesAgo: '{count} minutes ago',
  librarySettingsTimeHourAgo: '1 hour ago',
  librarySettingsTimeHoursAgo: '{count} hours ago',
  librarySettingsTimeYesterday: 'yesterday',
};

const t = (key: string): string => {
  const value = words[key];
  if (value === undefined) throw new Error(`missing word for ${key}`);
  return value;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// A local noon, so the date words are the same in every timezone.
const now = new Date(2026, 8, 9, 12, 0, 0).getTime();

describe('formatLibraryRelativeTime', () => {
  test('says just now inside the first minute', () => {
    expect(formatLibraryRelativeTime(now, now, t)).toBe('just now');
    expect(formatLibraryRelativeTime(now - 59_000, now, t)).toBe('just now');
    expect(formatLibraryRelativeTime(now + 5_000, now, t)).toBe('just now');
  });

  test('counts minutes and hours with the singular form', () => {
    expect(formatLibraryRelativeTime(now - MINUTE, now, t)).toBe('1 minute ago');
    expect(formatLibraryRelativeTime(now - 2 * MINUTE, now, t)).toBe('2 minutes ago');
    expect(formatLibraryRelativeTime(now - 59 * MINUTE, now, t)).toBe('59 minutes ago');
    expect(formatLibraryRelativeTime(now - HOUR, now, t)).toBe('1 hour ago');
    expect(formatLibraryRelativeTime(now - 3 * HOUR, now, t)).toBe('3 hours ago');
    expect(formatLibraryRelativeTime(now - 23 * HOUR, now, t)).toBe('23 hours ago');
  });

  test('says yesterday between one and two days', () => {
    expect(formatLibraryRelativeTime(now - DAY, now, t)).toBe('yesterday');
    expect(formatLibraryRelativeTime(now - 2 * DAY + 1, now, t)).toBe('yesterday');
  });

  test('falls back to a short date beyond two days', () => {
    expect(formatLibraryRelativeTime(now - 2 * DAY, now, t)).toBe('Sep 7, 2026');
    expect(formatLibraryRelativeTime(new Date(2025, 0, 15, 12).getTime(), now, t)).toBe('Jan 15, 2025');
  });
});

describe('describeLibraryPhase', () => {
  test('uses plain words for every phase', () => {
    const base = { queuedCount: 0 };
    expect(describeLibraryPhase({ ...base, phase: LibraryContentPhase.Off }, t)).toBe('Off');
    expect(describeLibraryPhase({ ...base, phase: LibraryContentPhase.Starting }, t)).toBe('Starting up');
    expect(describeLibraryPhase({ ...base, phase: LibraryContentPhase.Scanning }, t)).toBe('Looking for documents');
    expect(describeLibraryPhase({ ...base, phase: LibraryContentPhase.Idle }, t)).toBe('Up to date');
    expect(describeLibraryPhase({ ...base, phase: LibraryContentPhase.Paused }, t)).toBe('Paused');
  });

  test('shows the queued count with thousands separators while reading', () => {
    expect(describeLibraryPhase({ phase: LibraryContentPhase.Indexing, queuedCount: 7 }, t))
      .toBe('Reading documents… 7 to go');
    expect(describeLibraryPhase({ phase: LibraryContentPhase.Indexing, queuedCount: 1240 }, t))
      .toBe('Reading documents… 1,240 to go');
  });

  test('shows the error in plain words, with a fallback when there is none', () => {
    expect(describeLibraryPhase({ phase: LibraryContentPhase.Error, queuedCount: 0, error: 'The reader is missing.' }, t))
      .toBe('Could not start: The reader is missing.');
    expect(describeLibraryPhase({ phase: LibraryContentPhase.Error, queuedCount: 0, error: '  ' }, t))
      .toBe('Could not start.');
    expect(describeLibraryPhase({ phase: LibraryContentPhase.Error, queuedCount: 0 }, t))
      .toBe('Could not start.');
  });
});

describe('describeLibraryDocuments', () => {
  test('joins the count and the relative time', () => {
    expect(describeLibraryDocuments({ documentCount: 1240, lastIndexedAt: now - 2 * MINUTE }, now, t))
      .toBe('1,240 documents, last updated 2 minutes ago');
    expect(describeLibraryDocuments({ documentCount: 1, lastIndexedAt: now }, now, t))
      .toBe('1 document, last updated just now');
  });

  test('leaves out the time when nothing was indexed yet', () => {
    expect(describeLibraryDocuments({ documentCount: 0 }, now, t)).toBe('0 documents');
    expect(describeLibraryDocuments({ documentCount: 3, lastIndexedAt: 0 }, now, t)).toBe('3 documents');
  });
});

describe('describeLibraryFailures', () => {
  test('is empty unless files failed', () => {
    expect(describeLibraryFailures({ failedCount: 0 }, t)).toBe('');
    expect(describeLibraryFailures({ failedCount: 1 }, t)).toBe('1 file could not be read');
    expect(describeLibraryFailures({ failedCount: 2500 }, t)).toBe('2,500 files could not be read');
    expect(describeLibraryCloudOnly({ cloudOnlyCount: 0 }, t)).toBe('');
    expect(describeLibraryCloudOnly({ cloudOnlyCount: 5893 }, t)).toBe('5,893 files are in iCloud but not on this Mac. Open them once to bring them here.');
  });
});

describe('formatLibraryCount', () => {
  test('uses thousands separators only', () => {
    expect(formatLibraryCount(0)).toBe('0');
    expect(formatLibraryCount(999)).toBe('999');
    expect(formatLibraryCount(1_000_000)).toBe('1,000,000');
    expect(formatLibraryCount(-4)).toBe('0');
    expect(formatLibraryCount(Number.NaN)).toBe('0');
  });
});
