import { describe, expect, test } from 'vitest';

import {
  isRoomId,
  ROOM_MAX_MEMBERS,
  ROOM_MIN_MEMBERS,
  RoomError,
  roomId,
  roomProblem,
  roomProblemText,
} from './constants';

const known = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

describe('whether a room can be made', () => {
  test('a name and two members is a room', () => {
    expect(roomProblem({ name: 'Launch', memberIds: ['a', 'b'] }, known)).toBeUndefined();
  });

  test('one member is a conversation, not a room', () => {
    // Two ways to do the same thing, and the one with a name and a member
    // list is the worse of the two.
    expect(roomProblem({ name: 'Launch', memberIds: ['a'] }, known)).toBe(RoomError.TooFew);
  });

  test('too many is refused, because everybody answers everything', () => {
    const tooMany = known.slice(0, ROOM_MAX_MEMBERS + 1);
    expect(roomProblem({ name: 'Launch', memberIds: tooMany }, known)).toBe(RoomError.TooMany);
    expect(roomProblem({ name: 'Launch', memberIds: known.slice(0, ROOM_MAX_MEMBERS) }, known))
      .toBeUndefined();
  });

  test('a nameless room is refused', () => {
    expect(roomProblem({ name: '   ', memberIds: ['a', 'b'] }, known)).toBe(RoomError.NoName);
  });

  test('the same agent twice is refused', () => {
    expect(roomProblem({ name: 'Launch', memberIds: ['a', 'a'] }, known)).toBe(RoomError.Duplicate);
  });

  test('an agent that no longer exists is refused', () => {
    expect(roomProblem({ name: 'Launch', memberIds: ['a', 'gone'] }, known))
      .toBe(RoomError.Unknown);
  });
});

describe('what a person is told when it will not work', () => {
  test('every reason says which thing is wrong', () => {
    // "That did not work" is the least useful sentence in software.
    for (const problem of Object.values(RoomError)) {
      const text = roomProblemText(problem);
      expect(text.length, problem).toBeGreaterThan(10);
      expect(text, problem).not.toMatch(/error|invalid|failed/i);
    }
  });

  test('the counts in the text are the counts in the code', () => {
    expect(roomProblemText(RoomError.TooFew)).toContain(String(ROOM_MIN_MEMBERS));
    expect(roomProblemText(RoomError.TooMany)).toContain(String(ROOM_MAX_MEMBERS));
  });
});

describe('room ids', () => {
  test('a room and an agent can share one selection', () => {
    // The sidebar, the shell and the composer pass one "what is open" id
    // around. Prefixing keeps that one value rather than a value and a
    // kind, which is the sort of pair that gets out of step.
    expect(isRoomId('room:abc')).toBe(true);
    expect(isRoomId('engineering-lead')).toBe(false);
    expect(isRoomId(undefined)).toBe(false);
  });

  test('prefixing twice does not double it', () => {
    expect(roomId('abc')).toBe('room:abc');
    expect(roomId('room:abc')).toBe('room:abc');
  });
});
