import { type CaisraSession, caisraAccountUrl, refreshCaisraSession } from "./caisra-account.js";

/**
 * Holding a Caisra account's session on behalf of a run.
 *
 * A Caisra access token lives one hour and its refresh token thirty days, so
 * the account token cannot simply be stored as a model credential: it would
 * sign the person out every hour. The runtime never sees either token. It
 * addresses this proxy instead, which reads the account's session, injects the
 * bearer, and refreshes when the far end rejects it.
 *
 * This is the shape the desktop app already used against the same API, ported
 * to a process that serves many accounts rather than one: the engine was given
 * a loopback base URL and a placeholder key, and a proxy in front of it owned
 * the session. Keeping that division means a token never reaches the model
 * layer, a log line, or a prompt.
 *
 * The retry logic is deliberately the desktop's and not a simplification of it.
 * Two details there were learned rather than designed, and both are load-bearing:
 *
 * A 401 is not by itself a reason to refresh. Another request for the same
 * account may already have refreshed while this one was in flight, so the
 * session is re-read first and retried with whatever is current. Refreshing on
 * every 401 turns one expiry into a stampede of refreshes, each invalidating
 * the last.
 *
 * And a refresh is shared, not per request. Concurrent callers join the one
 * in-flight refresh for that account instead of starting their own, for the
 * same reason.
 */

/** Where a session is kept. The caller owns storage; this module owns the dance. */
export type CaisraSessionStore = {
  read(accountId: string): Promise<CaisraSession | undefined>;
  write(accountId: string, session: CaisraSession): Promise<void>;
};

export const CaisraProxyFailure = {
  /** No session at all: the account has never connected, or was disconnected. */
  NotConnected: "not_connected",
  /** The refresh token was rejected. Only a fresh sign-in fixes this. */
  Expired: "expired",
  /** A network fault or a server fault. Worth trying again. */
  Unavailable: "unavailable",
} as const;
export type CaisraProxyFailure = (typeof CaisraProxyFailure)[keyof typeof CaisraProxyFailure];

export class CaisraProxyError extends Error {
  constructor(
    readonly failure: CaisraProxyFailure,
    message: string,
  ) {
    super(message);
    this.name = "CaisraProxyError";
  }
}

/** One shared refresh per account, so concurrent 401s do not each start one. */
const inFlight = new Map<string, Promise<CaisraSession>>();

async function sharedRefresh(
  accountId: string,
  session: CaisraSession,
  store: CaisraSessionStore,
  fetchImpl: typeof globalThis.fetch | undefined,
  signal: AbortSignal | undefined,
): Promise<CaisraSession> {
  const existing = inFlight.get(accountId);
  if (existing) return existing;
  const work = (async () => {
    try {
      const next = await refreshCaisraSession(session.refreshToken, {
        fetch: fetchImpl,
        signal,
      });
      await store.write(accountId, next);
      return next;
    } catch (error) {
      const expired = (error as { expired?: boolean }).expired === true;
      throw new CaisraProxyError(
        expired ? CaisraProxyFailure.Expired : CaisraProxyFailure.Unavailable,
        error instanceof Error ? error.message : "Caisra session refresh failed",
      );
    } finally {
      inFlight.delete(accountId);
    }
  })();
  inFlight.set(accountId, work);
  return work;
}

/**
 * Send one request to Caisra as the given account, refreshing if it is rejected.
 *
 * `path` is the API path the runtime asked for, e.g. `/v1/chat/completions`.
 * The account's own base URL is applied here so the runtime cannot be pointed
 * somewhere else by its configuration.
 */
export async function caisraProxyFetch(input: {
  accountId: string;
  path: string;
  init: RequestInit;
  store: CaisraSessionStore;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}): Promise<Response> {
  const { accountId, store } = input;
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const url = new URL(input.path.replace(/^\/+/, ""), `${caisraAccountUrl()}/api/proxy/`).href;

  const send = async (accessToken: string): Promise<Response> => {
    const headers = new Headers(input.init.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    try {
      return await fetchImpl(url, { ...input.init, headers, signal: input.signal });
    } catch (error) {
      throw new CaisraProxyError(
        CaisraProxyFailure.Unavailable,
        error instanceof Error ? error.message : "Caisra request failed",
      );
    }
  };

  const session = await store.read(accountId);
  if (!session) {
    throw new CaisraProxyError(
      CaisraProxyFailure.NotConnected,
      "This account is not connected to Caisra",
    );
  }

  let rejected = session.accessToken;
  let response = await send(rejected);
  if (response.status !== 401) return response;

  // Another request for this account may have refreshed while this one was in
  // flight. Retry with whatever is current before spending a refresh.
  const latest = await store.read(accountId);
  if (latest?.accessToken && latest.accessToken !== rejected) {
    rejected = latest.accessToken;
    response = await send(rejected);
    if (response.status !== 401) return response;
  }

  const refreshed = await sharedRefresh(
    accountId,
    latest ?? session,
    store,
    input.fetch,
    input.signal,
  );
  return send(refreshed.accessToken);
}
