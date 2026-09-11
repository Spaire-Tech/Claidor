/**
 * Connections to accounts (docs/maties/connectors.md).
 *
 * The app never speaks to the connector service. It asks Claidor for a
 * sign-in URL, opens that URL in a window, and asks Claidor again what is
 * connected. Everything here is either an IPC channel name or a route on
 * Claidor's account protocol, which the app already reaches under
 * `/desktop` (`src/main/libs/endpoints.ts`).
 */

export const ConnectorsIpc = {
  /** What is connected, and whether the person may connect anything at all. */
  GetState: 'connectors:getState',
  /** Ask for a sign-in URL, open it, wait for the window, re-read the state. */
  Connect: 'connectors:connect',
  /** Drop one connected account. */
  Disconnect: 'connectors:disconnect',
  /** Main → renderer: the state changed, here it is. */
  Changed: 'connectors:changed',
} as const;
export type ConnectorsIpc = typeof ConnectorsIpc[keyof typeof ConnectorsIpc];

/** The four routes of docs/maties/connectors.md, section 4. */
export const CONNECTORS_ROUTE = '/api/connectors';

export const connectorLinkRoute = (slug: string): string => (
  `${CONNECTORS_ROUTE}/${encodeURIComponent(slug)}/link`
);

export const connectorAccountRoute = (accountId: string): string => (
  `${CONNECTORS_ROUTE}/${encodeURIComponent(accountId)}`
);

/** The engine talks to this one; the app only writes it into the engine's config. */
export const connectorMcpRoute = (slug: string): string => (
  `${CONNECTORS_ROUTE}/mcp/${encodeURIComponent(slug)}`
);

/** The answer of every route when connections are not part of the person's plan. */
export const CONNECTORS_PAYMENT_REQUIRED_STATUS = 402;

/** One account the person has connected, as Claidor reports it. */
export interface ConnectorConnection {
  readonly slug: string;
  readonly accountId: string;
  /** ISO 8601, as Claidor sent it; shown as-is or not at all. */
  readonly connectedAt: string;
  /**
   * What to call the account on the card, when Claidor names it. The four
   * routes do not promise one today; without it the card shows the day it
   * was connected rather than an id nobody can read.
   */
  readonly name?: string;
}

export interface ConnectorsState {
  /** Whether connections are part of this person's plan. */
  readonly entitled: boolean;
  readonly connections: readonly ConnectorConnection[];
  /** False until Claidor has answered once; the cards stay quiet until then. */
  readonly loaded: boolean;
}

export const EMPTY_CONNECTORS_STATE: ConnectorsState = {
  entitled: false,
  connections: [],
  loaded: false,
};

/** What became of a Connect or Disconnect. */
export const ConnectorOutcome = {
  /** The service is connected now. */
  Connected: 'connected',
  /** The account is gone. */
  Disconnected: 'disconnected',
  /** The person closed the window without finishing. */
  Cancelled: 'cancelled',
  /** Claidor answered 402: connections are part of the paid plan. */
  NotEntitled: 'not-entitled',
  /** Anything else; `error` says what in plain words. */
  Failed: 'failed',
} as const;
export type ConnectorOutcome = typeof ConnectorOutcome[keyof typeof ConnectorOutcome];

export interface ConnectorActionResult {
  readonly outcome: ConnectorOutcome;
  /** The state as it stands after the attempt, so the cards never go stale. */
  readonly state: ConnectorsState;
  readonly error?: string;
}
