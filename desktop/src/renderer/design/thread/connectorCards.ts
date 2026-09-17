import { type ProposeConnectorAsk, proposedConnection } from '../../../shared/connections/proposal';
import { type ConnectorItem, type ConnectorOutcome, ThreadItemKind } from './types';

/**
 * An agent proposing a connector, as a card.
 *
 * Pure, so the mapping from the tool's ask to the card, and the routing
 * of the answer back, are tested without a window. The card's id carries
 * the request id the way the staffing card's does, so a press on it
 * finds its way to the connectors bridge and nowhere else.
 */

const CONNECTOR_ID_PREFIX = 'connector:';

export const connectorItemId = (requestId: string): string => `${CONNECTOR_ID_PREFIX}${requestId}`;

export const connectorRequestId = (itemId: string): string | undefined =>
  itemId.startsWith(CONNECTOR_ID_PREFIX) ? itemId.slice(CONNECTOR_ID_PREFIX.length) : undefined;

/** How far a card has got. */
export interface ConnectorCardState {
  busy?: boolean;
  resolved?: ConnectorOutcome;
  failure?: string;
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
    ...(state.resolved ? { resolved: state.resolved } : {}),
    ...(state.failure ? { failure: state.failure } : {}),
    at,
  };
}
