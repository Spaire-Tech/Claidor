import { describe, expect, test } from 'vitest';

import {
  assignAvatar,
  AVATAR_COUNT,
  avatarColors,
  avatarFallback,
  AVATARS,
  avatarSeed,
  isAvatarIndex,
} from './avatars';

/** Chance, replaced by "the first candidate", so a sequence is a fact. */
const first = (): number => 0;
/** And "the last", to show the choice really is among the candidates. */
const last = (candidates: number): number => candidates - 1;

describe('the list', () => {
  test('is the canvas\'s twenty-five, three stops each', () => {
    expect(AVATAR_COUNT).toBe(25);
    for (const one of AVATARS) {
      expect(one.split(',')).toHaveLength(3);
      for (const hex of one.split(',')) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test('no two are the same', () => {
    expect(new Set(AVATARS).size).toBe(AVATAR_COUNT);
  });

  test('the seed is the canvas\'s pairing, i * 5 + 2', () => {
    // Juno is seed 2, Mira 52, Perrin 37 in the canvas — indices 0, 10, 7.
    expect(avatarSeed(0)).toBe(2);
    expect(avatarSeed(10)).toBe(52);
    expect(avatarSeed(7)).toBe(37);
    expect(AVATARS[10]).toBe('#a9c8ff,#8fb6f5,#86d4e8');
    expect(AVATARS[7]).toBe('#ffe3c7,#ffcdb2,#f7bfae');
  });

  test('colours come back as a list', () => {
    expect(avatarColors(0)).toEqual(['#8fd3f4', '#b9c4ee', '#f7b2d9']);
  });
});

describe('the founder\'s rule: the first twenty-five are all different', () => {
  test('twenty-five agents in a row get twenty-five different avatars', () => {
    const worn: number[] = [];
    for (let i = 0; i < AVATAR_COUNT; i += 1) worn.push(assignAvatar(worn, first));
    expect(new Set(worn).size).toBe(AVATAR_COUNT);
  });

  test('whichever way chance falls', () => {
    const worn: number[] = [];
    for (let i = 0; i < AVATAR_COUNT; i += 1) worn.push(assignAvatar(worn, last));
    expect(new Set(worn).size).toBe(AVATAR_COUNT);
  });

  test('and with real chance, a thousand times over', () => {
    for (let run = 0; run < 1000; run += 1) {
      const worn: number[] = [];
      for (let i = 0; i < AVATAR_COUNT; i += 1) worn.push(assignAvatar(worn));
      expect(new Set(worn).size).toBe(AVATAR_COUNT);
    }
  });
});

describe('after twenty-five, we re-do', () => {
  test('the twenty-sixth wears one somebody already wears', () => {
    const worn = Array.from({ length: AVATAR_COUNT }, (_, i) => i);
    expect(isAvatarIndex(assignAvatar(worn, first))).toBe(true);
  });

  test('and it is the least worn, so the second round is also all different', () => {
    const worn = Array.from({ length: AVATAR_COUNT }, (_, i) => i);
    const second: number[] = [];
    for (let i = 0; i < AVATAR_COUNT; i += 1) {
      const next = assignAvatar([...worn, ...second], first);
      second.push(next);
    }
    expect(new Set(second).size).toBe(AVATAR_COUNT);
  });

  test('a worn-thrice avatar is never handed out while others are worn twice', () => {
    const worn = [...Array.from({ length: AVATAR_COUNT }, (_, i) => i), 3, 3];
    for (let run = 0; run < 200; run += 1) {
      expect(assignAvatar(worn)).not.toBe(3);
    }
  });
});

describe('what deleting does', () => {
  test('frees the avatar for the next agent', () => {
    // Twenty-four agents, then one deleted — its avatar is the only free
    // one, so it is the only answer.
    const worn = Array.from({ length: AVATAR_COUNT }, (_, i) => i).filter(i => i !== 17);
    expect(assignAvatar(worn, first)).toBe(17);
    expect(assignAvatar(worn, last)).toBe(17);
  });
});

describe('what is ignored', () => {
  test('agents from before avatars existed do not count against a slot', () => {
    // `null` is an unbackfilled row; it must not make avatar 0 look worn.
    expect(assignAvatar([null, undefined, -1, 99, 2.5], first)).toBe(0);
  });

  test('a chooser that misbehaves is clamped rather than trusted', () => {
    expect(isAvatarIndex(assignAvatar([], () => 999))).toBe(true);
    expect(isAvatarIndex(assignAvatar([], () => -5))).toBe(true);
  });
});

describe('the fallback for things without one', () => {
  test('is stable and inside the list', () => {
    const a = avatarFallback('room:launch');
    expect(avatarFallback('room:launch')).toBe(a);
    expect(isAvatarIndex(a)).toBe(true);
  });
});

describe('isAvatarIndex', () => {
  test('accepts exactly 0..24 as integers', () => {
    expect(isAvatarIndex(0)).toBe(true);
    expect(isAvatarIndex(24)).toBe(true);
    expect(isAvatarIndex(25)).toBe(false);
    expect(isAvatarIndex(-1)).toBe(false);
    expect(isAvatarIndex(1.5)).toBe(false);
    expect(isAvatarIndex('3')).toBe(false);
    expect(isAvatarIndex(null)).toBe(false);
  });
});
