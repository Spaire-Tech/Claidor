import { describe, expect, test } from 'vitest';

import { type ThreadItem, ThreadItemKind } from '../thread/types';
import { mergeRoomThread, type RoomMemberThread, roomTyping } from './room';

const said = (text: string, at: number, from: 'person' | 'agent' = 'agent'): ThreadItem => ({
  kind: ThreadItemKind.Text, id: `${from}-${at}-${text}`, from, text, at,
});

const member = (
  agentId: string, agentName: string, items: readonly ThreadItem[],
): RoomMemberThread => ({ agentId, agentName, items });

describe('what a person sees when several agents answer at once', () => {
  test('the message they typed appears once, not once per member', () => {
    // Every member's session has a copy, because it was sent to all of
    // them. Four identical bubbles of what somebody just typed is the
    // most obviously wrong thing this screen could do.
    const merged = mergeRoomThread([
      member('eng', 'Engineering Lead', [said('What broke?', 1000, 'person'), said('The build.', 2000)]),
      member('design', 'Design Lead', [said('What broke?', 1000, 'person'), said('Not my end.', 2100)]),
    ]);

    expect(merged.filter(one => one.kind === ThreadItemKind.Text && one.from === 'person'))
      .toHaveLength(1);
    expect(merged).toHaveLength(3);
  });

  test('a copy that arrived a few hundred milliseconds later is still the same message', () => {
    // The fan-out does not reach every session in the same millisecond.
    const merged = mergeRoomThread([
      member('a', 'A', [said('Hello', 1_000, 'person')]),
      member('b', 'B', [said('Hello', 1_400, 'person')]),
    ]);
    expect(merged).toHaveLength(1);
  });

  test('two copies either side of a rounding boundary are still one message', () => {
    // The first version of this bucketed by whole seconds, so 1.4s and
    // 1.6s became two different messages and the person saw their own
    // sentence twice. Found by writing the boundary down rather than by
    // seeing it in the app.
    const merged = mergeRoomThread([
      member('a', 'A', [said('Hello', 1_400, 'person')]),
      member('b', 'B', [said('Hello', 1_600, 'person')]),
    ]);
    expect(merged).toHaveLength(1);
  });

  test('the same words typed again much later are a new message', () => {
    // People do say "yes" twice.
    const merged = mergeRoomThread([
      member('a', 'A', [said('yes', 1_000, 'person'), said('yes', 90_000, 'person')]),
    ]);
    expect(merged).toHaveLength(2);
  });

  test('two different questions both survive', () => {
    const merged = mergeRoomThread([
      member('a', 'A', [said('First', 1000, 'person'), said('Second', 9000, 'person')]),
      member('b', 'B', [said('First', 1000, 'person'), said('Second', 9000, 'person')]),
    ]);
    expect(merged).toHaveLength(2);
  });

  test('everything is in the order it was said', () => {
    const merged = mergeRoomThread([
      member('a', 'A', [said('third', 3000)]),
      member('b', 'B', [said('first', 1000), said('fourth', 4000)]),
      member('c', 'C', [said('second', 2000)]),
    ]);
    expect(merged.map(one => (one as { text: string }).text))
      .toEqual(['first', 'second', 'third', 'fourth']);
  });

  test('every bubble says who said it', () => {
    // Without this a room is four anonymous voices.
    const merged = mergeRoomThread([
      member('eng', 'Engineering Lead', [said('The build.', 2000)]),
    ]);
    expect(merged[0]).toMatchObject({ agentId: 'eng', agentName: 'Engineering Lead' });
  });
});

describe('keeping a room readable', () => {
  test('a long answer is trimmed to two bubbles', () => {
    // Three short bubbles reads like texting in a one-to-one thread. In a
    // room of four it is twelve bubbles for one question.
    const merged = mergeRoomThread([
      member('a', 'A', [said('one', 1000), said('two', 1100), said('three', 1200)]),
    ]);
    expect(merged).toHaveLength(2);
  });

  test('the part that is trimmed is folded away, not thrown away', () => {
    // Losing the end of somebody's answer to a layout rule is the app
    // quietly eating content.
    const merged = mergeRoomThread([
      member('a', 'A', [said('one', 1000), said('two', 1100), said('three', 1200), said('four', 1300)]),
    ]);
    const last = merged[merged.length - 1] as { details?: string };
    expect(last.details).toBe('three\n\nfour');
  });

  test('a run that is already short is untouched', () => {
    const merged = mergeRoomThread([member('a', 'A', [said('one', 1000), said('two', 1100)])]);
    expect(merged).toHaveLength(2);
    expect((merged[1] as { details?: string }).details).toBeUndefined();
  });

  test('a person speaking between two answers starts a new run', () => {
    const merged = mergeRoomThread([
      member('a', 'A', [
        said('one', 1000), said('two', 1100), said('three', 1200),
        said('and?', 1300, 'person'),
        said('four', 1400), said('five', 1500), said('six', 1600),
      ]),
    ]);
    // Two kept from each run, plus the person's message.
    expect(merged).toHaveLength(5);
  });
});

describe('what a room does not show', () => {
  test('cards belonging to one agent stay in that agent’s conversation', () => {
    // Answering an approval in a room would silently be answering it on
    // behalf of a conversation the person did not open.
    const cards: ThreadItem[] = [
      { kind: ThreadItemKind.Auth, id: 'auth', text: 'Allow?', at: 2000 },
      { kind: ThreadItemKind.Choice, id: 'choice', text: 'Which?', options: [], at: 2100 },
      { kind: ThreadItemKind.Secret, id: 'secret', text: 'Password', fields: [], at: 2200 },
    ];
    const merged = mergeRoomThread([member('a', 'A', [said('working', 1000), ...cards])]);
    expect(merged).toHaveLength(1);
  });

  test('a system line still comes through', () => {
    // "Perrin can run commands from now on" is about the room's members
    // and belongs where the person is looking.
    const merged = mergeRoomThread([
      member('a', 'A', [{ kind: ThreadItemKind.System, id: 's', text: 'Allowed.', at: 1000 }]),
    ]);
    expect(merged).toHaveLength(1);
  });
});

describe('roomTyping', () => {
  test('the room is working while any member is', () => {
    // The person is waiting for the room, not for an agent.
    expect(roomTyping([false, true, false])).toBe(true);
    expect(roomTyping([false, false])).toBe(false);
    expect(roomTyping([])).toBe(false);
  });
});
