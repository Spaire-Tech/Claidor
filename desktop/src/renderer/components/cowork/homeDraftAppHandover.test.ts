import { describe, expect, test } from 'vitest';

import { resolveHomeDraftAppHandover } from './homeDraftAppHandover';

const HOME = '';
const SESSION = 'session-1';

describe('resolveHomeDraftAppHandover', () => {
  test('carries the home choice into the conversation it starts', () => {
    expect(resolveHomeDraftAppHandover({
      previousSessionId: HOME,
      nextSessionId: SESSION,
      homeAppSlug: 'gmail',
    })).toBe('gmail');
  });

  test('carries nothing when nothing was chosen', () => {
    expect(resolveHomeDraftAppHandover({
      previousSessionId: HOME,
      nextSessionId: SESSION,
    })).toBeNull();
  });

  test('does not reach into a conversation opened later', () => {
    // The composer moving from one conversation to another must not drag a
    // choice made on the home screen along with it.
    expect(resolveHomeDraftAppHandover({
      previousSessionId: 'session-0',
      nextSessionId: SESSION,
      homeAppSlug: 'gmail',
    })).toBeNull();
  });

  test('does not overwrite a choice the conversation already has', () => {
    expect(resolveHomeDraftAppHandover({
      previousSessionId: HOME,
      nextSessionId: SESSION,
      homeAppSlug: 'gmail',
      existingAppSlug: 'slack',
    })).toBeNull();
  });

  test('carries nothing while still on the home screen', () => {
    expect(resolveHomeDraftAppHandover({
      previousSessionId: HOME,
      nextSessionId: HOME,
      homeAppSlug: 'gmail',
    })).toBeNull();
  });
});
