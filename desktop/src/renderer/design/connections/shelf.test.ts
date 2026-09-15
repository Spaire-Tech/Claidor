import { describe, expect, test } from 'vitest';

import type { ConnectionItem } from '../../../shared/connections/catalog';
import {
  CONNECTION_ITEMS,
  ConnectionGroupId,
  ConnectionKind,
  ConnectionTag,
  ConnectVia,
  OAuthRegistration,
} from '../../../shared/connections/catalog';
import {
  actionFor,
  ConnectAction,
  CONNECTED_GROUP_ID,
  connectedIds,
  installedPill,
  shelfGroups,
  shelfTotal,
} from './shelf';

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

  test('a vendor that wants a client we have not registered says not yet', () => {
    // Gmail, Zoom, HubSpot: their servers exist and refuse a client that
    // registers itself. A Connect button would end on their error page.
    const row = actionFor(
      item({ id: 'gmail', connect: { via: ConnectVia.Mcp, url: 'https://x/mcp', registration: OAuthRegistration.Preregistered } }),
      NONE,
    );
    expect(row.pressable).toBe(false);
    expect(row.label).toBe('Not yet');
  });

  test('but one the engine already holds a server for is connected, whatever the route says', () => {
    // The engine's state is the fact. A card saying "Not yet" over a
    // working connection would be the catalogue contradicting the
    // person's own computer.
    const row = actionFor(
      item({ id: 'gmail', connect: { via: ConnectVia.Mcp, url: 'https://x/mcp', registration: OAuthRegistration.Preregistered } }),
      new Set(['gmail']),
    );
    expect(row).toMatchObject({ action: ConnectAction.Connected, pressable: true });
  });

  test('an open server is a Connect button like any other', () => {
    const row = actionFor(
      item({ id: 'excalidraw', connect: { via: ConnectVia.Mcp, url: 'https://x/mcp', open: true } }),
      NONE,
    );
    expect(row).toEqual({ action: ConnectAction.Connect, label: 'Connect', pressable: true });
  });

  test('the founder\'s "through your browser" tag is the line on those cards', () => {
    const row = actionFor(item({ id: 'amazon', kind: ConnectionKind.Browser, tag: ConnectionTag.ThroughYourBrowser } as Partial<ConnectionItem> & { id: string }), NONE);
    expect(row.label).toBe('Through your browser');
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

  test('a card Composio carries is a Connect button whatever its own route says', () => {
    // Gmail's own server wants a client we have not registered ("Not
    // yet"); GitHub's wants a pasted token ("Needs a key"). Composio
    // carries both, and nothing has to be typed for it: Claidor's key is
    // on the server, so the slug alone is the button.
    const gmail = item({ id: 'gmail', composio: 'gmail', connect: { via: ConnectVia.Mcp, url: 'https://x/mcp', registration: OAuthRegistration.Preregistered } });
    const github = item({ id: 'github', composio: 'github', connect: { via: ConnectVia.Token, url: 'https://x/mcp', header: 'Authorization', tokenEnv: 'T' } });
    for (const one of [gmail, github]) {
      expect(actionFor(one, NONE), one.id)
        .toEqual({ action: ConnectAction.Connect, label: 'Connect', pressable: true });
      expect(actionFor(one, new Set([one.id])), one.id)
        .toMatchObject({ action: ConnectAction.Connected, pressable: true });
      expect(actionFor(one, NONE, one.id), one.id)
        .toMatchObject({ action: ConnectAction.Working, pressable: false });
    }
  });

  test('a card Composio does not carry keeps its own route\'s answer', () => {
    const row = actionFor(
      item({ id: 'x-ads', connect: { via: ConnectVia.Mcp, url: 'https://x/mcp', registration: OAuthRegistration.Preregistered } }),
      NONE,
    );
    expect(row).toMatchObject({ action: ConnectAction.NotYet, pressable: false });
  });

  test('Composio turns a "no way in yet" card into a way in', () => {
    // Mailchimp, Gusto, Lever: no vendor MCP, but Composio carries them.
    const row = actionFor(item({ id: 'mailchimp', kind: ConnectionKind.Soon, composio: 'mailchimp' } as Partial<ConnectionItem> & { id: string }), NONE);
    expect(row).toEqual({ action: ConnectAction.Connect, label: 'Connect', pressable: true });
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
  test('is the bare total, as the canvas puts it', () => {
    // `CATS.reduce((n, c) => n + c[2].length, 0)`: every card counts.
    expect(shelfTotal()).toBe(CONNECTION_ITEMS.length);
    expect(shelfTotal([item({ id: 'a' }), item({ id: 'b' })])).toBe(2);
  });
});

describe('the installed pill', () => {
  test('is not there when nothing is connected', () => {
    expect(installedPill(NONE)).toBeUndefined();
  });

  test('says how many, and shows the first four', () => {
    const pill = installedPill(new Set(['gmail', 'todoist', 'notion', 'stripe', 'figma']));
    expect(pill?.label).toBe('5 installed');
    expect(pill?.shown).toHaveLength(4);
  });

  test('pressed, the shelf is only what is connected', () => {
    const groups = shelfGroups('', new Set(['gmail']), undefined, true);
    expect(groups.map(group => group.id)).toEqual([CONNECTED_GROUP_ID]);
  });
});
