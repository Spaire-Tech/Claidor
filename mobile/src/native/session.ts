/**
 * The session on the phone: signing in in the system's sign-in sheet,
 * refreshing before the window loads, and ending it.
 *
 * The sheet is `ASWebAuthenticationSession` (expo-web-browser's
 * `openAuthSessionAsync`): Safari's engine and Safari's cookies, so a
 * person already signed in to Simeon in Safari only confirms, and Google
 * accepts it, which it does not inside an embedded web view. It listens for
 * the app's scheme; the server's confirm page opens `simeon-ios://app/v1/open`
 * (`SIGN_IN_RETURN_URL`) and the sheet closes on it. The pair itself comes
 * from polling, never from that link, exactly as on the Mac.
 */
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";

import { SIGN_IN_RETURN_URL } from "../core/config";
import { createLoginMetadata, loginUrl, pollForTokens } from "../core/sign-in";
import { needsRefresh, readRefreshAnswer, refreshRequest, sessionFromPair, type SessionTokens } from "../core/tokens";
import { clearSession, writeSession } from "./keychain";
import { unregisterThisPhone } from "./push";

/** What the server is told the client is (`x-simeon-client-version`, kept on the session row). */
export function clientVersion(): string {
  return `ios-${Constants.expoConfig?.version ?? "0.0.0"}`;
}

export type SignInResult =
  | { readonly kind: "signed-in"; readonly session: SessionTokens }
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly message: string };

/** How long to keep polling after the sheet closed on the confirm page's link: the pair is written as that page is answered. */
const POLLS_AFTER_CONFIRM = 10;
/** And after the person closed it themselves: one more look, in case they confirmed and then tapped Cancel. */
const POLLS_AFTER_CANCEL = 2;

export async function signIn(api: string): Promise<SignInResult> {
  const metadata = await createLoginMetadata({
    randomBytes: (count) => Crypto.getRandomBytes(count),
    sha256Base64: (text) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, { encoding: Crypto.CryptoEncoding.BASE64 }),
    randomUUID: () => Crypto.randomUUID(),
  });

  let sheet: "open" | "confirmed" | "closed" = "open";
  let pollsLeftAfterClose = 0;
  let nudge: (() => void) | null = null;
  const sheetDone = WebBrowser.openAuthSessionAsync(loginUrl(api, metadata), SIGN_IN_RETURN_URL).then((result) => {
    sheet = result.type === "success" ? "confirmed" : "closed";
    pollsLeftAfterClose = sheet === "confirmed" ? POLLS_AFTER_CONFIRM : POLLS_AFTER_CANCEL;
    nudge?.();
  }, (error: unknown) => {
    sheet = "closed";
    pollsLeftAfterClose = 0;
    console.warn(`[simeon] sign-in sheet failed: ${error instanceof Error ? error.message : String(error)}`);
    nudge?.();
  });

  const outcome = await pollForTokens({
    api,
    uuid: metadata.uuid,
    verifier: metadata.verifier,
    clientVersion: clientVersion(),
    fetch: (url, init) => fetch(url, init),
    // While the sheet is open, the Mac's backoff; once it closed, poll at once and then each second for a little while.
    wait: (ms) => new Promise<void>((resolve) => {
      const timer = setTimeout(() => { nudge = null; resolve(); }, sheet === "open" ? ms : 1_000);
      nudge = () => { clearTimeout(timer); nudge = null; resolve(); };
    }),
    keepGoing: () => {
      if (sheet === "open") return true;
      if (pollsLeftAfterClose <= 0) return false;
      pollsLeftAfterClose -= 1;
      return true;
    },
  });

  if (outcome.kind === "tokens") {
    // Signed in while the sheet still shows the confirm page: close it.
    if (sheet === "open") { try { WebBrowser.dismissAuthSession(); } catch { /* already closing */ } }
    await sheetDone.catch(() => undefined);
    const session = sessionFromPair(outcome.tokens, Date.now());
    await writeSession(session);
    return { kind: "signed-in", session };
  }
  if (sheet === "open") { try { WebBrowser.dismissAuthSession(); } catch { /* already closing */ } }
  if (outcome.kind === "stopped") return { kind: "cancelled" };
  if (outcome.kind === "refused") return { kind: "failed", message: "This account can't sign in to Simeon here." };
  return { kind: "failed", message: "Sign-in did not finish. Try again." };
}

export type StartOutcome =
  | { readonly kind: "ready"; readonly session: SessionTokens }
  | { readonly kind: "signed-out"; readonly message?: string };

/**
 * Before the window loads: a pair with less than five minutes left is
 * refreshed here, the one moment the app may (the page is not running yet,
 * so nothing else is spending the refresh token). Offline, the pair is
 * kept: the page tries again when it can.
 */
export async function prepareSession(api: string, session: SessionTokens): Promise<StartOutcome> {
  const now = Date.now();
  if (!needsRefresh(session, now)) return { kind: "ready", session };
  const request = refreshRequest(api, session);
  let status: number | null = null, body: unknown = null;
  try {
    const response = await fetch(request.url, request.init);
    status = response.status;
    body = await response.json().catch(() => null);
  } catch { status = null; }
  const outcome = readRefreshAnswer(status, body, Date.now());
  if (outcome.kind === "kept") return { kind: "ready", session };
  if (outcome.kind === "ended") {
    await clearSession();
    return { kind: "signed-out", message: "Your Simeon sign-in ended. Sign in again." };
  }
  await writeSession(outcome.session);
  return { kind: "ready", session: outcome.session };
}

/**
 * Ends the session on this phone. The person signed out: this phone comes
 * off the notification list while the pair is live, then the server ends
 * the session (`POST /desktop/api/auth/logout`, what the page does in a
 * browser tab), then the Keychain forgets it. The server ended it already:
 * the same, as far as a dead pair still reaches.
 */
export async function endSession(api: string, session: SessionTokens | null, options: { readonly revoke: boolean }): Promise<void> {
  const accessToken = session?.accessToken ?? null;
  await unregisterThisPhone(api, accessToken);
  if (options.revoke && accessToken != null) {
    try { await fetch(`${api}/desktop/api/auth/logout`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` } }); } catch { /* best effort: the Keychain forgets it either way */ }
  }
  await clearSession();
}
