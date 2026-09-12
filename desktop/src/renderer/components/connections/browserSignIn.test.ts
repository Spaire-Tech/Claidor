import type { ConnectionItem } from '@shared/connections/catalog';
import {
  CONNECTION_ITEMS,
  connectionAppSlug,
  ConnectionGroupId,
  ConnectionKind,
} from '@shared/connections/catalog';
import { describe, expect, test } from 'vitest';

import { APP_WEB_ADDRESSES, appWebAddress, offersBrowserSignIn } from './browserSignIn';
import { ConnectionCardState } from './connectionState';

const account = (appSlug: string): ConnectionItem => ({
  id: appSlug,
  name: appSlug,
  group: ConnectionGroupId.MailCalendar,
  kind: ConnectionKind.Account,
  appSlug,
});

const GMAIL = account('gmail');

const BROWSER: ConnectionItem = {
  id: 'amazon',
  name: 'Amazon',
  group: ConnectionGroupId.ShoppingTravel,
  kind: ConnectionKind.Browser,
};

const LOCAL: ConnectionItem = {
  id: 'apple-notes',
  name: 'Apple Notes',
  group: ConnectionGroupId.FilesDocs,
  kind: ConnectionKind.Local,
};

const CHANNEL: ConnectionItem = {
  id: 'telegram',
  name: 'Telegram',
  group: ConnectionGroupId.Messaging,
  kind: ConnectionKind.Channel,
  platformId: 'telegram',
};

const SOON: ConnectionItem = {
  id: 'otter',
  name: 'Otter',
  group: ConnectionGroupId.Meetings,
  kind: ConnectionKind.Soon,
};

describe('appWebAddress', () => {
  test('gives the service address of a connectable account', () => {
    expect(appWebAddress(GMAIL)).toBe('https://mail.google.com');
  });

  test('gives nothing for a service the table does not name', () => {
    expect(appWebAddress(account('a_service_we_never_listed'))).toBeUndefined();
  });

  test('gives nothing for a card that is not an account', () => {
    expect(appWebAddress(BROWSER)).toBeUndefined();
    expect(appWebAddress(LOCAL)).toBeUndefined();
    expect(appWebAddress(CHANNEL)).toBeUndefined();
    expect(appWebAddress(SOON)).toBeUndefined();
  });
});

describe('offersBrowserSignIn', () => {
  test('a connected account offers it', () => {
    expect(offersBrowserSignIn(GMAIL, ConnectionCardState.Connected)).toBe(true);
  });

  test('an account this person has not connected does not', () => {
    expect(offersBrowserSignIn(GMAIL, ConnectionCardState.Connect)).toBe(false);
    expect(offersBrowserSignIn(GMAIL, ConnectionCardState.Locked)).toBe(false);
    expect(offersBrowserSignIn(GMAIL, ConnectionCardState.Busy)).toBe(false);
    expect(offersBrowserSignIn(GMAIL, ConnectionCardState.Unknown)).toBe(false);
  });

  test('the kinds that never sign in anywhere do not, connected or not', () => {
    for (const item of [BROWSER, LOCAL, CHANNEL, SOON]) {
      expect(offersBrowserSignIn(item, ConnectionCardState.Connected)).toBe(false);
    }
  });

  test('a connected account with no known address does not', () => {
    expect(
      offersBrowserSignIn(account('a_service_we_never_listed'), ConnectionCardState.Connected),
    ).toBe(false);
  });
});

describe('the address table and the catalogue agree', () => {
  const catalogueSlugs = new Set(
    CONNECTION_ITEMS.map((item) => connectionAppSlug(item)).filter(Boolean) as string[],
  );

  test('every service the catalogue can connect has an address', () => {
    expect([...catalogueSlugs].filter((slug) => !APP_WEB_ADDRESSES[slug])).toEqual([]);
  });

  test('no address is left behind for a service the catalogue dropped', () => {
    expect(Object.keys(APP_WEB_ADDRESSES).filter((slug) => !catalogueSlugs.has(slug))).toEqual([]);
  });

  test('every address is a plain https page', () => {
    for (const address of Object.values(APP_WEB_ADDRESSES)) {
      expect(address.startsWith('https://')).toBe(true);
    }
  });
});
