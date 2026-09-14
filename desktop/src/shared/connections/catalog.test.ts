import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  APP_LOGO_DIRECTORY,
  CONNECTION_GROUPS,
  CONNECTION_ITEMS,
  ConnectionKind,
  connectionMonogram,
  connectMethod,
  ConnectVia,
  findConnection,
  getConnectionGroups,
  mcpServerName,
  OAuthRegistration,
  searchConnections,
} from './catalog';

const LOGO_DIR = path.resolve(__dirname, '../../../public', APP_LOGO_DIRECTORY);

const accounts = CONNECTION_ITEMS.filter(item => item.kind === ConnectionKind.Account);

describe('the catalogue holds together', () => {
  test('every id is distinct', () => {
    expect(new Set(CONNECTION_ITEMS.map(one => one.id)).size).toBe(CONNECTION_ITEMS.length);
  });

  test('every item is in a group the catalogue knows', () => {
    const known = new Set(CONNECTION_GROUPS.map(one => one.id));
    const strays = CONNECTION_ITEMS.filter(one => !known.has(one.group)).map(one => one.id);
    // The bug this guards actually happened: the Finance group was
    // dropped from the order while two groups were being added, and six
    // services disappeared from the catalogue without a word.
    expect(strays).toEqual([]);
  });

  test('no group is listed with nothing in it', () => {
    for (const group of getConnectionGroups()) {
      expect(group.items.length, `${group.id} is empty`).toBeGreaterThan(0);
    }
  });

  test('every logo it names is a file that exists', () => {
    const missing = CONNECTION_ITEMS
      .filter(one => one.logo && !existsSync(path.join(LOGO_DIR, one.logo)))
      .map(one => `${one.id} → ${one.logo}`);
    expect(missing).toEqual([]);
  });
});

describe('no card offers something it cannot do', () => {
  test('every account says how it connects', () => {
    // An account with no connect clause is the dead button the design
    // forbids: it looks connectable and does nothing.
    for (const item of accounts) {
      expect(connectMethod(item), `${item.id} has no connect`).toBeTruthy();
    }
  });

  test('only accounts carry a connect', () => {
    for (const item of CONNECTION_ITEMS) {
      if (item.kind !== ConnectionKind.Account) {
        expect(connectMethod(item)).toBeUndefined();
      }
    }
  });

  test('every endpoint is the vendor, over https, and not a placeholder', () => {
    for (const item of accounts) {
      const method = connectMethod(item)!;
      if (method.via !== ConnectVia.Mcp && method.via !== ConnectVia.Token) continue;
      expect(method.url.startsWith('https://'), `${item.id} is not https`).toBe(true);
      // A ${VAR} left in a manifest is not an address, and Cursor's own
      // proxy is somebody else's middleman — which is the thing route C
      // exists to avoid.
      expect(method.url, `${item.id} carries a placeholder`).not.toContain('${');
      expect(new URL(method.url).host, `${item.id} points at Cursor`).not.toBe('api.cursor.com');
    }
  });

  test('a local server names a command and a token one names its variable', () => {
    for (const item of accounts) {
      const method = connectMethod(item)!;
      if (method.via === ConnectVia.Local) expect(method.command).toBeTruthy();
      if (method.via === ConnectVia.Token) expect(method.tokenEnv).toMatch(/^[A-Z0-9_]+$/);
    }
  });
});

describe('the route each service takes', () => {
  test('most of them go direct, which is the point of route C', () => {
    const direct = accounts.filter(one => connectMethod(one)!.via === ConnectVia.Mcp);
    expect(direct.length).toBeGreaterThan(accounts.length / 2);
  });

  test('the ones that need a pre-registered client are marked, not hidden', () => {
    // Our config cannot pass a client id, so these depend on the provider
    // also accepting dynamic registration and that is unproven. The flag
    // is what lets a card be honest about it.
    const marked = accounts.filter(one => {
      const method = connectMethod(one)!;
      return method.via === ConnectVia.Mcp
        && method.registration === OAuthRegistration.Preregistered;
    });
    expect(marked.length).toBeGreaterThan(0);
    for (const one of marked) expect(connectMethod(one)!.via).toBe(ConnectVia.Mcp);
  });

  test('Pipedream is still there for what the vendors do not carry', () => {
    const viaUs = accounts.filter(one => connectMethod(one)!.via === ConnectVia.Pipedream);
    expect(viaUs.length).toBeGreaterThan(0);
    for (const one of viaUs) {
      const method = connectMethod(one)!;
      if (method.via !== ConnectVia.Pipedream) continue;
      expect(method.appSlug).toBeTruthy();
    }
  });

  test('the Microsoft services fell back rather than going through Cursor', () => {
    // Their manifests point at api.cursor.com. The catalogue must not.
    for (const id of ['outlook', 'onedrive', 'microsoft-teams']) {
      const item = findConnection(id);
      expect(item, `${id} is missing`).toBeTruthy();
      expect(connectMethod(item!)!.via).toBe(ConnectVia.Pipedream);
    }
  });
});

describe('the engine names', () => {
  test('a service is prefixed, so it cannot replace a server somebody added', () => {
    expect(mcpServerName('gmail')).toBe('connection-gmail');
  });

  test('two services never collide', () => {
    const names = accounts.map(one => mcpServerName(one.id));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('finding a service', () => {
  test('an empty search is everything, not nothing', () => {
    expect(searchConnections('  ')).toHaveLength(CONNECTION_ITEMS.length);
  });

  test('it matches the name', () => {
    expect(searchConnections('gmail').map(one => one.id)).toContain('gmail');
  });

  test('it matches what the service does', () => {
    // "who reads my email" is how somebody actually looks for this.
    const found = searchConnections('transcripts').map(one => one.id);
    expect(found.length).toBeGreaterThan(0);
  });

  test('it matches the group name', () => {
    const found = searchConnections('hiring').map(one => one.id);
    expect(found).toContain('ashby');
  });

  test('nothing matching is empty, not everything', () => {
    expect(searchConnections('zzzznotathing')).toEqual([]);
  });
});

describe('a card with no logo', () => {
  test('falls back to one letter', () => {
    expect(connectionMonogram('Notion')).toBe('N');
    expect(connectionMonogram('1Password')).toBe('P');
  });

  test('and to a question mark rather than an empty tile', () => {
    expect(connectionMonogram('123')).toBe('?');
  });
});
