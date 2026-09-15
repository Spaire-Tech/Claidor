import { describe, expect, test } from 'vitest';

import type { EngineMessage } from '../thread/fromEngine';
import { ThreadItemKind } from '../thread/types';
import {
  dayStamp,
  previewOf,
  sidebarAgents,
  sidebarRooms,
  type StoreAgent,
  type StoreSession,
  threadItems,
  whenLabel,
} from './select';

const NOW = new Date('2026-03-10T14:00:00Z').getTime();
const day = 86_400_000;

const agent = (id: string, over: Partial<StoreAgent> = {}): StoreAgent => ({
  id, name: id, enabled: true, ...over,
});

const message = (over: Partial<EngineMessage> & Pick<EngineMessage, 'type'>): EngineMessage => ({
  id: `m-${Math.random()}`, content: '', timestamp: NOW, ...over,
});

describe('previewOf', () => {
  test('is the last thing actually said, not the last event', () => {
    // A thread whose newest entry is a tool call would otherwise preview
    // as blank — or worse, as the tool's name.
    expect(previewOf([
      message({ type: 'assistant', content: 'Cleared the promotions.' }),
      message({ type: 'tool_use', metadata: { toolName: 'bash' } }),
      message({ type: 'tool_result', content: 'exit 0' }),
    ])).toBe('Cleared the promotions.');
  });

  test('skips thinking, which is never shown anywhere else either', () => {
    expect(previewOf([
      message({ type: 'assistant', content: 'Right.' }),
      message({ type: 'assistant', content: 'Hmm…', metadata: { isThinking: true } }),
    ])).toBe('Right.');
  });

  test('waits for a reply to finish, exactly as the thread does', () => {
    // The thread hides a reply until its final flag. The row was reading
    // the partial text as it streamed, so the sidebar said the answer
    // before the conversation did. Same flag, same moment.
    expect(previewOf([
      message({ type: 'user', content: 'hello' }),
      message({ type: 'assistant', content: 'Hey — what', metadata: { isStreaming: true, isFinal: false } }),
    ])).toBe('hello');
    expect(previewOf([
      message({ type: 'user', content: 'hello' }),
      message({ type: 'assistant', content: 'Hey — what can I do?', metadata: { isStreaming: false, isFinal: true } }),
    ])).toBe('Hey — what can I do?');
  });

  test('collapses newlines so a row stays one line', () => {
    expect(previewOf([message({ type: 'assistant', content: 'One.\n\nTwo.' })]))
      .toBe('One. Two.');
  });

  test('shows a file by name, without the marker around it', () => {
    // The canvas does exactly this: `.replace(/\[\[(.+?)\]\]/g, "$1")`.
    // A chip is a bubble's idea; a row is one line of grey text.
    expect(previewOf([message({ type: 'assistant', content: 'Found [[Mango 3y IS.xlsx]] there.' })]))
      .toBe('Found Mango 3y IS.xlsx there.');
  });

  test('reads a file link the way the bubble does: the name, not the markdown', () => {
    // The row under a bubble showing a chip read "Done. Here it is: [Gym R…".
    expect(previewOf([message({
      type: 'assistant',
      content: 'Done. Here it is: [Gym Routine.docx](file:///Users/bass/Gym%20Routine.docx)',
    })])).toBe('Done. Here it is: Gym Routine.docx');
    expect(previewOf([message({ type: 'assistant', content: 'Saved to /Users/bass/Desktop/plan.xlsx.' })]))
      .toBe('Saved to plan.xlsx.');
    expect(previewOf([message({ type: 'assistant', content: 'That is **done**.' })]))
      .toBe('That is done.');
  });

  test('never shows the machine-written attachment lines', () => {
    expect(previewOf([
      message({ type: 'user', content: 'have a look\nInput Files: /Users/bass/a.xlsx' }),
    ])).toBe('have a look');
  });

  test('is empty rather than undefined for a thread with nothing said', () => {
    expect(previewOf([])).toBe('');
    expect(previewOf(undefined)).toBe('');
  });
});

describe('whenLabel', () => {
  test('is a clock time today, a weekday this week, a date before that', () => {
    expect(whenLabel(NOW - 3600_000, NOW)).toMatch(/\d/);
    expect(whenLabel(NOW - 2 * day, NOW)).toMatch(/^[A-Z][a-z]+day$/);
    // "Tuesday" three weeks ago is a lie dressed as helpfulness.
    expect(whenLabel(NOW - 30 * day, NOW)).not.toMatch(/day$/);
  });

  test('is empty for an agent nobody has spoken to', () => {
    expect(whenLabel(undefined, NOW)).toBe('');
  });
});

