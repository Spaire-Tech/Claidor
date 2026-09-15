import { existsSync, readFileSync } from 'node:fs';
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
  signsInItself,
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
  test('sixty-three sign in with nothing from us — the list the founder asked to build first', () => {
    // `docs/product/connectors-list-2026-09-15.md`, "Self": the vendor's
    // own MCP server, registering us itself. Checked against each
    // endpoint on 15 September (`connectors-probe-2026-09-15*.txt`).
    // The two open servers are on top of the sixty-three.
    const self = CONNECTION_ITEMS.filter(one => {
      const method = connectMethod(one);
      return signsInItself(one) && method?.via === ConnectVia.Mcp && !method.open;
    });
    expect(self.map(one => one.id).sort()).toEqual([
      'ahrefs', 'airtable', 'amplemarket', 'apollo', 'asana', 'ashby', 'attio',
      'brex', 'calendly', 'canva', 'circleback', 'clay', 'clickup', 'cloudflare',
      'coda', 'craft', 'customer-io', 'daloopa', 'deepl', 'dropbox', 'fathom',
      'figma', 'fireflies', 'gamma', 'gong', 'greenhouse', 'guru',
      'interactive-brokers', 'jira', 'jotform', 'juicebox', 'klaviyo', 'linear',
      'mailerlite', 'make', 'meltwater', 'mem', 'mercury', 'miro', 'monday',
      'navan', 'notion', 'otter', 'outreach', 'paypal', 'profound', 'ramp',
      'readwise', 'semrush', 'sentry', 'sp-global', 'square', 'stripe',
      'supabase', 'todoist', 'typeform', 'upwork', 'vercel', 'webflow', 'webull',
      'wix', 'workable', 'zapier',
    ]);
    expect(self).toHaveLength(63);
  });

  test('the two open servers need no sign-in and say so', () => {
    for (const id of ['excalidraw', 'godaddy']) {
      const method = connectMethod(findConnection(id)!)!;
      expect(method.via).toBe(ConnectVia.Mcp);
      expect(method.via === ConnectVia.Mcp && method.open).toBe(true);
    }
  });

  test('the ones that want a client we have not registered are marked, not hidden', () => {
    // The probe found no registration endpoint at these. Our config
    // cannot pass a client id, so until one is registered with each
    // vendor the card says "Not yet". The flag is what lets it.
    const marked = accounts.filter(one => {
      const method = connectMethod(one)!;
      return method.via === ConnectVia.Mcp
        && method.registration === OAuthRegistration.Preregistered;
    }).map(one => one.id).sort();
    expect(marked).toEqual([
      'box', 'docusign', 'gmail', 'google-calendar', 'google-cloud-bigquery',
      'google-docs', 'google-drive', 'google-sheets', 'google-slides', 'hubspot',
      'intercom', 'rippling', 'x', 'x-ads', 'zoom',
    ]);
    for (const id of marked) expect(signsInItself(findConnection(id)!)).toBe(false);
  });

  test('Pipedream is still there for what no vendor carries, and is never a button', () => {
    const viaUs = accounts.filter(one => connectMethod(one)!.via === ConnectVia.Pipedream);
    expect(viaUs.length).toBeGreaterThan(0);
    for (const one of viaUs) {
      const method = connectMethod(one)!;
      if (method.via !== ConnectVia.Pipedream) continue;
      expect(method.appSlug).toBeTruthy();
      expect(signsInItself(one)).toBe(false);
    }
  });

  test('the Microsoft accounts fell back rather than going through Cursor', () => {
    // Cursor's manifests point at api.cursor.com. The catalogue must
    // not. Teams is a channel now — the engine carries `msteams` — so it
    // is not an account at all.
    for (const id of ['outlook', 'onedrive']) {
      const item = findConnection(id);
      expect(item, `${id} is missing`).toBeTruthy();
      expect(connectMethod(item!)!.via).toBe(ConnectVia.Pipedream);
    }
    expect(findConnection('microsoft-teams')?.kind).toBe(ConnectionKind.Channel);
  });

  test('every channel is a plugin that actually ships', () => {
    // Eight are engine extensions, `openclaw/extensions/<id>`. Email is
    // not: it is the third-party `@clawemail/email` plugin the app
    // installs from `package.json`'s `openclaw.plugins` — which this
    // test found out, after the doc had called it an engine plugin. A
    // channel card for a plugin that does not exist would be a way to
    // reach the agent that reaches nothing.
    const extensions: Record<string, string> = {
      whatsapp: 'whatsapp', imessage: 'imessage', slack: 'slack',
      'microsoft-teams': 'msteams', telegram: 'telegram', discord: 'discord',
      signal: 'signal', 'google-chat': 'googlechat',
    };
    const channels = CONNECTION_ITEMS.filter(one => one.kind === ConnectionKind.Channel);
    expect(channels.map(one => one.id).sort()).toEqual([...Object.keys(extensions), 'email'].sort());

    const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8')) as {
      openclaw?: { plugins?: { id: string }[] };
    };
    expect(manifest.openclaw?.plugins?.map(one => one.id)).toContain('clawemail-email');

    const engine = path.resolve(__dirname, '../../../../openclaw/extensions');
    if (!existsSync(engine)) return; // the engine is a sibling checkout, not always there
    for (const [id, extension] of Object.entries(extensions)) {
      expect(existsSync(path.join(engine, extension)), `${id} → ${extension}`).toBe(true);
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
