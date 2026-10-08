/**
 * Signing in on the iPhone: the Mac app's own sign-in, byte for byte, as
 * the server already serves it (`server/simeon/desktop/app_sign_in.py`).
 *
 * 1. A verifier only the app holds: 32 random bytes, base64url, unpadded.
 *    The challenge is base64url(sha256(verifier)), unpadded, the hash taken
 *    over the verifier's ASCII text (`createLoginMetadata` in
 *    `desktop/source/electron-main/account/account-auth.ts`,
 *    `generateAuthParams` in `packages/simeon-config/auth/login.ts`,
 *    `challenge_for` on the server). The uuid is a v4 uuid.
 * 2. The system's sign-in sheet opens
 *    `{api}/loginDeepControl?challenge=…&uuid=…&mode=login&redirectTarget=simeon-ios`
 *    (Google refuses sign-in inside an embedded web view, so it is never the
 *    WKWebView). The person signs in there if they need to and confirms.
 * 3. Meanwhile the app posts `{uuid, verifier}` to `/auth/poll`: 404 is
 *    "not yet", 200 carries `{accessToken, refreshToken}`. Same backoff as
 *    the Mac: 1 s growing by 1.2 to 10 s, three errors in a row give up,
 *    150 tries at most.
 *
 * Nothing here imports React Native: the random bytes, the hash, `fetch`
 * and the wait are handed in, so the tests run it under Node.
 */
import { URL_SCHEME } from "./config";

export const LOGIN_PATH = "/loginDeepControl";
export const POLL_PATH = "/auth/poll";
export const MAX_POLL_ATTEMPTS = 150;
/** Header the server stores on the session row (`client_version_of`), so a phone's session reads as one. */
export const CLIENT_VERSION_HEADER = "x-simeon-client-version";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base64url without padding: Node's `Buffer.toString("base64url")`, which the Mac uses. */
export function base64UrlFromBytes(bytes: Uint8Array): string {
  let out = "";
  let index = 0;
  for (; index + 2 < bytes.length; index += 3) {
    const n = (bytes[index]! << 16) | (bytes[index + 1]! << 8) | bytes[index + 2]!;
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!;
  }
  const left = bytes.length - index;
  if (left === 1) {
    const n = bytes[index]! << 16;
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
  } else if (left === 2) {
    const n = (bytes[index]! << 16) | (bytes[index + 1]! << 8);
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]!;
  }
  return out;
}

/** Standard base64 (what expo-crypto's digest gives) as base64url without padding. */
export function base64UrlFromBase64(value: string): string {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface LoginMetadata {
  readonly uuid: string;
  readonly verifier: string;
  readonly challenge: string;
}

export interface LoginCrypto {
  readonly randomBytes: (count: number) => Uint8Array;
  /** SHA-256 of the text's bytes, standard base64 (expo-crypto `digestStringAsync(SHA256, text, {encoding: BASE64})`). */
  readonly sha256Base64: (text: string) => Promise<string>;
  readonly randomUUID: () => string;
}

export async function challengeFor(verifier: string, crypto: Pick<LoginCrypto, "sha256Base64">): Promise<string> {
  return base64UrlFromBase64(await crypto.sha256Base64(verifier));
}

export async function createLoginMetadata(crypto: LoginCrypto): Promise<LoginMetadata> {
  const verifier = base64UrlFromBytes(crypto.randomBytes(32));
  return { uuid: crypto.randomUUID(), verifier, challenge: await challengeFor(verifier, crypto) };
}

/** The page the sheet opens, in the Mac's parameter order (`generateAuthParams`). Every value is base64url or a uuid, so nothing needs escaping. */
export function loginUrl(api: string, metadata: Pick<LoginMetadata, "uuid" | "challenge">, redirectTarget: string = URL_SCHEME): string {
  return `${api}${LOGIN_PATH}?challenge=${metadata.challenge}&uuid=${metadata.uuid}&mode=login&redirectTarget=${redirectTarget}`;
}

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export type PollOutcome =
  | { readonly kind: "tokens"; readonly tokens: TokenPair }
  /** Three errors in a row, 150 tries, or a 200 that carried no pair. */
  | { readonly kind: "gave-up" }
  /** `keepGoing` said stop (the person closed the sheet without confirming). */
  | { readonly kind: "stopped" }
  /** The server's sign-in policy refused this account (403 `sign_in_policy_violation`). */
  | { readonly kind: "refused" };

export interface PollOptions {
  readonly api: string;
  readonly uuid: string;
  readonly verifier: string;
  readonly clientVersion: string;
  readonly fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>;
  readonly wait: (ms: number) => Promise<void>;
  readonly keepGoing?: () => boolean;
  readonly maxAttempts?: number;
}

/** The wait before the next poll, as the Mac's `pollAuthenticationStatus` has it. */
export function pollDelayMs(attempt: number): number {
  return Math.min(1_000 * 1.2 ** attempt, 10_000);
}

function pairOf(value: unknown): TokenPair | null {
  if (value == null || typeof value !== "object") return null;
  const { accessToken, refreshToken } = value as { accessToken?: unknown; refreshToken?: unknown };
  return typeof accessToken === "string" && accessToken.length > 0 && typeof refreshToken === "string" && refreshToken.length > 0 ? { accessToken, refreshToken } : null;
}

/**
 * Polls until the person confirms. The verifier goes in the body, never the
 * query string, so it is not written to an access log (F-258; the server
 * takes the GET only for Mac builds from before 25 September 2026).
 */
export async function pollForTokens(options: PollOptions): Promise<PollOutcome> {
  const maxAttempts = options.maxAttempts ?? MAX_POLL_ATTEMPTS;
  let consecutiveErrors = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options.keepGoing != null && !options.keepGoing()) return { kind: "stopped" };
    try {
      const response = await options.fetch(`${options.api}${POLL_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", [CLIENT_VERSION_HEADER]: options.clientVersion },
        body: JSON.stringify({ uuid: options.uuid, verifier: options.verifier }),
      });
      if (response.status === 404) {
        consecutiveErrors = 0;
      } else if (response.status === 403) {
        const body = await response.json().catch(() => null) as { error?: unknown } | null;
        if (body?.error === "sign_in_policy_violation") return { kind: "refused" };
        if (++consecutiveErrors >= 3) return { kind: "gave-up" };
      } else if (!response.ok) {
        if (++consecutiveErrors >= 3) return { kind: "gave-up" };
      } else {
        const pair = pairOf(await response.json().catch(() => null));
        return pair == null ? { kind: "gave-up" } : { kind: "tokens", tokens: pair };
      }
    } catch {
      if (++consecutiveErrors >= 3) return { kind: "gave-up" };
    }
    await options.wait(pollDelayMs(attempt));
  }
  return { kind: "gave-up" };
}
