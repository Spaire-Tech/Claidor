import { describe, expect, test } from 'vitest';

import {
  buildSessionNamingExcerpt,
  buildSessionNamingPrompt,
  buildSessionTitleFromInput,
  buildSessionTitleFromModelReply,
  canNameSession,
  normalizeSessionTitleSource,
  parseModelSessionTitle,
  SESSION_NAMING_EXCERPT_MAX_CHARS,
  SESSION_TITLE_MAX_CHARS,
  SessionTitleSource,
  stripGoalCommandPrefixForDisplay,
} from './sessionTitle';

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

describe('naming a chat by what it is about', () => {
  test('only a placeholder name is open to a model call', () => {
    expect(canNameSession(SessionTitleSource.Fallback)).toBe(true);
    expect(canNameSession('')).toBe(true);
    expect(canNameSession(null)).toBe(true);
    // A name the app already wrote is finished; a name the person typed
    // wins for ever after.
    expect(canNameSession(SessionTitleSource.Assistant)).toBe(false);
    expect(canNameSession(SessionTitleSource.Person)).toBe(false);
  });

  test('an unrecognised source is read as the person’s, never as licence to rename', () => {
    expect(normalizeSessionTitleSource('imported-from-somewhere')).toBe(SessionTitleSource.Person);
    expect(canNameSession('imported-from-somewhere')).toBe(false);
  });

  test('the excerpt is capped, so one pasted contract cannot become an open cost', () => {
    const pasted = 'x'.repeat(SESSION_NAMING_EXCERPT_MAX_CHARS * 4);
    expect(buildSessionNamingExcerpt(pasted)).toHaveLength(SESSION_NAMING_EXCERPT_MAX_CHARS);
    expect(buildSessionNamingExcerpt('  a\n\n  b  ')).toBe('a b');
  });

  test('there is nothing to ask about a chat with no question in it', () => {
    expect(buildSessionNamingPrompt({ question: '   ', answer: 'hello' })).toBeNull();
    const prompt = buildSessionNamingPrompt({
      question: 'can you find last quarter’s invoices',
      answer: 'I found eleven of them.',
    });
    expect(prompt).toContain('last quarter’s invoices');
    expect(prompt).toContain('I found eleven of them.');
  });

  test('a name is taken from the reply; a sentence is not', () => {
    expect(parseModelSessionTitle('Finding last quarter’s invoices')).toBe('Finding last quarter’s invoices');
    expect(parseModelSessionTitle('"Bakery studio web page"')).toBe('Bakery studio web page');
    expect(parseModelSessionTitle('Title: Fixing the login failure')).toBe('Fixing the login failure');
    expect(parseModelSessionTitle('  Planning the move.  ')).toBe('Planning the move');
    // A model that answers with prose, a refusal or markup has not named
    // anything, and the caller keeps the truncation instead.
    expect(parseModelSessionTitle('I am sorry, but I cannot help with that request.')).toBeNull();
    expect(parseModelSessionTitle('<title>Something</title>')).toBeNull();
    expect(parseModelSessionTitle('')).toBeNull();
    expect(parseModelSessionTitle(null)).toBeNull();
    expect(parseModelSessionTitle('a'.repeat(SESSION_TITLE_MAX_CHARS + 1))).toBeNull();
  });

  test('a failed call leaves the chat with the name it already had', () => {
    expect(buildSessionTitleFromModelReply('Fixing the login failure', 'Please help me fix')).toEqual({
      title: 'Fixing the login failure',
      source: SessionTitleSource.Assistant,
    });
    // A chat is never nameless: the truncation stands, and the source stays
    // open so nothing records a name that was never written.
    expect(buildSessionTitleFromModelReply(null, 'Please help me fix')).toEqual({
      title: 'Please help me fix',
      source: SessionTitleSource.Fallback,
    });
  });
});
