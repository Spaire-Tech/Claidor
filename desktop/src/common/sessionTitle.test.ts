import { expect, test } from 'vitest';

import { buildSessionTitleFromInput, SESSION_TITLE_MAX_CHARS, stripGoalCommandPrefixForDisplay } from './sessionTitle';

test('builds title from the first characters of text input', () => {
  expect(buildSessionTitleFromInput('Please help me fix the login failure', 'New Chat')).toBe('Please help me fix the login failure');
});

test('collapses whitespace before taking the title prefix', () => {
  expect(buildSessionTitleFromInput('\n  first line\nsecond line  ', 'New Chat')).toBe('first line second line');
});

test('uses the localized default title for image-only input', () => {
  expect(buildSessionTitleFromInput('   ', 'New Chat')).toBe('New Chat');
});

test('strips goal command prefixes from generated titles', () => {
  expect(buildSessionTitleFromInput('/goal start Build a bakery studio web page for me', 'New Chat')).toBe('Build a bakery studio web page for me');
  expect(buildSessionTitleFromInput('/goal set Ship the landing page', 'New Chat')).toBe('Ship the landing page');
});

test('preserves non-start goal commands for display', () => {
  expect(stripGoalCommandPrefixForDisplay('/goal status')).toBe('/goal status');
});

test('caps generated titles to the maximum length', () => {
  const input = 'a'.repeat(SESSION_TITLE_MAX_CHARS + 10);
  expect(buildSessionTitleFromInput(input, 'New Chat')).toBe('a'.repeat(SESSION_TITLE_MAX_CHARS));
});
