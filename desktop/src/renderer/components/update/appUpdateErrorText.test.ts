import { describe, expect, test } from 'vitest';

import {
  APP_UPDATE_ELEVATION_DECLINED_ERROR,
  APP_UPDATE_FILE_INVALID_ERROR,
  APP_UPDATE_URL_UNTRUSTED_ERROR,
} from '../../../shared/appUpdate/constants';
import { formatAppUpdateError } from './appUpdateErrorText';

describe('formatAppUpdateError', () => {
  test('localizes stable Windows update errors', () => {
    expect(formatAppUpdateError(APP_UPDATE_ELEVATION_DECLINED_ERROR)).toContain(
      'system authorization',
    );
    expect(formatAppUpdateError(APP_UPDATE_URL_UNTRUSTED_ERROR)).toContain(
      'HTTPS safety requirements',
    );
    expect(formatAppUpdateError(APP_UPDATE_FILE_INVALID_ERROR)).toContain(
      'failed validation',
    );
  });

  test('preserves unknown operating-system messages', () => {
    expect(formatAppUpdateError('Access is denied.')).toBe('Access is denied.');
  });
});
