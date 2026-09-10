import { describe, expect, test } from 'vitest';

import { isSearchLibraryCandidateSessionKey } from '../../../openclaw-extensions/search-library/sessionKey';

describe('search-library session key gating', () => {
  test('allows desktop sessions across agents', () => {
    expect(isSearchLibraryCandidateSessionKey('agent:main:maties:session-1')).toBe(true);
    expect(isSearchLibraryCandidateSessionKey('agent:qa-reviewer:maties:session-2')).toBe(true);
  });

  test('allows materialized subagent session candidates', () => {
    expect(isSearchLibraryCandidateSessionKey('agent:qa-reviewer:subagent:run-1')).toBe(true);
  });

  test('allows legacy desktop sessions', () => {
    expect(isSearchLibraryCandidateSessionKey('maties:session-3')).toBe(true);
  });

  test('rejects channel and malformed session keys', () => {
    expect(isSearchLibraryCandidateSessionKey('agent:main:telegram:direct:user-1')).toBe(false);
    expect(isSearchLibraryCandidateSessionKey('agent:main:discord:channel:room-1')).toBe(false);
    expect(isSearchLibraryCandidateSessionKey('agent::maties:session-4')).toBe(false);
    expect(isSearchLibraryCandidateSessionKey('agent:main:maties:')).toBe(false);
    expect(isSearchLibraryCandidateSessionKey('')).toBe(false);
  });
});
