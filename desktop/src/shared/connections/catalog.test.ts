import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  APP_LOGO_DIRECTORY,
  composioToolkit,
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
  test('every card is an account with a Connect that works: nothing browser, local, channel, soon or "not yet"', () => {
    // The founder, 16 September: "i want nothing that is browser. or
    // that cant be connected. its noise … it says plugins, so you
    // should plug it." A card works when Composio carries it, or when
    // the vendor's own server registers us itself.
    for (const item of CONNECTION_ITEMS) {
      expect(item.kind, item.id).toBe(ConnectionKind.Account);
      const works = composioToolkit(item) !== undefined || signsInItself(item);
      expect(works, `${item.id} has no way in`).toBe(true);
    }
  });

  test('twenty-one sign in with nothing from us', () => {
    // `docs/product/connectors-list-2026-09-15.md`, "Self": the vendor's
    // own MCP server, registering us itself. Checked against each
    // endpoint on 15 September (`connectors-probe-2026-09-15*.txt`).
    const self = CONNECTION_ITEMS.filter(one => {
      const method = connectMethod(one);
      return signsInItself(one) && method?.via === ConnectVia.Mcp && !method.open;
    });
    expect(self.map(one => one.id).sort()).toEqual([
      'airtable', 'asana', 'ashby', 'brex', 'canva', 'dropbox', 'fathom', 'figma',
      'greenhouse', 'jira', 'klaviyo', 'linear', 'mercury', 'miro', 'notion',
      'paypal', 'ramp', 'stripe', 'supabase', 'todoist', 'vercel',
    ]);
    expect(self).toHaveLength(21);
  });

  test('the ones whose vendor wants a client we have not registered are all carried by Composio', () => {
    // The probe found no registration endpoint at these. Our config
    // cannot pass a client id, so without Composio the card would say
    // "Not yet", and no card may say that now.
    const marked = accounts.filter(one => {
      const method = connectMethod(one)!;
      return method.via === ConnectVia.Mcp
        && method.registration === OAuthRegistration.Preregistered;
    }).map(one => one.id).sort();
    expect(marked).toEqual([
      'docusign', 'gmail', 'google-calendar', 'google-docs', 'google-drive',
      'google-sheets', 'google-slides', 'hubspot', 'intercom', 'zoom',
    ]);
    for (const id of marked) {
      expect(signsInItself(findConnection(id)!)).toBe(false);
      expect(composioToolkit(findConnection(id)!), id).toBeTruthy();
    }
  });

  test('the middleman route is never a button on its own; every card on it is carried by Composio', () => {
    const viaUs = accounts.filter(one => connectMethod(one)!.via === ConnectVia.Pipedream);
    expect(viaUs.length).toBeGreaterThan(0);
    for (const one of viaUs) {
      const method = connectMethod(one)!;
      if (method.via !== ConnectVia.Pipedream) continue;
      expect(method.appSlug).toBeTruthy();
      expect(signsInItself(one)).toBe(false);
      expect(composioToolkit(one), one.id).toBeTruthy();
    }
  });

  test('a token or local route is never a button on its own either', () => {
    // GitHub wants a pasted token; Xero's server wants a client id in
    // its environment. Nobody types either; Composio carries both.
    for (const one of accounts) {
      const via = connectMethod(one)!.via;
      if (via === ConnectVia.Token || via === ConnectVia.Local) {
        expect(composioToolkit(one), one.id).toBeTruthy();
      }
    }
  });

  test('the Microsoft accounts fell back rather than going through Cursor', () => {
    // Cursor's manifests point at api.cursor.com. The catalogue must not.
    for (const id of ['outlook', 'onedrive']) {
      const item = findConnection(id);
      expect(item, `${id} is missing`).toBeTruthy();
      expect(connectMethod(item!)!.via).toBe(ConnectVia.Pipedream);
    }
  });

  test('no channel is a card: those belong to a channel screen, which does not exist yet', () => {
    // WhatsApp, Telegram, Slack and the rest are ways to reach the
    // agent, with a pairing flow of their own. Until the new shell has
    // that screen they are not "plugins" and are not here.
    expect(CONNECTION_ITEMS.filter(one => one.kind === ConnectionKind.Channel)).toEqual([]);
  });
});

describe('the Composio route', () => {
  test('the services the founder named are all carried, under Composio\'s own slugs', () => {
    // Each checked at composio.dev/toolkits/<slug>: the page exists for
    // these, and does not for the spellings dropped.
    const named: Record<string, string> = {
      gmail: 'gmail', 'google-calendar': 'googlecalendar', notion: 'notion',
      github: 'github', hubspot: 'hubspot', linear: 'linear',
      jira: 'jira', trello: 'trello', asana: 'asana', salesforce: 'salesforce',
      dropbox: 'dropbox', 'google-drive': 'googledrive', outlook: 'outlook',
      zoom: 'zoom', linkedin: 'linkedin', xero: 'xero', shopify: 'shopify',
    };
    for (const [id, slug] of Object.entries(named)) {
      expect(composioToolkit(findConnection(id)!), id).toBe(slug);
    }
  });

  test('a slug is Composio\'s spelling: lowercase, underscores, nothing else', () => {
    // `onedrive` and `google_meet` were guesses and 404; `one_drive` and
    // `googlemeet` are theirs. A slug that is not theirs is a Connect
    // button that ends on their error page.
    for (const one of CONNECTION_ITEMS) {
      const slug = composioToolkit(one);
      if (slug === undefined) continue;
      expect(slug, one.id).toMatch(/^[a-z0-9_]+$/);
    }
  });

  test('it is a second route, not a replacement: the vendor route stays', () => {
    // Gmail keeps its own MCP endpoint beside the slug, so the day a
    // client is registered with Google the card can go direct again.
    const gmail = findConnection('gmail')!;
    expect(composioToolkit(gmail)).toBe('gmail');
    expect(connectMethod(gmail)?.via).toBe(ConnectVia.Mcp);
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
    expect(found).toContain('greenhouse');
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
