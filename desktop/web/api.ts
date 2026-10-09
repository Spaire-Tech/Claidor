/**
 * Simeon on the web: the page's door to Simeon Labs' server.
 *
 * The window at app.simeonlabs.com speaks the Mac app's protocol: a bearer
 * on `/desktop/*` and the box broker, refreshed at `/oauth/token`. The
 * person is already signed in on the web app with its cookie, so the page
 * trades the cookie for that pair once (`POST /auth/web-session`,
 * `server/simeon/desktop/app_sign_in.py`) and keeps it for the tab in
 * sessionStorage: gone when the tab closes, never shared across tabs, never
 * written to disk by us.
 *
 * Simeon on the iPhone (8 October 2026, `mobile/`) shows this same page in a
 * WKWebView. The app signs in itself, the Mac's way (`/loginDeepControl`,
 * `/auth/poll`), keeps the pair in the Keychain and puts it on the window
 * before the page loads (NATIVE_TOKENS_GLOBAL). Inside the app
 * (`window.ReactNativeWebView`) the page trades no cookie (the web view has
 * none), sends every refreshed pair back to the app (the refresh token
 * rotates, so the Keychain must hold the live one), and tells the app the
 * session is over instead of going to the website's login.
 */

export const WEB_SESSION_PATH = "/auth/web-session";
export const REFRESH_PATH = "/oauth/token";
export const DESKTOP_API_PREFIX = "/desktop/api/";
export const CONNECT_SERVICE = "simeon.v1.ComputerService";
export const TOKENS_KEY = "simeon.web.tokens";
/** Refresh when this much of the hour is left: the Mac app does the same behind the person's back. */
export const REFRESH_AHEAD_MS = 5 * 60_000;

export interface WebTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Milliseconds since the epoch; from the envelope's `exp`, else an hour from issue. */
  readonly expiresAtMs: number;
}

export class SimeonApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "SimeonApiError";
  }
}

/**
 * Where the API is, from where the page is. app.simeonlabs.com talks to
 * api.simeonlabs.com; a page served from loopback talks to the API a
 * developer runs on 8000 (`uv run task api`); `?api=` overrides both for a
 * preview against another server.
 */
export function resolveApiBase(location: { readonly hostname: string; readonly search: string; readonly protocol: string }): string {
  const asked = new URLSearchParams(location.search).get("api");
  if (asked != null && /^https?:\/\//.test(asked)) return asked.replace(/\/+$/, "");
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return "http://127.0.0.1:8000";
  if (host.startsWith("app.")) return `${location.protocol}//api.${host.slice("app.".length)}`;
  return `${location.protocol}//api.${host}`;
}

/** The access token's `exp`, read off the envelope the server wraps it in (`envelope_access_token`). */
export function expiryOfAccessToken(token: string, nowMs: number): number {
  const body = token.replace(/^[a-z_]+_da_/, "").split(".")[1];
  if (body != null) {
    try {
      const claims = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
      if (typeof claims.exp === "number" && Number.isFinite(claims.exp)) return claims.exp * 1000;
    } catch { /* not an envelope: the hour below */ }
  }
  return nowMs + 60 * 60_000;
}

export interface TokenStore {
  read(): WebTokens | null;
  write(tokens: WebTokens | null): void;
}

/** A pair in the stored shape, or null; `expiresAtMs` read off the envelope when the writer left it out (the iPhone app keeps what `/auth/poll` gave it). */
export function parseWebTokens(value: unknown, nowMs: number): WebTokens | null {
  if (value == null || typeof value !== "object") return null;
  const { accessToken, refreshToken, expiresAtMs } = value as Partial<Record<keyof WebTokens, unknown>>;
  if (typeof accessToken !== "string" || accessToken.length === 0 || typeof refreshToken !== "string" || refreshToken.length === 0) return null;
  return { accessToken, refreshToken, expiresAtMs: typeof expiresAtMs === "number" && Number.isFinite(expiresAtMs) ? expiresAtMs : expiryOfAccessToken(accessToken, nowMs) };
}

// --- inside Simeon's iPhone app ----------------------------------------------

/** Where the app puts the pair before the page's first script runs (`injectedJavaScriptBeforeContentLoaded`). */
export const NATIVE_TOKENS_GLOBAL = "__simeonNativeTokens";
/**
 * The page's messages to the app, one JSON string each on
 * `window.ReactNativeWebView.postMessage` (read by `mobile/src/core/messages.ts`):
 * a refreshed pair; the end of the session; a link or a sign-in to open
 * outside the web view; a finished connected-app sign-in; the window's
 * theme; and the window being up (ready to open an agent).
 */
export const NATIVE_MESSAGE = {
  tokens: "simeon.tokens",
  signedOut: "simeon.signed-out",
  open: "simeon.open",
  mcpAuth: "simeon.mcp-auth",
  theme: "simeon.theme",
  ready: "simeon.ready",
} as const;
/** Why the page has no session: the person signed out (the app ends it on the server), the server ended it, or there never was one. */
export type NativeSignedOutReason = "logout" | "expired" | "no-session";

export interface NativeShell { postMessage(message: { readonly type: string } & Record<string, unknown>): void }

/** The app's web view, when the page is in one: `window.ReactNativeWebView` (react-native-webview), else null, which is a browser tab. */
export function nativeShellOf(scope: object): NativeShell | null {
  const view = Reflect.get(scope, "ReactNativeWebView") as { postMessage?: unknown } | undefined;
  if (view == null || typeof view.postMessage !== "function") return null;
  const post = view.postMessage as (data: string) => void;
  return { postMessage: (message) => { try { post.call(view, JSON.stringify(message)); } catch { /* the app is going away */ } } };
}

/**
 * The pair the app handed the page. Reads what it injected; every new pair
 * goes back to the app at once, which writes it to the Keychain and injects
 * it into the next load. A pair that is gone (`write(null)`) is not posted:
 * the page says why it is gone (`signed-out`), and the app deregisters this
 * phone's notifications with the pair it still holds before forgetting it.
 */
export function nativeTokenStore(shell: NativeShell, scope: object, now: () => number = () => Date.now()): TokenStore {
  return {
    read: () => parseWebTokens(Reflect.get(scope, NATIVE_TOKENS_GLOBAL), now()),
    write(tokens) {
      Reflect.set(scope, NATIVE_TOKENS_GLOBAL, tokens);
      if (tokens != null) shell.postMessage({ type: NATIVE_MESSAGE.tokens, tokens });
    },
  };
}

export function sessionTokenStore(storage: Storage = sessionStorage): TokenStore {
  return {
    read() {
      try {
        const raw = storage.getItem(TOKENS_KEY);
        if (raw == null) return null;
        const parsed = JSON.parse(raw) as Partial<WebTokens>;
        if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string" || typeof parsed.expiresAtMs !== "number") return null;
        return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, expiresAtMs: parsed.expiresAtMs };
      } catch { return null; }
    },
    write(tokens) {
      try {
        if (tokens == null) storage.removeItem(TOKENS_KEY);
        else storage.setItem(TOKENS_KEY, JSON.stringify(tokens));
      } catch { /* private window, blocked storage: the session lasts the page */ }
    },
  };
}

