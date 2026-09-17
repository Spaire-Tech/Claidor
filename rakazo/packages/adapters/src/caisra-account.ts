/**
 * Signing in to a Caisra account, which is what makes the metered proxy work.
 *
 * Caisra's users never type a key. They press a button, a browser opens on
 * Caisra's own sign-in, and the account comes back as a token that is stored
 * as this user's credential for the `caisra` model provider
 * (`pi-caisra-provider.ts`). From then on every run bills that account.
 *
 * Two properties of the Caisra API decide the shape of everything here, and
 * both are easy to get wrong by assuming it behaves like an ordinary REST
 * service.
 *
 * **A failure is an HTTP 200.** The API answers `{"code": 0, "data": …}` on
 * success and `{"code": <non-zero>, "message": …}` on failure, and the failure
 * still carries HTTP 200 for everything except an expired refresh token, which
 * is 401 so a client can tell "sign in again" from "try later". A client that
 * reads `response.ok` therefore treats every rejection as a success and stores
 * `undefined` as the account token. The status is checked here only to separate
 * those two failure meanings; the envelope's `code` is what decides success.
 *
 * **The callback address is allowlisted, and an https origin is not on the
 * list.** Caisra hands the auth code back only to `http://127.0.0.1/auth/callback`
 * (or `localhost`), or to the `caisra://auth/callback` deep link. Nothing else
 * receives a code. So sign-in completes through the desktop app's own loopback
 * listener; a hosted web origin cannot complete it until that allowlist grows a
 * third shape, which is a change on the Caisra side and not here.
 */

/**
 * The account API base, path included.
 *
 * It is an origin plus `/desktop`, not a bare origin, because every route of
 * this protocol hangs off that prefix — sign-in, token exchange, and the model
 * proxy alike. The value matches `SERVER_API_BASE_URL` in the desktop client,
 * which is the one that demonstrably works against the live server. Returning
 * only the origin here would drop the prefix and answer 404 on the first call.
 */
const DEFAULT_ACCOUNT_URL = "https://api.claidor.com/desktop";

export function caisraAccountUrl(): string {
  const value = process.env.CAISRA_ACCOUNT_URL?.trim() || DEFAULT_ACCOUNT_URL;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("CAISRA_ACCOUNT_URL must be an absolute HTTP(S) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("CAISRA_ACCOUNT_URL must be an absolute HTTP(S) URL");
  }
  if (url.username || url.password) {
    throw new Error("CAISRA_ACCOUNT_URL must not contain credentials");
  }
  // Keep the path, drop a trailing slash: callers append their own leading one.
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * The only callback shapes Caisra will hand an auth code to. Kept here as a
 * check rather than trusted, because a rejected redirect_uri fails at the far
 * end as an opaque 400 long after the browser has opened, and the caller can
 * do nothing useful with that.
 */
export function isAllowedCaisraCallback(redirectUri: string): boolean {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }
  if (url.protocol === "caisra:") return url.host === "auth" && url.pathname === "/callback";
  if (url.protocol !== "http:") return false;
  return (
    (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
    url.pathname === "/auth/callback"
  );
}

/** Where to send the browser so the person can sign in to Caisra. */
export function caisraSignInUrl(input: { redirectUri: string; state: string }): string {
  if (!isAllowedCaisraCallback(input.redirectUri)) {
    throw new Error(
      "Caisra returns an auth code only to the app's loopback callback or its caisra:// deep link",
    );
  }
  const url = new URL(`${caisraAccountUrl()}/login`);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("source", "rakazo");
  return url.href;
}

export type CaisraSession = {
  accessToken: string;
  refreshToken: string;
};

type Envelope = { code?: unknown; data?: unknown; message?: unknown };

/**
 * Unwrap the Caisra envelope, or throw with the server's own sentence.
 *
 * `expired` marks the one case a caller must treat differently: a 401 means the
 * account must sign in again, where anything else may be worth retrying.
 */
function unwrap(status: number, body: unknown): unknown {
  const envelope = (body ?? {}) as Envelope;
  if (envelope.code === 0) return envelope.data;
  const message =
    typeof envelope.message === "string" && envelope.message.trim()
      ? envelope.message
      : "Caisra sign-in failed";
  const error = new Error(message) as Error & { expired?: boolean };
  if (status === 401) error.expired = true;
  throw error;
}

function readSession(data: unknown): CaisraSession {
  const record = (data ?? {}) as Record<string, unknown>;
  const accessToken = typeof record.accessToken === "string" ? record.accessToken.trim() : "";
  const refreshToken = typeof record.refreshToken === "string" ? record.refreshToken.trim() : "";
  if (!accessToken || !refreshToken) {
    throw new Error("Caisra returned no account token");
  }
  return { accessToken, refreshToken };
}

async function post(
  path: string,
  body: Record<string, string>,
  opts?: { fetch?: typeof globalThis.fetch; signal?: AbortSignal },
): Promise<unknown> {
  const doFetch = opts?.fetch ?? globalThis.fetch;
  const response = await doFetch(`${caisraAccountUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: opts?.signal,
  });
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    // A non-JSON body is a proxy or an outage, never the API. Say so rather
    // than surfacing a parse error the reader cannot act on.
    throw new Error(`Caisra did not answer with JSON (HTTP ${response.status})`);
  }
  return unwrap(response.status, parsed);
}

/** Trade the browser's auth code for the account's tokens. */
export async function exchangeCaisraAuthCode(
  authCode: string,
  opts?: { fetch?: typeof globalThis.fetch; signal?: AbortSignal },
): Promise<CaisraSession> {
  const code = authCode.trim();
  if (!code) throw new Error("Caisra returned no auth code");
  return readSession(await post("/api/auth/exchange", { authCode: code }, opts));
}

/** Swap an expiring access token for a fresh pair. */
export async function refreshCaisraSession(
  refreshToken: string,
  opts?: { fetch?: typeof globalThis.fetch; signal?: AbortSignal },
): Promise<CaisraSession> {
  const token = refreshToken.trim();
  if (!token) throw new Error("Caisra returned no account token");
  return readSession(await post("/api/auth/refresh", { refreshToken: token }, opts));
}

/**
 * How long a Caisra access token is valid, from the account server's own
 * configuration (`DESKTOP_ACCESS_TOKEN_TTL`). The refresh token lasts thirty
 * days. Kept here because the exchange response carries no expiry of its own,
 * so a caller has nothing else to derive one from.
 */
export const CAISRA_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
