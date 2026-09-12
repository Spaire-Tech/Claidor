/**
 * The apps this person has actually connected, in the catalogue's order, for
 * the composer's app picker. Two cards may name the same service (Notion is
 * filed twice); it is one account and appears once here.
 */
import {
  CONNECTION_ITEMS,
  connectionAppSlug,
  type ConnectionItem,
} from '@shared/connections/catalog';
import type { ConnectorsState } from '@shared/connectors/constants';

export interface ConnectedApp {
  /** The name the connector service knows the service by, e.g. `gmail`. */
  readonly slug: string;
  /** The product's name, literal. */
  readonly name: string;
  /** File name under the app-logo directory; none shows the monogram. */
  readonly logo?: string;
}

export const listConnectedApps = (
  connectors: ConnectorsState,
  items: readonly ConnectionItem[] = CONNECTION_ITEMS,
): ConnectedApp[] => {
  const connectedSlugs = new Set(connectors.connections.map((connection) => connection.slug));
  const seen = new Set<string>();
  const apps: ConnectedApp[] = [];

  for (const item of items) {
    const slug = connectionAppSlug(item);
    if (!slug || !connectedSlugs.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    apps.push({ slug, name: item.name, ...(item.logo ? { logo: item.logo } : {}) });
  }

  // An account Claidor reports for a service the catalogue does not list still
  // belongs to the person, so it is offered under its own name.
  for (const connection of connectors.connections) {
    if (seen.has(connection.slug)) continue;
    seen.add(connection.slug);
    apps.push({ slug: connection.slug, name: connection.name?.trim() || connection.slug });
  }

  return apps;
};

export const findConnectedApp = (
  apps: readonly ConnectedApp[],
  slug: string | undefined,
): ConnectedApp | undefined => (
  slug ? apps.find((app) => app.slug === slug) : undefined
);
