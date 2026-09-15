import type { ConnectionGroup, ConnectionItem } from '../../../shared/connections/catalog';
import {
  ConnectionKind,
  ConnectionTag,
  ConnectVia,
  getConnectionGroups,
  MCP_SERVER_PREFIX,
  OAuthRegistration,
  searchConnections,
} from '../../../shared/connections/catalog';

/**
 * What the connections shelf decides.
 *
 * The one that matters is `actionFor`. A hundred and thirty-odd cards,
 * and only the ones whose vendor registers us itself can actually be
 * signed into today — so the job is to say something true on the
 * others rather than give them all a Connect button and let the person
 * find out.
 */

export const ConnectAction = {
  /** Sign in. The only one that is a button. */
  Connect: 'connect',
  /** Already signed in; the button disconnects. */
  Connected: 'connected',
  /** Signing in, right now. */
  Working: 'working',
  /** Nothing to connect: the agent uses the person's own browser. */
  Browser: 'browser',
  /** Nothing to connect: it is on this computer already. */
  Local: 'local',
  /** A way to reach the agent, set up in Settings rather than here. */
  Channel: 'channel',
  /** The vendor wants a token pasted, and that screen is not built. */
  NeedsToken: 'needs-token',
  /** No way in that works today: a client to register, or a middleman not wired. */
  NotYet: 'not-yet',
} as const;
export type ConnectAction = typeof ConnectAction[keyof typeof ConnectAction];

export interface RowAction {
  action: ConnectAction;
  /** What the control says, or the quiet line where there is no control. */
  label: string;
  /** False for the ones that are a statement rather than a button. */
  pressable: boolean;
}

export function actionFor(
  item: ConnectionItem,
  connected: ReadonlySet<string>,
  busyId?: string,
): RowAction {
  if (item.kind === ConnectionKind.Browser) {
    // The founder's own tag line where the canvas has one; the same
    // fact in the same words everywhere else.
    return { action: ConnectAction.Browser, label: item.tag === ConnectionTag.ThroughYourBrowser ? 'Through your browser' : 'In your browser', pressable: false };
  }
  if (item.kind === ConnectionKind.Local) {
    return { action: ConnectAction.Local, label: 'On this Mac', pressable: false };
  }
  if (item.kind === ConnectionKind.Channel) {
    return { action: ConnectAction.Channel, label: 'A way to reach you', pressable: false };
  }
  if (item.kind === ConnectionKind.Soon) {
    return { action: ConnectAction.NotYet, label: 'No way in yet', pressable: false };
  }

  switch (item.connect.via) {
    case ConnectVia.Mcp:
      // The engine's own state comes first: a server that is there is
      // connected, whatever the catalogue thinks of the route today.
      if (connected.has(item.id)) {
        return { action: ConnectAction.Connected, label: 'Connected', pressable: true };
      }
      if (item.connect.registration === OAuthRegistration.Preregistered) {
        // The vendor wants a client registered with them first and we
        // have not registered one. A Connect button here would open a
        // sign-in that ends in their error page.
        return { action: ConnectAction.NotYet, label: 'Not yet', pressable: false };
      }
      if (busyId === item.id) {
        return { action: ConnectAction.Working, label: 'Signing in…', pressable: false };
      }
      return { action: ConnectAction.Connect, label: 'Connect', pressable: true };
    case ConnectVia.Token:
      // Honest rather than hopeful: the vendor wants a key pasted and
      // there is nowhere to paste it yet.
      return { action: ConnectAction.NeedsToken, label: 'Needs a key', pressable: false };
    case ConnectVia.Local:
      return { action: ConnectAction.Local, label: 'Runs on this Mac', pressable: false };
    case ConnectVia.Pipedream:
      return { action: ConnectAction.NotYet, label: 'Not yet', pressable: false };
  }
}

/**
 * Which services are connected, read from the engine's own MCP servers.
 *
 * Nothing stores this separately, on purpose: the connection *is* the
 * server entry, so there is one fact and not a copy of it that can drift.
 * A disabled entry is not connected — somebody turned it off and the card
 * should agree with them.
 */
export function connectedIds(
  servers: readonly { name: string; enabled: boolean }[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const server of servers) {
    if (!server.enabled) continue;
    if (!server.name.startsWith(MCP_SERVER_PREFIX)) continue;
    ids.add(server.name.slice(MCP_SERVER_PREFIX.length));
  }
  return ids;
}

/**
 * The shelf: groups with their matching items, empty groups left out.
 *
 * Connected services are lifted into a group of their own at the top.
 * Somebody who has connected four things out of a hundred and thirty
 * should not have to go looking for them. `onlyConnected` is the
 * installed pill pressed: the same group, and nothing under it.
 */
export const CONNECTED_GROUP_ID = 'connected';

export interface ShelfGroup {
  id: string;
  title: string;
  items: readonly ConnectionItem[];
}

export function shelfGroups(
  query: string,
  connected: ReadonlySet<string>,
  items?: readonly ConnectionItem[],
  onlyConnected = false,
): ShelfGroup[] {
  const matching = searchConnections(query, items);
  const mine = matching.filter(item => connected.has(item.id));
  const rest = matching.filter(item => !connected.has(item.id));

  const groups: ShelfGroup[] = [];
  if (mine.length > 0) {
    groups.push({ id: CONNECTED_GROUP_ID, title: 'Connected', items: mine });
  }
  if (onlyConnected) return groups;
  for (const group of getConnectionGroups(rest) as ConnectionGroup[]) {
    groups.push({ id: group.id, title: group.title, items: group.items });
  }
  return groups;
}

/**
 * The bare total beside "Connectors", which is what the canvas puts
 * there: `CATS.reduce((n, c) => n + c[2].length, 0)`. Every card counts,
 * because every card is a service the agent can reach one way or
 * another — the ones with no button say how.
 */
export function shelfTotal(items?: readonly ConnectionItem[]): number {
  return searchConnections('', items).length;
}

/**
 * The installed pill: up to four logos overlapping, "N installed", a
 * chevron. The canvas's `installedList.slice(0, 4)`, in catalogue
 * order. Nothing when nothing is connected — the canvas hides it too.
 */
export const INSTALLED_PILL_LOGOS = 4;

export interface InstalledPill {
  label: string;
  /** The first few connected items, for their logo or monogram. */
  shown: readonly ConnectionItem[];
}

export function installedPill(
  connected: ReadonlySet<string>,
  items?: readonly ConnectionItem[],
): InstalledPill | undefined {
  const mine = searchConnections('', items).filter(item => connected.has(item.id));
  if (mine.length === 0) return undefined;
  return { label: `${mine.length} installed`, shown: mine.slice(0, INSTALLED_PILL_LOGOS) };
}
