/**
 * What the page says to the app (`window.ReactNativeWebView.postMessage`,
 * one JSON string each; `NATIVE_MESSAGE` in `desktop/web/api.ts` names
 * them). Anything that is not one of these is ignored: the page is ours,
 * but the app trusts the shape, not the sender.
 */
import { parseSession, type SessionTokens } from "./tokens";

export type SignedOutReason = "logout" | "expired" | "no-session";

export type PageMessage =
  /** A refreshed pair: the Keychain's copy must follow, the old refresh token is spent. */
  | { readonly type: "simeon.tokens"; readonly tokens: SessionTokens }
  /** The session is over: the person signed out (the app ends it on the server), the server ended it, or there was none. */
  | { readonly type: "simeon.signed-out"; readonly reason: SignedOutReason }
  /** A link or a sign-in to open outside the web view. */
  | { readonly type: "simeon.open"; readonly url: string; readonly purpose: "sign-in" | "link" }
  /** The box finished a connected-app sign-in: the sheet it ran in can close. */
  | { readonly type: "simeon.mcp-auth" }
  /** The window's theme, for the ground behind it and the status bar. */
  | { readonly type: "simeon.theme"; readonly preference: string; readonly resolved: "light" | "dark" }
  /** The window listens for `focus-agent`: an agent can be opened. */
  | { readonly type: "simeon.ready" };

const REASONS: readonly SignedOutReason[] = ["logout", "expired", "no-session"];

export function parsePageMessage(data: string, nowMs: number): PageMessage | null {
  let message: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(data);
    if (parsed == null || typeof parsed !== "object") return null;
    message = parsed as Record<string, unknown>;
  } catch { return null; }
  switch (message.type) {
    case "simeon.tokens": {
      const tokens = parseSession(message.tokens, nowMs);
      return tokens == null ? null : { type: "simeon.tokens", tokens };
    }
    case "simeon.signed-out":
      return { type: "simeon.signed-out", reason: REASONS.includes(message.reason as SignedOutReason) ? message.reason as SignedOutReason : "no-session" };
    case "simeon.open":
      return typeof message.url === "string" && message.url.length > 0 ? { type: "simeon.open", url: message.url, purpose: message.purpose === "sign-in" ? "sign-in" : "link" } : null;
    case "simeon.mcp-auth":
      return { type: "simeon.mcp-auth" };
    case "simeon.theme":
      return message.resolved === "light" || message.resolved === "dark" ? { type: "simeon.theme", preference: typeof message.preference === "string" ? message.preference : "system", resolved: message.resolved } : null;
    case "simeon.ready":
      return { type: "simeon.ready" };
    default:
      return null;
  }
}
