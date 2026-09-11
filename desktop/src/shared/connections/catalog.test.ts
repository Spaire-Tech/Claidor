import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { PlatformRegistry } from '../platform/constants';
import {
  APP_LOGO_DIRECTORY,
  CONNECTION_GROUPS,
  CONNECTION_ITEMS,
  ConnectionGroupId,
  ConnectionKind,
  connectionMonogram,
  countConnections,
  countConnectionsByKind,
  findConnection,
  getConnectionGroups,
  getConnectionMcpEntryIds,
  REACH_ENTRIES,
  reachAddressFor,
  ReachKind,
  searchConnections,
} from './catalog';

const DESKTOP_ROOT = path.resolve(__dirname, '../../..');
const MARKETPLACE_PATH = path.resolve(DESKTOP_ROOT, '../server/polar/desktop/mcp_marketplace.json');
const LOGO_DIR = path.resolve(DESKTOP_ROOT, 'public', APP_LOGO_DIRECTORY);

const readMarketplaceIds = (): Set<string> => {
  const parsed = JSON.parse(fs.readFileSync(MARKETPLACE_PATH, 'utf8')) as { servers: Array<{ id: string }> };
  return new Set(parsed.servers.map((server) => server.id));
};

describe('connections catalogue', () => {
  test('lists the sixty-five connections the founder drew, in eleven groups', () => {
    expect(CONNECTION_ITEMS).toHaveLength(65);
    expect(countConnections()).toBe(65);
    expect(CONNECTION_GROUPS).toHaveLength(11);
    expect(getConnectionGroups()).toHaveLength(11);
    expect(getConnectionGroups().map((group) => group.items.length)).toEqual([4, 6, 11, 7, 4, 6, 4, 6, 5, 6, 6]);
  });

  test('gives every item and every reach card a unique id', () => {
    const ids = [...CONNECTION_ITEMS.map((item) => item.id), ...REACH_ENTRIES.map((entry) => entry.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('keeps the founder\'s order and words', () => {
    const groups = getConnectionGroups();
    expect(groups[0].items.map((item) => item.name)).toEqual(['Gmail', 'Outlook', 'Google Calendar', 'Apple Calendar']);
    expect(groups[9].items.map((item) => item.name)).toEqual(['Amazon', 'Google Flights', 'Airbnb', 'Booking', 'OpenTable', 'DoorDash']);
    expect(groups[9].items.every((item) => item.tag === 'through-your-browser')).toBe(true);
    expect(REACH_ENTRIES.map((entry) => entry.name)).toEqual(['Gmail', 'Slack Bot', 'iMessage', 'WhatsApp', 'Telegram', 'iOS']);
  });

  test('points every mcp item at a server in the marketplace json', () => {
    const marketplaceIds = readMarketplaceIds();
    for (const item of CONNECTION_ITEMS) {
      if (item.kind !== ConnectionKind.Mcp) continue;
      expect(marketplaceIds.has(item.mcpEntryId), `${item.id} -> ${item.mcpEntryId}`).toBe(true);
    }
    expect(getConnectionMcpEntryIds().sort()).toEqual([
      'canva', 'figma', 'github', 'gitlab', 'gmail', 'google-calendar', 'google-drive', 'notion', 'slack', 'todoist',
    ]);
  });

  test('names only logo files that ship with the app', () => {
    const logos = [...CONNECTION_ITEMS, ...REACH_ENTRIES].flatMap((entry) => (entry.logo ? [entry.logo] : []));
    for (const logo of logos) {
      expect(fs.existsSync(path.join(LOGO_DIR, logo)), logo).toBe(true);
    }
    expect(logos.length).toBeGreaterThan(50);
  });

  test('offers channels only through platforms the app lists', () => {
    const offered = new Set<string>(PlatformRegistry.platforms);
    for (const item of CONNECTION_ITEMS) {
      if (item.kind === ConnectionKind.Channel && item.platformId) {
        expect(offered.has(item.platformId), item.id).toBe(true);
      }
    }
    for (const entry of REACH_ENTRIES) {
      if (entry.kind === ReachKind.Channel) {
        expect(offered.has(entry.platformId), entry.id).toBe(true);
      }
    }
  });

  test('knows what each kind of card is', () => {
    const counts = countConnectionsByKind();
    expect(counts[ConnectionKind.Mcp]).toBe(11);
    expect(counts[ConnectionKind.Local]).toBe(6);
    expect(counts[ConnectionKind.Browser]).toBe(14);
    expect(counts[ConnectionKind.Channel]).toBe(5);
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(65);
    expect(findConnection('apple-notes')?.kind).toBe(ConnectionKind.Local);
    expect(findConnection('telegram')).toMatchObject({ kind: ConnectionKind.Channel, platformId: 'telegram' });
    expect(findConnection('nothing')).toBeUndefined();
  });

  test('builds the reach address from the contract', () => {
    expect(reachAddressFor('Juno')).toBe('juno@maties.ai');
    expect(connectionMonogram('iMessage')).toBe('I');
    expect(connectionMonogram('X')).toBe('X');
  });
});

describe('searchConnections', () => {
  test('returns everything for an empty query', () => {
    expect(searchConnections('')).toHaveLength(65);
    expect(searchConnections('   ')).toHaveLength(65);
  });

  test('matches names regardless of case and spacing', () => {
    expect(searchConnections('google').map((item) => item.name)).toEqual([
      'Google Calendar', 'Google Drive', 'Google Docs', 'Google Sheets', 'Google Slides', 'Google Tasks', 'Google Meet', 'Google Flights',
    ]);
    expect(searchConnections('  NOTION ').map((item) => item.id)).toEqual(['notion', 'notion-tasks']);
  });

  test('matches a group title when a resolver is given', () => {
    const titles: Record<string, string> = { [ConnectionGroupId.Meetings]: 'Meetings' };
    const byTitle = searchConnections('meet', (id) => titles[id] ?? '');
    expect(byTitle.map((item) => item.name)).toEqual(['Zoom', 'Google Meet', 'Fathom', 'Otter']);
    expect(searchConnections('meet').map((item) => item.name)).toEqual(['Google Meet']);
  });

  test('returns nothing when nothing matches', () => {
    expect(searchConnections('zzzz')).toEqual([]);
    expect(getConnectionGroups(searchConnections('zzzz'))).toEqual([]);
  });
});
