import type { ConnectionGroup, ConnectionItem } from '../../../shared/connections/catalog';
import {
  ConnectionKind,
  ConnectVia,
  getConnectionGroups,
  MCP_SERVER_PREFIX,
  searchConnections,
} from '../../../shared/connections/catalog';

/**
 * What the connections shelf decides.
 *
 * The one that matters is `actionFor`. A hundred and nine cards, and only
 * forty-eight of them can actually be signed into today — so the job is
 * to say something true on the other sixty-one rather than give them all
 * a Connect button and let the person find out.
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
  /** Only reachable through our middleman, and that half is not wired. */
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
    return { action: ConnectAction.Browser, label: 'In your browser', pressable: false };
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
      if (busyId === item.id) {
        return { action: ConnectAction.Working, label: 'Signing in…', pressable: false };
      }
      return connected.has(item.id)
        ? { action: ConnectAction.Connected, label: 'Connected', pressable: true }
        : { action: ConnectAction.Connect, label: 'Connect', pressable: true };
    case ConnectVia.Token:
      // Honest rather than hopeful: the vendor wants a key pasted and
      // there is nowhere to paste it yet. A Connect button here would
      // open a sign-in that does not exist.
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
 * Somebody who has connected four things out of a hundred and nine
 * should not have to go looking for them.
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
): ShelfGroup[] {
  const matching = searchConnections(query, items);
  const mine = matching.filter(item => connected.has(item.id));
  const rest = matching.filter(item => !connected.has(item.id));

  const groups: ShelfGroup[] = [];
  if (mine.length > 0) {
    groups.push({ id: CONNECTED_GROUP_ID, title: 'Connected', items: mine });
  }
  for (const group of getConnectionGroups(rest) as ConnectionGroup[]) {
    groups.push({ id: group.id, title: group.title, items: group.items });
  }
  return groups;
}

/**
 * The count under the title.
 *
 * It says what can be signed into, not how many cards there are. "109
 * services" beside a shelf where sixty-one of them are statements would
 * be the more flattering number and the less useful one.
 */
export function shelfCount(
  connected: ReadonlySet<string>,
  items?: readonly ConnectionItem[],
): string {
  const all = searchConnections('', items);
  const connectable = all.filter(item => (
    item.kind === ConnectionKind.Account && item.connect.via === ConnectVia.Mcp
  )).length;
  const have = all.filter(item => connected.has(item.id)).length;
  if (have === 0) return `${connectable} services you can sign in to`;
  return `${have} connected of ${connectable}`;
}
