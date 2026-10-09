/**
 * Where a navigation in the window goes. The web view holds the window and
 * nothing else: a page from anywhere else would get the pair the app
 * injects into every top-level load, and a sign-in by Google inside an
 * embedded web view is refused by Google. So every top-level navigation is
 * decided here (`onShouldStartLoadWithRequest`, `onOpenWindow`, and the
 * links the page hands the app itself, `simeon.open`):
 *
 * - the window's own pages (`/app`, `/app/…` on its origin) load;
 * - the website's login page means the session is gone: the app's own
 *   sign-in, not the website's;
 * - a sign-in (Google, Microsoft, a connected app's OAuth page, the API's
 *   own app sign-ins) goes to the system's sign-in sheet, which shares
 *   Safari's cookies and which Google accepts;
 * - any other web link goes to Safari's sheet;
 * - mail, phone and message links go to their apps;
 * - anything else stays out.
 *
 * Frames inside the window (the computer panel is the box's noVNC page in
 * an iframe through the API) load as they ask.
 */

export type NavigationDecision =
  | { readonly kind: "load" }
  | { readonly kind: "sign-in" }
  | { readonly kind: "auth-session"; readonly url: string }
  | { readonly kind: "browser"; readonly url: string }
  | { readonly kind: "system"; readonly url: string }
  | { readonly kind: "block" };

export interface RoutingContext {
  /** The window's page, e.g. https://app.simeonlabs.com/app. */
  readonly app: string;
  /** Simeon Labs' API, e.g. https://api.simeonlabs.com. */
  readonly api: string;
}

/** Hosts whose pages are sign-ins wherever they lead. */
export const SIGN_IN_HOSTS: readonly string[] = [
  "accounts.google.com",
  "appleid.apple.com",
  "login.microsoftonline.com",
  "login.live.com",
  "login.windows.net",
];

/** Paths on the API that start a sign-in run by the server itself (Google's own sign-in, the apps Simeon Labs serves: Gmail, Slack, …). */
const API_SIGN_IN_PATHS = [/^\/integrations\//, /^\/desktop\/api\/apps\//, /^\/v1\/integrations\//];

const SYSTEM_SCHEMES = new Set(["mailto:", "tel:", "sms:", "facetime:", "facetime-audio:"]);

function parse(url: string): URL | null {
  try { return new URL(url); } catch { return null; }
}

function isWindowPage(url: URL, app: URL): boolean {
  if (url.origin !== app.origin) return false;
  const root = app.pathname.replace(/\/+$/, "") || "/app";
  return url.pathname === root || url.pathname.startsWith(`${root}/`);
}

function isWebsiteLogin(url: URL, app: URL): boolean {
  return url.origin === app.origin && /^\/(login|signup)(\/|$)/.test(url.pathname);
}

/** An OAuth or sign-in page: a known sign-in host, the API's own sign-ins, or anything shaped like an authorization request. */
export function isSignInUrl(url: URL, api: URL | null): boolean {
  if (SIGN_IN_HOSTS.includes(url.hostname)) return true;
  if (api != null && url.origin === api.origin && API_SIGN_IN_PATHS.some((pattern) => pattern.test(url.pathname))) return true;
  const params = url.searchParams;
  if (params.has("redirect_uri") || params.has("response_type")) return true;
  if (params.has("client_id") && params.has("state")) return true;
  return /\/oauth2?(\/|$)|\/authorize(\/|$)/i.test(url.pathname);
}

/** A navigation the web view is about to make. */
export function routeNavigation(request: { readonly url: string; readonly isTopFrame?: boolean }, context: RoutingContext): NavigationDecision {
  if (request.isTopFrame === false) return { kind: "load" };
  const url = parse(request.url);
  if (url == null) return { kind: "block" };
  if (url.protocol === "about:") return { kind: "load" };
  if (SYSTEM_SCHEMES.has(url.protocol)) return { kind: "system", url: request.url };
  if (url.protocol !== "https:" && url.protocol !== "http:") return { kind: "block" };
  const app = parse(context.app);
  if (app != null && isWindowPage(url, app)) return { kind: "load" };
  if (app != null && isWebsiteLogin(url, app)) return { kind: "sign-in" };
  if (isSignInUrl(url, parse(context.api))) return { kind: "auth-session", url: request.url };
  return { kind: "browser", url: request.url };
}

/**
 * A page the window wants in a new window (`window.open`, `target=_blank`,
 * `openExternal`): never the web view itself, which has room for one
 * window. A sign-in the page says is one (`purpose: "sign-in"`, a connected
 * app's Connect) goes to the sign-in sheet whatever it looks like.
 */
export function routeNewWindow(target: { readonly url: string; readonly purpose?: "sign-in" | "link" }, context: RoutingContext): NavigationDecision {
  const url = parse(target.url);
  if (url == null) return { kind: "block" };
  if (target.purpose === "sign-in" && (url.protocol === "https:" || url.protocol === "http:")) return { kind: "auth-session", url: target.url };
  const decision = routeNavigation({ url: target.url, isTopFrame: true }, context);
  if (decision.kind !== "load") return decision;
  return url.protocol === "https:" || url.protocol === "http:" ? { kind: "browser", url: target.url } : { kind: "block" };
}
