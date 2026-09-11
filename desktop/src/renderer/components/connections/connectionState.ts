/**
 * « Connected » is never a stored flag: it is read from the app's real
 * state. These are the readings, pure so they can be tested.
 */
import type { ConnectorConnection, ConnectorsState } from '@shared/connectors/constants';
import type { Platform } from '@shared/platform/constants';

import type { IMGatewayConfig } from '../../types/im';

/** A channel is configured when at least one instance exists in IM settings. */
export const isChannelConfigured = (config: IMGatewayConfig, platform: Platform): boolean => {
  const platformConfig = config[platform as keyof IMGatewayConfig] as { instances?: unknown } | undefined;
  return Array.isArray(platformConfig?.instances) && platformConfig.instances.length > 0;
};

/** The three states of an account card, and the two it passes through. */
export const ConnectionCardState = {
  /** Nothing is known yet: the card shows no action rather than a wrong one. */
  Unknown: 'unknown',
  /** Not connected, and connections are part of this person's plan. */
  Connect: 'connect',
  /** Connected: a tick, the account, and Disconnect. */
  Connected: 'connected',
  /** Not connected, and connections are not part of this person's plan. */
  Locked: 'locked',
  /** A window is open, or Claidor is being asked. */
  Busy: 'busy',
} as const;
export type ConnectionCardState = typeof ConnectionCardState[keyof typeof ConnectionCardState];

export interface ConnectionCardReading {
  readonly state: ConnectionCardState;
  /** The account, when there is one. */
  readonly connection?: ConnectorConnection;
}

/** The account Claidor reports for a service, when it reports one. */
export const findConnectorConnection = (
  connectors: ConnectorsState,
  appSlug: string,
): ConnectorConnection | undefined => (
  connectors.connections.find((connection) => connection.slug === appSlug)
);

/**
 * What one account card should show. `busySlug` is the service whose window
 * is open or whose request is in flight, if any.
 */
export const readConnectionCard = (
  appSlug: string,
  connectors: ConnectorsState,
  busySlug: string | null = null,
): ConnectionCardReading => {
  if (busySlug === appSlug) return { state: ConnectionCardState.Busy };
  const connection = findConnectorConnection(connectors, appSlug);
  if (connection) return { state: ConnectionCardState.Connected, connection };
  if (!connectors.loaded) return { state: ConnectionCardState.Unknown };
  if (!connectors.entitled) return { state: ConnectionCardState.Locked };
  return { state: ConnectionCardState.Connect };
};
