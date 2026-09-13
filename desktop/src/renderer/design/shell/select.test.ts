import { describe, expect, test } from 'vitest';

import type { EngineMessage } from '../thread/fromEngine';
import { ThreadItemKind } from '../thread/types';
import {
  dayStamp,
  previewOf,
  sidebarAgents,
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

  test('collapses newlines so a row stays one line', () => {
    expect(previewOf([message({ type: 'assistant', content: 'One.\n\nTwo.' })]))
      .toBe('One. Two.');
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
  const sessions: Record<string, StoreSession> = {
    juno: { id: 's1', agentId: 'juno', updatedAt: NOW - 1000, messages: [message({ type: 'assistant', content: 'Read it.' })] },
    mira: { id: 's2', agentId: 'mira', updatedAt: NOW - day, messages: [message({ type: 'assistant', content: 'Cleared.' })] },
  };

  test('newest conversation first', () => {
    const rows = sidebarAgents({
      agents: [agent('mira'), agent('juno')],
      sessionsByAgent: sessions,
      now: NOW,
    });
    expect(rows.map(r => r.id)).toEqual(['juno', 'mira']);
  });

  test('pinned agents stay on top, in their own order', () => {
    const rows = sidebarAgents({
      agents: [agent('juno'), agent('mira'), agent('sable', { pinned: true, pinOrder: 0 })],
      sessionsByAgent: sessions,
      now: NOW,
    });
    expect(rows[0].id).toBe('sable');
  });

  test('an agent nobody has spoken to is last, never hidden', () => {
    // A freshly installed role agent has to be findable before it has a
    // history.
    const rows = sidebarAgents({
      agents: [agent('newbie'), agent('juno')],
      sessionsByAgent: sessions,
      now: NOW,
    });
    expect(rows.map(r => r.id)).toEqual(['juno', 'newbie']);
    expect(rows[1]).toMatchObject({ preview: '', when: '' });
  });

  test('disabled agents are not listed', () => {
    const rows = sidebarAgents({
      agents: [agent('juno'), agent('off', { enabled: false })],
      sessionsByAgent: sessions,
      now: NOW,
    });
    expect(rows.map(r => r.id)).toEqual(['juno']);
  });

  test('carries the unread dot', () => {
    const rows = sidebarAgents({
      agents: [agent('juno')],
      sessionsByAgent: sessions,
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