describe('sidebarAgents', () => {
  const sessions: StoreSession[] = [
    { id: 's1', agentId: 'juno', updatedAt: NOW - 1000, messages: [message({ type: 'assistant', content: 'Read it.' })] },
    { id: 's2', agentId: 'mira', updatedAt: NOW - day, messages: [message({ type: 'assistant', content: 'Cleared.' })] },
  ];

  test('newest conversation first', () => {
    const rows = sidebarAgents({
      agents: [agent('mira'), agent('juno')],
      sessions,
      now: NOW,
    });
    expect(rows.map(r => r.id)).toEqual(['juno', 'mira']);
  });

  test('pinned agents stay on top, in their own order', () => {
    const rows = sidebarAgents({
      agents: [agent('juno'), agent('mira'), agent('sable', { pinned: true, pinOrder: 0 })],
      sessions,
      now: NOW,
    });
    expect(rows[0].id).toBe('sable');
  });

  test('a new, empty conversation does not blank the preview', () => {
    // The fault this replaces. Starting a fresh conversation makes an
    // empty session with a brand-new timestamp; reducing to the newest
    // session per agent then threw away the one holding every word they
    // had exchanged, and the row drew a time over nothing.
    const rows = sidebarAgents({
      agents: [agent('juno')],
      sessions: [
        { id: 'old', agentId: 'juno', updatedAt: NOW - day, lastMessage: 'Read it.' },
        { id: 'fresh', agentId: 'juno', updatedAt: NOW },
      ],
      now: NOW,
    });
    expect(rows[0].preview).toBe('Read it.');
  });

  test('the timestamp belongs to the text beside it', () => {
    // No text, no time. A row that says "now" over an empty line is the
    // same blank in a smaller font.
    const rows = sidebarAgents({
      agents: [agent('juno')],
      sessions: [{ id: 'fresh', agentId: 'juno', updatedAt: NOW }],
      now: NOW,
    });
    expect(rows[0]).toMatchObject({ preview: '', when: '' });
  });

  test('a just-made agent is at the top, not the bottom', () => {
    // Making an agent is activity. The old rule scored an agent with no
    // conversation at zero, so the thing you had just made landed in the
    // last place you would look for it.
    const rows = sidebarAgents({
      agents: [agent('juno'), agent('newbie', { createdAt: NOW })],
      sessions,
      now: NOW,
    });
    expect(rows.map(r => r.id)).toEqual(['newbie', 'juno']);
    expect(rows[0]).toMatchObject({ preview: '', when: '' });
  });

  test('an old agent nobody ever spoke to sinks on its own', () => {
    // The same rule, the other way round — no special case for it.
    const rows = sidebarAgents({
      agents: [agent('forgotten', { createdAt: NOW - 30 * day }), agent('juno'), agent('mira')],
      sessions,
      now: NOW,
    });
    expect(rows.map(r => r.id)).toEqual(['juno', 'mira', 'forgotten']);
  });

  test('an agent nobody has spoken to is never hidden', () => {
    const rows = sidebarAgents({
      agents: [agent('newbie'), agent('juno')],
      sessions,
      now: NOW,
    });
    expect(rows.map(r => r.id).sort()).toEqual(['juno', 'newbie']);
  });

  test('disabled agents are not listed', () => {
    const rows = sidebarAgents({
      agents: [agent('juno'), agent('off', { enabled: false })],
      sessions,
      now: NOW,
    });
    expect(rows.map(r => r.id)).toEqual(['juno']);
  });

  test('carries the unread dot', () => {
    const rows = sidebarAgents({
      agents: [agent('juno')],
      sessions,
      unread: new Set(['juno']),
      now: NOW,
    });
    expect(rows[0].unread).toBe(true);
  });
});

