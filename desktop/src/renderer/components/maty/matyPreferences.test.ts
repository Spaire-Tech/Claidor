import { MatyWorkPlace } from '@shared/maty/constants';
import { describe, expect, test } from 'vitest';

import {
  MATY_PUT_AWAY_LIMIT,
  parseMatyPutAway,
  parseMatyWorkPlace,
  withMatyJobPutAway,
} from './matyPreferences';

describe('parseMatyWorkPlace', () => {
  test('reads the cloud only when the cloud was written', () => {
    expect(parseMatyWorkPlace('cloud')).toBe(MatyWorkPlace.Cloud);
  });

  test('anything else runs here, so a bad store never sends work up by surprise', () => {
    expect(parseMatyWorkPlace('here')).toBe(MatyWorkPlace.Here);
    expect(parseMatyWorkPlace('')).toBe(MatyWorkPlace.Here);
    expect(parseMatyWorkPlace(null)).toBe(MatyWorkPlace.Here);
    expect(parseMatyWorkPlace('CLOUD')).toBe(MatyWorkPlace.Here);
    expect(parseMatyWorkPlace({ place: 'cloud' })).toBe(MatyWorkPlace.Here);
  });
});

describe('parseMatyPutAway', () => {
  test('reads the stored ids', () => {
    expect(parseMatyPutAway('["a","b"]')).toEqual(['a', 'b']);
  });

  test('anything unreadable is nothing put away', () => {
    expect(parseMatyPutAway(null)).toEqual([]);
    expect(parseMatyPutAway('')).toEqual([]);
    expect(parseMatyPutAway('not json')).toEqual([]);
    expect(parseMatyPutAway('{"a":1}')).toEqual([]);
  });

  test('drops the entries that are not ids', () => {
    expect(parseMatyPutAway('["a",null,3,"","b"]')).toEqual(['a', 'b']);
  });

  test('keeps the newest at the limit', () => {
    const ids = Array.from({ length: MATY_PUT_AWAY_LIMIT + 10 }, (_, index) => `j${index}`);
    const parsed = parseMatyPutAway(JSON.stringify(ids));
    expect(parsed).toHaveLength(MATY_PUT_AWAY_LIMIT);
    expect(parsed[parsed.length - 1]).toBe(`j${MATY_PUT_AWAY_LIMIT + 9}`);
  });
});

describe('withMatyJobPutAway', () => {
  test('adds the job at the end', () => {
    expect(withMatyJobPutAway(['a'], 'b')).toEqual(['a', 'b']);
  });

  test('putting the same job away twice leaves one of it', () => {
    expect(withMatyJobPutAway(['a', 'b'], 'a')).toEqual(['b', 'a']);
  });

  test('never grows past the limit', () => {
    const ids = Array.from({ length: MATY_PUT_AWAY_LIMIT }, (_, index) => `j${index}`);
    const next = withMatyJobPutAway(ids, 'new');
    expect(next).toHaveLength(MATY_PUT_AWAY_LIMIT);
    expect(next[next.length - 1]).toBe('new');
    expect(next[0]).toBe('j1');
  });
});
