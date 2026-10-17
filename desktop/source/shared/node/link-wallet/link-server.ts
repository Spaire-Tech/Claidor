// Link's sign-in through Simeon Labs' own client (17 October 2026): Stripe
// approved the company's Link Agent Wallet OAuth client, so the person
// approves "Simeon", with its name and logo, and the server holds Link's
// tokens (`server/simeon/desktop/link_wallet.py`). The refresh token never
// reaches this computer: before each Link command the server is asked for a
// live access token, which Stripe's CLI reads as `LINK_ACCESS_TOKEN`, with
// `LINK_NO_REFRESH` set so the CLI never tries to refresh it itself
// (`link-cli.ts`). A server without the client (or one from before it) says
// so, and the sign-in falls back to Link's device code, as before.

/** What the server says of the person's Link. */
export interface LinkServerStatus {
  /** Whether the server can sign in to Link with Simeon's own client. */
  readonly configured: boolean;
  readonly connected: boolean;
}

export type LinkServerStart =
  | { readonly url: string }
  | { readonly configured: false }
  | { readonly error: string };

export interface LinkServerOptions {
  /** The API's base address (`getSandInferenceBackendUrl`). */
  readonly backendUrl: () => string;
  /** The box's own bearer for the API; undefined when it has none yet. */
  readonly accessToken: () => Promise<string | null | undefined>;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly log?: (message: string) => void;
}

/** A token is used until this long before its end: a command that waits on Link (an approval, two minutes) must not outlive it. */
export const LINK_TOKEN_MARGIN_MS = 2 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;

export function createLinkServer(options: LinkServerOptions) {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => undefined);
  let cached: { readonly token: string; readonly expiresAtMs: number } | undefined;
  let fetching: Promise<string | undefined> | undefined;
  let lastConnected = false;

  const url = (path: string): string => `${options.backendUrl().replace(/\/+$/, "")}${path}`;

  const call = async (method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<{ readonly status: number; readonly body: Record<string, unknown> } | undefined> => {
    let bearer: string | null | undefined;
    try { bearer = await options.accessToken(); } catch { bearer = undefined; }
    if (bearer == null || bearer.length === 0) return undefined;
    try {
      const response = await fetchImpl(url(path), {
        method,
        headers: { authorization: `Bearer ${bearer}`, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      let parsed: unknown;
      try { parsed = await response.json(); } catch { parsed = undefined; }
      return { status: response.status, body: parsed != null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {} };
    } catch (error) {
      log(`[link] server ${method} ${path} failed: ${error instanceof Error ? error.name : "error"}`);
      return undefined;
    }
  };

  /** Whether the server can sign in to Link and the person is connected; undefined when it could not be asked (or predates this). */
  const status = async (): Promise<LinkServerStatus | undefined> => {
    const answer = await call("GET", "/desktop/api/link/status");
    if (answer == null || answer.status !== 200) return undefined;
    lastConnected = answer.body.connected === true;
    if (!lastConnected) cached = undefined;
    return { configured: answer.body.configured === true, connected: lastConnected };
  };

  /** The sign-in link (ours, leading to Link's page), for the apps' sign-in sheet. */
  const start = async (): Promise<LinkServerStart> => {
    const answer = await call("POST", "/desktop/api/link/start");
    if (answer == null) return { error: "Simeon's server could not be reached." };
    if (answer.status === 404 || (answer.status === 503 && answer.body.configured === false)) return { configured: false };
    const link = typeof answer.body.url === "string" ? answer.body.url : "";
    if (answer.status !== 200 || !link.startsWith("https://")) return { error: typeof answer.body.error === "string" ? answer.body.error : `Simeon's server answered ${answer.status}.` };
    return { url: link };
  };

  const fetchToken = async (refresh: boolean): Promise<string | undefined> => {
    const answer = await call("POST", "/desktop/api/link/token", refresh ? { refresh: true } : {});
    if (answer == null || answer.status !== 200) {
      if (answer != null) log(`[link] server token answered ${answer.status}`);
      return undefined;
    }
    if (answer.body.connected !== true) { lastConnected = false; cached = undefined; return undefined; }
    const token = typeof answer.body.accessToken === "string" ? answer.body.accessToken : "";
    const expiresAtMs = typeof answer.body.expiresAtMs === "number" ? answer.body.expiresAtMs : 0;
    if (token.length === 0) return undefined;
    lastConnected = true;
    cached = { token, expiresAtMs };
    return token;
  };

  /**
   * A live access token for the next Link command, or undefined when the
   * person has no Link connection held by the server (the CLI then uses
   * this computer's own sign-in file, from before, if there is one).
   * `refresh` after Link refused one: the server refreshes it once.
   */
  const accessToken = async (refresh = false): Promise<string | undefined> => {
    if (refresh) { cached = undefined; return await fetchToken(true); }
    if (cached != null && cached.expiresAtMs - LINK_TOKEN_MARGIN_MS > now()) return cached.token;
    // Commands started together ask the server once.
    fetching ??= fetchToken(false).finally(() => { fetching = undefined; });
    return await fetching;
  };

  /** Ends the connection: the server revokes it at Link and forgets it. */
  const disconnect = async (): Promise<boolean> => {
    cached = undefined;
    lastConnected = false;
    const answer = await call("DELETE", "/desktop/api/link");
    if (answer == null || answer.status !== 200) return false;
    if (answer.body.disconnected === true && answer.body.revoked !== true) log("[link] disconnected; Link could not be told (the server logs why)");
    return answer.body.disconnected === true;
  };

  return {
    status,
    start,
    accessToken,
    disconnect,
    /** What the server last said: whether the person's Link is connected there. */
    knownConnected: (): boolean => lastConnected,
  };
}

export type LinkServer = ReturnType<typeof createLinkServer>;
