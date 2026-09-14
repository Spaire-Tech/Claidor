import { describe, expect, test } from 'vitest';

import type { ConnectionItem } from '../../../shared/connections/catalog';
import {
  CONNECTION_ITEMS,
  ConnectionGroupId,
  ConnectionKind,
  ConnectVia,
} from '../../../shared/connections/catalog';
import {
  actionFor,
  ConnectAction,
  CONNECTED_GROUP_ID,
  connectedIds,
  shelfCount,
  shelfGroups,
} from './connections';

const item = (over: Partial<ConnectionItem> & { id: string }): ConnectionItem => ({
  name: over.id, group: ConnectionGroupId.Productivity,
  kind: ConnectionKind.Account,
  connect: { via: ConnectVia.Mcp, url: 'https://example.com/mcp' },
  ...over,
} as ConnectionItem);

const NONE: ReadonlySet<string> = new Set();

describe('what a card can actually do', () => {
  test('a vendor sign-in is the one that is a button', () => {
    expect(actionFor(item({ id: 'gmail' }), NONE))
      .toEqual({ action: ConnectAction.Connect, label: 'Connect', pressable: true });
  });

  test('one already signed into says so, and stays pressable so it can be undone', () => {
    expect(actionFor(item({ id: 'gmail' }), new Set(['gmail'])))
      .toMatchObject({ action: ConnectAction.Connected, pressable: true });
  });

  test('the one being signed in is neither', () => {
    expect(actionFor(item({ id: 'gmail' }), NONE, 'gmail'))
      .toMatchObject({ action: ConnectAction.Working, pressable: false });
  });

  test('a service wanting a pasted key does not offer a sign-in that does not exist', () => {
    // The fault this guards is the dead button: a Connect that opens
    // nothing, on a card that looks exactly like the ones that work.
    const row = actionFor(
      item({ id: 'github', connect: { via: ConnectVia.Token, url: 'https://x/mcp', header: 'Authorization', tokenEnv: 'T' } }),
      NONE,
    );
    expect(row.pressable).toBe(false);
    expect(row.label).toBe('Needs a key');
  });

  test('a service only reachable through the middleman says not yet', () => {
    const row = actionFor(
      item({ id: 'slack', connect: { via: ConnectVia.Pipedream, appSlug: 'slack_v2' } }),
      NONE,
    );
    expect(row.pressable).toBe(false);
    expect(row.label).toBe('Not yet');
  });

  test('browser, local and channel cards state a fact rather than offer a button', () => {
    for (const kind of [ConnectionKind.Browser, ConnectionKind.Local, ConnectionKind.Channel]) {
      const row = actionFor(item({ id: 'x', kind } as Partial<ConnectionItem> & { id: string }), NONE);
      expect(row.pressable, `${kind} should not be a button`).toBe(false);
      expect(row.label.length).toBeGreaterThan(3);
    }
  });

  test('every card in the real catalogue gets an action, and says something', () => {
    // No card may be blank on the right-hand side.
    for (const one of CONNECTION_ITEMS) {
      const row = actionFor(one, NONE);
      expect(row.label, `${one.id} says nothing`).toBeTruthy();
    }
  });
});

describe('which services are connected', () => {
  test('it reads the engine\'s own servers, by their prefix', () => {
    expect([...connectedIds([
      { name: 'connection-gmail', enabled: true },
      { name: 'connection-todoist', enabled: true },
    ])].sort()).toEqual(['gmail', 'todoist']);
  });

  test('a server somebody added by hand is not a connection', () => {
    expect(connectedIds([{ name: 'my-own-server', enabled: true }]).size).toBe(0);
  });

  test('one that is turned off is not connected', () => {
    // Somebody switched it off. The card should agree with them rather
    // than keep claiming a connection they have disabled.
    expect(connectedIds([{ name: 'connection-gmail', enabled: false }]).size).toBe(0);
  });
});

describe('the shelf', () => {
  test('what you have connected comes first, in its own group', () => {
    const groups = shelfGroups('', new Set(['gmail']));
    expect(groups[0].id).toBe(CONNECTED_GROUP_ID);
    expect(groups[0].items.map(one => one.id)).toEqual(['gmail']);
  });

  test('and is not repeated further down', () => {
    const groups = shelfGroups('', new Set(['gmail']));
    const below = groups.slice(1).flatMap(group => group.items.map(one => one.id));
    expect(below).not.toContain('gmail');
  });

  test('with nothing connected there is no Connected group at all', () => {
    // Rather than an empty heading, which says the screen has a slot.
    expect(shelfGroups('', NONE).some(group => group.id === CONNECTED_GROUP_ID)).toBe(false);
  });

  test('a search narrows it and drops the groups that emptied', () => {
    const groups = shelfGroups('gmail', NONE);
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) expect(group.items.length).toBeGreaterThan(0);
  });

  test('a search that matches nothing is no groups, not every group', () => {
    expect(shelfGroups('zzzznotathing', NONE)).toEqual([]);
  });
});

describe('the count under the title', () => {
  test('with none connected it says what can be', () => {
    // Not "109 services", which is the flattering number and the less
    // useful one: sixty-one of those cards are statements.
    const line = shelfCount(NONE);
    expect(line).toMatch(/^\d+ services you can sign in to$/);
    expect(line).not.toContain('109');
  });

  test('with some connected it counts those', () => {
    expect(shelfCount(new Set(['gmail', 'todoist']))).toMatch(/^2 connected of \d+$/);
  });
});
