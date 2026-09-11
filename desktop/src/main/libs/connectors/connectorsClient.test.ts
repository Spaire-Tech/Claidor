import { describe, expect, test } from 'vitest';

import { parseConnectorLink, parseConnectorsState } from './connectorsClient';

describe('parseConnectorsState', () => {
  test('reads the answer of GET /api/connectors', () => {
    expect(parseConnectorsState({
      entitled: true,
      connections: [{ slug: 'gmail', accountId: 'a1', connectedAt: '2026-09-11T08:00:00Z' }],
    })).toEqual({
      entitled: true,
      connections: [{ slug: 'gmail', accountId: 'a1', connectedAt: '2026-09-11T08:00:00Z' }],
      loaded: true,
    });
  });

  test('reads the same answer wrapped in the account protocol envelope', () => {
    const wrapped = parseConnectorsState({ code: 0, data: { entitled: true, connections: [] } });
    expect(wrapped).toEqual({ entitled: true, connections: [], loaded: true });
  });

  test('keeps the account name when Claidor sends one', () => {
    const state = parseConnectorsState({
      entitled: true,
      connections: [{ slug: 'gmail', accountId: 'a1', connectedAt: '', name: 'work@example.com' }],
    });
    expect(state.connections[0].name).toBe('work@example.com');
  });

  test('drops entries it cannot read rather than inventing them', () => {
    const state = parseConnectorsState({
      entitled: true,
      connections: [{ slug: 'gmail' }, null, { accountId: 'a2' }, { slug: 'notion', accountId: 'a3' }],
    });
    expect(state.connections).toEqual([{ slug: 'notion', accountId: 'a3', connectedAt: '' }]);
  });

  test('an answer it cannot read is « nothing connected », never « entitled »', () => {
    expect(parseConnectorsState(null)).toEqual({ entitled: false, connections: [], loaded: true });
    expect(parseConnectorsState({ entitled: 'yes' }).entitled).toBe(false);
  });
});

describe('parseConnectorLink', () => {
  test('reads the sign-in address', () => {
    expect(parseConnectorLink({ url: 'https://connect.example.com/x', expiresAt: '2026-09-11T09:00:00Z' }))
      .toEqual({ url: 'https://connect.example.com/x', expiresAt: '2026-09-11T09:00:00Z' });
  });

  test('refuses anything that is not an https address', () => {
    expect(parseConnectorLink({ url: 'http://connect.example.com/x' })).toBeNull();
    expect(parseConnectorLink({ url: 'javascript:alert(1)' })).toBeNull();
    expect(parseConnectorLink({ url: 'file:///etc/passwd' })).toBeNull();
    expect(parseConnectorLink({ url: 'not a url' })).toBeNull();
    expect(parseConnectorLink({})).toBeNull();
    expect(parseConnectorLink(null)).toBeNull();
  });
});
