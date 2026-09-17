import { type ProposeConnectorAsk, proposedConnection } from '../../../shared/connections/proposal';
import { type ConnectorItem, ConnectorOutcome, type SystemItem, ThreadItemKind } from './types';

/**
 * An agent proposing a connector, as a card.
 *
 * Pure, so the mapping from the tool's ask to the card, the line the card
 * leaves behind, and the routing of the answer back are tested without a
 * window. The card's id carries the request id the way the staffing
 * card's does, so a press on it finds its way to the connectors bridge
 * and nowhere else.
 */

const CONNECTOR_ID_PREFIX = 'connector:';

export const connectorItemId = (requestId: string): string => `${CONNECTOR_ID_PREFIX}${requestId}`;

export const connectorRequestId = (itemId: string): string | undefined =>
  itemId.startsWith(CONNECTOR_ID_PREFIX) ? itemId.slice(CONNECTOR_ID_PREFIX.length) : undefined;

/** How far a card has got. Only one state now: the sign-in is running. */
export interface ConnectorCardState {
  busy?: boolean;
}

/**
 * The card for an ask. Undefined when the ask names a connector the
 * catalogue does not have, which the tool refuses before it gets here;
 * this is the second lock on the same door.
 */
export function connectorItem(
  ask: ProposeConnectorAsk,
  state: ConnectorCardState,
  at: number,
): ConnectorItem | undefined {
  const item = proposedConnection(ask);
  if (!item) return undefined;
  return {
    kind: ThreadItemKind.Connector,
    id: connectorItemId(ask.requestId),
    connectionId: item.id,
    name: item.name,
    ...(item.line ? { line: item.line } : {}),
    ...(item.logo ? { logo: item.logo } : {}),
    ...(ask.reason ? { reason: ask.reason } : {}),
    ...(state.busy ? { busy: true } : {}),
    at,
  };
}

/**
 * What an answered card leaves behind.
 *
 * An approval card is consumed by its answer and replaced by one quiet
 * line (`decisionNote`). The connector card was the exception: it stayed
 * on the screen, resolved, until main said to take it away — and on a
 * renderer-side failure main never said, so it sat there for good. The
 * founder, 18 September: *"when the thing was terminated, it didnt
 * disapear. the card stayed there."* So it behaves like the approval
 * card now: answered, it goes, and this is what stays in its place.
 */
export function connectorNote(
  name: string,
  outcome: ConnectorOutcome,
  failure?: string,
): string {
  if (outcome === ConnectorOutcome.Connected) return `${name} is connected.`;
  if (outcome === ConnectorOutcome.Declined) return 'Not now.';
  const reason = failure?.trim().replace(/\.$/, '');
  return reason
    ? `${name} was not connected — ${reason}.`
    : `${name} was not connected.`;
}

/** The line, as a thread item. Its own id, so the card's key is free to go. */
export function connectorNoteItem(requestId: string, text: string, at: number): SystemItem {
  return {
    kind: ThreadItemKind.System,
    id: `note:${connectorItemId(requestId)}`,
    text,
    at,
  };
}
