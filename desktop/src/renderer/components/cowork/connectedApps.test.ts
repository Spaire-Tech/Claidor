import type { ConnectionItem } from '@shared/connections/catalog';
import { ConnectionGroupId, ConnectionKind } from '@shared/connections/catalog';
import type { ConnectorsState } from '@shared/connectors/constants';
import { describe, expect, test } from 'vitest';

import { findConnectedApp, listConnectedApps } from './connectedApps';

const CATALOGUE: readonly ConnectionItem[] = [
  { id: 'gmail', name: 'Gmail', group: ConnectionGroupId.MailCalendar, kind: ConnectionKind.Account, appSlug: 'gmail', logo: 'gmail.webp' },
  { id: 'notion-files', name: 'Notion', group: ConnectionGroupId.FilesDocs, kind: ConnectionKind.Account, appSlug: 'notion' },
  { id: 'notion-tasks', name: 'Notion', group: ConnectionGroupId.Productivity, kind: ConnectionKind.Account, appSlug: 'notion' },
  { id: 'apple-calendar', name: 'Apple Calendar', group: ConnectionGroupId.MailCalendar, kind: ConnectionKind.Local },
];

const state = (slugs: string[]): ConnectorsState => ({
  entitled: true,
  loaded: true,
  connections: slugs.map((slug) => ({ slug, accountId: `acc-${slug}`, connectedAt: '2026-09-01T00:00:00Z' })),
});

describe('listConnectedApps', () => {
  test('is empty when nothing is connected', () => {
    expect(listConnectedApps(state([]), CATALOGUE)).toEqual([]);
  });

  test('lists only what is connected, with the catalogue name and logo', () => {
    expect(listConnectedApps(state(['gmail']), CATALOGUE)).toEqual([
      { slug: 'gmail', name: 'Gmail', logo: 'gmail.webp' },
    ]);
  });

  test('lists a service filed under two groups once', () => {
    const apps = listConnectedApps(state(['notion']), CATALOGUE);
    expect(apps).toHaveLength(1);
    expect(apps[0].slug).toBe('notion');
  });

  test('keeps an account the catalogue does not list, under its own name', () => {
    const apps = listConnectedApps(state(['gmail', 'acme_crm']), CATALOGUE);
    expect(apps.map((app) => app.slug)).toEqual(['gmail', 'acme_crm']);
    expect(apps[1].name).toBe('acme_crm');
  });

  test('never offers a card that is not an account', () => {
    expect(listConnectedApps(state(['apple-calendar']), CATALOGUE).map((app) => app.name))
      .not.toContain('Apple Calendar');
  });
});

describe('findConnectedApp', () => {
  const apps = listConnectedApps(state(['gmail']), CATALOGUE);

  test('finds the chosen app', () => {
    expect(findConnectedApp(apps, 'gmail')?.name).toBe('Gmail');
  });

  test('is nothing when nothing is chosen, or the choice is gone', () => {
    expect(findConnectedApp(apps, undefined)).toBeUndefined();
    expect(findConnectedApp(apps, 'notion')).toBeUndefined();
  });
});
