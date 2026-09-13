import {
  HtmlShareErrorCode,
  HtmlShareFailureKind,
} from '@shared/htmlShare/constants';
import { describe, expect, test } from 'vitest';

import { formatHtmlShareFailure } from './htmlShareErrorPresentation';

describe('formatHtmlShareFailure', () => {
  test('localizes an input-too-long failure instead of displaying its raw error', () => {
    expect(formatHtmlShareFailure({
      failureKind: HtmlShareFailureKind.InputTooLong,
      error: 'content is too long.',
    })).toBe('The content exceeds the sharing size limit.');
  });

  test('formats a file size limit', () => {
    expect(formatHtmlShareFailure({
      failureKind: HtmlShareFailureKind.FileTooLarge,
      details: { limitBytes: 10 * 1024 * 1024 },
      error: 'File is too large to share.',
    })).toBe('The file is too large. Maximum size: 10 MB.');
  });

  test('localizes the server too-large error code', () => {
    expect(formatHtmlShareFailure({
      code: HtmlShareErrorCode.TooLarge,
      error: 'Share content is too large.',
    })).toBe('The share content exceeds the size limit.');
    expect(formatHtmlShareFailure({
      code: HtmlShareErrorCode.TooLarge,
      error: 'payload exceeds server limit',
    })).toBe('The share content exceeds the size limit.');
  });

  test('uses a generic message for unknown raw errors', () => {
    expect(formatHtmlShareFailure({ error: 'socket hang up' })).toBe(
      'Sharing failed. Please try again later.',
    );
    expect(formatHtmlShareFailure({ error: 'internal service error' })).toBe(
      'Sharing failed. Please try again later.',
    );
  });
});