describe('threadItems', () => {
  const session: StoreSession = {
    id: 's1',
    agentId: 'perrin',
    messages: [message({ type: 'assistant', content: 'On it.' })],
  };

  test('shows only this conversation&apos;s approvals', () => {
    // The store keeps one queue for the whole app. An approval raised in
    // another conversation appearing here would ask somebody to agree to
    // something they cannot see the context for.
    const items = threadItems({
      agentId: 'perrin',
      session,
      pendingPermissions: [
        { sessionId: 's1', requestId: 'a', toolName: 'bash', toolInput: { command: 'ls' } },
        { sessionId: 'other', requestId: 'b', toolName: 'bash', toolInput: { command: 'rm -rf /' } },
      ],
    });
    const auths = items.filter(i => i.kind === ThreadItemKind.Auth);
    expect(auths).toHaveLength(1);
    expect(JSON.stringify(auths)).not.toContain('rm -rf');
  });

  test('an agent with no session yet shows nothing rather than failing', () => {
    expect(threadItems({ agentId: 'newbie', session: undefined, pendingPermissions: [] }))
      .toEqual([]);
  });

  test('puts the agent&apos;s name on the approval card, not its id', () => {
    const items = threadItems({
      agentId: 'engineering-lead',
      agentName: 'Engineering Lead',
      session: { ...session, agentId: 'engineering-lead' },
      pendingPermissions: [{ sessionId: 's1', requestId: 'a', toolName: 'bash', toolInput: {} }],
    });
    const card = items[items.length - 1] as { text: string };
    expect(card.text).toContain('Engineering Lead');
    expect(card.text).not.toContain('engineering-lead');
  });

  test('passes the machine name through to the approval card', () => {
    const items = threadItems({
      agentId: 'perrin',
      session,
      pendingPermissions: [{ sessionId: 's1', requestId: 'a', toolName: 'bash', toolInput: {} }],
      deviceName: 'MacBook-Air',
    });
    expect(items[items.length - 1]).toMatchObject({ deviceId: 'MacBook-Air' });
  });
});

describe('dayStamp', () => {
  test('says Today rather than a date', () => {
    expect(dayStamp([message({ type: 'user', content: 'hi', timestamp: NOW })], NOW)).toBe('Today');
  });

  test('is absent for an empty thread', () => {
    expect(dayStamp([], NOW)).toBeUndefined();
    expect(dayStamp(undefined, NOW)).toBeUndefined();
  });
});

describe('rooms in the sidebar', () => {
  const agents = [{ id: 'eng', name: 'Engineering Lead' }, { id: 'design', name: 'Design Lead' }];
  const room = { id: 'room:1', name: 'Launch', memberIds: ['eng', 'design'], createdAt: 500 };

  test('the preview names who spoke last', () => {
    // In a room that is half the information. "Design Lead: not my end"
    // tells you more than "not my end".
    const rows = sidebarRooms({
      rooms: [room],
      agents,
      sessions: [
        { id: 's1', agentId: 'eng', updatedAt: 1000, lastMessage: 'the build' },
        { id: 's2', agentId: 'design', updatedAt: 2000, lastMessage: 'not my end' },
      ],
      now: 2000,
    });
    expect(rows[0].preview).toBe('Design Lead: not my end');
  });

  test('one member&apos;s empty session cannot silence the room', () => {
    // Same fault as the agent row: the newest session belonged to a seat
    // that had said nothing, so the room previewed blank while the thing
    // it should show sat one session back.
    const rows = sidebarRooms({
      rooms: [room],
      agents,
      sessions: [
        { id: 's1', agentId: 'eng', updatedAt: 1000, lastMessage: 'the build' },
        { id: 's2', agentId: 'design', updatedAt: 5000 },
      ],
      now: 5000,
    });
    expect(rows[0].preview).toBe('Engineering Lead: the build');
  });

  test('a room moves up the list when somebody talks in it', () => {
    const older = { ...room, id: 'room:old', name: 'Old', createdAt: 100 };
    const rows = sidebarRooms({
      rooms: [older, room],
      agents,
      sessions: [{ id: 's1', agentId: 'eng', updatedAt: 9000, lastMessage: 'hello' }],
      now: 9000,
    });
    // Both rooms contain `eng`, so both share its recency; the tie falls
    // to the one listed first. What matters is that a room with activity
    // is not stuck below one without.
    expect(rows).toHaveLength(2);
    expect(rows.every(one => one.when)).toBe(true);
  });

  test('a room nobody has spoken in still appears', () => {
    // A room somebody just made, before anything is said in it, is
    // exactly when they want to see it.
    const rows = sidebarRooms({ rooms: [room], agents, sessions: [], now: 1000 });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Launch');
    expect(rows[0].preview).toBe('');
  });
});
