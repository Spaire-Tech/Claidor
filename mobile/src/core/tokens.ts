/**
 * The pair on the phone: kept in the Keychain, handed to the page before it
 * loads, refreshed by the page while it runs.
 *
 * One rule matters more than the rest: the refresh token rotates (each
 * `/oauth/token` answer spends the one it was given), so exactly one party
 * may refresh at a time. While the window is up that is the page
 * (`desktop/web/api.ts`), which posts every new pair back; the app only
 * refreshes before the page loads (a cold start an hour later), and the
 * pair it injects is always the newest it has heard of.
 */
import type { TokenPair } from "./sign-in";

/** `WebTokens` in `desktop/web/api.ts`: the shape the page keeps. */
export interface SessionTokens extends TokenPair {
  /** Milliseconds since the epoch; the envelope's `exp`, else an hour from issue. */
  readonly expiresAtMs: number;
}

export const REFRESH_PATH = "/oauth/token";
/** `REFRESH_AHEAD_MS` in `desktop/web/api.ts`: refresh with five minutes left, as the Mac does. */
export const REFRESH_AHEAD_MS = 5 * 60_000;
/** `NATIVE_TOKENS_GLOBAL` in `desktop/web/api.ts`: where the page reads the injected pair. */
export const NATIVE_TOKENS_GLOBAL = "__simeonNativeTokens";

const BASE64_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function decodeBase64UrlText(value: string): string | null {
  const clean = value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  let bits = 0, buffer = 0, out = "";
  for (const char of clean) {
    const index = BASE64_URL.indexOf(char);
    if (index < 0) return null;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((buffer >> bits) & 0xff); }
  }
  // Bytes as Latin-1: enough for `exp`, a number; only an e-mail address could hold more than ASCII.
  return out;
}

/** The access token's `exp`, read off the envelope the server wraps it in (`envelope_access_token`); `expiryOfAccessToken` in `desktop/web/api.ts`. */
export function expiryOfAccessToken(token: string, nowMs: number): number {
  const body = token.replace(/^[a-z_]+_da_/, "").split(".")[1];
  if (body != null) {
    const text = decodeBase64UrlText(body);
    if (text != null) {
      try {
        const claims = JSON.parse(text) as { exp?: unknown };
        if (typeof claims.exp === "number" && Number.isFinite(claims.exp)) return claims.exp * 1000;
      } catch { /* not an envelope: the hour below */ }
    }
  }
  return nowMs + 60 * 60_000;
}

export function sessionFromPair(pair: TokenPair, nowMs: number): SessionTokens {
  return { accessToken: pair.accessToken, refreshToken: pair.refreshToken, expiresAtMs: expiryOfAccessToken(pair.accessToken, nowMs) };
}

/** A pair as the Keychain or the page hands it over, or null. */
export function parseSession(value: unknown, nowMs: number): SessionTokens | null {
  let candidate = value;
  if (typeof candidate === "string") { try { candidate = JSON.parse(candidate); } catch { return null; } }
  if (candidate == null || typeof candidate !== "object") return null;
  const { accessToken, refreshToken, expiresAtMs } = candidate as Record<string, unknown>;
  if (typeof accessToken !== "string" || accessToken.length === 0 || typeof refreshToken !== "string" || refreshToken.length === 0) return null;
  return { accessToken, refreshToken, expiresAtMs: typeof expiresAtMs === "number" && Number.isFinite(expiresAtMs) ? expiresAtMs : expiryOfAccessToken(accessToken, nowMs) };
}

export function needsRefresh(session: SessionTokens, nowMs: number): boolean {
  return nowMs >= session.expiresAtMs - REFRESH_AHEAD_MS;
}

export function refreshRequest(api: string, session: SessionTokens): { url: string; init: { method: "POST"; headers: Record<string, string>; body: string } } {
  return {
    url: `${api}${REFRESH_PATH}`,
    init: { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ grant_type: "refresh_token", refresh_token: session.refreshToken }) },
  };
}

export type RefreshOutcome =
  | { readonly kind: "refreshed"; readonly session: SessionTokens }
  /** The server ended the session: sign in again. */
  | { readonly kind: "ended" }
  /** Offline, a deploy, a 429: keep the pair and let the page try again. */
  | { readonly kind: "kept" };

/**
 * The server's answer, read the way the page reads it (`doRefresh` in
 * `desktop/web/api.ts`): 200 with `shouldLogout` for a spent token, a
 * non-2xx only for a malformed request, 5xx and 429 for "not now".
 */
export function readRefreshAnswer(status: number | null, body: unknown, nowMs: number): RefreshOutcome {
  if (status == null || status >= 500 || status === 429) return { kind: "kept" };
  if (status < 200 || status >= 300) return { kind: "ended" };
  const answer = (body ?? {}) as { access_token?: unknown; refresh_token?: unknown; shouldLogout?: unknown };
  if (answer.shouldLogout === true || typeof answer.access_token !== "string" || typeof answer.refresh_token !== "string") return { kind: "ended" };
  return { kind: "refreshed", session: sessionFromPair({ accessToken: answer.access_token, refreshToken: answer.refresh_token }, nowMs) };
}

/**
 * The script that runs before the page's own (`injectedJavaScriptBeforeContentLoaded`):
 * the pair, put where the page looks, on the window's own origin only. A
 * page from anywhere else (the web view never keeps one, but a script that
 * guards itself does not depend on that) gets nothing.
 */
export function tokensInjection(session: SessionTokens | null, appOrigin: string): string {
  return `(function () {
  if (window.location.origin !== ${JSON.stringify(appOrigin)}) return;
  window.${NATIVE_TOKENS_GLOBAL} = ${JSON.stringify(session)};
})();
true;`;
}
