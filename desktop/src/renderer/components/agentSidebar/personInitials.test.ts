import { describe, expect, test } from 'vitest';

import { getPersonFirstName, getPersonInitials } from './personInitials';

describe('getPersonInitials', () => {
  test('takes the first letter of the first and last word', () => {
    expect(getPersonInitials('Emma Watson')).toBe('EW');
    expect(getPersonInitials('  jean  claude   van damme ')).toBe('JD');
  });

  test('uses one letter for a single word', () => {
    expect(getPersonInitials('emma')).toBe('E');
  });

  test('reads an email address by its local part', () => {
    expect(getPersonInitials('emma.watson@example.com')).toBe('EW');
    expect(getPersonInitials('bxss@example.com')).toBe('B');
  });

  test('ignores punctuation and empty names', () => {
    expect(getPersonInitials('"Emma" (Watson)')).toBe('EW');
    expect(getPersonInitials('')).toBe('');
    expect(getPersonInitials(null)).toBe('');
    expect(getPersonInitials('   ')).toBe('');
  });
});

describe('getPersonFirstName', () => {
  test('returns the first word', () => {
    expect(getPersonFirstName('Emma Watson', 'Me')).toBe('Emma');
  });

  test('returns the local part of an email', () => {
    expect(getPersonFirstName('emma@example.com', 'Me')).toBe('emma');
  });

  test('falls back when there is no name', () => {
    expect(getPersonFirstName(undefined, 'Me')).toBe('Me');
    expect(getPersonFirstName('   ', 'Me')).toBe('Me');
  });
});