export interface SimeonApiOptions {
  readonly base: string;
  readonly store: TokenStore;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  /** `x-simeon-client-version`: what the server is told the client is. */
  readonly clientVersion: string;
  /** Inside Simeon's iPhone app: the app's web view, which signs in, keeps the pair and ends the session (see the top of this file). */
  readonly native?: NativeShell;
}

export class SimeonApi {
  private tokens: WebTokens | null;
  private refreshing: Promise<WebTokens | null> | null = null;
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;

  constructor(readonly options: SimeonApiOptions) {
    this.doFetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => Date.now());
    this.tokens = options.store.read();
  }

  get base(): string { return this.options.base; }

  isSignedIn(): boolean { return this.tokens != null; }

  /** The headers the Mac app sends the broker (`sand-client-metadata.ts`). */
  clientHeaders(): Record<string, string> {
    return { "x-simeon-client-type": "sand", "x-simeon-client-version": this.options.clientVersion, "x-sand-box-namespace": "prod" };
  }

  /**
   * Trades the web cookie for the pair. 401 means the person is not signed
   * in on the web app; the caller sends them to its login page.
   */
  async signInFromCookie(): Promise<boolean> {
    // In the iPhone app the pair comes from the app and nowhere else: its
    // web view holds no website cookie, and a session traded here would be
    // one the app never learns of, so could not end.
    if (this.options.native != null) return false;
    const response = await this.doFetch(`${this.base}${WEB_SESSION_PATH}`, { method: "POST", credentials: "include", headers: { accept: "application/json" } });
    if (response.status === 401) return false;
    if (!response.ok) throw new SimeonApiError(`Signing in to Simeon on the web failed (${response.status}).`, response.status);
    const body = await response.json() as { accessToken?: unknown; refreshToken?: unknown };
    if (typeof body.accessToken !== "string" || typeof body.refreshToken !== "string") throw new SimeonApiError("The sign-in answer carried no tokens.", response.status);
    this.setTokens({ accessToken: body.accessToken, refreshToken: body.refreshToken, expiresAtMs: expiryOfAccessToken(body.accessToken, this.now()) });
    return true;
  }

  setTokens(tokens: WebTokens | null): void {
    this.tokens = tokens;
    this.options.store.write(tokens);
  }

  /** The server ended the session (a spent refresh token, a 401): the pair is dropped, and the iPhone app is told, to show its own sign-in. */
  private sessionEnded(): void {
    this.setTokens(null);
    const reason: NativeSignedOutReason = "expired";
    this.options.native?.postMessage({ type: NATIVE_MESSAGE.signedOut, reason });
  }

  /** A live access token, refreshed first when the hour is nearly up. Null when signed out. */
  async accessToken(): Promise<string | null> {
    const current = this.tokens;
    if (current == null) return null;
    if (this.now() < current.expiresAtMs - REFRESH_AHEAD_MS) return current.accessToken;
    const refreshed = await this.refresh();
    return refreshed?.accessToken ?? null;
  }

  private refresh(): Promise<WebTokens | null> {
    this.refreshing ??= this.doRefresh().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private async doRefresh(): Promise<WebTokens | null> {
    const current = this.tokens;
    if (current == null) return null;
    let response: Response;
    try {
      response = await this.doFetch(`${this.base}${REFRESH_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ grant_type: "refresh_token", refresh_token: current.refreshToken }),
      });
    } catch {
      // Offline: keep what we hold; the next call tries again.
      return current;
    }
    if (!response.ok) {
      // The server answers 200 with `shouldLogout` for a spent token and a
      // non-2xx only for a malformed request; either way, nothing to keep.
      if (response.status >= 500 || response.status === 429) return current;
      this.sessionEnded();
      return null;
    }
    const body = await response.json() as { access_token?: unknown; refresh_token?: unknown; shouldLogout?: unknown };
    if (body.shouldLogout === true || typeof body.access_token !== "string" || typeof body.refresh_token !== "string") {
      this.sessionEnded();
      return null;
    }
    const next = { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAtMs: expiryOfAccessToken(body.access_token, this.now()) };
    this.setTokens(next);
    return next;
  }

  /**
   * Signs this tab's session out on the server and forgets the pair. In the
   * iPhone app the app ends it: it first takes this phone off the
   * notification list with the live pair (`DELETE /desktop/push-devices`),
   * which a session already ended here could no longer do, then posts
   * `auth/logout` itself.
   */
  async signOut(): Promise<void> {
    const token = this.tokens?.accessToken;
    this.setTokens(null);
    if (this.options.native != null) {
      const reason: NativeSignedOutReason = "logout";
      this.options.native.postMessage({ type: NATIVE_MESSAGE.signedOut, reason });
      return;
    }
    if (token == null) return;
    try { await this.doFetch(`${this.base}${DESKTOP_API_PREFIX}auth/logout`, { method: "POST", headers: { authorization: `Bearer ${token}` } }); } catch { /* best effort */ }
  }

  private async authorized(extra: Record<string, string> = {}): Promise<Headers> {
    const token = await this.accessToken();
    if (token == null) throw new SimeonApiError("Sign in to Simeon first.", 401);
    return new Headers({ authorization: `Bearer ${token}`, accept: "application/json", ...this.clientHeaders(), ...extra });
  }

  /**
   * One `/desktop/api/*` call, in the app's envelope (`{code, data}`), the
   * way `simeon-api.ts` reads it on the Mac.
   */
  async data<T = unknown>(path: string, request: { readonly method?: string; readonly json?: unknown; readonly signal?: AbortSignal } = {}): Promise<T> {
    const method = request.method ?? (request.json === undefined ? "GET" : "POST");
    const headers = await this.authorized(request.json === undefined ? {} : { "content-type": "application/json" });
    const response = await this.doFetch(`${this.base}${DESKTOP_API_PREFIX}${path}`, {
      method,
      headers,
      ...(request.json === undefined ? {} : { body: JSON.stringify(request.json) }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    if (response.status === 401) { this.sessionEnded(); }
    if (!response.ok) throw new SimeonApiError(`Simeon Labs' server answered ${path} with ${response.status}.`, response.status);
    const parsed = await response.json().catch(() => null) as { code?: unknown; data?: unknown; message?: unknown } | null;
    if (parsed == null || typeof parsed !== "object") throw new SimeonApiError(`Simeon Labs' server answered ${path} with something that is not JSON.`, response.status);
    if (parsed.code !== undefined && parsed.code !== 0) {
      const message = typeof parsed.message === "string" && parsed.message.length > 0 ? parsed.message : `Simeon Labs' server refused ${path}.`;
      throw new SimeonApiError(message, response.status);
    }
    return (parsed.code === undefined ? parsed : parsed.data) as T;
  }

  /**
   * One unary call on the box broker, Connect JSON
   * (`server/simeon/sand/connect.py`): `POST /simeon.v1.ComputerService/{Method}`.
   */
  async connect<T = Record<string, unknown>>(method: string, message: Record<string, unknown> = {}): Promise<T> {
    const headers = await this.authorized({ "content-type": "application/json", "connect-protocol-version": "1" });
    const response = await this.doFetch(`${this.base}/${CONNECT_SERVICE}/${method}`, { method: "POST", headers, body: JSON.stringify(message) });
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      const hint = response.headers.get("x-automation-failure-hint");
      const message = typeof body?.message === "string" ? body.message : `Simeon's cloud computer answered ${method} with ${response.status}.`;
      const error = new SimeonApiError(message, response.status);
      if (hint != null) Object.assign(error, { hint });
      throw error;
    }
    return (body ?? {}) as T;
  }
}
