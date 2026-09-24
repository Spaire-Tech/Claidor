import { claidorApiUrl } from "../../shared/node/cursor-backend/claidor-api.js";

// Sign-out on Simeon Labs' server: `POST /desktop/api/auth/logout` with the
// departing bearer (`server/polar/desktop/endpoints.py`, `logout`), which
// revokes the session row behind it — the envelope token and the opaque
// one alike, since `authenticate` unwraps before it looks up.
//
// Until 24 September 2026 the app's sign-out (`cursor-auth.ts`,
// `revokeCredentials`) only deleted the two keychain entries; the server
// session lived on until its refresh token expired, so a token copied out
// of the keychain before sign-out kept working. Grok Bot never revoked
// either (Cursor's session ends server-side by other means), which is why
// there was no hook here to point at anything.
//
// Best effort, by design: five seconds, then the local sign-out goes ahead
// whatever the server said. A sign-out that hangs on a dead network would
// be worse than a session the server times out on its own.

export const CLAIDOR_SIGN_OUT_PATH = "auth/logout";
export const CLAIDOR_SIGN_OUT_TIMEOUT_MS = 5_000;

export interface ClaidorSignOutOptions {
  readonly backendUrl?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly reportFailure?: (error: unknown) => void;
}

/** Resolves true when the server acknowledged, false otherwise. Never throws. */
export async function revokeClaidorSession(accessToken: string, options: ClaidorSignOutOptions = {}): Promise<boolean> {
  if (accessToken.length === 0) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Sign-out on Simeon Labs' server timed out.")), options.timeoutMs ?? CLAIDOR_SIGN_OUT_TIMEOUT_MS);
  timer.unref?.();
  try {
    const response = await (options.fetch ?? fetch)(claidorApiUrl(CLAIDOR_SIGN_OUT_PATH, options.backendUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) { options.reportFailure?.(new Error(`Sign-out on Simeon Labs' server answered ${response.status}.`)); return false; }
    return true;
  } catch (error) {
    options.reportFailure?.(error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
