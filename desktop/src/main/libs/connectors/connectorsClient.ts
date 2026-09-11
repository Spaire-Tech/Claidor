/**
 * The three requests the app makes to Claidor about connections
 * (docs/maties/connectors.md, section 4). The fourth route, the MCP
 * conversation, is the engine's and never passes through here.
 *
 * No bearer token is held in this module: the caller passes the app's
 * existing authenticated-request path (`fetchWithAuth`), which signs the
 * request and refreshes the token on a 401, exactly as memory sync does.
 */

import {
  connectorAccountRoute,
  type ConnectorConnection,
  connectorLinkRoute,
  CONNECTORS_PAYMENT_REQUIRED_STATUS,
  CONNECTORS_ROUTE,
  type ConnectorsState,
} from '../../../shared/connectors/constants';

export type FetchWithAuth = (url: string, options?: RequestInit) => Promise<Response>;

export interface ConnectorsClientDeps {
  /** The account protocol base URL, e.g. `https://api.claidor.com/desktop`. */
  getServerBaseUrl: () => string;
  fetchWithAuth: FetchWithAuth;
}

/** Claidor's sign-in URL for one service, and when it stops working. */
export interface ConnectorLink {
  readonly url: string;
  readonly expiresAt: string;
}

export const ConnectorRequestStatus = {
  Ok: 'ok',
  NotEntitled: 'not-entitled',
  Failed: 'failed',
} as const;
export type ConnectorRequestStatus =
  typeof ConnectorRequestStatus[keyof typeof ConnectorRequestStatus];

export type ConnectorRequestResult<T> =
  | { readonly status: typeof ConnectorRequestStatus.Ok; readonly data: T }
  | { readonly status: typeof ConnectorRequestStatus.NotEntitled }
  | { readonly status: typeof ConnectorRequestStatus.Failed; readonly error: string };

const REQUEST_TIMEOUT_MS = 20_000;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const readText = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Claidor's account protocol wraps some payloads in `{ code, data }` and
 * sends others bare, so both are read.
 */
const payloadOf = (body: unknown): Record<string, unknown> | null => {
  if (!isRecord(body)) return null;
  return isRecord(body.data) ? body.data : body;
};

const parseConnection = (value: unknown): ConnectorConnection | null => {
  if (!isRecord(value)) return null;
  const slug = readText(value.slug).trim();
  const accountId = readText(value.accountId).trim();
  if (!slug || !accountId) return null;
  const name = readText(value.name).trim();
  return {
    slug,
    accountId,
    connectedAt: readText(value.connectedAt),
    ...(name ? { name } : {}),
  };
};

/** Pure: read `GET /api/connectors`. An unreadable answer is « nothing connected ». */
export const parseConnectorsState = (body: unknown): ConnectorsState => {
  const payload = payloadOf(body);
  const rawConnections = Array.isArray(payload?.connections) ? payload.connections : [];
  const connections: ConnectorConnection[] = [];
  for (const entry of rawConnections) {
    const connection = parseConnection(entry);
    if (connection) connections.push(connection);
  }
  return {
    entitled: payload?.entitled === true,
    connections,
    loaded: true,
  };
};

/** Pure: read `POST /api/connectors/{slug}/link`. */
export const parseConnectorLink = (body: unknown): ConnectorLink | null => {
  const payload = payloadOf(body);
  const url = readText(payload?.url).trim();
  if (!url) return null;
  try {
    // Anything but https would be opened in a window, so it is refused here.
    if (new URL(url).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { url, expiresAt: readText(payload?.expiresAt) };
};

const failureMessage = async (response: Response): Promise<string> => {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.message === 'string' && body.message) {
      return body.message;
    }
  } catch {
    // The status alone is the whole story.
  }
  return `HTTP ${response.status}`;
};

const request = async <T>(
  deps: ConnectorsClientDeps,
  path: string,
  options: RequestInit,
  read: (response: Response) => Promise<ConnectorRequestResult<T>>,
): Promise<ConnectorRequestResult<T>> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await deps.fetchWithAuth(`${deps.getServerBaseUrl()}${path}`, {
      ...options,
      signal: controller.signal,
    });
    if (response.status === CONNECTORS_PAYMENT_REQUIRED_STATUS) {
      return { status: ConnectorRequestStatus.NotEntitled };
    }
    if (!response.ok) {
      return { status: ConnectorRequestStatus.Failed, error: await failureMessage(response) };
    }
    return await read(response);
  } catch (error) {
    return {
      status: ConnectorRequestStatus.Failed,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
};

export const fetchConnectorsState = (
  deps: ConnectorsClientDeps,
): Promise<ConnectorRequestResult<ConnectorsState>> => (
  request(deps, CONNECTORS_ROUTE, { method: 'GET' }, async (response) => ({
    status: ConnectorRequestStatus.Ok,
    data: parseConnectorsState(await response.json()),
  }))
);

export const requestConnectorLink = (
  deps: ConnectorsClientDeps,
  slug: string,
): Promise<ConnectorRequestResult<ConnectorLink>> => (
  request(deps, connectorLinkRoute(slug), { method: 'POST' }, async (response) => {
    const link = parseConnectorLink(await response.json());
    return link
      ? { status: ConnectorRequestStatus.Ok, data: link }
      : { status: ConnectorRequestStatus.Failed, error: 'The sign-in address was not usable.' };
  })
);

export const deleteConnectorAccount = (
  deps: ConnectorsClientDeps,
  accountId: string,
): Promise<ConnectorRequestResult<null>> => (
  request(deps, connectorAccountRoute(accountId), { method: 'DELETE' }, async () => ({
    status: ConnectorRequestStatus.Ok,
    data: null,
  }))
);
